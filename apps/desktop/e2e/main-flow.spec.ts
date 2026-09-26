import { expect, test, type Page } from '@playwright/test';
import { installMockNavidrome, MOCK_PASSWORD, MOCK_SERVER, MOCK_USER } from './mock-navidrome';

/**
 * Main flow: Login → Home → Search → Open album → Play song → Add to playlist → Open queue.
 * Runs against the in-memory mock by default. To run against a real server:
 *   SONORA_E2E_SERVER=http://localhost:4533 SONORA_E2E_USER=admin SONORA_E2E_PASSWORD=… pnpm test:e2e
 * (the real-server run expects an album whose name contains SONORA_E2E_QUERY, default "light").
 */
const real = process.env.SONORA_E2E_SERVER;
const server = real ?? MOCK_SERVER;
const user = real ? (process.env.SONORA_E2E_USER ?? 'admin') : MOCK_USER;
const password = real ? (process.env.SONORA_E2E_PASSWORD ?? '') : MOCK_PASSWORD;
const query = real ? (process.env.SONORA_E2E_QUERY ?? 'light') : 'glass';

async function login(page: Page) {
  await page.goto('/');
  await page.getByLabel('Server URL').fill(server);
  await page.getByLabel('Username').fill(user);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Log in' }).click();
}

test.beforeEach(async ({ page }) => {
  if (!real) await installMockNavidrome(page);
});

test('rejects wrong credentials with a clear error', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel('Server URL').fill(server);
  await page.getByLabel('Username').fill(user);
  await page.getByLabel('Password', { exact: true }).fill('definitely-wrong');
  await page.getByRole('button', { name: 'Log in' }).click();
  await expect(page.getByRole('alert')).toContainText('Wrong username or password');
});

test('login → home → search → album → play → add to playlist → queue', async ({ page, isMobile }) => {
  await login(page);
  await expect(page.getByRole('heading', { level: 1 })).toContainText(/Good (morning|afternoon|evening|night)/);
  await expect(page.getByRole('region', { name: 'Recently added' })).toBeVisible();

  // Search
  if (isMobile) {
    await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Search' }).click();
    await page.getByLabel('Search music').fill(query);
  } else {
    await page.keyboard.press('Control+k');
    await expect(page.getByLabel('Search music')).toBeFocused();
    await page.getByLabel('Search music').fill(query);
  }
  const albums = page.getByRole('region', { name: 'Albums' });
  await expect(albums).toBeVisible();

  // Open album
  await albums.getByRole('link').first().click();
  await expect(page).toHaveURL(/#\/album\//);
  await expect(page.getByRole('table')).toHaveCount(1); // lazy route has rendered
  await expect(page.getByRole('table')).toBeVisible();
  const albumTitle = (await page.getByRole('heading', { level: 1 }).textContent()) ?? '';

  // Play the second song
  const rows = page.getByRole('table').getByRole('row').filter({ has: page.getByRole('cell') });
  const secondTitle = (await rows.nth(1).locator('[role="cell"] .truncate').first().textContent())?.trim() ?? '';
  await rows.nth(1).click();
  if (isMobile) {
    await expect(page.getByRole('button', { name: new RegExp(`Now playing: ${secondTitle}`) })).toBeVisible();
  } else {
    const player = page.getByRole('region', { name: 'Player' });
    await expect(player).toContainText(secondTitle);
    await expect(player).toHaveAttribute('data-status', /playing|buffering|loading/);
  }

  // Add the song to a new playlist
  await rows.nth(1).getByRole('button', { name: `More options for ${secondTitle}` }).click();
  await page.getByRole('menuitem', { name: 'Add to playlist…' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'New playlist' }).click();
  const playlistName = `E2E ${Date.now()}`;
  await page.getByRole('dialog').getByLabel('Name').fill(playlistName);
  await page.getByRole('dialog').getByRole('button', { name: 'Create', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: `Created “${playlistName}”` })).toBeVisible();

  // Open queue
  if (isMobile) {
    await page.getByRole('button', { name: /Now playing:/ }).click();
    await page.getByRole('button', { name: 'Queue' }).click();
  } else {
    await page.getByRole('button', { name: 'Show queue' }).click();
  }
  const queue = page.getByRole('region', { name: 'Queue' });
  await expect(queue.getByText('Now playing')).toBeVisible();
  await expect(queue).toContainText(secondTitle);
  expect(albumTitle.length).toBeGreaterThan(0);

  // Playlist exists with the song
  if (isMobile) await page.getByRole('button', { name: 'Close player' }).click();
  await page.goto('/#/library/playlists');
  await page.getByRole('link', { name: playlistName }).first().click();
  await expect(page.getByRole('table')).toContainText(secondTitle);

  // Clean up on real servers
  if (real) {
    await page.getByRole('button', { name: 'More options', exact: true }).click();
    await page.getByRole('menuitem', { name: 'Delete playlist' }).click();
    await page.getByRole('button', { name: 'Delete' }).click();
  }
});

test('favorites update optimistically and persist', async ({ page, isMobile }) => {
  test.skip(isMobile, 'row heart buttons are desktop-only; mobile uses the ⋯ sheet');
  await login(page);
  await page.goto(`/#/search?q=${encodeURIComponent(query)}`);
  const albums = page.getByRole('region', { name: 'Albums' });
  await albums.getByRole('link').first().click();
  await expect(page).toHaveURL(/#\/album\//);
  await expect(page.getByRole('table')).toHaveCount(1); // lazy route has rendered
  const row = page.getByRole('table').getByRole('row').filter({ has: page.getByRole('cell') }).first();
  const title = (await row.locator('[role="cell"] .truncate').first().textContent())?.trim() ?? '';
  await row.hover();
  await row.getByRole('button', { name: `Add ${title} to Favorites` }).click();
  await expect(row.getByRole('button', { name: `Remove ${title} from Favorites` })).toBeVisible();
  await page.goto('/#/favorites');
  await expect(page.getByRole('table')).toContainText(title);
  // restore
  const favRow = page.getByRole('table').getByRole('row').filter({ hasText: title }).first();
  await favRow.hover();
  await favRow.getByRole('button', { name: `Remove ${title} from Favorites` }).click();
  await expect(page.getByRole('table')).toHaveCount(0);
});

test('state survives a reload (session, queue, volume)', async ({ page, isMobile }) => {
  test.skip(isMobile, 'covered by desktop run');
  await login(page);
  await page.goto(`/#/search?q=${encodeURIComponent(query)}`);
  await page.getByRole('region', { name: 'Albums' }).getByRole('link').first().click();
  await expect(page).toHaveURL(/#\/album\//);
  await expect(page.getByRole('table')).toHaveCount(1); // lazy route has rendered
  await page.getByRole('table').getByRole('row').filter({ has: page.getByRole('cell') }).first().click();
  const player = page.getByRole('region', { name: 'Player' });
  await expect(player).toHaveAttribute('data-status', /playing|buffering|loading/);
  await page.getByRole('button', { name: 'Mute' }).click();
  await page.reload();
  await expect(page.getByRole('region', { name: 'Player' })).toHaveAttribute('data-status', 'paused');
  await expect(page.getByRole('button', { name: 'Unmute' })).toBeVisible();
  // Still signed in and on the same page (hash route survives reload).
  await expect(page.getByRole('table')).toBeVisible();
});

test('song radio: start from a song, keeps a queue, can be stopped', async ({ page, isMobile }) => {
  test.skip(isMobile, 'covered by desktop run');
  await login(page);
  await page.goto(`/#/search?q=${encodeURIComponent(query)}`);
  await page.getByRole('region', { name: 'Albums' }).getByRole('link').first().click();
  await expect(page).toHaveURL(/#\/album\//);
  await expect(page.getByRole('table')).toHaveCount(1);
  const row = page.getByRole('table').getByRole('row').filter({ has: page.getByRole('cell') }).first();
  const title = (await row.locator('[role="cell"] .truncate').first().textContent())?.trim() ?? '';
  await row.getByRole('button', { name: `More options for ${title}` }).click();
  await page.getByRole('menuitem', { name: 'Start radio' }).click();

  const player = page.getByRole('region', { name: 'Player' });
  await expect(player).toContainText(title);
  await expect(player.getByRole('link', { name: 'Radio' })).toBeVisible();

  await player.getByRole('link', { name: 'Radio' }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(title);
  const upNext = page.getByRole('region', { name: 'Up next on radio' });
  await expect(upNext.getByRole('listitem').first()).toBeVisible();
  expect(await upNext.getByRole('listitem').count()).toBeGreaterThanOrEqual(3);

  // Skipping keeps the radio going.
  await page.getByRole('button', { name: 'Next', exact: true }).click();
  await expect(upNext.getByRole('listitem').first()).toBeVisible();

  await page.getByRole('button', { name: 'Stop radio' }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Radio');
  await expect(player.getByRole('link', { name: 'Radio' })).toHaveCount(0);
});
