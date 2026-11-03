import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.goto('./'); await page.getByRole('button', { name: 'Explore as commander' }).click();
  await expect(page.getByRole('table').first()).toBeVisible();
});

test('filters fetch only the queue and in-app navigation reuses reference data', async ({ page }) => {
  test.skip(!!process.env.RELAY_DEMO, 'The static demo has no HTTP data requests.');
  const paths: string[] = [];
  page.on('request', req => { if (req.url().includes('/api/')) paths.push(new URL(req.url()).pathname); });
  const filtered = page.waitForResponse(response => response.url().includes('/api/incidents?') && response.url().includes('severity=Major'));
  await page.getByRole('combobox', { name: 'Filter severity' }).selectOption('Major'); await filtered;
  await expect(page.locator('.incident-table tbody tr')).not.toHaveCount(0);
  expect(paths).toEqual(['/api/incidents']);
  await page.getByRole('button', { name: 'Services', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Service directory', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Activity', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Latest updates', exact: true })).toBeVisible();
  expect(paths).toEqual(['/api/incidents']);
});

test('drafts survive closing, reopening and reloading an incident', async ({ page }) => {
  const row = page.locator('.incident-link').first(); await row.click();
  let dialog = page.getByRole('dialog');
  await dialog.getByLabel('Incident update', { exact: true }).fill('Keep this unposted response update.');
  await expect(dialog.getByText('Draft saved in this tab', { exact: true })).toBeVisible();
  await page.keyboard.press('Escape'); await expect(dialog).not.toBeVisible();
  await row.click(); dialog = page.getByRole('dialog');
  await expect(dialog.getByLabel('Incident update', { exact: true })).toHaveValue('Keep this unposted response update.');
  await page.reload();
  await expect(page.getByRole('dialog').getByLabel('Incident update', { exact: true })).toHaveValue('Keep this unposted response update.');
});

test('keyboard actions focus search and restore a partially written incident form', async ({ page }) => {
  await page.keyboard.press('Control+k');
  await expect(page.getByRole('textbox', { name: 'Search incidents' })).toBeFocused();
  await page.getByRole('heading', { name: 'Incidents', exact: true }).click();
  await page.keyboard.press('Alt+Shift+n');
  const form = page.getByRole('region', { name: 'Declare an incident' });
  await form.getByLabel('Incident title', { exact: false }).fill('Unfinished incident draft');
  await form.getByRole('button', { name: 'Close incident form' }).click();
  await page.getByRole('button', { name: 'Declare incident', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Declare an incident' }).getByLabel('Incident title', { exact: false })).toHaveValue('Unfinished incident draft');
});

test('mobile service watch is compact and keyboard-expandable', async ({ page }, info) => {
  test.skip(info.project.name !== 'mobile', 'The desktop watch starts expanded.');
  const watch = page.locator('.watch-disclosure');
  await expect(watch).not.toHaveAttribute('open', '');
  await watch.locator('summary').focus(); await page.keyboard.press('Enter');
  await expect(watch).toHaveAttribute('open', '');
  await expect(watch.getByRole('button', { name: /Payments API/ })).toBeVisible();
});

test('a failed filter request keeps existing data and provides a working retry', async ({ page }) => {
  test.skip(!!process.env.RELAY_DEMO, 'The static demo uses local storage.');
  let fail = true;
  await page.route('**/api/incidents?**', route => fail && route.request().url().includes('severity=Minor')
    ? route.fulfill({ status: 503, contentType: 'application/problem+json', body: JSON.stringify({ detail: 'Temporary connection failure. Try again.' }) }) : route.continue());
  await page.getByRole('combobox', { name: 'Filter severity' }).selectOption('Minor');
  await expect(page.getByRole('alert')).toContainText('Temporary connection failure');
  await expect(page.getByRole('table').first()).toBeVisible();
  fail = false; await page.getByRole('button', { name: 'Try again', exact: true }).click();
  await expect(page.getByRole('alert')).toHaveCount(0);
  await expect(page.locator('.incident-table tbody tr').first()).toContainText('Minor');
});

test('a concurrent-write notice stays visible after refreshing while the draft is preserved', async ({ page }) => {
  test.skip(!!process.env.RELAY_DEMO, 'HTTP conflict handling is checked against the full host.');
  await page.locator('.incident-link').first().click();
  const dialog = page.getByRole('dialog');
  const note = `Keep the response update after a conflicting edit ${Date.now()}.`;
  await dialog.getByLabel('Incident update', { exact: true }).fill(note);
  let first = true;
  await page.route('**/api/incidents/*/comments', route => {
    if (!first) return route.continue();
    first = false;
    return route.fulfill({ status: 409, contentType: 'application/problem+json', body: JSON.stringify({ detail: 'Another responder updated this incident. Refresh and try again.' }) });
  });
  const refreshed = page.waitForResponse(response => /\/api\/incidents\/[^/?]+$/.test(response.url()) && response.request().method() === 'GET');
  await dialog.getByRole('button', { name: 'Post update' }).click(); await refreshed;
  await expect(dialog.getByRole('alert')).toContainText('Another responder updated this incident');
  await expect(dialog.getByLabel('Incident update', { exact: true })).toHaveValue(note);
  await dialog.getByRole('button', { name: 'Post update' }).click();
  await expect(dialog.getByRole('alert')).toHaveCount(0);
  await expect(dialog.getByText(note, { exact: true })).toBeVisible();
});
