import { writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { Page } from 'playwright'
import { DEMO_BASE_URL, DEMO_TOKEN, DEMO_WORKSPACE_ROOT } from '../demo-server'
import type { Shot } from '../shot'
import { openApp } from '../ui'

const { storeWrite } = await import('../../../../tests/e2e/helpers')

const nodeProfile = {
  id: 'profile-node-dev',
  name: 'Node dev',
  shell: 'bash',
  args: [],
  cwd: '',
  env: { NODE_ENV: 'development' }
}

// Keep the demo server's DOM renderer when replacing the app settings.
async function seedDomRenderer(extra: Record<string, unknown> = {}): Promise<void> {
  await storeWrite('settings/app', { terminalRenderer: 'dom', ...extra })
}

async function openTerminalsApp(page: Page): Promise<void> {
  await openApp(page)
}

async function openMobileApp(page: Page): Promise<void> {
  await page.goto(`${DEMO_BASE_URL}/#token=${DEMO_TOKEN}`)
  await page.waitForFunction((t) => localStorage.getItem('termul.webAuthToken') === t, DEMO_TOKEN)
  await page.goto(`${DEMO_BASE_URL}/#/`)
  await page
    .getByRole('button', { name: /^Open menu/ })
    .first()
    .waitFor()
  await page.waitForTimeout(1000)
}

async function openTerminal(page: Page, shell = 'Bash', pane = 0): Promise<void> {
  const before = await page.locator('.xterm-screen').count()
  await page.getByRole('button', { name: 'New tab', exact: true }).nth(pane).click()
  await page.getByRole('menuitem', { name: shell, exact: true }).click()
  await page.locator('.xterm-screen').nth(before).waitFor()
  await page.waitForTimeout(1500)
}

async function run(page: Page, commands: string[], pane = 0): Promise<void> {
  await page.locator('.xterm-screen').nth(pane).click()
  for (const command of commands) {
    await page.keyboard.type(`${command}\n`, { delay: 15 })
    await page.waitForTimeout(400)
  }
  await page.waitForTimeout(1200)
}

async function openPalette(page: Page, query: string): Promise<void> {
  await page.getByRole('button', { name: 'Search', exact: true }).first().click()
  await page.getByPlaceholder('Search commands, projects, settings...').waitFor()
  await page.keyboard.type(query)
  await page.waitForTimeout(500)
}

async function openSettings(page: Page, category: string): Promise<void> {
  await page.getByRole('button', { name: 'Settings', exact: true }).first().click()
  const dialog = page.getByRole('dialog').first()
  await dialog.waitFor()
  await dialog.getByRole('button', { name: category, exact: true }).first().click()
  await page.waitForTimeout(800)
}

/** Drag-select the first rows of a terminal, then open its right-click menu. */
async function selectAndRightClick(page: Page, rows: number): Promise<void> {
  const box = await page.locator('.xterm-screen').first().boundingBox()
  if (!box) throw new Error('terminal not visible')
  await page.mouse.move(box.x + 4, box.y + 4)
  await page.mouse.down()
  await page.mouse.move(box.x + box.width * 0.6, box.y + rows * 19, { steps: 10 })
  await page.mouse.up()
  await page.mouse.click(box.x + 260, box.y + 30, { button: 'right' })
  await page.getByRole('menuitem', { name: 'Explain with AI' }).waitFor()
}

async function openMobileTerminal(page: Page): Promise<void> {
  await page
    .getByRole('button', { name: /^Open menu/ })
    .first()
    .click()
  await page.getByRole('button', { name: 'Terminals', exact: true }).click()
  await page.getByRole('button', { name: 'New terminal' }).last().click()
  await page.locator('.xterm-screen').first().waitFor()
  await page.waitForTimeout(1500)
}

async function openMobileSnapshots(page: Page): Promise<void> {
  await page
    .getByRole('button', { name: /^Open menu/ })
    .first()
    .click()
  await page.getByRole('button', { name: 'Snapshots', exact: true }).click()
  await page.getByText('Workspace Snapshots').first().waitFor()
  await page.waitForTimeout(500)
}

/** The card of a snapshot dialog. These dialogs carry no dialog role. */
function modalCard(page: Page, title: string) {
  return page.locator('.bg-card.shadow-2xl').filter({ hasText: title })
}

async function saveSnapshot(page: Page, name: string, description = ''): Promise<void> {
  await openPalette(page, 'Save Workspace Snapshot')
  await page
    .getByRole('option', { name: /Save Workspace Snapshot/ })
    .first()
    .click()
  await page.getByPlaceholder('Pre-deployment state').fill(name)
  if (description)
    await page.getByPlaceholder('Describe the state of your workspace...').fill(description)
}

// A minimal agent that answers the terminal assist prompt in plain text, the
// way a real agent does. The shared demo agent always replies with tool calls,
// which terminal assist rejects.
const ASSIST_AGENT = `
const out = (m) => process.stdout.write(JSON.stringify({ jsonrpc: '2.0', ...m }) + '\\n')
const fix = 'Git has no \`chekout\` command. The subcommand name has a typo, so Git stopped and suggested \`checkout\`.\\n\\n\`\`\`sh\\ngit checkout feature/discounts\\n\`\`\`'
let buf = ''
process.stdin.on('data', (c) => {
  buf += c
  for (let i = buf.indexOf('\\n'); i >= 0; i = buf.indexOf('\\n')) {
    const line = buf.slice(0, i).trim()
    buf = buf.slice(i + 1)
    if (!line) continue
    const { id, method, params = {} } = JSON.parse(line)
    if (method === 'initialize') out({ id, result: { protocolVersion: 1, agentCapabilities: {}, authMethods: [] } })
    else if (method === 'session/new') out({ id, result: { sessionId: 'assist-' + Date.now() } })
    else if (method === 'session/prompt') {
      out({ method: 'session/update', params: { sessionId: params.sessionId, update: { sessionUpdate: 'agent_message_chunk', content: { type: 'text', text: fix } } } })
      out({ id, result: { stopReason: 'end_turn' } })
    } else if (id !== undefined) out({ id, result: {} })
  }
})
`

async function seedAssistAgent(): Promise<void> {
  const script = join(DEMO_WORKSPACE_ROOT, '.terminal-assist-agent.mjs')
  await writeFile(script, ASSIST_AGENT)
  await storeWrite('acp/agents', [
    {
      id: 'assist-agent',
      templateId: 'demo-agent',
      configId: 'assist-agent',
      name: 'Demo Agent',
      command: 'bun',
      args: [script],
      env: {},
      allowTerminal: false
    }
  ])
}

async function dragTabToRightEdge(page: Page, tabName: string): Promise<void> {
  const tab = await page.getByText(tabName, { exact: true }).boundingBox()
  const pane = await page.locator('.xterm-screen').last().boundingBox()
  if (!tab || !pane) throw new Error('tab or pane not visible')
  await page.mouse.move(tab.x + tab.width / 2, tab.y + tab.height / 2)
  await page.mouse.down()
  await page.mouse.move(tab.x + 40, tab.y + 40, { steps: 5 })
  await page.mouse.move(pane.x + pane.width - 40, pane.y + pane.height / 2, { steps: 15 })
  await page.waitForTimeout(600)
}

export const shots: Shot[] = [
  {
    id: 'terminals-overview',
    run: async (page) => {
      await openTerminalsApp(page)
      await openTerminal(page)
      await run(page, ['git log --oneline', 'ls src', 'git status --short'])
      await page.waitForTimeout(2000)
    }
  },
  {
    id: 'terminals-new-tab-menu',
    run: async (page) => {
      await openTerminalsApp(page)
      await page.getByRole('button', { name: 'New tab', exact: true }).click()
      const menu = page.getByRole('menu')
      await menu.getByRole('menuitem', { name: 'Bash', exact: true }).waitFor()
      return menu
    }
  },
  {
    id: 'terminals-default-shell',
    run: async (page) => {
      await openTerminalsApp(page)
      await openSettings(page, 'Default Shell')
      return page.getByRole('dialog').first()
    }
  },
  {
    id: 'terminals-profile-dialog',
    run: async (page) => {
      await openTerminalsApp(page)
      await openSettings(page, 'Terminal Profiles')
      await page.getByRole('button', { name: 'Add profile' }).click()
      const dialog = page.getByRole('dialog', { name: 'New terminal profile' })
      await dialog.getByPlaceholder('e.g. Node dev').fill('Node dev')
      await dialog.getByPlaceholder('NODE_ENV=development').fill('NODE_ENV=development')
      return dialog
    }
  },
  {
    id: 'terminals-profile-palette',
    run: async (page) => {
      await seedDomRenderer({ terminalProfiles: [nodeProfile] })
      await openApp(page)
      await openPalette(page, 'Node dev')
      await page.getByRole('option', { name: /New Terminal: Node dev/ }).waitFor()
      return page.locator('[cmdk-root]')
    }
  },
  {
    id: 'terminals-tab-menu',
    run: async (page) => {
      await openTerminalsApp(page)
      await openTerminal(page)
      await openTerminal(page)
      await page.getByText('Terminal 1', { exact: true }).click({ button: 'right' })
      const menu = page.getByRole('menu')
      await menu.getByRole('menuitem', { name: 'Rename' }).waitFor()
      await page.waitForTimeout(500)
    }
  },
  {
    id: 'terminals-split-drag',
    run: async (page) => {
      await openTerminalsApp(page)
      await openTerminal(page)
      await run(page, ['git log --oneline'])
      await openTerminal(page)
      await page.locator('.xterm-screen:visible').first().click()
      await page.keyboard.type('ls src\n', { delay: 15 })
      await page.waitForTimeout(800)
      await dragTabToRightEdge(page, 'Terminal 2')
    }
  },
  {
    id: 'terminals-split',
    run: async (page) => {
      await openTerminalsApp(page)
      await openTerminal(page)
      await run(page, ['git log --oneline'])
      await openTerminal(page)
      await dragTabToRightEdge(page, 'Terminal 2')
      await page.mouse.up()
      await page.getByRole('button', { name: 'Focus pane' }).nth(1).waitFor()
      await page.waitForTimeout(800)
      await run(page, ['ls src', 'git branch'], 1)
    }
  },
  {
    id: 'terminals-right-click',
    run: async (page) => {
      await openTerminalsApp(page)
      await openTerminal(page)
      await run(page, ['clear', 'git status --short', 'ls src'])
      await selectAndRightClick(page, 3)
    }
  },
  {
    id: 'terminals-appearance-settings',
    run: async (page) => {
      await openTerminalsApp(page)
      await openSettings(page, 'Terminal Appearance')
      return page.getByRole('dialog').first()
    }
  },
  {
    id: 'terminals-behavior-settings',
    run: async (page) => {
      await openTerminalsApp(page)
      await openSettings(page, 'Behavior')
      return page.getByRole('dialog').first()
    }
  },
  {
    id: 'terminals-snapshot-create',
    run: async (page) => {
      await openTerminalsApp(page)
      await openTerminal(page)
      await run(page, ['git log --oneline'])
      await saveSnapshot(page, 'Discount work', 'Shell in acme-shop before the refactor')
      return modalCard(page, 'Create Snapshot')
    }
  },
  {
    id: 'terminals-snapshot-restore',
    run: async (page) => {
      await openTerminalsApp(page)
      await openTerminal(page)
      await run(page, ['git log --oneline'])
      await openTerminal(page)
      await saveSnapshot(page, 'Discount work', 'Two shells in acme-shop')
      await page.getByRole('button', { name: 'Create', exact: true }).click()
      await page.waitForTimeout(1500)
      await page.goto(`${DEMO_BASE_URL}/#/snapshots`)
      await page.getByRole('button', { name: 'Restore', exact: true }).first().click()
      const dialog = modalCard(page, 'Restore Snapshot')
      await dialog.waitFor()
      return dialog
    }
  },
  {
    id: 'terminals-snapshots-page',
    run: async (page) => {
      await openTerminalsApp(page)
      await openTerminal(page)
      await run(page, ['git log --oneline'])
      await saveSnapshot(page, 'Discount work', 'Shell in acme-shop before the refactor')
      await page.getByRole('button', { name: 'Create', exact: true }).click()
      await page.waitForTimeout(1000)
      await page.goto(`${DEMO_BASE_URL}/#/snapshots`)
      await page.getByRole('button', { name: 'Restore', exact: true }).first().waitFor()
      await page.waitForTimeout(500)
    }
  },
  {
    id: 'terminals-mobile-terminal',
    viewport: { width: 390, height: 844 },
    run: async (page) => {
      await openMobileApp(page)
      await openMobileTerminal(page)
      await run(page, ['clear', 'git log --oneline'])
    }
  },
  {
    id: 'terminals-mobile-snapshots',
    viewport: { width: 390, height: 844 },
    run: async (page) => {
      await openMobileApp(page)
      await openMobileSnapshots(page)
      await page.getByRole('button', { name: 'Create First Snapshot' }).first().click()
      await page.getByPlaceholder('Pre-deployment state').fill('Discount work')
      await page.getByRole('button', { name: 'Create', exact: true }).click()
      // Creating a snapshot on a phone returns to the chat screen.
      await page.waitForTimeout(1500)
      await openMobileSnapshots(page)
      await page.getByRole('button', { name: 'Restore', exact: true }).first().waitFor()
      await page.waitForTimeout(500)
    }
  },
  {
    id: 'terminals-ai-fix',
    run: async (page) => {
      await seedAssistAgent()
      await openTerminalsApp(page)
      await openTerminal(page)
      await run(page, ['git chekout feature/discounts'])
      await selectAndRightClick(page, 4)
      await page.getByRole('menuitem', { name: 'Fix Command with AI' }).click()
      await page.getByRole('button', { name: 'Insert suggested command 1' }).waitFor()
      await page.waitForTimeout(500)
    }
  }
]
