import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

test.beforeEach(async ({ page }) => {
  await page.goto('./');
  await page.getByRole('button', { name: 'Explore as commander' }).click();
  await expect(page.getByRole('heading', { name: 'Keep the response moving.' })).toBeVisible();
  await expect(page.getByRole('table').first()).toBeVisible();
});

test('declare, assign, update and resolve an incident', async ({ page }) => {
  const title = `Checkout recovery ${Date.now()}`;
  await page.getByRole('button', { name: 'Declare incident', exact: true }).click();
  const form = page.getByRole('region', { name: 'Declare an incident' });
  await form.getByLabel('Incident title', { exact: false }).fill(title);
  await form.getByLabel('Affected service').selectOption({ label: 'Payments API' });
  await form.getByLabel('Impact and context', { exact: false }).fill('Checkout requests time out. Investigating the upstream connection pool.');
  await form.getByRole('button', { name: 'Declare incident', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByRole('heading', { name: title })).toBeVisible();
  await dialog.getByLabel('Responder', { exact: true }).selectOption({ label: 'Alex Morgan' });
  await expect(dialog.getByLabel('Responder', { exact: true })).toHaveValue('e6e4ac30-f879-4359-b7f1-5f12fab60001');
  await dialog.getByLabel('Incident update', { exact: true }).fill('The response team is investigating the connection pool.');
  await dialog.getByRole('button', { name: 'Post update' }).click();
  await expect(dialog.getByText('The response team is investigating the connection pool.', { exact: true })).toBeVisible();
  for (const stage of ['identified', 'monitoring', 'resolved']) {
    await dialog.getByRole('button', { name: `Move to ${stage}` }).click();
    await dialog.getByLabel('Stage update', { exact: true }).fill(`Verified the ${stage} step with the response team and service owner.`);
    await dialog.getByRole('button', { name: `Mark ${stage}`, exact: true }).click();
    await expect(dialog.locator('.badge-row')).toContainText(stage[0].toUpperCase() + stage.slice(1));
  }
  await expect(dialog.getByText('Target met', { exact: true })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(dialog).not.toBeVisible();
  await page.getByRole('button', { name: 'Resolved', exact: true }).click();
  await page.getByRole('textbox', { name: 'Search incidents' }).fill(title);
  await expect(page.getByRole('table').first().getByText(title, { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('textbox', { name: 'Search incidents' })).toHaveValue(title);
});

test('viewer mode removes write controls and public status stays accessible', async ({ page }) => {
  await page.getByRole('combobox', { name: 'Demo role' }).selectOption('Viewer');
  await expect(page.getByText('You are viewing this workspace with read-only permissions.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Declare incident', exact: true })).toHaveCount(0);
  await page.locator('.incident-link').first().click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Post update' })).toHaveCount(0);
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Status page' }).click();
  await expect(page.getByRole('heading', { name: 'Services', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Active incidents', exact: true })).toBeVisible();
});

test('service registration connects to the incident service filter', async ({ page }) => {
  await page.getByRole('button', { name: 'Services', exact: true }).click();
  await page.getByRole('button', { name: 'Register service', exact: true }).click();
  const form = page.getByRole('region', { name: 'Register a service' });
  const name = `Search API ${Date.now()}`;
  await form.getByLabel('Service name').fill(name);
  await form.getByLabel('Owning team').fill('Platform');
  await form.getByLabel('Description').fill('Search endpoints and indexing workloads.');
  await form.getByRole('button', { name: 'Register service' }).click();
  await page.getByRole('table').getByText(name, { exact: true }).click();
  await expect(page.getByRole('heading', { name: 'The queue is clear' })).toBeVisible();
  await expect(page.getByRole('combobox', { name: 'Filter service' })).toHaveValue(/.+/);
  await page.getByRole('button', { name: 'Clear filters' }).click();
  await expect(page.getByRole('table').first()).toBeVisible();
});

test('workspace is accessible and fits the viewport', async ({ page }, info) => {
  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
  expect(results.violations.map(v => ({ id: v.id, nodes: v.nodes.map(n => n.target) }))).toEqual([]);
  for (const width of [320, 390, 768, 1024, 1440, 1920]) {
    await page.setViewportSize({ width, height: 1000 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `overflow at ${width}px`).toBe(true);
  }
  await page.setViewportSize(info.project.name === 'mobile' ? { width: 390, height: 844 } : { width: 1440, height: 1000 });
  await page.screenshot({ path: `test-results/workspace-${info.project.name}.png`, fullPage: true });
  await page.locator('.incident-link').first().click();
  await expect(page.getByRole('dialog').getByRole('heading').first()).toBeVisible();
  const detailResults = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
  expect(detailResults.violations.map(v => ({ id: v.id, nodes: v.nodes.map(n => n.target) }))).toEqual([]);
  await page.screenshot({ path: `test-results/incident-${info.project.name}.png`, fullPage: false });
});

test('SignalR delivers incident changes to a second signed-in session', async ({ page, browser }, info) => {
  test.skip(!!process.env.RELAY_DEMO || info.project.name === 'mobile', 'Live transport is verified against the .NET host on desktop.');
  await expect(page.getByText('Live updates', { exact: true })).toBeVisible();
  const second = await browser.newContext(); const other = await second.newPage();
  try {
    await other.goto(process.env.RELAY_URL ?? 'http://localhost:5180');
    await other.getByRole('button', { name: 'Explore as commander' }).click();
    await expect(other.getByText('Live updates', { exact: true })).toBeVisible();
    const title = `Live incident ${Date.now()}`;
    await other.getByRole('button', { name: 'Declare incident', exact: true }).click();
    const form = other.getByRole('region', { name: 'Declare an incident' });
    await form.getByLabel('Incident title', { exact: false }).fill(title);
    await form.getByLabel('Affected service').selectOption({ label: 'Public API' });
    await form.getByLabel('Severity', { exact: true }).selectOption('Critical');
    await form.getByLabel('Impact and context', { exact: false }).fill('Checking real-time propagation between two browser sessions.');
    await form.getByRole('button', { name: 'Declare incident', exact: true }).click();
    await expect(page.getByRole('table').first().getByText(title, { exact: true })).toBeVisible({ timeout: 5000 });
  } finally { await second.close(); }
});
