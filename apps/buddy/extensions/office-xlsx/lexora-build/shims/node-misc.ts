// Modules the bundled code imports but never reaches in the plugin: fail loudly if called.
function unavailable(name: string) {
  return () => {
    throw new Error(`SHEETS_FEATURE_UNAVAILABLE: ${name}`)
  }
}
export const execFile = unavailable('child_process.execFile')
export const spawn = unavailable('child_process.spawn')
export const Worker = class {
  constructor() {
    unavailable('worker_threads')()
  }
}
export const isMainThread = true
export const parentPort = null
export const workerData = null
export const createServer = unavailable('http.createServer')
export const createInterface = unavailable('readline.createInterface')
export const homedir = () => '/virtual/home'
export const tmpdir = () => '/virtual/tmp'
export const platform = () => 'win32'
export const cpus = () => []
export const hostname = () => 'xtlaw'
export const lookup = unavailable('dns.lookup')
export const isIP = (value: string) => (/^\d+\.\d+\.\d+\.\d+$/.test(value) ? 4 : value.includes(':') ? 6 : 0)
export const fileURLToPath = (url: string | URL) => decodeURIComponent(new URL(url).pathname)
export const pathToFileURL = (path: string) => new URL(`file://${path}`)
export default { createServer, createInterface, execFile, spawn, Worker, isMainThread, homedir, tmpdir, platform, cpus, hostname, lookup, isIP, fileURLToPath, pathToFileURL }
export const Agent = class {}
export const fetch = unavailable('undici.fetch')
export const getGlobalDispatcher = unavailable('undici.getGlobalDispatcher')
export const pipeline = unavailable('stream.pipeline')
