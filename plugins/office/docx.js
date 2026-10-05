import { Inflate } from './vendor/fflate.js'

export const MAX_DOCX_BYTES = 64 * 1024 * 1024
const MAX_EXPANDED_BYTES = 128 * 1024 * 1024
const MAX_ENTRIES = 10000

function invalid() {
  throw new Error('OFFICE_INVALID_DOCX')
}

function checkInflated(bytes, method, expectedSize, deadline) {
  let size = 0
  const accept = (data) => {
    size += data.length
    if (size > expectedSize || performance.now() > deadline)
      invalid()
  }
  if (method === 0) {
    accept(bytes)
  }
  else {
    const inflate = new Inflate(accept)
    for (let offset = 0; offset < bytes.length; offset += 1024) {
      if (performance.now() > deadline)
        invalid()
      inflate.push(bytes.subarray(offset, offset + 1024), offset + 1024 >= bytes.length)
    }
  }
  if (size !== expectedSize)
    invalid()
}

// Check ZIP directory budgets before the editor inflates any part. ZIP64 and
// encrypted containers are deliberately excluded from the migrated first slice.
export function validateDocx(data) {
  const bytes = data instanceof Uint8Array ? data : new Uint8Array(data)
  if (bytes.byteLength < 22 || bytes.byteLength > MAX_DOCX_BYTES)
    invalid()
  const deadline = performance.now() + 15000
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  let end = -1
  for (let offset = bytes.length - 22; offset >= Math.max(0, bytes.length - 65557); offset--) {
    if (view.getUint32(offset, true) === 0x06054B50 && offset + 22 + view.getUint16(offset + 20, true) === bytes.length) {
      end = offset
      break
    }
  }
  if (end < 0 || view.getUint16(end + 4, true) || view.getUint16(end + 6, true))
    invalid()
  const count = view.getUint16(end + 10, true)
  const directorySize = view.getUint32(end + 12, true)
  const directoryStart = view.getUint32(end + 16, true)
  if (!count || count > MAX_ENTRIES || view.getUint16(end + 8, true) !== count || directoryStart + directorySize !== end)
    invalid()
  let offset = directoryStart
  let expanded = 0
  const names = new Set()
  const decoder = new TextDecoder('utf-8', { fatal: true })
  for (let index = 0; index < count; index++) {
    if (offset + 46 > end || view.getUint32(offset, true) !== 0x02014B50)
      invalid()
    const flags = view.getUint16(offset + 8, true)
    const method = view.getUint16(offset + 10, true)
    const compressed = view.getUint32(offset + 20, true)
    const size = view.getUint32(offset + 24, true)
    const nameLength = view.getUint16(offset + 28, true)
    const next = offset + 46 + nameLength + view.getUint16(offset + 30, true) + view.getUint16(offset + 32, true)
    const local = view.getUint32(offset + 42, true)
    if ((flags & 1) || ![0, 8].includes(method) || next > end || size > MAX_DOCX_BYTES || view.getUint16(offset + 34, true))
      invalid()
    expanded += size
    if (expanded > MAX_EXPANDED_BYTES || local + 30 > directoryStart || view.getUint32(local, true) !== 0x04034B50)
      invalid()
    const name = decoder.decode(bytes.subarray(offset + 46, offset + 46 + nameLength))
    if (!name || name.includes('\\') || name.startsWith('/') || name.includes(':') || name.split('/').some(part => part === '..' || part === '.') || names.has(name))
      invalid()
    const localNameLength = view.getUint16(local + 26, true)
    const bodyStart = local + 30 + localNameLength + view.getUint16(local + 28, true)
    if (bodyStart + compressed > directoryStart || flags !== view.getUint16(local + 6, true) || method !== view.getUint16(local + 8, true) || decoder.decode(bytes.subarray(local + 30, local + 30 + localNameLength)) !== name)
      invalid()
    // Data-descriptor entries carry sizes in the central directory. Otherwise
    // insist on matching local declarations so the decoder sees the same budget.
    if (!(flags & 8) && (view.getUint32(local + 18, true) !== compressed || view.getUint32(local + 22, true) !== size))
      invalid()
    checkInflated(bytes.subarray(bodyStart, bodyStart + compressed), method, size, deadline)
    names.add(name)
    offset = next
  }
  if (offset !== end || !names.has('[Content_Types].xml') || !names.has('word/document.xml'))
    invalid()
  return bytes
}

export async function readDocx(resources, resource, signal) {
  if (!/\.docx$/i.test(resource.name) || !Number.isSafeInteger(resource.size) || resource.size < 22 || resource.size > MAX_DOCX_BYTES)
    throw new Error('OFFICE_UNSUPPORTED_DOCX')
  const data = new Uint8Array(resource.size)
  let offset = 0
  while (offset < data.length) {
    signal.throwIfAborted()
    const length = Math.min(128 * 1024, data.length - offset)
    const result = await resources.readBytes(resource, { offset, length })
    signal.throwIfAborted()
    if (result.size !== data.length || result.data.length !== length || result.eof !== (offset + length === data.length))
      throw new Error('OFFICE_RESOURCE_CHANGED')
    data.set(result.data, offset)
    offset += length
  }
  return validateDocx(data)
}
