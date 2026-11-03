using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Relay.Api;
using Relay.Domain;
using Relay.Infrastructure;

namespace Relay.Tests;

public sealed class ApiTests
{
    [Fact]
    public async Task Non_demo_workspace_uses_identity_passwords_and_has_no_demo_entry()
    {
        using var app = new RelayFactory(demo: false); using var client = app.CreateClient();
        await RelayFactory.Csrf(client);
        Assert.Equal(HttpStatusCode.NotFound, (await client.PostAsJsonAsync("/api/session/demo", new { role = "Commander" })).StatusCode);
        var response = await client.PostAsJsonAsync("/api/session/login", new { email = "admin@relay.example", password = "Relay.Test.Account.23!" });
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        await RelayFactory.Csrf(client);
        var session = await client.GetFromJsonAsync<JsonElement>("/api/session");
        Assert.False(session.GetProperty("demoEnabled").GetBoolean());
        Assert.Equal("Commander", session.GetProperty("user").GetProperty("role").GetString());
        Assert.Equal(HttpStatusCode.Created, (await client.PostAsJsonAsync("/api/services", new { name = "Production API", description = "A real service in a fresh non-demo workspace.", team = "Platform", tier = "Core" })).StatusCode);
    }

    [Fact]
    public async Task Identity_locks_out_repeated_incorrect_password_attempts()
    {
        using var app = new RelayFactory(demo: false); using var client = app.CreateClient();
        await RelayFactory.Csrf(client);
        for (var attempt = 0; attempt < 5; attempt++)
            Assert.Equal(HttpStatusCode.Unauthorized, (await client.PostAsJsonAsync("/api/session/login", new { email = "admin@relay.example", password = "incorrect-password" })).StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, (await client.PostAsJsonAsync("/api/session/login", new { email = "admin@relay.example", password = "Relay.Test.Account.23!" })).StatusCode);
    }

    private static async Task<IncidentDto> Declare(HttpClient client, string? key = null, string title = "Checkout integration test")
    {
        var services = await client.GetFromJsonAsync<List<ServiceDto>>("/api/services", RelayFactory.Json);
        using var message = new HttpRequestMessage(HttpMethod.Post, "/api/incidents")
        { Content = JsonContent.Create(new CreateIncidentRequest(title, "A reproducible checkout failure affects requests.", services![0].Id, Severity.Critical), options: RelayFactory.Json) };
        message.Headers.Add("Idempotency-Key", key ?? Guid.NewGuid().ToString());
        var response = await client.SendAsync(message);
        Assert.True(response.IsSuccessStatusCode, await response.Content.ReadAsStringAsync());
        return (await response.Content.ReadFromJsonAsync<IncidentDto>(RelayFactory.Json))!;
    }

    [Fact]
    public async Task Anonymous_users_cannot_access_incidents_but_public_status_is_safe()
    {
        using var app = new RelayFactory(); using var client = app.CreateClient();
        Assert.Equal(HttpStatusCode.Unauthorized, (await client.GetAsync("/api/incidents")).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await client.GetAsync("/health")).StatusCode);
        var status = await client.GetStringAsync("/api/status");
        Assert.Contains("Payments API", status);
        Assert.DoesNotContain("assignee", status, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("\"events\":", status, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("\"description\":", status, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("Alex Morgan", status);
    }

    [Fact]
    public async Task Viewer_can_read_but_cannot_write()
    {
        using var app = new RelayFactory(); using var client = await app.Login("Viewer");
        Assert.Equal(HttpStatusCode.OK, (await client.GetAsync("/api/incidents")).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await client.PostAsJsonAsync("/api/incidents", new { })).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await client.PostAsJsonAsync("/api/services", new { })).StatusCode);
    }

    [Fact]
    public async Task Cookie_authenticated_writes_require_csrf_token()
    {
        using var app = new RelayFactory(); using var client = await app.Login();
        client.DefaultRequestHeaders.Remove("X-CSRF-TOKEN");
        var response = await client.PostAsJsonAsync("/api/incidents", new { });
        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.Contains("Session verification", await response.Content.ReadAsStringAsync());
    }

    [Fact]
    public async Task Create_retry_is_idempotent_and_reused_payload_key_is_rejected()
    {
        using var app = new RelayFactory(); using var client = await app.Login();
        var key = Guid.NewGuid().ToString(); var one = await Declare(client, key); var retry = await Declare(client, key);
        Assert.Equal(one.Id, retry.Id); Assert.Equal(one.Number, retry.Number);
        var services = await client.GetFromJsonAsync<List<ServiceDto>>("/api/services", RelayFactory.Json);
        using var message = new HttpRequestMessage(HttpMethod.Post, "/api/incidents") { Content = JsonContent.Create(new { title = "Different title", description = "Another checkout failure.", serviceId = services![0].Id, severity = "Major" }) };
        message.Headers.Add("Idempotency-Key", key);
        Assert.Equal(HttpStatusCode.Conflict, (await client.SendAsync(message)).StatusCode);
    }

    [Fact]
    public async Task Full_lifecycle_persists_events_and_rejects_stale_edits()
    {
        using var app = new RelayFactory(); using var client = await app.Login();
        var incident = await Declare(client);
        var assigned = await client.PostAsJsonAsync($"/api/incidents/{incident.Id}/assign", new { assigneeId = SeedData.CommanderId, version = incident.Version });
        Assert.True(assigned.IsSuccessStatusCode, await assigned.Content.ReadAsStringAsync());
        var current = (await assigned.Content.ReadFromJsonAsync<IncidentDto>(RelayFactory.Json))!;
        var stale = await client.PostAsJsonAsync($"/api/incidents/{incident.Id}/comments", new { body = "Old client update", version = incident.Version });
        Assert.Equal(HttpStatusCode.Conflict, stale.StatusCode);
        foreach (var stage in new[] { "Identified", "Monitoring", "Resolved" })
        {
            var response = await client.PostAsJsonAsync($"/api/incidents/{incident.Id}/transition", new { status = stage, note = "Verified the next recovery step with the response team.", version = current.Version });
            Assert.True(response.IsSuccessStatusCode, await response.Content.ReadAsStringAsync());
            current = (await response.Content.ReadFromJsonAsync<IncidentDto>(RelayFactory.Json))!;
        }
        Assert.Equal(IncidentStatus.Resolved, current.Status); Assert.NotNull(current.ResolvedAt);
        Assert.Equal(5, current.Events.Count);
        var persisted = await client.GetFromJsonAsync<IncidentDto>($"/api/incidents/{incident.Id}", RelayFactory.Json);
        Assert.Equal(current.Version, persisted!.Version);
        Assert.Equal(5, persisted.Events.Count);
    }

    [Fact]
    public async Task Parallel_edits_have_one_winner_and_one_conflict()
    {
        using var app = new RelayFactory(); using var client = await app.Login();
        var incident = await Declare(client);
        var responses = await Task.WhenAll(Enumerable.Range(0, 2).Select(n => client.PostAsJsonAsync($"/api/incidents/{incident.Id}/comments", new { body = $"Responder update {n}", version = incident.Version })));
        Assert.Single(responses, r => r.StatusCode == HttpStatusCode.OK);
        Assert.Single(responses, r => r.StatusCode == HttpStatusCode.Conflict);
        var persisted = await client.GetFromJsonAsync<IncidentDto>($"/api/incidents/{incident.Id}", RelayFactory.Json);
        Assert.Equal(2, persisted!.Events.Count);
    }

    [Fact]
    public async Task Invalid_payloads_filters_and_nonexistent_services_are_rejected()
    {
        using var app = new RelayFactory(); using var client = await app.Login();
        Assert.Equal(HttpStatusCode.BadRequest, (await client.GetAsync("/api/incidents?severity=unknown")).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await client.PostAsJsonAsync("/api/incidents", new { title = "Valid title", description = "Valid incident description.", serviceId = Guid.NewGuid(), severity = "Major" })).StatusCode);
        using var message = new HttpRequestMessage(HttpMethod.Post, "/api/incidents") { Content = JsonContent.Create(new { title = "Valid title", description = "Valid incident description.", serviceId = Guid.NewGuid(), severity = "Major" }) };
        message.Headers.Add("Idempotency-Key", Guid.NewGuid().ToString());
        Assert.Equal(HttpStatusCode.BadRequest, (await client.SendAsync(message)).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await client.PostAsync("/api/incidents", new StringContent("{}", System.Text.Encoding.UTF8, "application/json"))).StatusCode);
    }

    [Fact]
    public async Task Service_health_and_overview_follow_active_incidents()
    {
        using var app = new RelayFactory(); using var client = await app.Login();
        var before = await client.GetFromJsonAsync<JsonElement>("/api/overview");
        var incident = await Declare(client);
        var after = await client.GetFromJsonAsync<JsonElement>("/api/overview");
        Assert.Equal(before.GetProperty("active").GetInt32() + 1, after.GetProperty("active").GetInt32());
        var services = await client.GetFromJsonAsync<List<ServiceDto>>("/api/services", RelayFactory.Json);
        Assert.Equal("Disrupted", services!.Single(s => s.Id == incident.ServiceId).Health);
    }

    [Fact]
    public async Task Ef_concurrency_token_rejects_two_tracked_versions()
    {
        using var app = new RelayFactory(); using var client = await app.Login();
        var dto = await Declare(client);
        using var scope1 = app.Services.CreateScope(); using var scope2 = app.Services.CreateScope();
        var db1 = scope1.ServiceProvider.GetRequiredService<RelayDbContext>(); var db2 = scope2.ServiceProvider.GetRequiredService<RelayDbContext>();
        var a = await db1.Incidents.SingleAsync(i => i.Id == dto.Id); var b = await db2.Incidents.SingleAsync(i => i.Id == dto.Id);
        a.Comment("First database writer", "Alex", DateTime.UtcNow); b.Comment("Second database writer", "Jules", DateTime.UtcNow);
        await db1.SaveChangesAsync();
        await Assert.ThrowsAsync<DbUpdateConcurrencyException>(() => db2.SaveChangesAsync());
    }

    [Fact]
    public async Task Sla_worker_records_a_single_escalation()
    {
        using var app = new RelayFactory(); using var client = await app.Login();
        using (var scope = app.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<RelayDbContext>();
            db.Incidents.Add(Incident.Create("Overdue worker scenario", "This incident exists to check the escalation worker.", (await db.Services.FirstAsync()).Id, Severity.Critical, "Alex", DateTime.UtcNow.AddHours(-2), Guid.NewGuid().ToString()));
            await db.SaveChangesAsync();
        }
        var worker = app.Services.GetServices<Microsoft.Extensions.Hosting.IHostedService>().OfType<SlaWorker>().Single();
        await worker.SweepAsync(default); await worker.SweepAsync(default);
        using var verify = app.Services.CreateScope();
        var dbVerify = verify.ServiceProvider.GetRequiredService<RelayDbContext>();
        var incident = await dbVerify.Incidents.Include(i => i.Events).SingleAsync(i => i.Title == "Overdue worker scenario");
        Assert.True(incident.SlaBreached); Assert.Single(incident.Events, e => e.Kind == "sla");
    }
}
