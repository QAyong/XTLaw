// Stand-in for the Node modules that only the signing, printing and desktop-integration code reaches. Those entry points are
// not offered by the plugin, so calling any of this means a code path was missed and should fail loudly.
function unavailable(): never {
  throw new Error('OFFICE_FEATURE_UNAVAILABLE')
}

export const basename = unavailable
export const dirname = unavailable
export const isAbsolute = unavailable
export const join = unavailable
export const relative = unavailable
export const resolve = unavailable
export const sep = '/'
export const fileURLToPath = unavailable
export const createRequire = unavailable
export const homedir = unavailable
export const tmpdir = unavailable
export const deflateSync = unavailable
export const execFile = unavailable
export const connect = unavailable
export default { connect }
