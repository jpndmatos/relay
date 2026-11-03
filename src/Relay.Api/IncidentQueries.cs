using Microsoft.EntityFrameworkCore;
using Relay.Domain;
using Relay.Infrastructure;

namespace Relay.Api;

public static class IncidentQueries
{
    public static IQueryable<IncidentDto> AsDto(this IQueryable<Incident> query, RelayDbContext db) =>
        query.Select(i => new IncidentDto(i.Id, i.Number, i.Title, i.Description, i.ServiceId,
            db.Services.Where(s => s.Id == i.ServiceId).Select(s => s.Name).First(),
            db.Services.Where(s => s.Id == i.ServiceId).Select(s => s.Team).First(),
            i.Severity, i.Status, i.AssigneeId,
            db.Users.Where(u => u.Id == i.AssigneeId).Select(u => u.DisplayName).FirstOrDefault(),
            i.CreatedAt, i.UpdatedAt, i.DueAt, i.ResolvedAt, i.SlaBreached, i.Version,
            i.Events.OrderByDescending(e => e.CreatedAt).ThenBy(e => e.Id)
                .Select(e => new EventDto(e.Id, e.Kind, e.Actor, e.Body, e.CreatedAt, e.Status)).ToList()));

    public static async Task<List<ServiceDto>> ServiceList(RelayDbContext db, CancellationToken ct)
    {
        var services = await db.Services.AsNoTracking().OrderBy(s => s.Name).ToListAsync(ct);
        var active = await db.Incidents.AsNoTracking().Where(i => i.Status != IncidentStatus.Resolved)
            .Select(i => new { i.ServiceId, i.Severity }).ToListAsync(ct);
        return services.Select(s =>
        {
            var incidents = active.Where(i => i.ServiceId == s.Id).ToArray();
            var health = incidents.Length == 0 ? "Operational" : incidents.Any(i => i.Severity == Severity.Critical) ? "Disrupted" : "Degraded";
            return new ServiceDto(s.Id, s.Name, s.Description, s.Team, s.Tier, health, incidents.Length);
        }).ToList();
    }
}
