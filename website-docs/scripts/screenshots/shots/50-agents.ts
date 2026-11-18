import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Locator, Page } from 'playwright'
import { storeWrite } from '../../../../tests/e2e/helpers'
import { DEMO_WORKSPACE_ROOT } from '../demo-server'
import type { Shot } from '../shot'
import { openApp } from '../ui'

const agentScript = join(dirname(fileURLToPath(import.meta.url)), '..', 'demo-agent.ts')

// The demo agent's "rich" profile answers prompts that start with "Fix" or
// "Try" without a plan. A finished chat shows its plan twice (pinned and
// inline), so shots that are not about the plan use these prompts.

/** Two agents (the second one for switching) and a project skill for the slash menu. */
async function setup(page: Page): Promise<void> {
  const agent = (id: string, name: string, profile: string) => ({
    id,
    templateId: id,
    configId: id,
    name,
    command: 'bun',
    args: [agentScript],
    env: { DEMO_AGENT_PROFILE: profile },
    allowTerminal: false
  })
  await storeWrite('acp/agents', [
    agent('demo-agent', 'Demo Agent', 'rich'),
    agent('helper-agent', 'Helper Agent', 'second')
  ])
  const skill = join(DEMO_WORKSPACE_ROOT, 'acme-shop', '.agents', 'skills', 'release-notes')
  await mkdir(skill, { recursive: true })
  await writeFile(
    join(skill, 'SKILL.md'),
    '---\nname: release-notes\ndescription: Write release notes from the commits since the last tag\n---\n\nRead the git log since the last tag and write short release notes.\n'
  )
  await openApp(page)
  // Clicking an already active project row that shows a status badge can
  // land on its settings button; close that dialog if it opened.
  const settings = page.getByText('Project Settings').first()
  if (await settings.isVisible()) {
    await page.keyboard.press('Escape')
    await settings.waitFor({ state: 'hidden' })
  }
}

const pane = (page: Page): Locator => page.locator('[data-pane-content]').first()
const composer = (page: Page): Locator => page.locator('[data-composer-editor="true"]').last()

async function send(page: Page, text: string, settleMs = 1_500): Promise<void> {
  await composer(page).click()
  await page.keyboard.type(text)
  await page.keyboard.press('Enter')
  await page.waitForTimeout(settleMs)
}

async function openLauncher(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'New chat', exact: true }).first().click()
  await page
    .getByRole('button', { name: /Currently Demo Agent/ })
    .last()
    .waitFor()
  await page.waitForTimeout(800)
}

/** Send a prompt from the launcher and give the agent time to answer. */
async function startChat(page: Page, prompt: string, settleMs: number): Promise<void> {
  await openLauncher(page)
  await page.locator('[data-composer-editor="true"][aria-label="Agent prompt"]').last().click()
  await page.keyboard.type(prompt)
  await page.keyboard.press('Enter')
  await page.waitForTimeout(settleMs)
}

async function openModelPicker(page: Page): Promise<Locator> {
  // A chat that reuses another chat's agent process names it "the current
  // agent" instead of "Demo Agent", so match the part every label shares.
  await page
    .getByRole('button', { name: /\. Currently / })
    .last()
    .click()
  const panel = page.getByTestId('agent-model-selector-panel')
  await panel.waitFor()
  await page.waitForTimeout(400)
  return panel
}

async function expandTurn(page: Page): Promise<void> {
  await page
    .getByRole('button', { name: /Worked for/ })
    .first()
    .click()
  await page.waitForTimeout(300)
}

export const shots: Shot[] = [
  {
    id: 'agents-launcher',
    run: async (page) => {
      await setup(page)
      await openLauncher(page)
    }
  },
  {
    id: 'agents-model-picker',
    run: async (page) => {
      await setup(page)
      await openLauncher(page)
      return openModelPicker(page)
    }
  },
  {
    id: 'agents-modes',
    run: async (page) => {
      await setup(page)
      await openLauncher(page)
      await page
        .getByRole('button', { name: /^Default/ })
        .last()
        .click()
      const menu = page.getByTestId('mode-chip-options')
      await menu.waitFor()
      return menu
    }
  },
  {
    id: 'agents-worktree-option',
    run: async (page) => {
      await setup(page)
      await openLauncher(page)
      await page.getByRole('combobox', { name: 'Workspace' }).click()
      await page.getByRole('option', { name: 'New worktree' }).waitFor()
      return pane(page)
    }
  },
  // The switch shots run first: a chat started after another chat reuses that
  // chat's agent process, and the switch separator then reads "previous agent".
  {
    id: 'agents-switch-done',
    run: async (page) => {
      await setup(page)
      await startChat(page, 'Fix the discount math in the cart total', 5_000)
      const panel = await openModelPicker(page)
      await panel.getByRole('tab', { name: /Helper Agent/ }).click()
      await panel.getByText('Helper Pro').click()
      await page.waitForTimeout(3_000)
      if (await panel.isVisible()) await page.keyboard.press('Escape')
      await send(page, 'Review the change and add a test for it', 6_000)
      const handoff = page.getByRole('button', { name: /^Handoff:/ }).last()
      await handoff.evaluate((el) => el.scrollIntoView({ block: 'start' }))
      await page.waitForTimeout(500)
      return pane(page)
    }
  },
  {
    id: 'agents-switch-picker',
    run: async (page) => {
      await setup(page)
      await startChat(page, 'Fix the cart total for discounts', 5_000)
      const panel = await openModelPicker(page)
      await panel.getByRole('tab', { name: /Helper Agent/ }).click()
      await panel.getByText('Helper Pro').waitFor()
      await page.waitForTimeout(400)
      return panel
    }
  },
  {
    id: 'agents-chat',
    run: async (page) => {
      await setup(page)
      const prompt = 'Add a discount option to the cart total'
      await startChat(page, prompt, 5_000)
      // Show the start of the turn: your message, the steps row and the reply.
      await pane(page)
        .getByText(prompt, { exact: true })
        .last()
        .evaluate((el) => el.scrollIntoView({ block: 'center' }))
      await page.waitForTimeout(500)
    }
  },
  {
    id: 'agents-slash-menu',
    run: async (page) => {
      await setup(page)
      await startChat(page, 'Try a discount option on the cart total', 5_000)
      await composer(page).click()
      // Filtered so the menu doesn't list skills installed on the capture machine.
      await page.keyboard.type('/rel')
      await page.getByText('/release-notes').waitFor()
      await page.waitForTimeout(300)
      return pane(page)
    }
  },
  {
    id: 'agents-file-mention',
    run: async (page) => {
      await setup(page)
      await startChat(page, 'Fix the cart total so it takes a discount', 5_000)
      await composer(page).click()
      await page.keyboard.type('Add a test for @cart')
      await page.getByText('src/cart.ts').last().waitFor()
      await page.waitForTimeout(400)
      return pane(page)
    }
  },
  {
    id: 'agents-attachment',
    run: async (page) => {
      await setup(page)
      await startChat(page, 'Try a cart total on the checkout page', 5_000)
      // A screenshot of the app stands in for the image a user would attach.
      const image = await page.screenshot({ clip: { x: 0, y: 0, width: 480, height: 300 } })
      const chooser = page.waitForEvent('filechooser')
      await page.getByRole('button', { name: 'Attach files' }).last().click()
      await (await chooser).setFiles({ name: 'checkout.png', mimeType: 'image/png', buffer: image })
      await composer(page).click()
      await page.keyboard.type('The total overlaps the button on this page. Can you fix it?')
      await page.getByRole('button', { name: 'Remove checkout.png' }).waitFor()
      await page.waitForTimeout(600)
      return pane(page)
    }
  },
  {
    id: 'agents-context-usage',
    run: async (page) => {
      await setup(page)
      await startChat(page, 'Fix the total when a discount is set', 5_000)
      await page.getByRole('button', { name: /percent used/ }).click()
      await page.getByText('Reported by agent').waitFor()
      return pane(page)
    }
  },
  {
    id: 'agents-tool-cards',
    run: async (page) => {
      await setup(page)
      await startChat(page, 'Fix rounding in the cart total', 5_000)
      await expandTurn(page)
      await page.getByRole('button', { name: /^Edited 1 file/ }).click()
      await page.waitForTimeout(600)
      await pane(page)
        .getByText('Worked for')
        .first()
        .evaluate((el) => el.scrollIntoView({ block: 'start' }))
      await page.waitForTimeout(500)
      return pane(page)
    }
  },
  {
    id: 'agents-changed-files',
    run: async (page) => {
      await setup(page)
      await startChat(page, 'Try a discount argument for cartTotal', 5_000)
      await page.getByRole('button', { name: /^Changes:/ }).click()
      await page.waitForTimeout(500)
      return pane(page)
    }
  },
  {
    id: 'agents-subagent',
    run: async (page) => {
      await setup(page)
      await startChat(page, 'Get a second opinion on the checkout flow', 4_000)
      await expandTurn(page)
      await page.getByRole('button', { name: /^Ran 1 agent/ }).click()
      await page
        .getByRole('button', { name: /Review the checkout flow/ })
        .first()
        .click()
      const dialog = page.getByRole('dialog')
      await dialog.waitFor()
      return dialog
    }
  },
  {
    id: 'agents-message-actions',
    run: async (page) => {
      await setup(page)
      const prompt = 'Try a discount parameter on cartTotal'
      await startChat(page, prompt, 5_000)
      const bubble = pane(page).getByText(prompt, { exact: true }).last()
      await bubble.evaluate((el) => el.scrollIntoView({ block: 'center' }))
      await bubble.hover()
      await page.waitForTimeout(500)
      return pane(page)
    }
  },
  {
    id: 'agents-worktree-chat',
    run: async (page) => {
      await setup(page)
      await openLauncher(page)
      await page.getByRole('combobox', { name: 'Workspace' }).click()
      await page.getByRole('option', { name: 'New worktree' }).click()
      await page
        .getByRole('combobox', { name: 'Base branch' })
        .getByText('main (current)')
        .waitFor()
      await page.locator('[data-composer-editor="true"][aria-label="Agent prompt"]').last().click()
      await page.keyboard.type('Try a percentage discount in the cart')
      await page.keyboard.press('Enter')
      await page.waitForTimeout(8_000)
    }
  },
  {
    id: 'agents-chat-menu',
    run: async (page) => {
      await setup(page)
      await page
        .getByRole('button', { name: /^Try a percentage discount in the cart/ })
        .first()
        .click({ button: 'right' })
      await page.getByRole('menuitem', { name: 'Open in split' }).waitFor()
    }
  },
  // The shots below leave a turn running or waiting for an answer, so they
  // come last: a held turn can stall new chats started after it.
  {
    id: 'agents-queue',
    run: async (page) => {
      await setup(page)
      await startChat(page, 'Run the full test suite', 2_500)
      await send(page, 'Then update the roadmap', 400)
      await send(page, 'Then write release notes', 800)
      await page.getByText('Then update the roadmap').hover()
      await page
        .getByRole('button', { name: /^Steer/ })
        .first()
        .waitFor()
      return pane(page)
    }
  },
  {
    id: 'agents-permission',
    run: async (page) => {
      await setup(page)
      await startChat(page, 'Push the discounts branch', 2_500)
      await page.getByTestId('permission-prompt').waitFor()
      return pane(page)
    }
  },
  {
    id: 'agents-question',
    run: async (page) => {
      await setup(page)
      await startChat(page, 'Add discount codes to checkout', 2_500)
      await page.getByText('Percentage off').waitFor()
      return pane(page)
    }
  },
  {
    id: 'agents-needs-you',
    run: async (page) => {
      await setup(page)
      await startChat(page, 'Push the release branch', 2_500)
      await startChat(page, 'Fix the failing cart tests', 5_000)
    }
  }
]
