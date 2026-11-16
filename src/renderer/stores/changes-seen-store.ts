import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'

/** Most chats kept; the one seen longest ago drops first. */
export const MAX_SEEN_SESSIONS = 200

export const CHANGES_SEEN_STORAGE_KEY = 'termul.changes-seen'

interface ChangesSeenState {
  /** Chat id to the fingerprint of the changed files the user last looked at. */
  seen: Record<string, string>
  /** Chat ids, oldest first. Object key order is not reliable for numeric-like ids. */
  order: string[]
  markSeen: (sessionId: string, fingerprint: string) => void
}

/**
 * What the user has seen of each chat's changed files, on this device. The
 * blue dot on the Changes segment shows while the current files differ from
 * this record.
 */
export const useChangesSeenStore = create<ChangesSeenState>()(
  persist(
    (set) => ({
      seen: {},
      order: [],
      markSeen: (sessionId, fingerprint) =>
        set((state) => {
          if (state.seen[sessionId] === fingerprint && state.order.at(-1) === sessionId) {
            return state
          }
          const order = [...state.order.filter((id) => id !== sessionId), sessionId]
          const seen = { ...state.seen, [sessionId]: fingerprint }
          for (const dropped of order.splice(0, Math.max(0, order.length - MAX_SEEN_SESSIONS))) {
            delete seen[dropped]
          }
          return { seen, order }
        })
    }),
    {
      name: CHANGES_SEEN_STORAGE_KEY,
      version: 1,
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({ seen: state.seen, order: state.order })
    }
  )
)
