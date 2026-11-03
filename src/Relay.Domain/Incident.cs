namespace Relay.Domain;

public enum Severity { Critical = 1, Major = 2, Minor = 3 }
public enum IncidentStatus { Investigating, Identified, Monitoring, Resolved }

public sealed class DomainException(string message) : Exception(message);

/// <summary>The aggregate owns transitions, deadlines and its append-only event history.</summary>
public sealed class Incident
{
    private Incident() { }
    public Guid Id { get; private set; } = Guid.NewGuid();
    public int Number { get; private set; }
    public string Title { get; private set; } = "";
    public string Description { get; private set; } = "";
    public Guid ServiceId { get; private set; }
    public Severity Severity { get; private set; }
    public IncidentStatus Status { get; private set; }
    public Guid? AssigneeId { get; private set; }
    public DateTime CreatedAt { get; private set; }
    public DateTime UpdatedAt { get; private set; }
    public DateTime DueAt { get; private set; }
    public DateTime? ResolvedAt { get; private set; }
    public bool SlaBreached { get; private set; }
    public long Version { get; private set; } = 1;
    public string RequestKey { get; private set; } = "";
    public List<IncidentEvent> Events { get; private set; } = [];

    public static Incident Create(string title, string description, Guid serviceId,
        Severity severity, string actor, DateTime now, string requestKey)
    {
        title = title.Trim(); description = description.Trim();
        if (title.Length is < 5 or > 160) throw new DomainException("Use a title between 5 and 160 characters.");
        if (description.Length is < 12 or > 4000) throw new DomainException("Describe the impact in 12 to 4,000 characters.");
        if (serviceId == Guid.Empty) throw new DomainException("Choose an affected service.");
        if (!Enum.IsDefined(severity)) throw new DomainException("Choose a valid severity.");
        var incident = new Incident
        {
            Title = title,
            Description = description,
            ServiceId = serviceId,
            Severity = severity,
            CreatedAt = now,
            UpdatedAt = now,
            DueAt = now.AddMinutes(BudgetMinutes(severity)),
            RequestKey = requestKey
        };
        incident.Record("created", actor, description, now);
        return incident;
    }

    public static int BudgetMinutes(Severity severity) => severity switch
    {
        Severity.Critical => 30,
        Severity.Major => 120,
        Severity.Minor => 480,
        _ => throw new DomainException("Choose a valid severity.")
    };

    public void Transition(IncidentStatus next, string note, string actor, DateTime now)
    {
        if (!Enum.IsDefined(next) || (int)next != (int)Status + 1)
            throw new DomainException("Move to the next stage: investigating, identified, monitoring, then resolved.");
        note = note.Trim();
        if (note.Length is < 12 or > 4000)
            throw new DomainException("Add an update between 12 and 4,000 characters to explain the transition.");
        if (AssigneeId is null) throw new DomainException("Assign a responder before changing the incident stage.");
        Status = next;
        if (next == IncidentStatus.Resolved) ResolvedAt = now;
        // A late resolution counts as a breach even if it beats the worker's next tick.
        if (now > DueAt) SlaBreached = true;
        Touch(now);
        Record("status", actor, note, now);
    }

    public void Assign(Guid assignee, string name, string actor, DateTime now)
    {
        if (Status == IncidentStatus.Resolved) throw new DomainException("A resolved incident cannot be reassigned.");
        if (assignee == Guid.Empty) throw new DomainException("Choose a responder.");
        if (AssigneeId == assignee) return;
        AssigneeId = assignee;
        Touch(now);
        Record("assigned", actor, $"Assigned to {name}.", now);
    }

    public void Comment(string body, string actor, DateTime now)
    {
        body = body.Trim();
        if (body.Length is < 3 or > 4000) throw new DomainException("Write an update between 3 and 4,000 characters.");
        Touch(now);
        Record("comment", actor, body, now);
    }

    public bool MarkSlaBreach(DateTime now)
    {
        if (SlaBreached || Status == IncidentStatus.Resolved || now <= DueAt) return false;
        SlaBreached = true;
        Touch(now);
        Record("sla", "Relay", "The resolution target was exceeded. Escalate to the service owner.", now);
        return true;
    }

    private void Touch(DateTime now) { UpdatedAt = now; Version++; }
    private void Record(string kind, string actor, string body, DateTime now) =>
        Events.Add(new IncidentEvent
        {
            IncidentId = Id,
            Kind = kind,
            Actor = actor,
            Body = body,
            CreatedAt = now,
            Status = Status
        });
}

public sealed class IncidentEvent
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid IncidentId { get; set; }
    public string Kind { get; set; } = "";
    public string Actor { get; set; } = "";
    public string Body { get; set; } = "";
    public DateTime CreatedAt { get; set; }
    public IncidentStatus Status { get; set; }
}

public sealed class Service
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public string Name { get; set; } = "";
    public string Description { get; set; } = "";
    public string Team { get; set; } = "";
    public string Tier { get; set; } = "Core";
}
