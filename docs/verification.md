# Verification record

Verified locally on 3 November 2026 with the .NET 10 SDK and Node.js 22.14 on Windows. This file records completed checks rather than a guarantee about every deployment environment.

- .NET builds with nullable reference checking and warnings treated as errors.
- 25 domain and real SQLite HTTP integration tests passed, including production-mode password login and account lockout.
- 18 frontend unit tests passed, covering the demo, UTC formatting, query validation, cancellation and tab-scoped drafts.
- Frontend TypeScript check and production/static-demo builds passed.
- npm dependency audit: zero reported vulnerabilities at installation time.
- Full .NET host: 20 Playwright workflows passed across desktop and mobile. The duplicate mobile SignalR transport check and desktop-only omission of the mobile disclosure check were intentionally skipped; two-session SignalR delivery passed on desktop.
- Static portfolio demo: 13 workflows passed across desktop and mobile. HTTP-only filtering, failure and conflict cases, and SignalR cases are excluded because this build deliberately has no backend.
- Frontend regressions check that filters request only the incident queue, view navigation reuses reference data, drafts survive reopening/reload, keyboard commands work, failed requests can be retried and conflict notices survive a successful refresh.
- axe: zero WCAG A/AA violations in the tested queue and detail views; layout checked at 320, 390, 768, 1024, 1440 and 1920 pixels.
- Hallmark sweep: zero Floor failures; the queue's live count and identifier typography are documented exceptions. Secondary-button and heading-selector warnings were reviewed against the actual controls and text.
- Real desktop, incident detail and mobile captures are included in this directory; the portfolio cover is a crop of the running .NET workspace.

The frontend refinement pass includes an authenticated mobile Lighthouse comparison. See [performance.md](performance.md) for the measurements and lab limits. Static assets were also checked for compression and immutable cache headers; API session responses remain uncompressed and uncached.

Dark-only follow-up: the palette is fixed in HTML. The theme regression checks stale light preferences, a light operating system, absence of the selector, narrow layouts and queue accessibility. The historical light/system selector tests were replaced.

Final standalone verification: 25 .NET tests, 18 frontend unit tests and 22 browser cases passed (two viewport-specific cases skipped). Browser workflows ran on a separate disposable database.
