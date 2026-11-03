import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
test('workspace stays dark and has no theme selector', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('relay.theme', 'light'));
  await page.emulateMedia({ colorScheme: 'light' });
  await page.goto('./');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await expect(page.getByRole('combobox', { name: 'Color theme' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Explore as commander' }).click();
  await expect(page.getByRole('table').first()).toBeVisible();
  const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
  expect(result.violations).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
