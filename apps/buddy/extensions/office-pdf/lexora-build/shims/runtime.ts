import { Buffer } from 'node:buffer'
import { fontCoversText } from '../../apps/pdf/src/main/font-cmap'

// Stand-in for what the editor's save/edit code takes from Node and Electron upstream: file reads for its own wasm and
// fonts, system font lookup, atomic file writes and native image encoding. The plugin has no file system, so the
// runtime files are fetched once from the plugin package (loadRuntime) and `readFileSync` serves them from memory.

if (!('Buffer' in globalThis))
  Object.assign(globalThis, { Buffer })

const files = new Map<string, Buffer>()
const families = ['Sans', 'Serif', 'Mono']
const styles = ['Regular', 'Bold', 'Italic', 'BoldItalic']
const cjk = 'NotoSansCJKsc-Regular-subset.otf'

export async function loadRuntime(base: URL, signal: AbortSignal): Promise<void> {
  const names = ['pdfium.wasm', 'hb-subset.wasm', cjk, ...families.flatMap(family => styles.map(style => `Liberation${family}-${style}.ttf`))]
  await Promise.all(names.map(async (name) => {
    if (files.has(name))
      return
    const response = await fetch(new URL(`runtime/${name}`, base), { signal })
    if (!response.ok)
      throw new Error(`PDF_RUNTIME_MISSING:${name}`)
    files.set(name, Buffer.from(await response.arrayBuffer()))
  }))
}

export function readFileSync(path: string): Buffer {
  const name = path.replaceAll('\\', '/').split('/').at(-1) ?? ''
  const bytes = files.get(name)
  if (!bytes)
    throw new Error(`PDF_RUNTIME_MISSING:${name}`)
  return bytes
}

export const pdfiumWasmPath = () => 'pdfium.wasm'
export const hbSubsetWasmPath = () => 'hb-subset.wasm'

// The page cannot see system fonts. Liberation covers Latin text and the Noto subset covers Chinese.
export const isTruetype = (bytes: Buffer) => bytes.length >= 4 && bytes.readUInt32BE(0) !== 0x4F54544F
export function findSystemFont(psName: string, family: string): Buffer | null {
  const key = `${psName} ${family}`.toLowerCase()
  if (/noto|yahei|simsun|pingfang|hiragino|gothic|malgun/.test(key))
    return files.get(cjk) ?? null
  const face = /times|serif/.test(key) ? 'Serif' : /courier|mono/.test(key) ? 'Mono' : 'Sans'
  const bold = /bold/.test(key)
  const italic = /italic|oblique/.test(key)
  const style = bold && italic ? 'BoldItalic' : bold ? 'Bold' : italic ? 'Italic' : 'Regular'
  return files.get(`Liberation${face}-${style}.ttf`) ?? null
}
export function findFontCovering(text: string): Buffer | null {
  for (const name of ['LiberationSans-Regular.ttf', cjk]) {
    const bytes = files.get(name)
    if (bytes && fontCoversText(bytes, text))
      return bytes
  }
  return null
}

const decodedImages = new Map<string, { width: number, height: number, bgra: Buffer }>()

// Electron's nativeImage is only used to encode raw bitmaps to PNG and to decode an image the user inserts.
export const nativeImage = {
  createFromBitmap(bytes: Uint8Array, { width, height }: { width: number, height: number }) {
    return {
      toPNG(): Buffer {
        const canvas = document.createElement('canvas')
        canvas.width = width
        canvas.height = height
        const context = canvas.getContext('2d')
        if (!context)
          throw new Error('PDF_CANVAS_UNAVAILABLE')
        const image = context.createImageData(width, height)
        for (let i = 0; i < bytes.length; i += 4) {
          const alpha = bytes[i + 3]!
          const factor = alpha > 0 && alpha < 255 ? 255 / alpha : 1
          image.data[i] = Math.min(255, Math.round(bytes[i + 2]! * factor))
          image.data[i + 1] = Math.min(255, Math.round(bytes[i + 1]! * factor))
          image.data[i + 2] = Math.min(255, Math.round(bytes[i]! * factor))
          image.data[i + 3] = alpha
        }
        context.putImageData(image, 0, 0)
        return Buffer.from(canvas.toDataURL('image/png').split(',')[1]!, 'base64')
      },
    }
  },
  // Decoding is synchronous upstream and asynchronous in a page, so the images of a save request are decoded first
  // (prepareImages) and looked up here by their bytes.
  createFromBuffer(bytes: Uint8Array) {
    const decoded = decodedImages.get(Buffer.from(bytes).toString('base64'))
    return {
      isEmpty: () => !decoded,
      getSize: () => ({ width: decoded?.width ?? 0, height: decoded?.height ?? 0 }),
      toBitmap: (): Buffer => {
        if (!decoded)
          throw new Error('PDF_IMAGE_NOT_DECODED')
        return decoded.bgra
      },
    }
  },
}

/** Decodes a base64 PNG/JPEG to the premultiplied BGRA bitmap Electron would give for it. */
export async function prepareImage(base64: string): Promise<void> {
  const bytes = Buffer.from(base64, 'base64')
  const key = bytes.toString('base64')
  if (decodedImages.has(key))
    return
  const bitmap = await createImageBitmap(new Blob([new Uint8Array(bytes)]))
  try {
    const canvas = document.createElement('canvas')
    canvas.width = bitmap.width
    canvas.height = bitmap.height
    const context = canvas.getContext('2d')
    if (!context)
      throw new Error('PDF_CANVAS_UNAVAILABLE')
    context.drawImage(bitmap, 0, 0)
    const rgba = context.getImageData(0, 0, bitmap.width, bitmap.height).data
    const bgra = Buffer.alloc(rgba.length)
    for (let i = 0; i < rgba.length; i += 4) {
      const alpha = rgba[i + 3]!
      bgra[i] = Math.round(rgba[i + 2]! * alpha / 255)
      bgra[i + 1] = Math.round(rgba[i + 1]! * alpha / 255)
      bgra[i + 2] = Math.round(rgba[i]! * alpha / 255)
      bgra[i + 3] = alpha
    }
    // Keep a handful: a save request carries the images it needs, and they are decoded again for the next one.
    if (decodedImages.size >= 8)
      decodedImages.delete(decodedImages.keys().next().value!)
    decodedImages.set(key, { width: bitmap.width, height: bitmap.height, bgra })
  }
  finally {
    bitmap.close()
  }
}

export async function readFile(): Promise<never> {
  throw new Error('OFFICE_FEATURE_UNAVAILABLE')
}
export async function writePdfAtomically(): Promise<never> {
  throw new Error('OFFICE_FEATURE_UNAVAILABLE')
}
