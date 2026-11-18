import type { Shot } from '../shot'
import { openApp } from '../ui'

// Browser tabs, page annotations and agent browser control are desktop-only,
// so this section only screenshots the canvas entry points.

export const shots: Shot[] = [
  {
    id: 'browser-canvas-palette',
    run: async (page) => {
      await openApp(page)
      await page.getByRole('button', { name: 'Search', exact: true }).first().click()
      await page.keyboard.type('canvas')
      await page.getByText('Open Canvas', { exact: true }).waitFor()
    }
  }
]
