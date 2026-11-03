using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using Relay.Domain;

namespace Relay.Infrastructure;

public static class SeedData
{
    public static readonly Guid CommanderId = Guid.Parse("e6e4ac30-f879-4359-b7f1-5f12fab60001");
    public static readonly Guid ViewerId = Guid.Parse("e6e4ac30-f879-4359-b7f1-5f12fab60002");
    public static readonly Guid ResponderId = Guid.Parse("e6e4ac30-f879-4359-b7f1-5f12fab60003");

    public static async Task InitializeAsync(RelayDbContext db, UserManager<AppUser> users,
        RoleManager<IdentityRole<Guid>> roles, bool demo, string? adminEmail, string? adminPassword,
        TimeProvider clock)
    {
        await db.Database.MigrateAsync();
        foreach (var role in new[] { "Commander", "Responder", "Viewer" })
            if (!await roles.RoleExistsAsync(role)) await roles.CreateAsync(new IdentityRole<Guid>(role));

        if (!demo)
        {
            if (!await users.Users.AnyAsync())
            {
                if (string.IsNullOrWhiteSpace(adminEmail) || string.IsNullOrWhiteSpace(adminPassword))
                    throw new InvalidOperationException("Set Bootstrap__Email and Bootstrap__Password for the first administrator (or enable Demo__Enabled explicitly for sample data).");
                var user = new AppUser { UserName = adminEmail, Email = adminEmail, DisplayName = "Incident commander", EmailConfirmed = true };
                var result = await users.CreateAsync(user, adminPassword);
                if (!result.Succeeded) throw new InvalidOperationException(string.Join(" ", result.Errors.Select(e => e.Description)));
                await users.AddToRoleAsync(user, "Commander");
            }
            return;
        }

        var people = new[] {
            (CommanderId, "alex@relay.example", "Alex Morgan", "Commander"),
            (ViewerId, "sam@relay.example", "Sam Rivera", "Viewer"),
            (ResponderId, "jules@relay.example", "Jules Chen", "Responder")
        };
        foreach (var (id, email, name, role) in people)
        {
            if (await users.FindByIdAsync(id.ToString()) is not null) continue;
            var user = new AppUser { Id = id, UserName = email, Email = email, DisplayName = name, EmailConfirmed = true, LockoutEnabled = true };
            // Demo entry signs in via a gated endpoint, never a shared production password.
            var result = await users.CreateAsync(user);
            if (!result.Succeeded) throw new InvalidOperationException("Could not create a demo user.");
            await users.AddToRoleAsync(user, role);
        }
        if (await db.Services.AnyAsync()) return;
        var services = new[] {
            new Service { Name = "Payments API", Description = "Checkout, authorisation and payment processing.", Team = "Commerce", Tier = "Critical" },
            new Service { Name = "Authentication", Description = "Sign-in, sessions and identity verification.", Team = "Platform", Tier = "Critical" },
            new Service { Name = "Notification worker", Description = "Email delivery and asynchronous notifications.", Team = "Messaging", Tier = "Core" },
            new Service { Name = "Public API", Description = "Public endpoints and partner integrations.", Team = "Platform", Tier = "Core" },
            new Service { Name = "Analytics pipeline", Description = "Product events and reporting workloads.", Team = "Data", Tier = "Standard" }
        };
        db.Services.AddRange(services);
        var now = clock.GetUtcNow().UtcDateTime;
        var samples = new[] {
            ("Elevated checkout failure rate", "Payment authorisations are intermittently timing out. The response team is investigating the upstream connection pool.", 0, Severity.Critical, 18, 1),
            ("Delayed transactional emails", "Transactional email delivery is delayed. Queue depth is increasing while the primary provider recovers.", 2, Severity.Major, 46, 2),
            ("Intermittent sign-in errors", "A subset of sign-in requests returns a session validation error following the latest key rotation.", 1, Severity.Major, 32, 0),
            ("Reporting jobs running behind", "Hourly analytics reports are arriving later than scheduled. No events have been lost.", 4, Severity.Minor, 95, 1),
            ("Partner API latency recovered", "Partner API response times increased during a scheduled index rebuild. The rebuild has completed.", 3, Severity.Minor, 180, 3),
            ("Webhook deliveries restored", "Webhook retries accumulated after a deploy. The worker concurrency limit has been adjusted.", 0, Severity.Major, 260, 3)
        };
        foreach (var (title, description, service, severity, age, stage) in samples)
        {
            var created = now.AddMinutes(-age);
            var incident = Incident.Create(title, description, services[service].Id, severity, "Alex Morgan", created, $"seed:{service}:{age}");
            if (stage > 0)
            {
                incident.Assign(service % 2 == 0 ? CommanderId : ResponderId, service % 2 == 0 ? "Alex Morgan" : "Jules Chen", "Alex Morgan", created.AddMinutes(2));
                incident.Transition(IncidentStatus.Identified, "The affected component has been isolated. Preparing a targeted mitigation.", "Alex Morgan", created.AddMinutes(5));
            }
            if (stage > 1) incident.Transition(IncidentStatus.Monitoring, "Mitigation is deployed. Watching error rates and queue depth before closing.", "Jules Chen", created.AddMinutes(12));
            if (stage > 2) incident.Transition(IncidentStatus.Resolved, "Service has recovered and the backlog is cleared. Follow-up actions recorded.", "Alex Morgan", created.AddMinutes(24));
            db.Incidents.Add(incident);
        }
        await db.SaveChangesAsync();
    }
}
