import { Buffer } from 'node:buffer'
import pako from 'pako'

const bytes = (data: Uint8Array | ArrayBuffer) => (data instanceof Uint8Array ? data : new Uint8Array(data))
export const gunzipSync = (data: Uint8Array) => Buffer.from(pako.ungzip(bytes(data)))
export const inflateSync = (data: Uint8Array) => Buffer.from(pako.inflate(bytes(data)))
export const inflateRawSync = (data: Uint8Array) => Buffer.from(pako.inflateRaw(bytes(data)))
export const deflateSync = (data: Uint8Array) => Buffer.from(pako.deflate(bytes(data)))
export const gzipSync = (data: Uint8Array) => Buffer.from(pako.gzip(bytes(data)))
export default { gunzipSync, inflateSync, inflateRawSync, deflateSync, gzipSync }
