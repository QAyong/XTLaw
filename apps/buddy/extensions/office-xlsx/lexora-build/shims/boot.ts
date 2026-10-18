/* eslint-disable node/prefer-global/buffer, node/prefer-global/process -- this file defines the globals the bundled code expects */
// Browser globals the Node-oriented engine and main-process code expect.
import { Buffer } from 'node:buffer'

const globals = globalThis as Record<string, unknown>
globals.Buffer ??= Buffer
globals.global ??= globalThis
const processStub = { env: {}, platform: 'win32', versions: {}, cwd: () => '/', nextTick: (fn: () => void) => queueMicrotask(fn), on() {}, emitWarning() {}, argv: [] as string[] }
globals.process ??= processStub
