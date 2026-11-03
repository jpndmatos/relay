// Capture the actual running .NET application, including a clean portfolio cover.
// Start Relay first. Usage: node scripts/capture.mjs [http://localhost:5180]
import { chromium } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
const docs = fileURLToPath(new URL('../../docs/', import.meta.url));
const covers = fileURLToPath(new URL('../../docs/', import.meta.url));
await mkdir(docs, { recursive: true });
await mkdir(covers, { recursive: true });
const browser = await chromium.launch();
try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 1 });
  const page = await context.newPage();
  await page.goto(process.argv[2] ?? 'http://localhost:5180');
  await page.getByRole('button', { name: 'Explore as commander' }).click();
  await page.getByRole('table').first().waitFor();
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: `${docs}/workspace.png`, fullPage: true });
  const region = await page.locator('.workspace-grid').boundingBox();
  if (!region) throw new Error('Workspace is not rendered.');
  await page.screenshot({ path: `${covers}/cover.png`, clip: { x: region.x, y: region.y, width: region.width, height: Math.min(region.height, region.width * 360 / 960) } });
  await page.locator('.incident-link').first().click();
  await page.getByRole('dialog').getByRole('heading').first().waitFor();
  await page.screenshot({ path: `${docs}/incident.png` });
  await page.keyboard.press('Escape');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: `${docs}/mobile.png`, fullPage: true });
  await context.close();
  console.log('Saved real desktop, timeline, mobile and portfolio captures.');
} finally { await browser.close(); }
