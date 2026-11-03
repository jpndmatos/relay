using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Identity.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore;
using Relay.Domain;

namespace Relay.Infrastructure;

public sealed class AppUser : IdentityUser<Guid>
{
    public string DisplayName { get; set; } = "";
}

public sealed class RelayDbContext(DbContextOptions<RelayDbContext> options)
    : IdentityDbContext<AppUser, IdentityRole<Guid>, Guid>(options)
{
    public DbSet<Incident> Incidents => Set<Incident>();
    public DbSet<Service> Services => Set<Service>();
    public DbSet<IncidentEvent> IncidentEvents => Set<IncidentEvent>();

    protected override void OnModelCreating(ModelBuilder builder)
    {
        base.OnModelCreating(builder);
        builder.Entity<Incident>(b =>
        {
            b.HasKey(i => i.Number);
            b.Property(i => i.Number).ValueGeneratedOnAdd();
            b.HasAlternateKey(i => i.Id);
            b.HasIndex(i => i.RequestKey).IsUnique();
            b.HasIndex(i => new { i.Status, i.CreatedAt });
            b.Property(i => i.Title).HasMaxLength(160);
            b.Property(i => i.Description).HasMaxLength(4000);
            b.Property(i => i.RequestKey).HasMaxLength(200);
            b.Property(i => i.Version).IsConcurrencyToken();
            b.HasOne<Service>().WithMany().HasForeignKey(i => i.ServiceId).OnDelete(DeleteBehavior.Restrict);
            b.HasOne<AppUser>().WithMany().HasForeignKey(i => i.AssigneeId).OnDelete(DeleteBehavior.Restrict);
            b.HasMany(i => i.Events).WithOne().HasForeignKey(e => e.IncidentId).HasPrincipalKey(i => i.Id).OnDelete(DeleteBehavior.Cascade);
        });
        // Event IDs come from the aggregate. EF must INSERT newly discovered events,
        // rather than assuming a non-empty generated key identifies an existing row.
        builder.Entity<IncidentEvent>().Property(e => e.Id).ValueGeneratedNever();
        builder.Entity<IncidentEvent>().HasIndex(e => new { e.IncidentId, e.CreatedAt });
        builder.Entity<Service>().Property(s => s.Name).HasMaxLength(80);
        builder.Entity<Service>().HasIndex(s => s.Name).IsUnique();
    }

}
