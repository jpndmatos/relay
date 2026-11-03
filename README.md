# Relay

An incident response workspace built with **.NET 10, ASP.NET Core, EF Core, SQLite, SignalR, React and TypeScript**.

Declare an incident, assign a responder, work through recovery and leave a shared record of what happened. Service health and resolution metrics come from the incident records, rather than decorative dashboard numbers.

![The Relay incident workspace](docs/workspace.png)

## Run the complete app

Requirements: [.NET 10 SDK](https://dotnet.microsoft.com/download/dotnet/10.0), Node.js 22.12+ and npm. No database server, cloud credentials or account registration is needed for the local demo.

From this directory, Windows:

```powershell
.\run.ps1
```

macOS / Linux:

```sh
sh run.sh
```

Open **http://localhost:5180** and choose **Explore as commander**. The first run applies versioned EF Core migrations and seeds clearly fictional services, people and incidents. SQLite records and cookie encryption keys persist under `src/Relay.Api/data/`. Switching roles in the header lets you check the permission boundaries.

The Windows script also recognises a task-local SDK at `%LOCALAPPDATA%/RelayDevTools/dotnet`, used to build and test this project on a machine with an older system SDK. It does not change the system SDK or PATH.

For frontend development with hot reload, run the API as above, then:

```sh
cd web
npm run dev
```

Open http://127.0.0.1:5173. Vite proxies the API and SignalR to the .NET host; there is no cross-origin cookie configuration to maintain.

## Docker

```sh
docker compose up --build
```

The same workspace runs at http://localhost:5180, with SQLite and Data Protection keys in a named volume. The container builds both applications, runs as the unprivileged .NET application user and serves them from one origin. The supplied compose file explicitly opts into a **local development demo**, bound to loopback. Docker configuration is supplied; the image has not been executed in the authoring environment, where Docker was unavailable.

## What to try

1. Open a seeded incident to read its event history and resolution deadline.
2. Declare an incident, assign a responder and post a progress update.
3. Move through **Investigating → Identified → Monitoring → Resolved**. Each move needs a useful update. Stages cannot be skipped or reversed, and a responder must be assigned first.
4. Open a second browser session. A change in one session refreshes the other through SignalR. The client also reconciles every 30 seconds if live delivery is unavailable.
5. Switch to **Viewer**. Reading remains available; write controls disappear and the API independently rejects writes.
6. Register a service as **Commander**. Select it in the directory to filter the queue. Its health follows active incidents.
7. Open **Status page**. This public endpoint exposes incident titles, stage and service health, while excluding internal descriptions, timeline entries and responder identities.

## Two delivery modes

| Mode | Storage and behaviour | Purpose |
| --- | --- | --- |
| Full app | .NET API, real SQLite, Identity cookies, server authorisation, background worker and SignalR | Run, inspect and test the backend |
| Portfolio demo | Browser localStorage, local role simulation, cross-tab storage events, no backend requests | Try the interface directly on GitHub Pages |

Build the portfolio demo with `cd web && npm run build:demo`. It writes to the portfolio's `demo/relay/` directory and is explicitly labelled in the UI. **The static demo does not run .NET and its role selector is not a security boundary.** The full build cannot silently fall back to local data when its API is unavailable. The public demo can be reset without affecting the .NET database.

## Architecture

```text
React + TypeScript
       │ same-origin JSON + antiforgery header
       ▼
Relay.Api                  HTTP contracts, validation, role policies,
       │                   Problem Details, SignalR and SLA worker
       ▼
Relay.Infrastructure       EF Core, Identity, migrations, seed data
       │
       ▼
Relay.Domain               Incident aggregate, state machine,
                           deadline policy and recorded events
```

The domain project has no framework dependencies. The API orchestrates use cases; domain methods enforce business rules even when called by the worker rather than an HTTP route. EF's DbContext is the unit of work, so incident changes and their timeline entries commit in one database transaction. A repository wrapper and a mediator pipeline would add little to this size of application.

Important decisions and their limits are recorded in [the architecture notes](docs/architecture.md).

## API

Signed-in users can inspect `/openapi/v1.json`. The schema is generated from the actual Minimal API routes.

| Endpoint | Access | Purpose |
| --- | --- | --- |
| `GET /api/session` | Public | User, demo configuration and antiforgery request token |
| `POST /api/session/login` | Public, antiforgery | Identity password authentication with lockout |
| `POST /api/session/demo` | Explicit demo mode only | Sign in as a fictional Commander, Responder or Viewer |
| `POST /api/session/logout` | Authenticated | End the cookie session |
| `GET /api/incidents` | Authenticated | Search, status/severity/service/assignee filters and capped pagination |
| `GET /api/incidents/{id}` | Authenticated | Current incident version and full timeline |
| `POST /api/incidents` | Responder / Commander | Declare an incident; requires a UUID `Idempotency-Key` header |
| `POST /api/incidents/{id}/assign` | Responder / Commander | Assign an eligible responder; requires `version` |
| `POST /api/incidents/{id}/transition` | Responder / Commander | Advance one stage; requires `version` and a note |
| `POST /api/incidents/{id}/comments` | Responder / Commander | Add a timeline update; requires `version` |
| `GET /api/services` | Authenticated | Ownership and derived health |
| `POST /api/services` | Commander | Register a service |
| `GET /api/responders` | Authenticated | Eligible incident owners |
| `GET /api/overview` | Authenticated | Actual queue totals, last-seven-day recovery and recent events |
| `GET /api/status` | Public | Deliberately limited service and incident information |
| `GET /health` | Public | SQLite connectivity readiness check |
| `/hubs/incidents` | Authenticated | SignalR invalidation messages |

Every JSON mutation needs `X-CSRF-TOKEN` from `GET /api/session`. Refresh the token after changing authentication identity. Mutation conflicts return **409**; business rule violations return **422**; invalid input returns **400**. Problem Details includes a correlation `traceId` for server errors without exposing stack traces to the client.

## Verification

```sh
dotnet test Relay.sln
cd web
npm ci
npm test
npm run build
npx playwright install chromium
# With the full .NET app running on localhost:5180:
npm run test:e2e
```

The suite covers state transitions, resolution deadlines, late resolution, input validation, real HTTP authentication and CSRF, authorisation, idempotent creation, EF concurrency conflicts, simultaneous edits, event persistence, service health and worker escalation. Integration tests use actual temporary SQLite files and `WebApplicationFactory`, not EF's in-memory provider.

Current local results: **25 .NET tests, 18 frontend unit tests, 20 full-host browser workflows and 13 static-demo browser workflows passed**. The browser runs include desktop and mobile; network checks are skipped where duplicated or inapplicable to the static build.

Frontend refinements, request caching and keyboard behaviour are documented in [the frontend notes](docs/frontend.md). An authenticated mobile Lighthouse comparison and its reproducible settings are in [the performance record](docs/performance.md).

Playwright covers the full recovery flow, role switching, service creation, URL filters, desktop/mobile layouts, accessibility checks with axe and updates between two live browser sessions. Browser tests create their own uniquely named records. Run them against a disposable demo database, rather than an operational workspace.

CI is defined in [`../../.github/workflows/relay.yml`](../../.github/workflows/relay.yml): unit/integration tests, both frontend builds, publish and browser workflows. [Verification notes](docs/verification.md) distinguish checks actually run locally from deployment work.

## Run with real credentials

Demo entry is **off by default** outside the Development launch profile. Use a new database for a non-demo environment and set these values through your deployment secret store:

```text
ASPNETCORE_ENVIRONMENT=Production
Demo__Enabled=false
Bootstrap__Email=<administrator email>
Bootstrap__Password=<unique password, at least 12 characters>
ConnectionStrings__Relay=Data Source=/persistent/relay.db;Default Timeout=10
```

The first administrator is created only when no users exist. No default production password is checked in. Production cookies are Secure and HttpOnly; serve the app over HTTPS. Preserve the writable database and Data Protection key directory across restarts, protect the volume with filesystem permissions and configure encrypted storage for the hosting environment. When using a trusted reverse proxy, terminate HTTPS there and configure forwarded headers for that proxy before deployment. This repository does not automatically trust arbitrary forwarded headers.

User invitations, password recovery, external identity providers, multi-tenancy and horizontal scaling are outside this project. Production readiness depends on the chosen hosting environment, backups, TLS and access lifecycle; a working local demonstration is not a claim of a live production service.

## Credits

Designed and implemented for João Matos's portfolio. General Sans by Indian Type Foundry is redistributed under the [Fontshare Free Font License](web/public/fonts/LICENSE.txt). Icons: Lucide, ISC. All sample incidents, people and service workloads are fictional.

## Standalone project

This repository runs independently of the portfolio. From `web`, `npm run build:demo` creates `web/dist-demo`, a static, browser-only demo. `npm run build` builds the actual .NET application frontend. Screenshots are written to `docs`; audit output stays in local `tmp`.
