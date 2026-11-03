using System.Text.Json.Serialization;
using System.Threading.RateLimiting;
using Microsoft.AspNetCore.Antiforgery;
using Microsoft.AspNetCore.DataProtection;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using Relay.Api;
using Relay.Domain;
using Relay.Infrastructure;

var builder = WebApplication.CreateBuilder(args);
builder.WebHost.ConfigureKestrel(o => o.Limits.MaxRequestBodySize = 16_384);
builder.Services.AddProblemDetails();
builder.Services.AddResponseCompression(o => o.EnableForHttps = true);
builder.Services.Configure<Microsoft.AspNetCore.ResponseCompression.GzipCompressionProviderOptions>(o =>
    o.Level = System.IO.Compression.CompressionLevel.Optimal);
builder.Services.Configure<Microsoft.AspNetCore.ResponseCompression.BrotliCompressionProviderOptions>(o =>
    o.Level = System.IO.Compression.CompressionLevel.Optimal);
builder.Services.AddOpenApi();
builder.Services.ConfigureHttpJsonOptions(o => o.SerializerOptions.Converters.Add(new JsonStringEnumConverter(allowIntegerValues: false)));
builder.Services.AddSingleton(TimeProvider.System);
builder.Services.AddDbContext<RelayDbContext>(o => o.UseSqlite(builder.Configuration.GetConnectionString("Relay")));
builder.Services.AddIdentityCore<AppUser>(o =>
{
    o.Password.RequiredLength = 12;
    o.User.RequireUniqueEmail = true;
    o.Lockout.MaxFailedAccessAttempts = 5;
    o.Lockout.DefaultLockoutTimeSpan = TimeSpan.FromMinutes(15);
}).AddRoles<IdentityRole<Guid>>().AddEntityFrameworkStores<RelayDbContext>().AddSignInManager();
builder.Services.AddAuthentication(IdentityConstants.ApplicationScheme)
    .AddCookie(IdentityConstants.ApplicationScheme, o =>
    {
        o.Cookie.Name = "relay.session";
        o.Cookie.HttpOnly = true;
        o.Cookie.SameSite = SameSiteMode.Strict;
        o.Cookie.SecurePolicy = builder.Environment.IsDevelopment() || builder.Environment.IsEnvironment("Testing") ? CookieSecurePolicy.SameAsRequest : CookieSecurePolicy.Always;
        o.ExpireTimeSpan = TimeSpan.FromHours(8);
        o.Events.OnRedirectToLogin = context => { context.Response.StatusCode = 401; return Task.CompletedTask; };
        o.Events.OnRedirectToAccessDenied = context => { context.Response.StatusCode = 403; return Task.CompletedTask; };
    });
builder.Services.AddAuthorizationBuilder().AddPolicy("Respond", p => p.RequireRole("Commander", "Responder"))
    .AddPolicy("Command", p => p.RequireRole("Commander"));
builder.Services.AddAntiforgery(o => { o.HeaderName = "X-CSRF-TOKEN"; o.Cookie.Name = "relay.csrf"; o.Cookie.SameSite = SameSiteMode.Strict; });
builder.Services.AddSignalR();
builder.Services.AddHostedService<SlaWorker>();
builder.Services.AddHealthChecks().AddDbContextCheck<RelayDbContext>();
builder.Services.AddRateLimiter(o =>
{
    o.RejectionStatusCode = 429;
    o.AddPolicy("login", context => RateLimitPartition.GetFixedWindowLimiter(
        context.Connection.RemoteIpAddress?.ToString() ?? "unknown", _ => new FixedWindowRateLimiterOptions
        {
            PermitLimit = builder.Environment.IsEnvironment("Testing") ? 200 :
            builder.Configuration.GetValue<bool>("Demo:Enabled") && context.Request.Path == "/api/session/demo" ? 120 : 12,
            Window = TimeSpan.FromMinutes(1),
            QueueLimit = 0
        }));
    o.GlobalLimiter = PartitionedRateLimiter.Create<HttpContext, string>(context => RateLimitPartition.GetFixedWindowLimiter(
        context.Connection.RemoteIpAddress?.ToString() ?? "unknown", _ => new FixedWindowRateLimiterOptions
        { PermitLimit = 600, Window = TimeSpan.FromMinutes(1), QueueLimit = 0 }));
    o.OnRejected = async (context, ct) =>
    {
        context.HttpContext.Response.Headers.RetryAfter = "60";
        await Results.Problem(statusCode: 429, title: "Too many requests", detail: "Wait one minute and try again.").ExecuteAsync(context.HttpContext);
    };
});

var dataPath = Path.Combine(builder.Environment.ContentRootPath, "data");
Directory.CreateDirectory(dataPath);
builder.Services.AddDataProtection().PersistKeysToFileSystem(new DirectoryInfo(Path.Combine(dataPath, "keys"))).SetApplicationName("Relay");

var app = builder.Build();
app.UseExceptionHandler(error => error.Run(async context =>
{
    var ex = context.Features.Get<Microsoft.AspNetCore.Diagnostics.IExceptionHandlerFeature>()?.Error;
    var (status, title, detail) = ex switch
    {
        DomainException e => (422, "This change needs attention", e.Message),
        DbUpdateConcurrencyException => (409, "Incident changed", "Another responder updated this incident. Refresh and try again."),
        DbUpdateException { InnerException: SqliteException { SqliteErrorCode: 19 } } => (409, "Record already exists", "This request or service name already exists. Refresh before retrying."),
        BadHttpRequestException => (400, "Invalid request", "Check the request body and field types."),
        _ => (500, "Something went wrong", "The request could not be completed. Try again.")
    };
    await Results.Problem(statusCode: status, title: title, detail: detail,
        extensions: new Dictionary<string, object?> { ["traceId"] = context.TraceIdentifier }).ExecuteAsync(context);
}));
if (!app.Environment.IsDevelopment() && !app.Environment.IsEnvironment("Testing")) app.UseHsts();
app.Use(async (context, next) =>
{
    context.Response.Headers["X-Content-Type-Options"] = "nosniff";
    context.Response.Headers["Referrer-Policy"] = "same-origin";
    context.Response.Headers["X-Frame-Options"] = "DENY";
    context.Response.Headers["Content-Security-Policy"] = "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; font-src 'self'; connect-src 'self' ws: wss:; frame-ancestors 'none'; base-uri 'self'; form-action 'self'";
    if (context.Request.Path.StartsWithSegments("/api")) context.Response.Headers.CacheControl = "no-store";
    if (context.Request.Path.StartsWithSegments("/hubs") && context.Request.Headers.Origin.FirstOrDefault() is { } origin
        && origin != $"{context.Request.Scheme}://{context.Request.Host}")
    { context.Response.StatusCode = 403; return; }
    await next();
});
app.UseDefaultFiles();
// Compress only public build assets; authenticated JSON and CSRF responses stay
// outside compression. Hashed bundles can be reused safely across visits.
app.UseWhen(context => context.Request.Path.StartsWithSegments("/assets"), assets => assets.UseResponseCompression());
app.UseStaticFiles(new StaticFileOptions
{
    OnPrepareResponse = context =>
    {
        var path = context.Context.Request.Path;
        context.Context.Response.Headers.CacheControl = path.StartsWithSegments("/assets")
            ? "public,max-age=31536000,immutable"
            : path.StartsWithSegments("/fonts") ? "public,max-age=604800" : "no-cache";
    }
});
app.UseRouting();
app.UseRateLimiter();
app.UseAuthentication();
app.UseAuthorization();
app.Use(async (context, next) =>
{
    if (context.Request.Path.StartsWithSegments("/api") && !HttpMethods.IsGet(context.Request.Method)
        && !HttpMethods.IsHead(context.Request.Method) && !HttpMethods.IsOptions(context.Request.Method))
    {
        try { await context.RequestServices.GetRequiredService<IAntiforgery>().ValidateRequestAsync(context); }
        catch (AntiforgeryValidationException)
        { await Results.Problem(statusCode: 400, title: "Session verification expired", detail: "Refresh this page and try again.").ExecuteAsync(context); return; }
    }
    await next();
});
app.MapRelayEndpoints();
app.MapHub<IncidentHub>("/hubs/incidents");
app.MapHealthChecks("/health");
app.MapOpenApi().RequireAuthorization();
app.Map("/api/{**path}", () => Results.NotFound());
app.MapFallbackToFile("index.html");

using (var scope = app.Services.CreateScope())
{
    await SeedData.InitializeAsync(scope.ServiceProvider.GetRequiredService<RelayDbContext>(),
        scope.ServiceProvider.GetRequiredService<UserManager<AppUser>>(),
        scope.ServiceProvider.GetRequiredService<RoleManager<IdentityRole<Guid>>>(),
        app.Configuration.GetValue<bool>("Demo:Enabled"), app.Configuration["Bootstrap:Email"],
        app.Configuration["Bootstrap:Password"], app.Services.GetRequiredService<TimeProvider>());
}
await app.RunAsync();
public partial class Program;
