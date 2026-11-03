using Relay.Domain;
using System.ComponentModel.DataAnnotations;

namespace Relay.Api;

public sealed record LoginRequest([property: Required, EmailAddress, StringLength(254)] string Email,
    [property: Required, StringLength(256)] string Password);
public sealed record DemoRequest([property: Required] string Role);
public sealed record CreateIncidentRequest([property: Required, StringLength(160, MinimumLength = 5)] string Title,
    [property: Required, StringLength(4000, MinimumLength = 12)] string Description, Guid ServiceId, Severity Severity);
public sealed record TransitionRequest(IncidentStatus Status,
    [property: Required, StringLength(4000, MinimumLength = 12)] string Note, [property: Range(1, long.MaxValue)] long Version);
public sealed record AssignRequest(Guid AssigneeId, long Version);
public sealed record CommentRequest([property: Required, StringLength(4000, MinimumLength = 3)] string Body, long Version);
public sealed record CreateServiceRequest([property: Required, StringLength(80, MinimumLength = 3)] string Name,
    [property: Required, StringLength(240, MinimumLength = 12)] string Description,
    [property: Required, StringLength(80, MinimumLength = 2)] string Team, [property: Required] string Tier);
public sealed record UserDto(Guid Id, string Name, string Email, string Role);
public sealed record EventDto(Guid Id, string Kind, string Actor, string Body, DateTime CreatedAt, IncidentStatus Status);
public sealed record IncidentDto(Guid Id, int Number, string Title, string Description, Guid ServiceId,
    string ServiceName, string Team, Severity Severity, IncidentStatus Status, Guid? AssigneeId,
    string? AssigneeName, DateTime CreatedAt, DateTime UpdatedAt, DateTime DueAt, DateTime? ResolvedAt,
    bool SlaBreached, long Version, IReadOnlyList<EventDto> Events);
public sealed record PageDto<T>(IReadOnlyList<T> Items, int Total, int Page, int PageSize);
public sealed record ServiceDto(Guid Id, string Name, string Description, string Team, string Tier,
    string Health, int ActiveIncidents);
