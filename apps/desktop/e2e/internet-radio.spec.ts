import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { expect, test } from '@playwright/test';
import { installMockNavidrome, MOCK_PASSWORD, MOCK_RADIO_HOST, MOCK_SERVER, MOCK_USER, wav } from './mock-navidrome';

let albumId = '';

test.beforeEach(async ({ page, isMobile }) => {
  test.skip(isMobile, 'stations are managed on the desktop Radio page');
  albumId = (await installMockNavidrome(page, { admin: true })).albums[0]!.id;
  await page.goto('/');
  await page.getByLabel('Server URL').fill(MOCK_SERVER);
  await page.getByLabel('Username').fill(MOCK_USER);
  await page.getByLabel('Password', { exact: true }).fill(MOCK_PASSWORD);
  await page.getByRole('button', { name: 'Log in' }).click();
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
});

test('internet radio: play a station live, add and delete stations, back to the library', async ({ page }) => {
  await page.getByRole('link', { name: 'Radio', exact: true }).first().click();
  const section = page.getByRole('region', { name: 'Internet radio' });
  await expect(section.getByRole('button', { name: 'Play Mock FM' })).toBeVisible();

  // a station without CORS headers still plays (without Web Audio), shown as live
  await section.getByRole('button', { name: 'Play Mock FM' }).click();
  const player = page.getByRole('region', { name: 'Player' });
  await expect(player).toHaveAttribute('data-status', 'playing', { timeout: 10_000 });
  await expect(player.getByLabel('Live stream')).toBeVisible();
  await expect(player.getByRole('button', { name: /Favorites/ })).toHaveCount(0);
  await expect(section.getByRole('button', { name: 'Pause Mock FM' })).toBeVisible();

  // add a station
  await section.getByRole('button', { name: 'Add station' }).click();
  const dialog = page.getByRole('dialog', { name: 'Add a radio station' });
  await dialog.getByLabel('Name').fill('Second FM');
  await dialog.getByLabel('Stream address').fill('not a url');
  await dialog.getByRole('button', { name: 'Add station' }).click();
  await expect(dialog.getByText(/starting with http/)).toBeVisible();
  await dialog.getByLabel('Stream address').fill(`${MOCK_RADIO_HOST}/second`);
  await dialog.getByRole('button', { name: 'Add station' }).click();
  await expect(dialog).toBeHidden();
  await expect(section.getByRole('button', { name: 'Play Second FM' })).toBeVisible();

  // delete it again
  await section.getByRole('button', { name: 'Play Second FM' }).hover();
  await section.getByRole('button', { name: 'More options for Second FM' }).click();
  await page.getByRole('menuitem', { name: 'Delete station' }).click();
  await page.getByRole('dialog', { name: 'Delete station?' }).getByRole('button', { name: 'Delete' }).click();
  await expect(section.getByRole('button', { name: 'Play Second FM' })).toHaveCount(0);

  // library songs play normally afterwards
  await page.goto(`/#/album/${albumId}`);
  await page.getByRole('button', { name: 'Play album' }).click();
  await expect(player).toHaveAttribute('data-status', 'playing', { timeout: 10_000 });
  await expect(player.getByLabel('Live stream')).toHaveCount(0);
});

test('a station without CORS plays without the EQ; library songs get the EQ back', async ({ page }) => {
  // A real cross-origin server WITHOUT Access-Control-Allow-Origin (Playwright routes do not enforce CORS).
  const body = wav();
  const server = createServer((req, res) => {
    res.writeHead(200, { 'content-type': 'audio/wav', 'content-length': body.length });
    res.end(req.method === 'HEAD' ? undefined : body);
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  const port = (server.address() as AddressInfo).port;
  await page.unrouteAll({ behavior: 'ignoreErrors' });
  const mock = await installMockNavidrome(page, { admin: true, radioUrl: `http://127.0.0.1:${port}/live` });
  await page.evaluate(() => {
    localStorage.setItem('sonora.preferences', JSON.stringify({ state: { equalizer: { enabled: true, preamp: 0, bands: [6, 0, 0, 0, 0, 0, 0, 0, 0, 0], preset: null } }, version: 2 }));
  });
  await page.reload();
  await page.goto('/#/radio');
  const player = page.getByRole('region', { name: 'Player' });
  await page.getByRole('region', { name: 'Internet radio' }).getByRole('button', { name: 'Play Mock FM' }).click();
  await expect(player).toHaveAttribute('data-status', 'playing', { timeout: 15_000 });
  await expect(player.getByLabel('Live stream')).toBeVisible();

  await page.goto(`/#/album/${mock.albums[0]!.id}`);
  await page.getByRole('button', { name: 'Play album' }).click();
  await expect(player).toHaveAttribute('data-status', 'playing', { timeout: 10_000 });
  // audio flows through the EQ again (Web Audio output is not silent)
  await expect
    .poll(() => page.evaluate(() => (window as unknown as { __sonoraEngine: { getOutputLevel(): number | null } }).__sonoraEngine.getOutputLevel()), { timeout: 8000 })
    .toBeGreaterThan(0.001);
  server.close();
});
