import { expect, test, type Page } from '@playwright/test';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { installMockNavidrome, MOCK_PASSWORD, MOCK_SERVER, MOCK_USER, wav } from './mock-navidrome';
import { equalizerFromPreset } from '../../../packages/core/src/equalizer';

const real = process.env.SONORA_E2E_SERVER;

test.describe('equalizer', () => {
  test.skip(({ isMobile }) => isMobile, 'desktop run covers the engine');

  test('DSP: bands shape the signal, flat/off are transparent', async ({ page }) => {
    await page.goto('/');
    const presets = { bass: equalizerFromPreset('Bass boost'), flat: equalizerFromPreset('Flat') };
    const result = await page.evaluate(async ({ bass, flat }) => {
      // Served by the Vite dev server; resolved in the browser, not by tsc.
      const path = '/src/platform/equalizer.ts';
      const mod = (await import(/* @vite-ignore */ path)) as typeof import('../src/platform/equalizer');
      const measure = async (freq: number, settings: import('@sonora/types').EqualizerSettings) => {
        const rate = 44100;
        const ctx = new OfflineAudioContext(1, rate, rate);
        const osc = ctx.createOscillator();
        osc.frequency.value = freq;
        const level = ctx.createGain();
        level.gain.value = 0.1; // well below the limiter threshold
        const chain = mod.createEqualizerChain(ctx);
        chain.apply(settings);
        osc.connect(level).connect(chain.input);
        chain.output.connect(ctx.destination);
        osc.start();
        const buf = await ctx.startRendering();
        const data = buf.getChannelData(0).slice(rate / 2); // skip the settle time
        const rms = Math.sqrt(data.reduce((s, v) => s + v * v, 0) / data.length);
        return 20 * Math.log10(rms / (0.1 / Math.SQRT2));
      };
      const out: Record<string, number> = {};
      for (const f of [60, 1000, 12000]) {
        out[`bass${f}`] = await measure(f, bass);
        out[`flat${f}`] = await measure(f, flat);
        out[`off${f}`] = await measure(f, { ...bass, enabled: false });
      }
      return out;
    }, presets);
    console.log('EQ response (dB):', JSON.stringify(Object.fromEntries(Object.entries(result).map(([k, v]) => [k, Math.round(v * 100) / 100]))));
    // Bass boost (+7 dB at 60 Hz, 0 dB at 12 kHz, preamp −3.5 dB):
    // the 60 Hz band must deliver its full boost relative to the untouched band.
    expect(result.bass60! - result.bass12000!).toBeGreaterThan(6.5);
    expect(result.bass12000!).toBeCloseTo(-3.5, 0);
    expect(result.bass60!).toBeLessThan(7);
    for (const f of [60, 1000, 12000]) {
      expect(Math.abs(result[`flat${f}`]!)).toBeLessThan(0.5);
      expect(Math.abs(result[`off${f}`]!)).toBeLessThan(0.5);
    }
  });

  async function login(page: Page) {
    await page.goto('/');
    await page.getByLabel('Server URL').fill(real ?? MOCK_SERVER);
    await page.getByLabel('Username').fill(real ? (process.env.SONORA_E2E_USER ?? 'admin') : MOCK_USER);
    await page.getByLabel('Password', { exact: true }).fill(real ? (process.env.SONORA_E2E_PASSWORD ?? '') : MOCK_PASSWORD);
    await page.getByRole('button', { name: 'Log in' }).click();
  }

  test('UI: enable, presets, keyboard, persists, audio flows through the EQ', async ({ page }) => {
    if (!real) await installMockNavidrome(page);
    await login(page);
    await page.goto(`/#/search?q=${encodeURIComponent(real ? (process.env.SONORA_E2E_QUERY ?? 'light') : 'glass')}`);
    await page.getByRole('region', { name: 'Albums' }).getByRole('link').first().click();
    await expect(page.getByRole('table')).toHaveCount(1);
    await page.getByRole('table').getByRole('row').filter({ has: page.getByRole('cell') }).first().click();
    const player = page.getByRole('region', { name: 'Player' });
    await expect(player).toHaveAttribute('data-status', 'playing');

    await player.getByRole('button', { name: 'Equalizer' }).click();
    const dialog = page.getByRole('dialog', { name: 'Equalizer' });
    await dialog.getByRole('switch', { name: 'Equalizer' }).click();
    await expect(dialog.getByRole('switch', { name: 'Equalizer' })).toHaveAttribute('aria-checked', 'true');
    await dialog.getByLabel('Preset').selectOption('Rock');
    const band60 = dialog.getByRole('slider', { name: '60', exact: true });
    await expect(band60).toHaveAttribute('aria-valuenow', '6');
    await band60.focus();
    await page.keyboard.press('ArrowUp');
    await expect(band60).toHaveAttribute('aria-valuenow', '6.5');
    await expect(dialog.getByLabel('Preset')).toHaveValue('');

    await expect(dialog.getByRole('alert')).toHaveCount(0);
    await page.keyboard.press('Escape');
    // Audio keeps playing and is audible after the EQ (no CORS silence).
    await expect(player).toHaveAttribute('data-status', 'playing');
    await expect
      .poll(() => page.evaluate(() => (window as unknown as { __sonoraEngine: { getOutputLevel(): number | null } }).__sonoraEngine.getOutputLevel()), {
        timeout: 8000,
      })
      .toBeGreaterThan(0.001);
    await expect(player.getByRole('button', { name: 'Equalizer (on)' })).toBeVisible();
    await page.reload();
    await page.getByRole('region', { name: 'Player' }).getByRole('button', { name: 'Equalizer (on)' }).click();
    await expect(page.getByRole('dialog', { name: 'Equalizer' }).getByRole('slider', { name: '60', exact: true })).toHaveAttribute('aria-valuenow', '6.5');
  });
});

test('without CORS on the stream the music keeps playing and the EQ reports unavailable', async ({ page, isMobile }) => {
  test.skip(isMobile || Boolean(real), 'mock-only scenario');
  // A real cross-origin server WITHOUT Access-Control-Allow-Origin (Playwright routes do not enforce CORS).
  const body = wav();
  const server = createServer((req, res) => {
    res.writeHead(200, { 'content-type': 'audio/wav', 'content-length': body.length });
    res.end(req.method === 'HEAD' ? undefined : body);
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  const port = (server.address() as AddressInfo).port;
  await installMockNavidrome(page, { audioUrl: `http://127.0.0.1:${port}/song.wav` });
  await page.addInitScript(() => {
    // EQ already switched on from a previous session.
    localStorage.setItem(
      'sonora.preferences',
      JSON.stringify({ state: { equalizer: { enabled: true, preamp: 0, bands: [6, 0, 0, 0, 0, 0, 0, 0, 0, 0], preset: null } }, version: 1 }),
    );
  });
  await page.goto('/');
  await page.getByLabel('Server URL').fill(MOCK_SERVER);
  await page.getByLabel('Username').fill(MOCK_USER);
  await page.getByLabel('Password', { exact: true }).fill(MOCK_PASSWORD);
  await page.getByRole('button', { name: 'Log in' }).click();
  await page.goto('/#/search?q=glass');
  await page.getByRole('region', { name: 'Albums' }).getByRole('link').first().click();
  await expect(page.getByRole('table')).toHaveCount(1);
  await page.getByRole('table').getByRole('row').filter({ has: page.getByRole('cell') }).first().click();
  const player = page.getByRole('region', { name: 'Player' });
  await expect(player).toHaveAttribute('data-status', 'playing', { timeout: 10_000 });
  await player.getByRole('button', { name: /Equalizer/ }).click();
  await expect(page.getByRole('dialog', { name: 'Equalizer' }).getByRole('alert')).toContainText('does not allow cross-origin audio');
  server.close();
});

test('visualizer: toggles with V, animates with the music and is remembered', async ({ page, isMobile }) => {
  test.skip(isMobile, 'desktop run covers it');
  if (!real) await installMockNavidrome(page);
  await page.goto('/');
  await page.getByLabel('Server URL').fill(real ?? MOCK_SERVER);
  await page.getByLabel('Username').fill(real ? (process.env.SONORA_E2E_USER ?? 'admin') : MOCK_USER);
  await page.getByLabel('Password', { exact: true }).fill(real ? (process.env.SONORA_E2E_PASSWORD ?? '') : MOCK_PASSWORD);
  await page.getByRole('button', { name: 'Log in' }).click();
  await page.goto(`/#/search?q=${encodeURIComponent(real ? (process.env.SONORA_E2E_QUERY ?? 'light') : 'glass')}`);
  await page.getByRole('region', { name: 'Albums' }).getByRole('link').first().click();
  await expect(page.getByRole('table')).toHaveCount(1);
  await page.getByRole('table').getByRole('row').filter({ has: page.getByRole('cell') }).first().click();
  await expect(page.getByRole('region', { name: 'Player' })).toHaveAttribute('data-status', 'playing');
  await page.getByRole('button', { name: 'Full screen player' }).click();
  await page.keyboard.press('v');
  const vis = page.getByTestId('visualizer');
  await expect(vis).toBeVisible();
  await expect(page.getByRole('button', { name: 'Visualizer (V)' })).toHaveAttribute('aria-pressed', 'true');

  const snapshot = () =>
    page.evaluate(() => {
      const c = document.querySelector<HTMLCanvasElement>('[data-testid=visualizer] canvas')!;
      const d = c.getContext('2d')!.getImageData(0, 0, c.width, c.height).data;
      let lit = 0;
      let sum = 0;
      for (let i = 0; i < d.length; i += 64) {
        sum += d[i]! + d[i + 1]! + d[i + 2]!;
        if (d[i + 3]! > 40) lit++;
      }
      return { lit, sum };
    });
  await expect.poll(async () => (await snapshot()).lit, { timeout: 8000 }).toBeGreaterThan(100);
  // The ring reaches further out while music plays than after pausing (it reacts to the audio,
  // not just to its idle wobble).
  let playingLit = 0;
  for (let i = 0; i < 8; i++) {
    playingLit = Math.max(playingLit, (await snapshot()).lit);
    await page.waitForTimeout(100);
  }
  const fullPlayer = page.getByRole('dialog', { name: /Now playing/ });
  await fullPlayer.getByRole('button', { name: 'Pause', exact: true }).click();
  await page.waitForTimeout(1500);
  const pausedLit = (await snapshot()).lit;
  expect(pausedLit).toBeLessThan(playingLit * 0.9);
  await fullPlayer.getByRole('button', { name: 'Play', exact: true }).click();

  // Immersive fullscreen: F enters, controls and cursor hide when idle, Esc leaves it but keeps the player open.
  await page.keyboard.press('f');
  await expect(vis).toHaveAttribute('data-immersive', 'true');
  const exit = vis.getByRole('button', { name: 'Exit fullscreen (F)' });
  await expect(exit).toBeVisible();
  await expect(vis).toHaveClass(/cursor-none/, { timeout: 5000 });
  await expect(exit.locator('..')).toHaveCSS('opacity', '0');
  await page.mouse.move(200, 200);
  await page.mouse.move(220, 210);
  await expect(vis).not.toHaveClass(/cursor-none/);
  await page.keyboard.press('Escape');
  await expect(vis).not.toHaveAttribute('data-immersive');
  await expect(fullPlayer).toBeVisible();

  await page.reload();
  await page.getByRole('button', { name: 'Full screen player' }).click();
  await expect(page.getByTestId('visualizer')).toBeVisible();
});

test('visualizer styles: every style draws, menu and arrow keys switch, the choice is remembered', async ({ page, isMobile }) => {
  test.skip(isMobile, 'desktop run covers it');
  test.setTimeout(120_000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  if (!real) await installMockNavidrome(page);
  await page.goto('/');
  await page.getByLabel('Server URL').fill(real ?? MOCK_SERVER);
  await page.getByLabel('Username').fill(real ? (process.env.SONORA_E2E_USER ?? 'admin') : MOCK_USER);
  await page.getByLabel('Password', { exact: true }).fill(real ? (process.env.SONORA_E2E_PASSWORD ?? '') : MOCK_PASSWORD);
  await page.getByRole('button', { name: 'Log in' }).click();
  await page.goto(`/#/search?q=${encodeURIComponent(real ? (process.env.SONORA_E2E_QUERY ?? 'light') : 'glass')}`);
  await page.getByRole('region', { name: 'Albums' }).getByRole('link').first().click();
  await page.getByRole('table').getByRole('row').filter({ has: page.getByRole('cell') }).first().click();
  await expect(page.getByRole('region', { name: 'Player' })).toHaveAttribute('data-status', 'playing');
  await page.getByRole('button', { name: 'Full screen player' }).click();
  await page.keyboard.press('v');
  const vis = page.getByTestId('visualizer');
  await expect(vis).toHaveAttribute('data-style', 'ring');

  /** Share of lit pixels on the 2D canvas, or the brightness the WebGL renderer reports. */
  const drawn = () =>
    page.evaluate(() => {
      const c = document.querySelector<HTMLCanvasElement>('[data-testid=visualizer] canvas')!;
      if (c.dataset.lum !== undefined) return Number(c.dataset.lum) / 255;
      const ctx = c.getContext('2d');
      if (!ctx) return 0;
      const d = ctx.getImageData(0, 0, c.width, c.height).data;
      let lit = 0;
      let n = 0;
      for (let i = 0; i < d.length; i += 4 * 32, n++) if (d[i + 3]! > 30 && d[i]! + d[i + 1]! + d[i + 2]! > 60) lit++;
      return lit / n;
    });

  const expected = ['ring', 'bars', 'mirror', 'scope', 'terrain', 'tunnel', 'galaxy', 'milkdrop', 'liquid', 'lyrics', 'ambient'];
  const next = page.getByRole('button', { name: 'Next visualizer style' });
  for (const [i, id] of expected.entries()) {
    if (i) await next.click();
    await expect(vis).toHaveAttribute('data-style', id);
    // An empty canvas reads 0; the mock plays a plain tone, so e.g. bars stay low and scope is one thin line.
    await expect.poll(drawn, { timeout: 8000, message: `style ${id} draws something` }).toBeGreaterThan(id === 'scope' ? 0.002 : 0.005);
    if (id === 'lyrics') await expect(page.getByTestId('lyric-pulse')).toBeVisible();
  }
  await next.click();
  await expect(vis).toHaveAttribute('data-style', 'ring');

  // Menu
  await page.getByRole('button', { name: 'Visualizer style', exact: true }).click();
  await page.getByRole('menuitemradio', { name: 'Warp tunnel' }).click();
  await expect(vis).toHaveAttribute('data-style', 'tunnel');
  await expect(page.getByRole('menu')).toHaveCount(0);

  // Arrows switch styles only in fullscreen (outside they keep seeking).
  await page.keyboard.press('f');
  await expect(vis).toHaveAttribute('data-immersive', 'true');
  await page.keyboard.press('ArrowRight');
  await expect(vis).toHaveAttribute('data-style', 'galaxy');
  await page.keyboard.press('ArrowLeft');
  await page.keyboard.press('ArrowLeft');
  await expect(vis).toHaveAttribute('data-style', 'terrain');
  await page.keyboard.press('Escape');
  await expect(vis).not.toHaveAttribute('data-immersive');

  await page.reload();
  await page.getByRole('button', { name: 'Full screen player' }).click();
  await expect(page.getByTestId('visualizer')).toHaveAttribute('data-style', 'terrain');
  expect(errors).toEqual([]);
});
