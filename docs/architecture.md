# Architecture decisions

## A small modular monolith

One deployable ASP.NET Core application serves the REST API, SignalR hub and compiled React interface. `Domain` remains framework-free; `Infrastructure` owns persistence and Identity; `Api` composes the application and its use cases. There is one SQLite database. This is an intentionally small deployable system, with fewer operational dependencies than microservices.

## The incident aggregate is the write boundary

`Incident.Create`, `Assign`, `Transition`, `Comment` and `MarkSlaBreach` enforce the rules and add timeline entries. HTTP handlers and the worker cannot bypass transition rules accidentally. Events have explicit GUID identities; EF marks them as non-generated so a new event on an existing aggregate is inserted correctly. Incident numbers are SQLite-generated integer primary keys; a GUID alternate key is the public identifier and event foreign key. Concurrent creation cannot allocate the same human-readable number in application memory.

The event table is an append-only application audit trail, **not event sourcing**. Current aggregate state is persisted directly. There is no API to edit or delete historical events. Access to the database itself remains privileged access, rather than a tamper-proof audit boundary.

## Optimistic concurrency has two checks

Every mutation sends the incident version the client read. An early version mismatch returns 409. The same version property is an EF concurrency token, so two requests which both pass the early check still cannot silently overwrite each other. EF sends the original version in its update predicate, and the unsuccessful transaction rolls back its timeline insert too. Integration tests cover both simultaneous HTTP requests and independent tracked DbContexts.

The UI refreshes after a conflict while preserving the text the user wrote. Assignment and progression are explicit writes rather than optimistic changes pretending to have committed.

## Creation retries are safe

A client-generated UUID idempotency key is scoped to the authenticated user and has a unique database index. Replaying the same payload returns the existing incident. Reusing the key for different data returns 409. The create form retains its key across a failed attempt and replaces it if the payload changes. Concurrent requests with the same key may receive a unique-constraint 409; retrying with the original key then recovers the existing resource. Keys live for the lifetime of the incident.

## A resolution target is not an uptime claim

Critical incidents get 30 minutes, Major 120 and Minor 480. Deadlines are computed in UTC once at creation. A `BackgroundService` checks overdue, unresolved incidents every 30 seconds, records one escalation and invalidates connected clients. Its mutation is idempotent. A late resolution is marked breached immediately, even if it arrives before the worker's next sweep. A resolved incident is not escalated afterwards.

`TimeProvider` is injected into domain orchestration and the worker so time-sensitive behaviour can be tested without sleeps. Duration values are based on UTC instants; charts group days in UTC, while the interface displays individual timestamps in the browser's locale.

## Identity and server-side permissions

ASP.NET Core Identity handles password hashing, account lockout and role claims. Sessions use HttpOnly, SameSite=Strict cookies. JSON writes validate an antiforgery token, including login and the demo entry endpoint. Identity-bound tokens are refreshed after sign-in, sign-out or role switching. The API applies role policies independently of frontend visibility. Same-origin SignalR connections authenticate with the session cookie; foreign browser origins are rejected for hub requests.

Commander can register services and respond. Responder can declare incidents, assign eligible responders and post updates. Viewer can only read. There is no public registration endpoint. Demo accounts have no shared password and can only be entered when `Demo:Enabled` is explicitly true.

## Live transport is an invalidation hint

SignalR tells authenticated clients that incidents changed; it does not carry private incident details or become the source of truth. Clients fetch authorised, versioned data again. Reconnection and a 30-second reconciliation poll recover from missed messages. Notifications are best-effort **after** the database commit. There is no distributed outbox, guaranteed delivery or multi-instance backplane. Add those only if deploying across instances or integrating external notification providers.

## SQLite is deliberate

It makes cloning, running and integration testing the actual persistence model straightforward. Foreign keys, unique constraints, migrations, version checks and transactional aggregate updates remain real. Query filters run in SQL; list responses are paginated, and overview queries exclude older resolved history. A single-instance workspace is the intended scale. SQLite's single-writer limit, local filesystem durability and startup migrations are not an architecture for a horizontally scaled service. At that boundary, move to PostgreSQL, run migrations as a release step and review provider-specific behaviour.

## The static demo has an explicit trust boundary

The demo build uses a local adapter behind the same request interface, with deliberately similar validation and workflow behaviour. It persists only browser-local fictional data. Client-side roles are a demonstration, not authentication. The full build uses the .NET endpoints exclusively and reports connection failures; it never fabricates a successful backend response from demo data. Both paths have targeted tests, but the backend remains authoritative and is tested separately.
