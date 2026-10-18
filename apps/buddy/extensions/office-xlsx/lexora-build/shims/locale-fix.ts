import type { TFunc } from '../../apps/sheets/src/renderer/i18n/locale'
// Stands in for the renderer's `i18n/locale` module. Save As exports a copy and answers the renderer with a cancelled save
// (entry.ts), which would leave "Save canceled." in the status line. When the copy was written, the module-level translator
// words that one message as what happened instead; everything else is the upstream translator.
import { getLang, t as upstreamT } from '../../apps/sheets/src/renderer/i18n/locale'

export * from '../../apps/sheets/src/renderer/i18n/locale'

const flags = globalThis as { __lexoraCopyExported?: boolean }

/** `__lexoraCopyExported` is set by entry.ts after an export; the next "save canceled" message reports the copy instead. */
export const t: TFunc = (key, params) => {
  if (key === 'appSaveCanceled' && flags.__lexoraCopyExported) {
    flags.__lexoraCopyExported = false
    return getLang() === 'zh' ? '已另存为副本，当前文档仍是原文件。' : 'Saved a copy. This document is still the original file.'
  }
  return upstreamT(key, params)
}
