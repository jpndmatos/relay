# Frontend performance and interaction design

The frontend uses a small session-scoped data layer rather than refetching the whole workspace for every UI change. Filters remain in the URL so links, reloads and browser navigation retain context.

## Request behaviour

- Changing search, severity, service, assignee or pagination requests **only `/api/incidents`**. This replaces four requests with one per filter change.
- Search updates the URL immediately and debounces only the network request by 180 ms. Stage and pagination changes have no artificial delay.
- Service health and overview refresh on reconciliation; the responder directory is cached for five minutes per identity.
- Navigating between Incidents, Services and Activity reuses the current workspace data.
- Superseded reads use `AbortController`. Stale responses cannot replace newer results.
- A write and its SignalR echo are coalesced into one reconciliation. One fallback polling timer pauses in hidden or offline tabs and reconciles when they become active again.
- Existing results stay visible while updating, with an explicit busy state. A failed filter request keeps the last successful data and offers a working retry.

## Loading and delivery

Incident details and forms are separate, lazy-loaded chunks. Pointer and keyboard intent can warm their modules before the click. A failed chunk renders a recoverable application error instead of a blank page. The normal app still reports API failures and never substitutes browser demo data.

The .NET host compresses public JS/CSS assets with optimal gzip/Brotli compression and sends year-long immutable caching for fingerprinted bundles. Fonts use a shorter cache, while HTML is revalidated. Authenticated JSON and antiforgery responses are outside asset compression and remain uncached. Only the critical regular and semibold font faces are preloaded; the medium face loads when needed.

Session chrome, summary placeholders and touch-sized account controls reserve their space before data arrives. This avoids the previous header jump. Skeletons do not animate, and refreshing a loaded queue does not replace it with a loading screen.

## Interaction refinements

### Dark workspace

Relay uses a single graphite palette. The theme selector, stored preferences and early theme script have been removed. The initial HTML declares dark mode, including native controls and browser metadata; old browser preferences do not affect it. Severity colors, charts, fields and focus rings use semantic dark tokens.
