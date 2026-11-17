import { randomUUID } from 'node:crypto'
import { mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { type APIRequestContext, expect, test } from 'playwright/test'
import { E2E_BASE_URL, E2E_TOKEN } from './helpers'
import { openWorkspace, selectProject } from './ui'

const createdProjectIds: string[] = []

test.afterEach(async ({ request }) => {
  for (const id of createdProjectIds.splice(0)) {
    await request
      .delete(`${E2E_BASE_URL}/projects/${id}`, {
        headers: { Authorization: `Bearer ${E2E_TOKEN}` }
      })
      .catch(() => {})
  }
})

async function createProject(api: APIRequestContext): Promise<string> {
  const root = process.env.E2E_WORKSPACE_ROOT
  if (!root) throw new Error('E2E_WORKSPACE_ROOT unset — run under tests/e2e global-setup')
  const unique = `composer-click-${randomUUID().slice(0, 6)}`
  const path = join(root, unique)
  await mkdir(path, { recursive: true })
  const id = `e2e-proj-${unique}`
  const res = await api.post(`${E2E_BASE_URL}/projects`, {
    headers: { Authorization: `Bearer ${E2E_TOKEN}`, 'content-type': 'application/json' },
    data: { id, name: unique, path, color: 'blue' }
  })
  if (!res.ok()) throw new Error(`project registration failed: ${res.status()}`)
  createdProjectIds.push(id)
  return unique
}

test('a click below one line of text focuses the composer with the caret at the end', async ({
  page,
  request
}) => {
  const projectName = await createProject(request)
  await openWorkspace(page)
  await selectProject(page, projectName)

  // A new project has no tabs, so its pane shows the empty-pane launcher.
  // Do not press New chat: it opens an empty chat tab, not the launcher.
  const editor = page.locator('[data-composer-editor="true"][aria-label="Agent prompt"]')
  await expect(editor).toBeVisible()

  await editor.click()
  await page.keyboard.type('hi')
  await page.keyboard.press('Home')

  // The start-screen input is 40px tall at minimum (CHAT_START_INPUT_MIN_HEIGHT,
  // #1840), so do not pin a height: assert there is empty editor area below
  // the one line of text, then click into that area.
  const area = await editor.boundingBox()
  const line = await editor.locator('p').first().boundingBox()
  if (!area || !line) throw new Error('composer editor has no layout box')
  const clickY = area.y + area.height - 6
  expect(clickY).toBeGreaterThan(line.y + line.height)
  await page.mouse.click(area.x + area.width / 2, clickY)

  await expect(editor).toBeFocused()
  await page.keyboard.type('!')
  await expect(editor).toHaveText('hi!')
})
