import { type MutableRefObject, type RefObject, useLayoutEffect, useRef, useState } from 'react'
import type { LeafNode } from '@/types/workspace.types'
import { LAUNCHER_DOCK_BOTTOM_PX } from './launcher-motion'
import type { LauncherExitAnim } from './overlay-chrome'

interface UseLauncherExitAnimInput {
  isPresent: boolean
  isExiting: boolean
  reducedMotion: boolean
  paneLeaf: LeafNode | null
  rootRef: RefObject<HTMLDivElement | null>
  composerCardRef: RefObject<HTMLDivElement | null>
  launchInFlightRef: MutableRefObject<boolean>
  prevActiveTabIdRef: MutableRefObject<string | null | undefined>
}

/** Exit classification and morph measurement for the launcher -> chat handoff. */
export function useLauncherExitAnim({
  isPresent,
  isExiting,
  reducedMotion,
  paneLeaf,
  rootRef,
  composerCardRef,
  launchInFlightRef,
  prevActiveTabIdRef
}: UseLauncherExitAnimInput): LauncherExitAnim | null {
  const [exitAnim, setExitAnim] = useState<LauncherExitAnim | null>(null)
  const exitMeasuredRef = useRef(false)

  // Presence can resume inside the same boundary (overlay hidden → re-shown
  // while still exiting): drop stale exit styling and re-arm measurement.
  useLayoutEffect(() => {
    if (!isPresent) return
    setExitAnim(null)
    exitMeasuredRef.current = false
  }, [isPresent])

  // Measure once on the first exiting commit, while the transform is still
  // identity: the getBoundingClientRect reflow anchors that computed value so
  // the follow-up render animates identity → morph instead of jumping. The
  // once-guard also stops paneLeaf churn mid-exit from re-measuring the
  // already-transformed card (rects include transforms → wrong math).
  // biome-ignore lint/correctness/useExhaustiveDependencies: refs arrive as props; the effect must re-run only on these three (moved as is from AgentLauncher).
  useLayoutEffect(() => {
    if (!isExiting || reducedMotion || exitMeasuredRef.current) return
    const root = rootRef.current
    const card = composerCardRef.current
    if (!root || !card) return
    exitMeasuredRef.current = true

    const activeTab = paneLeaf?.tabs.find((t) => t.id === paneLeaf.activeTabId)
    const launched =
      launchInFlightRef.current ||
      (activeTab?.type === 'agent-chat' && activeTab.id !== prevActiveTabIdRef.current)
    if (!launched) {
      setExitAnim({ kind: 'dismiss' })
      return
    }

    // Morph target: the real ChatInputBar card mounted by the fresh chat tab
    // in the same pane. Inactive chat tabs stay mounted (invisible but laid
    // out) and their composers can differ in height — prefer the composer in
    // the ACTIVE tab, then any non-invisible one.
    const paneEl = root.closest('[data-pane-content]')
    const candidates = paneEl
      ? Array.from(paneEl.querySelectorAll<HTMLElement>('[data-chat-composer="true"]'))
      : []
    const target =
      candidates.find((el) => el.closest('[data-chat-tab-state="visible"]') !== null) ??
      candidates.find((el) => el.closest('.invisible') === null) ??
      candidates[0] ??
      null
    const group = card.parentElement ?? card
    const t = target?.getBoundingClientRect()
    const g = group.getBoundingClientRect()
    const c = card.getBoundingClientRect()
    if (!t || t.width <= 0 || t.height <= 0 || c.width <= 0 || c.height <= 0) {
      // Chat composer not laid out yet (lazy chunk / jsdom): keep the
      // constant-distance dock dive as the fallback.
      const distance = root.getBoundingClientRect().bottom - c.bottom - LAUNCHER_DOCK_BOTTOM_PX
      setExitAnim({ kind: 'morph', tx: 0, ty: Math.max(0, distance), sx: 1, sy: 1, ox: 0, oy: 0 })
      return
    }
    // Anchor the card's bottom-center (transform origin in the group's local
    // frame) so the scaled card lands exactly on the target's bottom-center.
    const ox = c.left - g.left + c.width / 2
    const oy = c.bottom - g.top
    setExitAnim({
      kind: 'morph',
      sx: t.width / c.width,
      sy: t.height / c.height,
      ox,
      oy,
      tx: t.left + t.width / 2 - (g.left + ox),
      ty: t.bottom - (g.top + oy)
    })
  }, [isExiting, reducedMotion, paneLeaf])

  return exitAnim
}
