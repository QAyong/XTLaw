/** Bounds one service history page. Electron IPC can carry a larger assembled response. */
export const RUN_EVENT_PAGE_LIMITS = Object.freeze({
  items: 100,
  bytes: 512 * 1024,
})
