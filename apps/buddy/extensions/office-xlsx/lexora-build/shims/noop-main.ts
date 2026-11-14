// Main-process modules the plugin does not provide: PDF export and printing.
async function unavailable(): Promise<never> {
  throw new Error('SHEETS_FEATURE_UNAVAILABLE')
}
export const exportPdf = unavailable
export const printWorkbook = unavailable

// Windows-only clipboard enhancement is deliberately absent in the browser plugin.
export async function runCopyEmfHelper(_helper: string, _payload: string): Promise<{ ok: boolean }> {
  return { ok: false }
}
