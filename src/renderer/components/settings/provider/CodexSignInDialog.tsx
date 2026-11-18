import type { CodexAccountView } from '@shared/types/codex-accounts.types'
import { useState } from 'react'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import { CodexSignInRun } from './CodexSignInStep'

/**
 * Sign in an existing Codex account: the "Sign in" step of the Add account
 * dialog on its own. It stays open while a sign-in runs; a failed sign-in
 * shows its reason and the method pick comes back.
 */
export function CodexSignInDialog({
  account,
  onClose,
  onSignedIn
}: {
  account: CodexAccountView | null
  onClose: () => void
  onSignedIn: (account: CodexAccountView) => Promise<void>
}): React.JSX.Element {
  const [running, setRunning] = useState(false)
  return (
    <Dialog
      open={account !== null}
      onOpenChange={(open) => {
        if (!open && !running) onClose()
      }}
    >
      <DialogContent className="max-h-[90dvh] gap-5 overflow-y-auto overscroll-contain sm:max-w-[400px]">
        {/* The content unmounts on close, so each open starts at the method pick. */}
        {account && (
          <CodexSignInRun
            account={account}
            onRunningChange={setRunning}
            onSignedIn={() => void onSignedIn(account)}
            onCancel={onClose}
          />
        )}
      </DialogContent>
    </Dialog>
  )
}
