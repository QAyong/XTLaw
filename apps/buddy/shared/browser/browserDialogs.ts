export const BROWSER_PAGE_DIALOG_CHANNEL = 'lexora:browser:page-dialog'
export interface BrowserPageDialogRequest {
  type: 'alert' | 'confirm'
  message: string
}
export interface BrowserPageDialogResponse {
  handled: boolean
  value: boolean
}
