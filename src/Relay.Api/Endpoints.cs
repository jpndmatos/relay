using System.Security.Claims;
using Microsoft.AspNetCore.Antiforgery;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.SignalR;
using Microsoft.EntityFrameworkCore;
using Relay.Domain;
using Relay.Infrastructure;

namespace Relay.Api;

public static class Endpoints
{
    private static async Task<UserDto> Describe(AppUser user, UserManager<AppUser> users) =>
        new(user.Id, user.DisplayName, user.Email!, (await users.GetRolesAsync(user)).FirstOrDefault() ?? "Viewer");

    public static void MapRelayEndpoints(this WebApplication app)
    {
        var api = app.MapGroup("/api").AddEndpointFilter<ValidationFilter>();
        api.MapGet("/session", async (HttpContext ctx, IAntiforgery csrf, UserManager<AppUser> users, IConfiguration config) =>
        {
            var user = await users.GetUserAsync(ctx.User);
            return Results.Ok(new
            {
                user = user is null ? null : await Describe(user, users),
                csrfToken = csrf.GetAndStoreTokens(ctx).RequestToken,
                demoEnabled = config.GetValue<bool>("Demo:Enabled")
            });
        }).WithTags("Session");
        api.MapPost("/session/login", async (LoginRequest request, SignInManager<AppUser> signin, UserManager<AppUser> users) =>
        {
            var user = await users.FindByEmailAsync(request.Email.Trim());
            if (user is null) return Results.Problem(statusCode: 401, title: "Sign-in failed", detail: "Check your email and password.");
            var result = await signin.CheckPasswordSignInAsync(user, request.Password, lockoutOnFailure: true);
            if (!result.Succeeded) return Results.Problem(statusCode: 401, title: "Sign-in failed", detail: "Check your credentials or try again after the lockout period.");
            await signin.SignInAsync(user, false);
            return Results.Ok(await Describe(user, users));
        }).RequireRateLimiting("login").WithTags("Session");
        api.MapPost("/session/demo", async (DemoRequest request, IConfiguration config, SignInManager<AppUser> signin, UserManager<AppUser> users) =>
        {
            if (!config.GetValue<bool>("Demo:Enabled")) return Results.NotFound();
            var id = request.Role switch { "Commander" => SeedData.CommanderId, "Viewer" => SeedData.ViewerId, "Responder" => SeedData.ResponderId, _ => Guid.Empty };
            if (id == Guid.Empty) return Results.BadRequest();
            var user = await users.FindByIdAsync(id.ToString());
            if (user is null) return Results.NotFound();
            await signin.SignInAsync(user, false);
            return Results.Ok(await Describe(user, users));
        }).RequireRateLimiting("login").WithTags("Session");
        api.MapPost("/session/logout", async (HttpContext ctx) => { await ctx.SignOutAsync(IdentityConstants.ApplicationScheme); return Results.NoContent(); })
            .RequireAuthorization().WithTags("Session");

        api.MapGet("/status", async (RelayDbContext db, CancellationToken ct) =>
        {
            var services = await IncidentQueries.ServiceList(db, ct);
            // Public surface deliberately excludes descriptions, comments and responder identities.
            var incidents = await db.Incidents.AsNoTracking().Where(i => i.Status != IncidentStatus.Resolved)
                .OrderBy(i => i.Severity).Select(i => new { i.Id, i.Number, i.Title, i.ServiceId, i.Severity, i.Status, i.UpdatedAt }).ToListAsync(ct);
            return Results.Ok(new { services = services.Select(s => new { s.Id, s.Name, s.Health, s.ActiveIncidents }), incidents, updatedAt = DateTime.UtcNow });
        }).WithTags("Public status");

        var secured = api.MapGroup("").RequireAuthorization();
        secured.MapGet("/responders", async (UserManager<AppUser> users, CancellationToken ct) =>
        {
            var responders = (await users.GetUsersInRoleAsync("Commander")).Concat(await users.GetUsersInRoleAsync("Responder")).DistinctBy(u => u.Id);
            return Results.Ok(responders.Select(u => new { u.Id, name = u.DisplayName }).OrderBy(u => u.name));
        }).WithTags("People");
        secured.MapGet("/services", async (RelayDbContext db, CancellationToken ct) => Results.Ok(await IncidentQueries.ServiceList(db, ct))).WithTags("Services");
        secured.MapPost("/services", async (CreateServiceRequest request, RelayDbContext db, CancellationToken ct) =>
        {
            if (request.Tier is not ("Critical" or "Core" or "Standard")) return Results.ValidationProblem(new Dictionary<string, string[]> { ["tier"] = ["Choose Critical, Core or Standard."] });
            var service = new Service { Name = request.Name.Trim(), Description = request.Description.Trim(), Team = request.Team.Trim(), Tier = request.Tier };
            if (service.Name.Length < 3 || service.Team.Length < 2 || service.Description.Length < 12) throw new DomainException("Service fields cannot contain only spaces.");
            db.Services.Add(service); await db.SaveChangesAsync(ct);
            return Results.Created($"/api/services/{service.Id}", service);
        }).RequireAuthorization("Command").WithTags("Services");

        secured.MapGet("/incidents", async (string? q, string? status, string? severity, Guid? serviceId,
            Guid? assigneeId, int? page, int? pageSize, RelayDbContext db, CancellationToken ct) =>
        {
            var query = db.Incidents.AsNoTracking();
            if (!string.IsNullOrWhiteSpace(q)) { var term = q.Trim().ToLowerInvariant(); query = query.Where(i => i.Title.ToLower().Contains(term) || i.Description.ToLower().Contains(term)); }
            if (status == "active") query = query.Where(i => i.Status != IncidentStatus.Resolved);
            else if (!string.IsNullOrEmpty(status) && status != "all")
            {
                if (!Enum.TryParse<IncidentStatus>(status, true, out var value) || !Enum.IsDefined(value)) return Results.BadRequest(new { detail = "Invalid status filter." });
                query = query.Where(i => i.Status == value);
            }
            if (!string.IsNullOrEmpty(severity))
            {
                if (!Enum.TryParse<Severity>(severity, true, out var value) || !Enum.IsDefined(value)) return Results.BadRequest(new { detail = "Invalid severity filter." });
                query = query.Where(i => i.Severity == value);
            }
            if (serviceId is not null) query = query.Where(i => i.ServiceId == serviceId);
            if (assigneeId is not null) query = query.Where(i => i.AssigneeId == assigneeId);
            var current = Math.Clamp(page ?? 1, 1, 100_000); var size = Math.Clamp(pageSize ?? 20, 1, 100);
            var total = await query.CountAsync(ct);
            var items = await query.OrderBy(i => i.Status == IncidentStatus.Resolved).ThenBy(i => i.Severity)
                .ThenByDescending(i => i.CreatedAt).Skip((current - 1) * size).Take(size).AsDto(db).ToListAsync(ct);
            return Results.Ok(new PageDto<IncidentDto>(items, total, current, size));
        }).WithTags("Incidents");
        secured.MapGet("/incidents/{id:guid}", async (Guid id, RelayDbContext db, CancellationToken ct) =>
        {
            var result = await db.Incidents.AsNoTracking().Where(i => i.Id == id).AsDto(db).SingleOrDefaultAsync(ct);
            return result is null ? Results.NotFound() : Results.Ok(result);
        }).WithTags("Incidents");
        secured.MapGet("/overview", async (RelayDbContext db, TimeProvider clock, CancellationToken ct) =>
        {
            var now = clock.GetUtcNow().UtcDateTime;
            var from = now.AddDays(-7);
            var incidents = await db.Incidents.AsNoTracking().Where(i => i.Status != IncidentStatus.Resolved || i.CreatedAt >= from || i.ResolvedAt >= from)
                .Select(i => new { i.Status, i.Severity, i.CreatedAt, i.ResolvedAt, i.DueAt, i.SlaBreached }).ToListAsync(ct);
            var active = incidents.Where(i => i.Status != IncidentStatus.Resolved).ToArray();
            var resolved = incidents.Where(i => i.ResolvedAt >= from).ToArray();
            var days = Enumerable.Range(0, 7).Select(offset =>
            {
                var date = now.Date.AddDays(offset - 6);
                return new { date = date.ToString("yyyy-MM-dd"), opened = incidents.Count(i => i.CreatedAt.Date == date), resolved = incidents.Count(i => i.ResolvedAt?.Date == date) };
            });
            return Results.Ok(new
            {
                active = active.Length,
                critical = active.Count(i => i.Severity == Severity.Critical),
                overdue = active.Count(i => i.DueAt < now),
                resolvedThisWeek = resolved.Length,
                meanResolutionMinutes = resolved.Length == 0 ? (double?)null : Math.Round(resolved.Average(i => (i.ResolvedAt!.Value - i.CreatedAt).TotalMinutes)),
                days,
                recentEvents = await db.IncidentEvents.AsNoTracking().OrderByDescending(e => e.CreatedAt).Take(6)
                    .Select(e => new { e.Id, e.IncidentId, e.Kind, e.Actor, e.Body, e.CreatedAt }).ToListAsync(ct)
            });
        }).WithTags("Overview");

        var writes = secured.MapGroup("/incidents").RequireAuthorization("Respond");
        writes.MapPost("", async (CreateIncidentRequest request, HttpContext ctx, RelayDbContext db,
            TimeProvider clock, IHubContext<IncidentHub> hub, CancellationToken ct) =>
        {
            var key = ctx.Request.Headers["Idempotency-Key"].ToString();
            if (!Guid.TryParse(key, out _)) return Results.ValidationProblem(new Dictionary<string, string[]> { ["Idempotency-Key"] = ["Send a UUID idempotency key."] });
            key = $"{ctx.User.FindFirstValue(ClaimTypes.NameIdentifier)}:{key}";
            var existing = await db.Incidents.AsNoTracking().Where(i => i.RequestKey == key).AsDto(db).SingleOrDefaultAsync(ct);
            if (existing is not null)
            {
                if (existing.Title != request.Title.Trim() || existing.Description != request.Description.Trim() || existing.ServiceId != request.ServiceId || existing.Severity != request.Severity)
                    return Results.Problem(statusCode: 409, title: "Idempotency key reused", detail: "Use a new key for a different incident.");
                return Results.Ok(existing);
            }
            if (!await db.Services.AnyAsync(s => s.Id == request.ServiceId, ct)) return Results.ValidationProblem(new Dictionary<string, string[]> { ["serviceId"] = ["Choose an existing service."] });
            var actor = await Actor(ctx, db, ct);
            var incident = Incident.Create(request.Title, request.Description, request.ServiceId, request.Severity, actor, clock.GetUtcNow().UtcDateTime, key);
            db.Incidents.Add(incident); await db.SaveChangesAsync(ct);
            await hub.Clients.All.SendAsync("incidentsChanged", cancellationToken: ct);
            return Results.Created($"/api/incidents/{incident.Id}", await db.Incidents.Where(i => i.Id == incident.Id).AsDto(db).SingleAsync(ct));
        }).WithTags("Incidents");
        writes.MapPost("/{id:guid}/transition", async (Guid id, TransitionRequest request, HttpContext ctx,
            RelayDbContext db, TimeProvider clock, IHubContext<IncidentHub> hub, CancellationToken ct) =>
            await Mutate(id, request.Version, ctx, db, clock, hub, ct, async (incident, actor, now) =>
            {
                incident.Transition(request.Status, request.Note, actor, now); await Task.CompletedTask;
            })).WithTags("Incidents");
        writes.MapPost("/{id:guid}/assign", async (Guid id, AssignRequest request, HttpContext ctx,
            RelayDbContext db, TimeProvider clock, IHubContext<IncidentHub> hub, UserManager<AppUser> users, CancellationToken ct) =>
            await Mutate(id, request.Version, ctx, db, clock, hub, ct, async (incident, actor, now) =>
            {
                var user = await users.FindByIdAsync(request.AssigneeId.ToString());
                if (user is null || !(await users.IsInRoleAsync(user, "Commander") || await users.IsInRoleAsync(user, "Responder")))
                    throw new DomainException("Choose a user with responder permissions.");
                incident.Assign(user.Id, user.DisplayName, actor, now);
            })).WithTags("Incidents");
        writes.MapPost("/{id:guid}/comments", async (Guid id, CommentRequest request, HttpContext ctx,
            RelayDbContext db, TimeProvider clock, IHubContext<IncidentHub> hub, CancellationToken ct) =>
            await Mutate(id, request.Version, ctx, db, clock, hub, ct, async (incident, actor, now) =>
            {
                incident.Comment(request.Body, actor, now); await Task.CompletedTask;
            })).WithTags("Incidents");
    }

    private static async Task<string> Actor(HttpContext ctx, RelayDbContext db, CancellationToken ct)
    {
        var id = Guid.Parse(ctx.User.FindFirstValue(ClaimTypes.NameIdentifier)!);
        return await db.Users.Where(u => u.Id == id).Select(u => u.DisplayName).SingleAsync(ct);
    }

    private static async Task<IResult> Mutate(Guid id, long version, HttpContext ctx, RelayDbContext db,
        TimeProvider clock, IHubContext<IncidentHub> hub, CancellationToken ct, Func<Incident, string, DateTime, Task> action)
    {
        var incident = await db.Incidents.SingleOrDefaultAsync(i => i.Id == id, ct);
        if (incident is null) return Results.NotFound();
        if (incident.Version != version) return Results.Problem(statusCode: 409, title: "Incident changed", detail: "Another responder updated this incident. Refresh and try again.");
        await action(incident, await Actor(ctx, db, ct), clock.GetUtcNow().UtcDateTime);
        await db.SaveChangesAsync(ct);
        await hub.Clients.All.SendAsync("incidentsChanged", cancellationToken: ct);
        return Results.Ok(await db.Incidents.AsNoTracking().Where(i => i.Id == id).AsDto(db).SingleAsync(ct));
    }
}
