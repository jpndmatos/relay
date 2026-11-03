using System.Net.Http.Json;
using System.Text.Json;
using System.Text.Json.Serialization;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Extensions.Configuration;

namespace Relay.Tests;

public sealed class RelayFactory : WebApplicationFactory<Program>
{
    private readonly bool demo;
    public RelayFactory(bool demo = true) { this.demo = demo; }
    private readonly string database = Path.Combine(Path.GetTempPath(), $"relay-test-{Guid.NewGuid()}.db");
    public static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web) { Converters = { new JsonStringEnumConverter() } };
    protected override void ConfigureWebHost(IWebHostBuilder builder)
    {
        builder.UseEnvironment("Testing");
        builder.ConfigureAppConfiguration((_, config) => config.AddInMemoryCollection(new Dictionary<string, string?>
        {
            ["Demo:Enabled"] = demo.ToString(), ["ConnectionStrings:Relay"] = $"Data Source={database}",
            ["Bootstrap:Email"] = "admin@relay.example", ["Bootstrap:Password"] = "Relay.Test.Account.23!"
        }));
    }
    public async Task<HttpClient> Login(string role = "Commander")
    {
        var client = CreateClient(new WebApplicationFactoryClientOptions { AllowAutoRedirect = false });
        await Csrf(client);
        var response = await client.PostAsJsonAsync("/api/session/demo", new { role });
        response.EnsureSuccessStatusCode();
        await Csrf(client);
        return client;
    }
    public static async Task Csrf(HttpClient client)
    {
        var session = await client.GetFromJsonAsync<JsonElement>("/api/session");
        client.DefaultRequestHeaders.Remove("X-CSRF-TOKEN");
        client.DefaultRequestHeaders.Add("X-CSRF-TOKEN", session.GetProperty("csrfToken").GetString());
    }
    protected override void Dispose(bool disposing)
    {
        base.Dispose(disposing);
        if (disposing) { Microsoft.Data.Sqlite.SqliteConnection.ClearAllPools(); foreach (var suffix in new[] { "", "-wal", "-shm" }) File.Delete(database + suffix); }
    }
}
