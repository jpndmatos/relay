// Audit an authenticated production build, not the lightweight sign-in screen.
import { chromium } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
let lighthouse;
try { ({ default: lighthouse } = await import(process.env.LIGHTHOUSE_MODULE ? pathToFileURL(process.env.LIGHTHOUSE_MODULE).href : 'lighthouse')); }
catch {
  console.error('Install the optional audit tool first: npm install --no-save --package-lock=false lighthouse@12.8.2');
  process.exit(1);
}
const url = process.env.RELAY_URL ?? 'http://localhost:5180';
const label = process.argv[2] ?? 'current';
const output = fileURLToPath(new URL('../../tmp/relay-performance/', import.meta.url));
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ args: ['--remote-debugging-port=9227'] });
try {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto(url);
  await page.getByRole('button', { name: 'Explore as commander' }).click();
  await page.getByRole('table').first().waitFor();
  // Lighthouse opens its own page in Chrome's default context. Authenticate there
  // with the same cookies instead of accidentally auditing a signed-out screen.
  const cdpBrowser = await chromium.connectOverCDP('http://localhost:9227');
  await cdpBrowser.contexts()[0].addCookies(await context.cookies());
  const report = await lighthouse(url, {
    port: 9227, output: 'html', logLevel: 'error', disableStorageReset: true,
    onlyCategories: ['performance', 'accessibility', 'best-practices'],
    throttlingMethod: 'simulate',
  });
  const lhr = report.lhr;
  const audits = lhr.audits;
  const authenticated = audits['network-requests'].details.items.some(item => item.url.includes('/api/incidents?'));
  if (!authenticated) throw new Error('The audit did not reach the authenticated incident queue.');
  const summary = {
    label, url, authenticated, lighthouseVersion: lhr.lighthouseVersion,
    scores: Object.fromEntries(Object.entries(lhr.categories).map(([k, v]) => [k, Math.round(v.score * 100)])),
    metrics: Object.fromEntries(['first-contentful-paint', 'largest-contentful-paint', 'total-blocking-time', 'cumulative-layout-shift', 'speed-index', 'total-byte-weight'].map(k => [k, { value: audits[k]?.numericValue, display: audits[k]?.displayValue }])),
    opportunities: Object.values(audits).filter(a => a.score !== null && a.score < 1 && ['metricSavings', 'opportunity'].some(k => k in (a.details ?? {}))).map(a => ({ id: a.id, title: a.title, display: a.displayValue })),
  };
  await writeFile(`${output}/${label}.html`, report.report);
  await writeFile(`${output}/${label}.json`, JSON.stringify(summary, null, 2));
  await writeFile(`${output}/${label}.lhr.json`, JSON.stringify(lhr));
  console.log(JSON.stringify(summary, null, 2));
} finally { await browser.close(); }
