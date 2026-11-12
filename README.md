# Relay

Track incidents from triage to recovery. Assign an owner, update the timeline, and keep the team in sync with live updates and role-based access.

![Relay workspace](docs/workspace.png)

## Setup

.NET 10 SDK and Node.js 22.12+.

```powershell
./run.ps1
```

On macOS/Linux: `sh run.sh`. Open http://localhost:5180 and choose **Explore as commander**. Includes fictional incidents and local role switching. SQLite data persists between runs.

.NET · Identity · EF Core · SignalR · React · TypeScript. [Development notes](docs/development.md).
