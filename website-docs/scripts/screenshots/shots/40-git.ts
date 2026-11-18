import { execSync } from 'node:child_process'
import { appendFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { Locator, Page } from 'playwright'
import { DEMO_WORKSPACE_ROOT } from '../demo-server'
import type { Shot } from '../shot'
import { openApp } from '../ui'

const shop = join(DEMO_WORKSPACE_ROOT, 'acme-shop')
const remote = join(DEMO_WORKSPACE_ROOT, '.remotes', 'acme-shop.git')
const worktrees = join(shop, '.termul', 'worktrees')

function git(cmd: string, cwd = shop): string {
  return execSync(`git -c user.email=dev@acme.test -c user.name="Acme Dev" ${cmd}`, {
    cwd,
    encoding: 'utf8'
  }).trim()
}

function commitFile(cwd: string, file: string, body: string, message: string): void {
  writeFileSync(join(cwd, file), body)
  git(`add ${file}`, cwd)
  git(`commit -q -m "${message}"`, cwd)
}

// Adds history, branches, a remote and two worktrees to acme-shop.
// The demo workspace is rebuilt for every capture run, so this runs once.
function ensureFixtures(): void {
  if (existsSync(remote)) return
  appendFileSync(join(shop, '.git', 'info', 'exclude'), '.termul/\n')
  git('tag v0.1.0 HEAD~1')

  const timeout = join(worktrees, 'checkout-timeout')
  git(`worktree add -q -b fix/checkout-timeout ${timeout} HEAD~2`)
  writeFileSync(
    join(timeout, 'src', 'checkout.ts'),
    "export const CHECKOUT_TIMEOUT_MS = 10_000\n\nexport async function checkout(): Promise<string> {\n  return 'pending'\n}\n"
  )
  git('add src/checkout.ts', timeout)
  git('commit -q -m "fix(checkout): time out slow payment requests"', timeout)

  const coupons = join(worktrees, 'try-coupons')
  git(`worktree add -q -b try-coupons ${coupons} feature/discounts`)
  commitFile(
    coupons,
    'src/discount.ts',
    'export const COUPONS: Record<string, number> = { WELCOME10: 10 }\n',
    'feat(discounts): add coupon codes'
  )
  commitFile(
    coupons,
    'src/discount.ts',
    'export const COUPONS: Record<string, number> = { WELCOME10: 10, SPRING25: 25 }\n',
    'feat(discounts): add the spring coupon'
  )

  mkdirSync(join(DEMO_WORKSPACE_ROOT, '.remotes'), { recursive: true })
  git(`init -q --bare ${remote}`, DEMO_WORKSPACE_ROOT)
  git(`remote add origin ${remote}`)
  git('push -q origin HEAD~2:refs/heads/release/1.0')
  git('fetch -q origin')
}

// Stores a stash without touching the working tree. Kept out of
// ensureFixtures because the history graph would show it as two commits.
function ensureStash(): void {
  if (git('stash list') !== '') return
  git(`stash store -m "On main: try a coupon field" ${git('stash create')}`)
}

function changesPanel(page: Page): Locator {
  return page.getByRole('tabpanel', { name: /^Changes/ })
}

async function openChanges(page: Page): Promise<Locator> {
  ensureFixtures()
  await openApp(page)
  await page.getByRole('tab', { name: /^Changes/ }).click()
  const panel = changesPanel(page)
  await panel.getByRole('option').first().waitFor()
  return panel
}

async function openDiff(page: Page, file: string): Promise<void> {
  const panel = await openChanges(page)
  await panel.getByRole('option', { name: new RegExp(`^${file}`) }).click()
  await page.getByRole('group', { name: 'Diff view mode' }).waitFor()
  await page.waitForTimeout(800)
}

async function openHistory(page: Page): Promise<void> {
  const panel = await openChanges(page)
  await panel.getByRole('button', { name: 'Open History in the main panel' }).click()
  await page.getByRole('listbox', { name: 'Commits' }).getByRole('option').first().waitFor()
  // A wide tab docks the details pane beside the list instead of over it.
  await page.getByRole('button', { name: 'Hide side panel' }).click()
  await page.waitForTimeout(800)
}

async function openWorktreeModal(page: Page): Promise<Locator> {
  ensureFixtures()
  await openApp(page)
  await page.locator('[aria-label^="Project: acme-shop"]').first().click({ button: 'right' })
  await page.getByText('New Worktree', { exact: true }).click()
  const heading = page.getByRole('heading', { name: 'New Worktree' })
  await heading.waitFor()
  await page.getByPlaceholder('e.g. try-new-hero').fill('try-new-hero')
  return page.locator('div', { has: heading }).filter({ hasText: 'Cancel' }).last()
}

const diffViewport = { width: 1280, height: 540 }

export const shots: Shot[] = [
  {
    id: 'git-changes',
    run: async (page) => {
      await openDiff(page, 'cart\\.ts')
    }
  },
  {
    id: 'git-diff-split',
    viewport: diffViewport,
    run: async (page) => {
      await openDiff(page, 'cart\\.ts')
      await page.getByRole('button', { name: 'Split', exact: true }).click()
      await page.waitForTimeout(600)
      return page.locator('main')
    }
  },
  {
    id: 'git-stage-lines',
    viewport: diffViewport,
    run: async (page) => {
      await openDiff(page, 'cart\\.ts')
      const gutters = page.getByRole('button', { name: 'Select line for partial staging' })
      for (let i = 0; i < 3; i++) await gutters.first().click()
      await page.getByRole('button', { name: /Stage selected/ }).waitFor()
      return page.locator('main')
    }
  },
  {
    id: 'git-commit-box',
    run: async (page) => {
      const panel = await openChanges(page)
      await panel.getByRole('option', { name: /^cart\.ts/ }).hover()
      await panel.getByRole('button', { name: 'Stage changes' }).first().click()
      await panel.getByText('Staged', { exact: true }).waitFor()
      await panel
        .getByRole('textbox', { name: 'Commit summary' })
        .fill('feat(cart): add applyDiscount')
      await panel
        .getByRole('textbox', { name: 'Commit description' })
        .fill('Takes a percentage and returns the discounted total.')
      await page.mouse.move(900, 600)
      return panel
    }
  },
  {
    id: 'git-branch-switch-dialog',
    run: async (page) => {
      const panel = await openChanges(page)
      await panel.getByRole('button', { name: 'main', exact: true }).click()
      await page.getByRole('menuitem', { name: 'feature/discounts' }).click()
      const dialog = page.getByRole('dialog', { name: 'Uncommitted Changes' })
      await dialog.waitFor()
      return dialog
    }
  },
  {
    id: 'git-history',
    run: async (page) => {
      await openHistory(page)
      await page.getByRole('option', { name: /add the spring coupon/ }).click()
      await page.getByText('1 file changed').waitFor()
    }
  },
  {
    id: 'git-history-filter',
    viewport: diffViewport,
    run: async (page) => {
      await openHistory(page)
      await page.getByRole('textbox', { name: 'Filter commits' }).fill('coupon')
      await page.getByText(/^\d+ of \d+$/).waitFor()
      await page.getByRole('option', { name: /add coupon codes/ }).click()
      await page.getByText('1 file changed').waitFor()
      return page.locator('main')
    }
  },
  {
    id: 'git-stash-dialog',
    run: async (page) => {
      const panel = await openChanges(page)
      await panel.getByRole('button', { name: 'Stash changes' }).click()
      const dialog = page.getByRole('dialog', { name: 'Stash Changes' })
      await dialog.getByPlaceholder('WIP on current branch...').fill('Half-done discount UI')
      await dialog.getByRole('checkbox', { name: 'Include untracked files' }).check()
      return dialog
    }
  },
  {
    id: 'git-stash-list',
    run: async (page) => {
      ensureFixtures()
      ensureStash()
      const panel = await openChanges(page)
      const row = panel.getByText('stash@{0}')
      await row.hover()
      await panel.getByRole('button', { name: 'Drop stash' }).waitFor()
      return panel
    }
  },
  {
    id: 'git-worktree-modal',
    run: async (page) => openWorktreeModal(page)
  },
  {
    id: 'git-worktree-advanced',
    run: async (page) => {
      const modal = await openWorktreeModal(page)
      await modal.getByText('Advanced (branch options)').click()
      await modal.getByPlaceholder('HEAD, main, or a commit hash').fill('main')
      return modal
    }
  },
  {
    id: 'git-worktree-switcher',
    run: async (page) => {
      await openChanges(page)
      await page.getByRole('button', { name: 'Workspace', exact: true }).click()
      const switcher = page.getByRole('dialog', { name: 'Working copies' })
      await switcher.getByText('try-coupons').waitFor()
      await switcher.getByText('try-coupons').hover()
      return switcher
    }
  },
  {
    id: 'git-launcher-worktree',
    run: async (page) => {
      ensureFixtures()
      await openApp(page)
      await page.getByRole('combobox', { name: 'Workspace' }).click()
      await page.getByRole('option', { name: 'New worktree' }).waitFor()
      await page.waitForTimeout(400)
    }
  },
  {
    id: 'git-worktree-symlinks',
    run: async (page) => {
      ensureFixtures()
      await openApp(page)
      await page.locator('[aria-label^="Project: acme-shop"]').first().click({ button: 'right' })
      await page.getByText('Settings', { exact: true }).first().click()
      await page.getByRole('button', { name: 'Worktree Symlinks' }).first().click()
      await page.getByRole('heading', { name: 'Worktree Symlinks' }).waitFor()
      const input = page.getByPlaceholder('e.g. node_modules')
      if ((await input.count()) === 0)
        await page.getByRole('button', { name: /Add Directory/ }).click()
      await input.first().fill('node_modules')
      await page.mouse.move(1200, 100)
      return page.locator('[data-settings-section="symlinks"]')
    }
  }
]
