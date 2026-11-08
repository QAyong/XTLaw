import type { ExtensionContext, Json } from '../lexora'

const LIMIT = 100

function record(value: Json): Record<string, Json> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {}
}

function subtitle(value: Json) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const id = value.id
  const name = value.name
  const type = value.type
  const encoding = value.encoding
  const show = value.show
  if (typeof id !== 'string' || typeof name !== 'string' || typeof encoding !== 'string' || typeof show !== 'boolean') return null
  if (type !== 'srt' && type !== 'vtt' && type !== 'ass') return null
  return { id, name, type, encoding, show, ...(typeof value.relativePath === 'string' && value.relativePath.length <= 32768 ? { relativePath: value.relativePath } : {}) }
}

export function activate(context: ExtensionContext) {
  context.subscriptions.add(context.commands.register(`${context.extension.id}.subtitle`, async ({ arguments: input }) => {
    const request = record(input)
    const key = request.key
    if (typeof key !== 'string' || !key) return null
    const stored = record(await context.storage.get())
    const book = record(stored.subtitles)
    if (request.op === 'get') return subtitle(book[key] ?? null)
    if (request.op === 'delete') {
      const next = { ...book }
      delete next[key]
      await context.storage.set({ subtitles: next })
      return true
    }
    if (request.op !== 'put') return null
    const value = subtitle(request.value ?? null)
    if (!value) return null
    const next = { ...book, [key]: value }
    const keys = Object.keys(next)
    if (keys.length > LIMIT) {
      for (const extra of keys.slice(0, keys.length - LIMIT)) {
        if (extra !== key) delete next[extra]
      }
    }
    await context.storage.set({ subtitles: next })
    return true
  }))
}
