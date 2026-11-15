import { KeyRound } from '@/components/icons'
import { Switch } from '@/components/ui/switch'
import { SettingsCard } from '../SettingsGroup'
import { SettingsRow, settingsDescriptionId } from '../SettingsRow'

/**
 * The one line under a provider's account rows (Claude and Codex alike).
 * Two or more accounts: the "Switch accounts automatically" setting. One
 * account: switching has nowhere to go, so a quiet hint says what a second
 * account gives (the group header's Add account adds it). Nothing on a
 * read-only connection with one account.
 */
export function AccountGroupFooter({
  id,
  accountCount,
  canManage,
  autoSwitch,
  saving,
  onAutoSwitchChange
}: {
  /** Prefix of the switch id, e.g. "claude" or "codex". */
  id: string
  accountCount: number
  canManage: boolean
  autoSwitch: boolean
  saving: boolean
  onAutoSwitchChange: (enabled: boolean) => void
}): React.JSX.Element | null {
  const switchId = `${id}-auto-switch`
  if (accountCount >= 2) {
    return (
      <SettingsCard className="mt-3">
        <SettingsRow
          htmlFor={switchId}
          label="Switch accounts automatically"
          description="When a chat reaches its account's limit, continue it on the signed-in account with the most room."
          layout="inline"
        >
          <Switch
            id={switchId}
            aria-describedby={settingsDescriptionId(switchId)}
            checked={autoSwitch}
            disabled={saving || !canManage}
            onCheckedChange={onAutoSwitchChange}
          />
        </SettingsRow>
      </SettingsCard>
    )
  }
  if (!canManage) return null
  return (
    <p
      data-testid={`${id}-second-account-hint`}
      className="flex items-start gap-2 pt-3 text-2xs leading-relaxed text-muted-foreground"
    >
      <KeyRound size={12} aria-hidden="true" className="mt-0.5 shrink-0" />
      Add a second account to keep work and personal apart. When one reaches its limit, chats can
      continue on the other.
    </p>
  )
}
