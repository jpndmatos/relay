using Microsoft.AspNetCore.SignalR;
using Microsoft.EntityFrameworkCore;
using Relay.Domain;
using Relay.Infrastructure;

namespace Relay.Api;

public sealed class SlaWorker(IServiceScopeFactory scopes, IHubContext<IncidentHub> hub,
    TimeProvider clock, ILogger<SlaWorker> logger) : BackgroundService
{
    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        using var timer = new PeriodicTimer(TimeSpan.FromSeconds(30), clock);
        try
        {
            while (await timer.WaitForNextTickAsync(stoppingToken))
            {
                try { await SweepAsync(stoppingToken); }
                catch (DbUpdateConcurrencyException) { logger.LogInformation("SLA sweep raced an incident update; retrying on the next tick."); }
                catch (Exception ex) when (ex is not OperationCanceledException)
                { logger.LogError(ex, "SLA sweep failed; retrying on the next tick."); }
            }
        }
        catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested) { }
    }

    public async Task SweepAsync(CancellationToken ct)
    {
        using var scope = scopes.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<RelayDbContext>();
        var now = clock.GetUtcNow().UtcDateTime;
        var overdue = await db.Incidents.Where(i => !i.SlaBreached && i.Status != IncidentStatus.Resolved && i.DueAt < now).ToListAsync(ct);
        foreach (var incident in overdue) incident.MarkSlaBreach(now);
        if (overdue.Count == 0) return;
        await db.SaveChangesAsync(ct);
        await hub.Clients.All.SendAsync("incidentsChanged", cancellationToken: ct);
        logger.LogInformation("Escalated {Count} overdue incidents", overdue.Count);
    }
}
