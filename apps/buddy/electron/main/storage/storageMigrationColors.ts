// The migration page is a standalone document shown before the renderer exists, so it cannot use the renderer
// theme. These values mirror the light and dark tokens in `src/theme/buddyTheme.ts`; keep them in step with it.
const tokens = [
  ['surface-canvas', '#fafaf8', '#202422'],
  ['text-strong', '#202522', '#f2f4f0'],
  ['text-primary', '#414844', '#d5dad5'],
  ['text-secondary', '#666e69', '#aab1ab'],
  ['text-on-accent', '#ffffff', '#ffffff'],
  ['border-subtle', 'rgba(32, 37, 34, 0.1)', 'rgba(255, 255, 255, 0.11)'],
  ['accent-solid', '#506b90', '#506b90'],
  ['accent-solid-hover', '#5b769c', '#5b769c'],
  ['accent-text', '#40597b', '#91abcc'],
  ['accent-surface', 'rgb(80 107 144 / 12%)', 'rgb(145 171 204 / 13%)'],
  ['focus-ring', '#506b90', '#91abcc'],
  ['status-success-text', '#287550', '#70ce9c'],
  ['status-warning-text', '#89591e', '#e2ad64'],
] as const

export const storageMigrationColors = tokens
  .map(([name, light, dark]) => `--buddy-${name}: light-dark(${light}, ${dark});`)
  .join('\n')
