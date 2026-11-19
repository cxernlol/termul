import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

/**
 * The new homepage at desktop (1440) and phone (390) widths.
 * Motion is reduced so the tour and the card drawings show their still frame.
 */
const VIEWPORTS = [
  { name: 'desktop', width: 1440, height: 900 },
  { name: 'phone', width: 390, height: 844 },
] as const;

async function openHome(page: Page) {
  await page.emulateMedia({ reducedMotion: 'reduce', colorScheme: 'dark' });
  // Keep the page stable: no live releases or testimonials from the network.
  await page.route('**/api/releases', (route) => route.abort());
  await page.route('**/api/testimonials', (route) => route.abort());
  await page.goto('/');
  await page.locator('main#main-content').waitFor({ state: 'visible' });
  await page.evaluate(() => document.fonts.ready);
}

for (const viewport of VIEWPORTS) {
  test.describe(`Landing page · ${viewport.name}`, () => {
    test.use({ viewport: { width: viewport.width, height: viewport.height } });

    test('shows every section', async ({ page }) => {
      await openHome(page);
      await expect(page.getByRole('heading', { level: 1, name: /Any Agents\s*in One UI/ })).toBeVisible();
      for (const name of [
        'Works with the agents you use',
        /Watch the troupe do the work/,
        'One window for the whole troupe',
        /Everything around the chat/,
        /Stop switching windows/,
        /Developers who run/,
        /Frequently asked/,
      ]) {
        await expect(page.getByRole('heading', { name }).first()).toBeAttached();
      }
    });

    test('has no automatic accessibility violations', async ({ page }) => {
      await openHome(page);
      const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag22aa']).analyze();
      expect(results.violations.map((v) => `${v.id}: ${v.nodes.length}`)).toEqual([]);
    });

    test('matches the full page screenshot', async ({ page }) => {
      await openHome(page);
      await expect(page).toHaveScreenshot(`landing-${viewport.name}.png`, {
        fullPage: true,
        animations: 'disabled',
        maxDiffPixelRatio: 0.02,
      });
    });
  });
}

test.describe('Download control', () => {
  test('desktop: the menu lists Stable and Nightly', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await openHome(page);
    await page.getByRole('button', { name: /^Download for / }).first().click();
    const menu = page.getByRole('menu');
    await expect(menu).toBeVisible();
    await expect(menu.getByRole('menuitem', { name: /Stable/ })).toBeVisible();
    await expect(menu.getByRole('menuitem', { name: /Nightly/ })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(menu).toBeHidden();
  });

  test('phone: the button opens the sheet with Copy link', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await openHome(page);
    await page.getByRole('button', { name: 'Get Troupe for your Mac' }).first().click();
    const sheet = page.getByRole('dialog');
    await expect(sheet).toBeVisible();
    await expect(sheet.getByRole('button', { name: /Copy link/ })).toBeVisible();
  });
});

test.describe('Feature tour', () => {
  test('tabs switch with a click and with the arrow keys', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await openHome(page);
    const tabs = page.getByRole('tablist', { name: 'Troupe features' });
    await tabs.getByRole('tab', { name: 'Remote' }).click();
    await expect(tabs.getByRole('tab', { name: 'Remote' })).toHaveAttribute('aria-selected', 'true');
    await page.keyboard.press('ArrowLeft');
    await expect(tabs.getByRole('tab', { name: 'Browser' })).toHaveAttribute('aria-selected', 'true');
  });

  test('the Pause button toggles', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await openHome(page);
    const pause = page.getByRole('button', { name: 'Pause' });
    await pause.click();
    await expect(page.getByRole('button', { name: 'Play' })).toHaveAttribute('aria-pressed', 'true');
  });
});

test.describe('FAQ', () => {
  test('opens and closes an answer', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await openHome(page);
    const question = page.getByRole('button', { name: 'Is Troupe free?' });
    await expect(question).toHaveAttribute('aria-expanded', 'false');
    await question.click();
    await expect(question).toHaveAttribute('aria-expanded', 'true');
    await expect(page.getByText(/free and open source under the MIT License/)).toBeVisible();
    await question.click();
    await expect(question).toHaveAttribute('aria-expanded', 'false');
  });
});
