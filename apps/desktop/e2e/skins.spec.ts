import { expect, test, type Page } from '@playwright/test';
import { installMockNavidrome, MOCK_PASSWORD, MOCK_SERVER, MOCK_USER } from './mock-navidrome';

/** Skins and classic (Winamp) mode. Mock server only. */
async function login(page: Page) {
  await installMockNavidrome(page);
  await page.goto('/');
  await page.getByLabel('Server URL').fill(MOCK_SERVER);
  await page.getByLabel('Username').fill(MOCK_USER);
  await page.getByLabel('Password', { exact: true }).fill(MOCK_PASSWORD);
  await page.getByRole('button', { name: 'Log in' }).click();
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
}

test('skins restyle the whole app and are remembered', async ({ page }) => {
  await login(page);
  await page.goto('/#/settings');
  const root = page.locator('html');
  await expect(root).toHaveAttribute('data-skin', 'sonora');
  const bg = () => page.evaluate(() => getComputedStyle(document.body).getPropertyValue('--bg').trim());
  const before = await bg();

  await page.getByRole('radio', { name: 'Terminal', exact: true }).click();
  await expect(root).toHaveAttribute('data-skin', 'terminal');
  await expect(root).toHaveAttribute('data-pattern', 'scanlines');
  expect(await bg()).not.toBe(before);
  expect(await page.evaluate(() => getComputedStyle(document.body).fontFamily)).toMatch(/Cascadia|Consolas|monospace/);
  // Theme and accent are set by the skin, so their controls are disabled.
  await expect(page.locator('[aria-disabled=true]').getByRole('radiogroup', { name: 'Accent color' })).toBeVisible();

  await page.getByRole('radio', { name: 'Luna', exact: true }).click();
  await expect(root).toHaveAttribute('data-theme', 'light');
  await page.reload();
  await expect(root).toHaveAttribute('data-skin', 'luna');

  await page.getByRole('radio', { name: 'Sonora', exact: true }).click();
  await expect(root).toHaveAttribute('data-skin', 'sonora');
  expect(await bg()).toBe(before);
});

test('classic mode takes over the queue in Winamp and hands it back', async ({ page, isMobile }) => {
  test.skip(isMobile, 'desktop feature');
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await login(page);
  await page.goto('/#/search?q=glass');
  await page.getByRole('region', { name: 'Albums' }).getByRole('link').first().click();
  await page.getByRole('table').getByRole('row').filter({ has: page.getByRole('cell') }).first().click();
  const player = page.getByRole('region', { name: 'Player' });
  await expect(player).toHaveAttribute('data-status', 'playing');

  await page.getByRole('button', { name: 'Classic mode (Winamp)' }).click();
  await expect(page.getByTestId('classic-mode')).toBeVisible();
  await expect(page.locator('#webamp #main-window')).toBeVisible({ timeout: 15_000 });
  // Sonora pauses while Winamp plays the same queue.
  await expect(player).toHaveAttribute('data-status', 'paused');
  await expect(page.locator('#webamp #playlist-window')).toContainText(/1\.\s/);

  await page.getByRole('button', { name: 'Back to Sonora' }).click();
  await expect(page.getByTestId('classic-mode')).toHaveCount(0);
  await expect(page.locator('#webamp')).toHaveCount(0);
  await expect(player).toHaveAttribute('data-status', 'playing', { timeout: 10_000 });
  expect(errors).toEqual([]);
});
