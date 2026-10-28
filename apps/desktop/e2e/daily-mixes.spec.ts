import { expect, test } from '@playwright/test';
import { installMockNavidrome, MOCK_PASSWORD, MOCK_SERVER, MOCK_USER } from './mock-navidrome';

test.beforeEach(async ({ page, isMobile }) => {
  test.skip(isMobile, 'daily mixes are on the desktop home page');
  await installMockNavidrome(page);
  await page.goto('/');
  await page.getByLabel('Server URL').fill(MOCK_SERVER);
  await page.getByLabel('Username').fill(MOCK_USER);
  await page.getByLabel('Password', { exact: true }).fill(MOCK_PASSWORD);
  await page.getByRole('button', { name: 'Log in' }).click();
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
});

test('daily mixes: shown on Home, play, open, remake, the same after a reload', async ({ page }) => {
  // every mock song is Ambient and 10 of 12 have been played
  const shelf = page.getByRole('region', { name: 'Made for you' });
  await expect(shelf.getByRole('link', { name: 'Ambient Mix' })).toBeVisible({ timeout: 15_000 });

  // keep the card clear of the sticky header
  await shelf.evaluate((el) => el.scrollIntoView({ block: 'center' }));
  await shelf.getByRole('button', { name: 'Play Ambient Mix' }).click();
  const player = page.getByRole('region', { name: 'Player' });
  await expect(player).toHaveAttribute('data-status', 'playing', { timeout: 10_000 });
  await expect(player).toContainText('Ambient Mix');

  await shelf.getByRole('link', { name: 'Ambient Mix' }).click();
  await expect(page).toHaveURL(/#\/mix\/genre%3Aambient/);
  await expect(page.getByRole('heading', { level: 1, name: 'Ambient Mix' })).toBeVisible();
  await expect(page.getByText('12 songs')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Pause mix' })).toBeVisible();
  const tracks = page.getByRole('list', { name: 'Ambient Mix tracks' }).or(page.getByRole('table', { name: 'Ambient Mix tracks' })).or(page.getByRole('grid', { name: 'Ambient Mix tracks' }));
  const order = await tracks.innerText();

  await page.getByRole('button', { name: 'More options', exact: true }).first().click();
  await page.getByRole('menuitem', { name: 'Make new mixes for today' }).click();
  await expect.poll(() => tracks.innerText()).not.toBe(order);
  const remade = await tracks.innerText();

  await page.reload();
  await expect(page.getByRole('heading', { level: 1, name: 'Ambient Mix' })).toBeVisible();
  await expect.poll(() => tracks.innerText()).toBe(remade);
});
