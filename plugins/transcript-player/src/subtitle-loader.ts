import { MAX_SUBTITLE_BYTES } from './transcript.ts'

export async function readSubtitle(response: Response, encoding: string, signal: AbortSignal): Promise<string> {
  if (!response.ok) throw new Error('无法读取字幕文件，请重新选择。')
  if (!response.body) throw new Error('字幕文件为空。')
  const reader = response.body.getReader()
  let decoder: TextDecoder
  try {
    decoder = new TextDecoder(encoding, { fatal: true })
  }
  catch {
    throw new Error('当前环境不能用这个编码读取，请改用 UTF-8。')
  }
  let bytes = 0
  let text = ''
  const decode = (chunk?: Uint8Array) => {
    try {
      return chunk ? decoder.decode(chunk, { stream: true }) : decoder.decode()
    }
    catch {
      throw new Error('字幕编码不匹配，请切换 UTF-8 / GBK 后重试。')
    }
  }
  const cancel = () => { void reader.cancel().catch(() => {}) }
  signal.addEventListener('abort', cancel, { once: true })
  try {
    for (;;) {
      signal.throwIfAborted()
      const chunk = await reader.read()
      signal.throwIfAborted()
      if (chunk.done) break
      bytes += chunk.value.byteLength
      if (bytes > MAX_SUBTITLE_BYTES) throw new Error('字幕文件超过 8 MiB，请拆分后加载。')
      text += decode(chunk.value)
    }
    text += decode()
    if (!text.trim()) throw new Error('字幕文件为空。')
    return text
  }
  finally {
    signal.removeEventListener('abort', cancel)
    await reader.cancel().catch(() => {})
    reader.releaseLock()
  }
}
