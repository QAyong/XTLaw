// The renderer mounts into #root when imported; view.js creates the element first and awaits `ready`.
// vite.config.mjs rewrites main.tsx so that `ready` settles after the first render and `window.__lexoraOfficeUnmount` exists.
export { ready } from '../apps/docs/src/renderer/main'
