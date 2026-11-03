using Relay.Domain;

namespace Relay.Tests;

public sealed class IncidentTests
{
    private readonly DateTime now = new(2026, 11, 3, 12, 0, 0, DateTimeKind.Utc);
    private Incident Create(Severity severity = Severity.Critical) => Incident.Create("Checkout requests failing", "Customers cannot complete their checkout requests.", Guid.NewGuid(), severity, "Alex", now, Guid.NewGuid().ToString());

    [Theory]
    [InlineData(Severity.Critical, 30)]
    [InlineData(Severity.Major, 120)]
    [InlineData(Severity.Minor, 480)]
    public void Severity_sets_resolution_target(Severity severity, int minutes) => Assert.Equal(now.AddMinutes(minutes), Create(severity).DueAt);

    [Fact]
    public void Incident_requires_an_owner_before_changing_stage()
    {
        var incident = Create();
        Assert.Throws<DomainException>(() => incident.Transition(IncidentStatus.Identified, "Connection pool is saturated.", "Alex", now));
        Assert.Equal(IncidentStatus.Investigating, incident.Status);
        Assert.Single(incident.Events);
    }

    [Theory]
    [InlineData(IncidentStatus.Investigating)]
    [InlineData(IncidentStatus.Monitoring)]
    [InlineData(IncidentStatus.Resolved)]
    [InlineData((IncidentStatus)99)]
    public void Stage_skips_reversals_and_unknown_values_are_rejected(IncidentStatus status)
    {
        var incident = Create(); incident.Assign(Guid.NewGuid(), "Alex", "Alex", now);
        Assert.Throws<DomainException>(() => incident.Transition(status, "We have identified the cause.", "Alex", now));
    }

    [Fact]
    public void Lifecycle_records_each_transition_and_resolves_atomically()
    {
        var incident = Create();
        incident.Assign(Guid.NewGuid(), "Alex", "Alex", now);
        incident.Transition(IncidentStatus.Identified, "We isolated the connection pool issue.", "Alex", now.AddMinutes(4));
        incident.Comment("Mitigation is being deployed.", "Jules", now.AddMinutes(6));
        incident.Transition(IncidentStatus.Monitoring, "Pool has been resized. Monitoring recovery.", "Jules", now.AddMinutes(10));
        incident.Transition(IncidentStatus.Resolved, "Error rates are normal and backlog cleared.", "Alex", now.AddMinutes(20));
        Assert.Equal(IncidentStatus.Resolved, incident.Status);
        Assert.Equal(now.AddMinutes(20), incident.ResolvedAt);
        Assert.False(incident.SlaBreached);
        Assert.Equal(6, incident.Events.Count);
        Assert.Equal(6, incident.Version);
        Assert.Throws<DomainException>(() => incident.Assign(Guid.NewGuid(), "New owner", "Alex", now));
    }

    [Fact]
    public void Sla_escalation_is_idempotent_and_does_not_escalate_a_resolved_incident()
    {
        var incident = Create();
        Assert.False(incident.MarkSlaBreach(now.AddMinutes(30)));
        Assert.True(incident.MarkSlaBreach(now.AddMinutes(31)));
        Assert.False(incident.MarkSlaBreach(now.AddMinutes(40)));
        Assert.Single(incident.Events, e => e.Kind == "sla");
    }

    [Fact]
    public void Late_resolution_counts_as_breached_even_before_worker_tick()
    {
        var incident = Create(); incident.Assign(Guid.NewGuid(), "Alex", "Alex", now);
        incident.Transition(IncidentStatus.Identified, "Root cause is identified.", "Alex", now);
        incident.Transition(IncidentStatus.Monitoring, "Monitoring the deployed fix.", "Alex", now);
        incident.Transition(IncidentStatus.Resolved, "Everything is operating normally.", "Alex", now.AddMinutes(31));
        Assert.True(incident.SlaBreached);
        Assert.False(incident.MarkSlaBreach(now.AddMinutes(60)));
    }

    [Theory]
    [InlineData("   ", "Description long enough.")]
    [InlineData("A valid incident", "    ")]
    public void Empty_or_whitespace_input_is_rejected(string title, string description) =>
        Assert.Throws<DomainException>(() => Incident.Create(title, description, Guid.NewGuid(), Severity.Minor, "Alex", now, "key"));
}
