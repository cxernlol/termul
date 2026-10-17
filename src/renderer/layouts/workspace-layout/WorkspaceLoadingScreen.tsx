import { ResizeEdges } from '@/components/ResizeEdges'

interface WorkspaceLoadingScreenProps {
  isMobileWebShell: boolean
}

/** The "Loading..." state shown while projects are being loaded (mobile and desktop). */
export function WorkspaceLoadingScreen({
  isMobileWebShell
}: WorkspaceLoadingScreenProps): React.JSX.Element {
  return (
    <div className="flex h-screen flex-col overflow-hidden bg-background">
      {!isMobileWebShell && <ResizeEdges />}
      <div className="flex flex-1 items-center justify-center">
        <div className="text-sm text-muted-foreground">Loading...</div>
      </div>
    </div>
  )
}
