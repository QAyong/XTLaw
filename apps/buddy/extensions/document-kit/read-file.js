// Document kit: read the whole file behind a selected-file handle (context.resource).
// Copied into plugins by sync.mjs; edit the original in apps/buddy/extensions/document-kit.
//
// The host hands out the file in chunks of at most 128 KiB, up to 64 MiB, and fails a read when the file changes underneath.
// Reading it all in order is also what lets the host later accept a save or a chat quote for this view: it remembers the
// version and hash of the file this view has fully read.

export const READ_CHUNK_BYTES = 128 * 1024
export const MAX_FILE_BYTES = 64 * 1024 * 1024

/*
 * @param resources context.resources of the view
 * @param resource context.resource (needs name and size)
 * @param signal context.signal
 * @param options.extensions accepted extensions, lowercase without the dot; empty accepts any name
 * @param options.minBytes smallest valid file (22 is an empty ZIP)
 * @param options.maxBytes upper bound, at most MAX_FILE_BYTES
 * @param options.errors codes thrown for an unsupported file and for a file that changed while being read
 */
export async function readWholeFile(resources, resource, signal, options = {}) {
  const { extensions = [], minBytes = 0, maxBytes = MAX_FILE_BYTES, errors = {} } = options
  const unsupported = errors.unsupported ?? 'DOCUMENT_UNSUPPORTED'
  const changed = errors.changed ?? 'DOCUMENT_RESOURCE_CHANGED'
  const extension = /\.([^./\\]+)$/.exec(resource.name)?.[1]?.toLowerCase()
  if ((extensions.length && !extensions.includes(extension)) || !Number.isSafeInteger(resource.size) || resource.size < minBytes || resource.size > Math.min(maxBytes, MAX_FILE_BYTES))
    throw new Error(unsupported)
  const data = new Uint8Array(resource.size)
  let offset = 0
  while (offset < data.length) {
    signal.throwIfAborted()
    const length = Math.min(READ_CHUNK_BYTES, data.length - offset)
    const result = await resources.readBytes(resource, { offset, length })
    signal.throwIfAborted()
    if (result.size !== data.length || result.data.length !== length || result.eof !== (offset + length === data.length))
      throw new Error(changed)
    data.set(result.data, offset)
    offset += length
  }
  return data
}
