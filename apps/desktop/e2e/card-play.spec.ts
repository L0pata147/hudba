import { expect, test } from '@playwright/test';
import { installMockNavidrome, MOCK_PASSWORD, MOCK_SERVER, MOCK_USER } from './mock-navidrome';

test('the play button on an album card plays the album instead of opening it', async ({ page, isMobile }) => {
  test.skip(isMobile, 'hover cards are desktop only');
  await installMockNavidrome(page);
  await page.goto('/');
  await page.getByLabel('Server URL').fill(MOCK_SERVER);
  await page.getByLabel('Username').fill(MOCK_USER);
  await page.getByLabel('Password', { exact: true }).fill(MOCK_PASSWORD);
  await page.getByRole('button', { name: 'Log in' }).click();
  const shelf = page.getByRole('region', { name: 'Recently added' });
  // keep the card clear of the sticky header
  await shelf.evaluate((el) => el.scrollIntoView({ block: 'center' }));
  await shelf.getByRole('button', { name: /^Play / }).first().click();
  await expect(page.getByRole('region', { name: 'Player' })).toHaveAttribute('data-status', 'playing', { timeout: 10_000 });
  await expect(page).not.toHaveURL(/#\/album\//);
});
