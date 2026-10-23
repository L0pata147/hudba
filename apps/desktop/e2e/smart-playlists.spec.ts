import { expect, test } from '@playwright/test';
import { installMockNavidrome, MOCK_PASSWORD, MOCK_SERVER, MOCK_USER } from './mock-navidrome';

test.beforeEach(async ({ page, isMobile }) => {
  test.skip(isMobile, 'smart playlists are edited from the desktop sidebar');
  await installMockNavidrome(page);
  await page.goto('/');
  await page.getByLabel('Server URL').fill(MOCK_SERVER);
  await page.getByLabel('Username').fill(MOCK_USER);
  await page.getByLabel('Password', { exact: true }).fill(MOCK_PASSWORD);
  await page.getByRole('button', { name: 'Log in' }).click();
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
});

test('smart playlist: create from a template, play, edit the rules, save to the server, remembered', async ({ page }) => {
  await page.getByRole('complementary', { name: 'Sidebar' }).getByRole('button', { name: 'Create playlist' }).first().click();
  await page.getByRole('menuitem', { name: 'Smart playlist' }).click();
  const dialog = page.getByRole('dialog', { name: 'New smart playlist' });
  await dialog.getByRole('button', { name: 'Never played' }).click();
  await expect(dialog.getByLabel('Name')).toHaveValue('Never played');
  // play counts in the mock are (n·7) mod 5: songs 5 and 10 were never played
  await expect(dialog.getByText('2 songs match')).toBeVisible();
  await dialog.getByRole('button', { name: 'Create' }).click();

  await expect(page).toHaveURL(/#\/smart\/smart-/);
  await expect(page.getByRole('heading', { level: 1, name: 'Never played' })).toBeVisible();
  const tracks = page.getByRole('list', { name: 'Never played tracks' }).or(page.getByRole('table', { name: 'Never played tracks' })).or(page.getByRole('grid', { name: 'Never played tracks' }));
  await expect(tracks).toContainText('Glass Rivers Intro');
  await expect(page.getByRole('link', { name: /Never played/ }).first()).toBeVisible();

  await page.getByRole('button', { name: 'Play smart playlist' }).click();
  await expect(page.getByRole('region', { name: 'Player' })).toHaveAttribute('data-status', 'playing', { timeout: 10_000 });

  // loosen the rules: every song played at least once, most played first, at most 5
  await page.getByRole('button', { name: 'Edit rules' }).click();
  const edit = page.getByRole('dialog', { name: 'Edit smart playlist' });
  await edit.getByLabel('Plays').selectOption('played');
  await edit.getByLabel('Order').selectOption('most-played');
  await edit.getByLabel('At most').selectOption('25');
  await expect(edit.getByText('10 songs match')).toBeVisible();
  await edit.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByText(/10 songs/).first()).toBeVisible();

  await page.getByRole('button', { name: 'More options', exact: true }).first().click();
  await page.getByRole('menuitem', { name: 'Save to server as a playlist' }).click();
  await expect(page.getByText('Saved “Never played” to the server')).toBeVisible();
  await expect(page.getByRole('link', { name: /Never played.*Playlist/ })).toBeVisible();

  await page.reload();
  await expect(page.getByRole('heading', { level: 1, name: 'Never played' })).toBeVisible();
});
