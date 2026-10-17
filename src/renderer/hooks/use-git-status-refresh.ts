import { useEffect } from 'react'
import { startGitStatusRefreshSources } from '@/lib/git-status-sources'

/**
 * Mounts the git status store's refresh sources (terminal git events, window
 * focus, 30 s visible-only interval). Mount once per renderer root.
 */
export function useGitStatusRefresh(): void {
  useEffect(() => startGitStatusRefreshSources(), [])
}
