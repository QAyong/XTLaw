// Print and printer APIs are deliberately unavailable in the browser plugin.
// Keep these exports inert so importing slides-main never loads Electron or Node APIs.
export async function loadPrintHtml() {
  return { tempDir: '' }
}

export function printOutcome() {
  return { ok: false }
}

export function printJobOptions() {
  return { silent: false }
}

export async function printPdfViaCups() {
  return { ok: false, error: 'SLIDES_FEATURE_UNAVAILABLE' }
}

export function printToPdfOptionsFor() {
  return { printBackground: false }
}

export async function queryPrinterOptions() {
  return []
}

export const DRIVER_OPTION_NAMES: string[] = []
