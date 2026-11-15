import { Info } from '@/components/icons'
import { CodexProviderSettings } from '@/components/settings/provider/CodexProviderSettings'
import { ProviderSettings } from '@/components/settings/provider/ProviderSettings'
import { SettingsSection } from '@/components/settings/SettingsLayout'
import { useServerAdmitsRemoteWrites } from '@/hooks/use-server-admits-remote-writes'

/**
 * Settings → Accounts: the Claude group, then the Codex group, then one note
 * for both on where to choose an account per project.
 */
export function ProviderSection(): React.JSX.Element {
  const canManage = useServerAdmitsRemoteWrites()
  return (
    <SettingsSection id="provider">
      <ProviderSettings />
      <CodexProviderSettings />
      {canManage && (
        <p className="mt-6 flex items-center gap-1.5 text-2xs text-muted-foreground">
          <Info size={12} aria-hidden="true" className="shrink-0" />
          Choose an account per project in Project settings → Accounts.
        </p>
      )}
    </SettingsSection>
  )
}
