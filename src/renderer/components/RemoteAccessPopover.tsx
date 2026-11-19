import { QRCodeSVG } from 'qrcode.react'
import { useEffect, useState } from 'react'
import { AlertCircle, Check, Copy, Monitor, ShieldAlert } from '@/components/icons'
import { ToolStrip } from '@/components/shell/tool-strip/ToolStrip'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Switch } from '@/components/ui/switch'
import { remoteServerApi } from '@/lib/api'
import { cn } from '@/lib/utils'
import { useRemoteStatus, useRemoteStatusStore } from '@/stores/remote-status-store'

/**
 * Tool strip popover for remote agent access (desktop shared-live host only).
 *
 * Enabling starts the in-process localhost web server + a built-in cloudflared
 * quick-tunnel, producing an ephemeral `https://*.trycloudflare.com` URL the
 * phone can reach on any network. That URL is rendered as a QR — scan to open.
 * No bind selector, no URL text row: the QR is the connect UI.
 *
 * Security posture: cloudflared provides edge TLS and the shared link carries
 * the bearer token. Remote clients are view-only unless the user turns on
 * "Allow full control" before sharing; the level is fixed while sharing runs
 * (toggle off and on to change it, which also rotates the link). The warning
 * below names what the link grants.
 */
export function RemoteAccessPopover(): React.JSX.Element {
  const remoteStatus = useRemoteStatus()
  const [remoteBusy, setRemoteBusy] = useState(false)
  const [remoteError, setRemoteError] = useState<string | null>(null)
  const [copiedUrl, setCopiedUrl] = useState(false)
  // The access level the next start asks for. While sharing runs, the switch
  // shows the running host's level instead (fixed until it is restarted).
  const [allowWritesChoice, setAllowWritesChoice] = useState(false)

  const isRunning = remoteStatus?.running ?? false
  const allowWrites = isRunning ? (remoteStatus?.allowWrites ?? false) : allowWritesChoice
  // The QR encodes the public tunnel URL only — never the localhost `url`.
  const tunnelUrl = remoteStatus?.tunnelUrl ?? null
  // Track whether a tunnel URL was ever seen this session so the popover can
  // distinguish "Starting tunnel…" (never connected) from "Tunnel
  // disconnected" (was connected, now gone — the 3s status poll cleared it).
  const [sawUrl, setSawUrl] = useState(false)
  useEffect(() => {
    if (tunnelUrl) setSawUrl(true)
    if (!isRunning) setSawUrl(false)
  }, [tunnelUrl, isRunning])

  const handleRemoteToggle = async (enable: boolean): Promise<void> => {
    setRemoteBusy(true)
    setRemoteError(null)
    try {
      const result = enable
        ? await (allowWritesChoice
            ? remoteServerApi.start({ allowWrites: true })
            : remoteServerApi.start())
        : await remoteServerApi.stop()
      if (result.success) {
        useRemoteStatusStore.getState().setStatus(result.data)
        // Browsers read the project list, the MCP servers and chat history
        // from the host directly, so nothing is seeded here.
      } else {
        setRemoteError(result.error)
      }
    } catch (error) {
      setRemoteError(error instanceof Error ? error.message : String(error))
    } finally {
      setRemoteBusy(false)
    }
  }

  const handleCopyLink = async (): Promise<void> => {
    if (!tunnelUrl) return
    try {
      await navigator.clipboard.writeText(tunnelUrl)
      setCopiedUrl(true)
      setTimeout(() => setCopiedUrl(false), 1500)
    } catch {
      // Clipboard unavailable; ignore.
    }
  }

  return (
    <Popover>
      <PopoverTrigger asChild>
        <ToolStrip.Button
          label="Remote access"
          aria-label="Remote terminal access"
          aria-pressed={isRunning}
          className="data-[state=open]:bg-foreground/[0.06] data-[state=open]:text-foreground"
          icon={<Monitor size={14} aria-hidden className={cn(isRunning && 'text-connection')} />}
          badge={isRunning ? <span className="sr-only">Remote access enabled</span> : undefined}
        />
      </PopoverTrigger>
      <PopoverContent side="left" align="end" className="w-72 p-4">
        <div className="space-y-3">
          <div>
            <h4 className="font-medium text-sm text-foreground">Remote Agent Access</h4>
            <p className="text-xs text-muted-foreground mt-1">
              Scan the QR to open your live agent sessions on a phone, on any network.
            </p>
          </div>

          <div className="flex items-center justify-between gap-3">
            <div className="flex-1 min-w-0">
              <div className="text-sm text-foreground">Enable remote access</div>
              <div className="text-xs text-muted-foreground mt-0.5">
                Starts a local server + a cloudflared tunnel.
              </div>
            </div>
            <Switch
              checked={isRunning}
              disabled={remoteBusy}
              onCheckedChange={(checked) => void handleRemoteToggle(checked)}
              aria-label="Toggle remote terminal access"
            />
          </div>

          <div className="flex items-center justify-between gap-3">
            <div className="flex-1 min-w-0">
              <div className="text-sm text-foreground">Allow full control</div>
              <div className="text-xs text-muted-foreground mt-0.5">
                {isRunning
                  ? 'Turn remote access off to change this.'
                  : 'Let remote devices prompt agents, run commands, and edit files. Off: view only.'}
              </div>
            </div>
            <Switch
              checked={allowWrites}
              disabled={remoteBusy || isRunning}
              onCheckedChange={setAllowWritesChoice}
              aria-label="Allow remote devices full control"
            />
          </div>

          {remoteError && (
            <div className="flex items-start gap-2 text-sm text-destructive bg-destructive/10 border border-destructive/30 rounded-md px-3 py-2">
              <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
              <span className="min-w-0 [overflow-wrap:anywhere]">{remoteError}</span>
            </div>
          )}

          {isRunning && tunnelUrl && (
            <div className="space-y-2">
              {/* White pad so the black QR modules are legible in dark themes. */}
              <div className="flex justify-center">
                <div className="rounded-lg bg-primary-foreground p-2">
                  <QRCodeSVG value={tunnelUrl} size={160} level="M" />
                </div>
              </div>
              <div className="flex items-start gap-2 text-xs text-warning bg-warning/10 border border-warning/30 rounded-md px-3 py-2">
                <ShieldAlert className="w-4 h-4 mt-0.5 shrink-0" />
                <span>
                  {allowWrites
                    ? 'This link carries your access token (after the #). Anyone who has it can control this machine: prompt your agents, run commands, and edit files. Share it only with devices you trust.'
                    : 'This link carries your access token (after the #). Anyone who has it can watch your live sessions, so share it only with devices you trust.'}{' '}
                  The tunnel address is random and changes each time you toggle off and on.
                </span>
              </div>
              <Button
                type="button"
                variant="secondary"
                size="xs"
                onClick={() => void handleCopyLink()}
                className="w-full [&_svg]:size-3.5"
                aria-label="Copy tunnel link"
              >
                {copiedUrl ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}
                {copiedUrl ? 'Copied' : 'Copy link'}
              </Button>
            </div>
          )}

          {isRunning && !tunnelUrl && (
            <div className="flex items-center justify-center text-xs text-muted-foreground py-2">
              {sawUrl ? 'Tunnel disconnected — toggle off and on to retry' : 'Starting tunnel…'}
            </div>
          )}
        </div>
      </PopoverContent>
    </Popover>
  )
}
