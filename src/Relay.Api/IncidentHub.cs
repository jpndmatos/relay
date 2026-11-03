using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.SignalR;

namespace Relay.Api;

[Authorize]
public sealed class IncidentHub : Hub;
