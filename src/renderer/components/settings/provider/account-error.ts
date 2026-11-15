/** The message of a failed account action, for the dialog's error line. */
export function accountErrorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
