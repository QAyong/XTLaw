// Document kit: check a ZIP-based document (DOCX, PPTX, XLSX, EPUB, ...) before an editor or parser opens it.
// Copied into plugins by sync.mjs; edit the original in apps/buddy/extensions/document-kit.
//
// It reads only the ZIP directory and refuses what an untrusted file should not get away with: ZIP64, encryption, unusual
// methods, unsafe or duplicate names, entries whose local header disagrees with the central directory, and parts that
// inflate to more than they declare or take too long. The caller passes fflate's Inflate so the kit carries no dependency.

/*
 * @param data bytes of the file
 * @param options.Inflate the Inflate class of the plugin's vendored fflate
 * @param options.error builds the error thrown for any invalid file, for example () => new Error('OFFICE_INVALID_DOCX')
 * @param options.maxBytes largest accepted file
 * @param options.maxEntryBytes largest single part when expanded
 * @param options.maxExpandedBytes largest total when expanded
 * @param options.maxEntries most parts (default 10000)
 * @param options.deadlineMs time allowed for checking (default 15000)
 * @param options.inflateChunk bytes handed to the inflater at a time (default 64 KiB)
 * @param options.requiredParts part names that must exist, for example ['[Content_Types].xml', 'xl/workbook.xml']
 */
export function validateZipContainer(data, options) {
  const { Inflate, maxBytes, maxEntryBytes, maxExpandedBytes, maxEntries = 10000, deadlineMs = 15000, inflateChunk = 64 * 1024, requiredParts = [] } = options
  const invalid = () => {
    throw options.error()
  }
  const bytes = data instanceof Uint8Array ? data : new Uint8Array(data)
  if (bytes.byteLength < 22 || bytes.byteLength > maxBytes)
    invalid()
  const deadline = performance.now() + deadlineMs
  function checkInflated(body, method, expectedSize) {
    let size = 0
    const accept = (part) => {
      size += part.length
      if (size > expectedSize || performance.now() > deadline)
        invalid()
    }
    if (method === 0) {
      accept(body)
    }
    else {
      const inflate = new Inflate(accept)
      for (let offset = 0; offset < body.length; offset += inflateChunk) {
        if (performance.now() > deadline)
          invalid()
        inflate.push(body.subarray(offset, offset + inflateChunk), offset + inflateChunk >= body.length)
      }
    }
    if (size !== expectedSize)
      invalid()
  }
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
  if (!count || count > maxEntries || view.getUint16(end + 8, true) !== count || directoryStart + directorySize !== end)
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
    if ((flags & 1) || ![0, 8].includes(method) || next > end || size > maxEntryBytes || view.getUint16(offset + 34, true))
      invalid()
    expanded += size
    if (expanded > maxExpandedBytes || local + 30 > directoryStart || view.getUint32(local, true) !== 0x04034B50)
      invalid()
    const name = decoder.decode(bytes.subarray(offset + 46, offset + 46 + nameLength))
    if (!name || name.includes('\\') || name.startsWith('/') || name.includes(':') || name.split('/').some(part => part === '..' || part === '.') || names.has(name))
      invalid()
    const localNameLength = view.getUint16(local + 26, true)
    const bodyStart = local + 30 + localNameLength + view.getUint16(local + 28, true)
    if (bodyStart + compressed > directoryStart || flags !== view.getUint16(local + 6, true) || method !== view.getUint16(local + 8, true) || decoder.decode(bytes.subarray(local + 30, local + 30 + localNameLength)) !== name)
      invalid()
    // Data-descriptor entries carry sizes in the central directory. Otherwise insist on matching local declarations.
    if (!(flags & 8) && (view.getUint32(local + 18, true) !== compressed || view.getUint32(local + 22, true) !== size))
      invalid()
    checkInflated(bytes.subarray(bodyStart, bodyStart + compressed), method, size)
    names.add(name)
    offset = next
  }
  if (offset !== end || requiredParts.some(part => !names.has(part)))
    invalid()
  return bytes
}
