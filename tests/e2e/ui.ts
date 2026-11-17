import { expect, type Locator, type Page } from 'playwright/test'
import { E2E_BASE_URL, E2E_TOKEN } from './helpers'

/**
 * Page-level helpers for the termul-server web client E2E suite.
 *
 * The web auth token is seeded via the `#token=` fragment bootstrap (the
 * production first-visit flow): one goto to the fragment URL persists the
 * token to localStorage, then the app is used from `/#/`.
 */

/**
 * Bootstrap the auth token then land on the workspace root. Waits for the
 * token to actually land in localStorage (a fixed sleep races slow boots —
 * the token gate would then show instead of the workspace).
 */
export async function openWorkspace(page: Page): Promise<void> {
  await page.goto(`${E2E_BASE_URL}/#token=${E2E_TOKEN}`)
  await page.waitForFunction(
    (token) => localStorage.getItem('termul.webAuthToken') === token,
    E2E_TOKEN
  )
  await page.goto(`${E2E_BASE_URL}/#/`)
  // Wait for the Rail's project list to load (projects fetched + auth
  // accepted). A Rail restored collapsed lists projects as icons only, so a
  // collapsed Rail counts as loaded too.
  await page
    .locator('[aria-label^="Project: proj-"], nav[aria-label="Projects"][data-expanded="false"]')
    .first()
    .waitFor({ state: 'visible' })
}

/**
 * Select a project in the Rail. No click when it is already the active
 * project: a click on the active row hides or shows its chats.
 */
export async function selectProject(page: Page, name: string): Promise<void> {
  // Prefix match: the active project's label carries an " (active)" suffix.
  // The expanded row's button covers the row. Its icon column is a sibling
  // that does not take clicks, and a hover there shows the chat chevron.
  // Click the name, just past the icon, so the actions at the row's end stay
  // clear. The collapsed row's button contains the icon, so its center is safe.
  const button = page.locator(`[aria-label^="Project: ${cssEscape(name)}"]`).first()
  await button.waitFor({ state: 'visible' })
  if ((await button.getAttribute('aria-current')) !== 'page') {
    const collapsed = (await button.locator('[data-rail-icon-column]').count()) > 0
    if (collapsed) await button.click()
    else await button.click({ position: { x: 44, y: 14 } })
  }
  // Wait for the Rail to mark it active (the workspace restore follows).
  await page
    .locator(`[aria-label^="Project: ${cssEscape(name)} (active)"]`)
    .first()
    .waitFor({ state: 'visible' })
  await page.waitForTimeout(1_000)
}

/**
 * Open the New project modal from the Rail's Projects `+` menu (desktop
 * shell, Rail expanded).
 */
export async function openRailNewProjectModal(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Add project or folder group' }).click()
  await page.getByRole('menuitem', { name: 'New project' }).click()
}

/**
 * Show the right panel on one view (Explorer, Changes or GitHub) with its tool
 * strip button and wait until the button is pressed. A click on the open view
 * hides the panel, so the helper clicks only when the view is not open. The
 * last view is remembered per project, so a spec that needs a specific one
 * opens it instead of assuming the default.
 */
export async function openRightPanelView(
  page: Page,
  name: 'Explorer' | 'Changes' | 'GitHub'
): Promise<void> {
  const button = page
    .getByRole('toolbar', { name: 'Tools' })
    .getByRole('button', { name, exact: true })
  if ((await button.getAttribute('aria-pressed')) !== 'true') await button.click()
  await expect(button).toHaveAttribute('aria-pressed', 'true')
}

/**
 * The Rail chat row (under the open project) whose accessible name starts
 * with `title`: the project's chats, closed ones included. Call
 * {@link showAllRailChats} first when the chat may sit past "Show N more".
 */
export function railChat(page: Page, title: string) {
  return page
    .getByTestId('rail-project-chats')
    .getByRole('button', { name: new RegExp(`^${escapeRegExp(title)}`) })
    .first()
}

/** Expand the open project's Rail chats past "Show N more" (no-op when all fit). */
export async function showAllRailChats(page: Page): Promise<void> {
  const more = page.getByTestId('rail-project-chats').getByRole('button', {
    name: /^Show \d+ more/
  })
  if ((await more.count()) > 0) await more.first().click()
}

/**
 * The composer of the empty chat (a chat tab with no messages) that the
 * active pane shows. The empty chat shows the start hero ("What should we do
 * in <project>?"), and its composer has no aria-label (the launcher composer
 * has "Agent prompt"). The scope is the visible chat tab, so the composer of
 * a hidden tab or of a chat that has messages does not match.
 */
export function emptyChatComposer(page: Page): Locator {
  return emptyChatPanel(page).locator('[data-composer-editor="true"]').first()
}

/**
 * The context row under the empty chat composer (desktop shell only):
 * Workspace select (Current checkout, Existing worktree, New worktree) and,
 * per mode, the Base branch or Worktree select. The first send applies the
 * pick.
 */
export function chatStartContextRow(page: Page): Locator {
  return emptyChatPanel(page).locator('[data-chat-start-context-row="true"]').first()
}

/**
 * The launcher composer (aria-label "Agent prompt"): the empty-pane launcher
 * (a pane with no tabs) or the launcher overlay. New chat opens the overlay
 * only as a fallback (no configured agent, or the agent needs a sign-in).
 */
export function launcherComposer(page: Page): Locator {
  return page.locator('[data-composer-editor="true"][aria-label="Agent prompt"]').first()
}

/**
 * Click the Rail "New chat" button and return the composer that starts the
 * chat. New chat opens a new empty chat tab in the active pane (or focuses
 * the empty chat that the pane shows), so the usual result is the empty chat
 * composer. When the empty chat does not open, the helper uses the launcher
 * composer if it is visible (the launcher fallback, or a pane with no tabs).
 * The composer is editable when the helper returns.
 */
export async function startNewChat(page: Page): Promise<Locator> {
  const emptyChat = emptyChatComposer(page)
  let composer: Locator | null = null
  // A click can come before the Rail is ready, so try again two times.
  for (let attempt = 0; attempt < 3 && !composer; attempt++) {
    await page.getByRole('button', { name: 'New chat', exact: true }).first().click()
    try {
      await emptyChat.waitFor({ state: 'visible', timeout: 5_000 })
      composer = emptyChat
    } catch {
      // Do not use the launcher on the first attempts: on a pane with no
      // tabs the empty-pane launcher shows before the empty chat opens.
      if (attempt === 2 && (await launcherComposer(page).isVisible())) {
        composer = launcherComposer(page)
      }
    }
  }
  if (!composer) throw new Error('New chat opened no empty chat and no launcher')
  // The launcher keeps its composer non-editable ("Composer unavailable")
  // until the agent is ready. The empty chat composer is editable at once
  // (a message sent before the session is ready waits in the queue).
  await expect(composer).toHaveAttribute('contenteditable', 'true')
  return composer
}

/**
 * Start a NEW chat in the active project and send `prompt` as its first
 * message. The helper uses New chat (see {@link startNewChat}), not the
 * composer of an open chat: that composer would QUEUE the prompt to the
 * running turn of its session.
 * Resolves when the chat tab shows the session title (= the first prompt).
 */
export async function launchChat(page: Page, prompt: string): Promise<void> {
  const composer = await startNewChat(page)
  // The empty chat can render again while it starts and drop the text, so
  // enter it again until the composer shows the prompt.
  await expect(async () => {
    await composer.focus()
    await page.keyboard.press('ControlOrMeta+A')
    await page.keyboard.insertText(prompt)
    await expect(composer).toHaveText(prompt, { timeout: 2_500 })
  }).toPass({ timeout: 40_000 })
  await page.keyboard.press('Enter')
  // The chat tab's aria-label is the session title (= the first prompt text).
  await chatTab(page, prompt).waitFor({ state: 'visible' })
}

/**
 * Enter `prompt` in the empty chat composer and send it with the Send
 * button (`tap` for the phone shell). Call this after New chat opened the
 * empty chat. The composer can render again while the chat starts, which
 * drops the focus and the text, so the entry is done again (focus, select
 * all, replace) until the Send button is enabled.
 */
export async function sendFromEmptyChat(
  page: Page,
  prompt: string,
  options: { tap?: boolean } = {}
): Promise<void> {
  const composer = emptyChatComposer(page)
  const send = emptyChatPanel(page)
    .getByRole('button', { name: /^(Send|Queue) message$/ })
    .first()
  await expect(async () => {
    await composer.focus()
    await page.keyboard.press('ControlOrMeta+A')
    await page.keyboard.insertText(prompt)
    await expect(send).toBeEnabled({ timeout: 2_500 })
  }).toPass({ timeout: 40_000 })
  if (options.tap) await send.tap()
  else await send.click()
}

/**
 * An agent-chat tab whose accessible name starts with `title`.
 * The Rail chat rows are draggable too and reuse the same name, so the
 * lookup is the tab role, which only the workspace tab bar uses.
 */
export function chatTab(page: Page, title: string) {
  return page.getByRole('tab', { name: new RegExp(`^${escapeRegExp(title)}`) }).first()
}

/**
 * Count of streamed chunk markers currently visible in the page body.
 * `chunk-N` markers are word-bounded (`chunk-10` is NOT a `chunk-1` match).
 */
export async function visibleChunkCount(page: Page): Promise<number> {
  const text = await page.locator('body').innerText()
  return (text.match(/\bchunk-\d+\b/g) ?? []).length
}

/** The visible chat tab that shows the empty chat start screen. */
export function emptyChatPanel(page: Page): Locator {
  return page
    .locator('[data-chat-tab-state="visible"]')
    .filter({ has: page.getByRole('heading', { name: /^What should we do in / }) })
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function cssEscape(text: string): string {
  return text.replace(/["\\]/g, '\\$&')
}
