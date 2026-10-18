// Main-process modules the plugin does not provide: PDF export and printing.
async function unavailable(): Promise<never> {
  throw new Error('SHEETS_FEATURE_UNAVAILABLE')
}
export const exportPdf = unavailable
export const printWorkbook = unavailable
