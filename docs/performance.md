# Authenticated frontend performance

Measured on 3 November 2026 against local, production-built ASP.NET Core hosts, with identical six-incident sample workspaces. Lighthouse 12.8.2 used its simulated mobile profile: 150 ms RTT, 1,638.4 Kbps throughput and 4× CPU slowdown. The audit signed in first and verified that the incident queue API was requested. These are lab measurements, not field Core Web Vitals or an INP measurement.

| Metric | Before | After |
| --- | ---: | ---: |
| Performance score | 81 | 98 |
| Accessibility score | 100 | 100 |
| Best practices score | 100 | 100 |
| First contentful paint | 2.7 s | 1.4 s |
| Largest contentful paint | 3.6 s | 2.3 s |
| Total blocking time | 0 ms | 0 ms |
| Cumulative layout shift | 0.124 | 0.001 |
| Resource transfer | 431 KiB | 187 KiB |
| Requests on a filter change | 4 | 1 |

The first audit scored 82 and intermediate optimised runs scored 98. The table records the retained final comparison rather than selecting the highest run. Resource sizes and request behaviour improved consistently; score and timing values naturally vary between runs. Sanitised data is in [performance.json](performance.json).

## Changes behind the result

- Public JS/CSS delivery uses compression, hashed immutable asset caching and HTML revalidation. Cookie-authenticated API responses are excluded from asset compression.
- Forms and the incident drawer load separately. Critical fonts are preloaded, while noncritical faces remain demand-loaded.
- Filtering requests only the queue. Navigating existing workspace views reuses data, old requests are cancelled and responder metadata is cached per session identity.
- Polling pauses for hidden/offline tabs; SignalR write echoes are coalesced with local reconciliation.
- Skeletons and touch-sized session controls reserve geometry before data arrives. This removes the sign-in header jump without shrinking mobile controls.

The improvements preserve the real .NET API, authentication, SignalR connection, sample dataset, timeline, role controls and accessibility checks. The audit does not substitute a lightweight signed-out page or disable the application's main features.

## Reproduce

Run the full production build locally, then, from `web/`:

```sh
npx playwright install chromium
# Optional one-off audit tooling; it is not a project/runtime dependency.
npm install --no-save --package-lock=false lighthouse@12.8.2
npm run audit:performance -- current
```

`RELAY_URL` selects a different local host. The script starts an isolated Chromium, enters the demo as Commander, transfers its session cookies to the audit context and checks authenticated API activity. Reports are written under the portfolio's ignored `tmp/relay-performance/`, outside Playwright's output directory so a browser test run cannot delete them. `npm ci` restores the declared dependency tree after the optional audit installation.

GitHub Pages serves the separate static browser demo. Its host supplies its own compression/cache headers, so these .NET-host timings are not presented as measurements of a deployed Pages URL. The local audit does not establish how an internet deployment performs on real users' connections.

Both frontend builds enforce static-entry download budgets: 90 KiB gzip for JavaScript and 10 KiB for CSS. The check follows the Vite manifest’s static dependency graph, including vendor chunks, and early classic bootstrap files, rather than measuring only the entry filename. The dark-only build measures 79.1 KiB and 7.3 KiB. Lazy chunks remain separate and are not counted as initial static imports.

## Dark workspace

The previous authenticated dark-theme audit scored 98 performance, 100 accessibility and 100 best practices (see performance-dark.json). The current dark-only interface removes the preference bootstrap and selector. These are lab observations, not field measurements.

The final dark-only build was re-audited after separation: **98 performance, 100 accessibility, 100 best practices**, 2.1 s LCP, 0.001 CLS and 10 ms TBT. See `performance-dark-only.json` for the sanitized local result.
