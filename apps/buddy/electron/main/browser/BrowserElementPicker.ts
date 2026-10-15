import type { Input, MouseInputEvent } from 'electron'
import type { BrowserLocateElementInput, BrowserPickResult } from '../../../shared/browser/browserSelection'
import type { BrowserDebugger } from './BrowserDebugger'
import { z } from 'zod'
import { browserPickResultSchema } from '../../../shared/browser/browserSelection'
import { cdpLayoutMetricsSchema, cdpResolveNodeSchema, cdpRuntimeResultSchema } from './browserCdpSchemas'
import { BROWSER_ELEMENT_HIGHLIGHT_CLEAR_SCRIPT, BROWSER_ELEMENT_HIGHLIGHT_SCRIPT } from './browserElementHighlight'
import { BROWSER_ELEMENT_SNAPSHOT_SCRIPT } from './browserElementPickerScript'

interface ActivePick {
  requestId: string
  resolve: (result: BrowserPickResult) => void
  selecting: boolean
  timeout: ReturnType<typeof setTimeout>
}
const nodeLocationSchema = z.object({ backendNodeId: z.number().int().positive(), frameId: z.string().min(1) })

export class BrowserElementPicker {
  #active: ActivePick | null = null
  #swallowRelease = false
  #moving = false
  #hover: { active: ActivePick, x: number, y: number } | null = null
  #disposed = false
  #operations: Promise<unknown> = Promise.resolve()
  #highlightTimer: ReturnType<typeof setTimeout> | undefined
  #highlightContext: number | undefined
  readonly connection: BrowserDebugger
  readonly zoom: () => number
  constructor(connection: BrowserDebugger, zoom: () => number) {
    this.connection = connection
    this.zoom = zoom
  }

  start(requestId: string): Promise<BrowserPickResult> {
    this.cancel()
    if (this.#disposed)
      return Promise.resolve({ status: 'unavailable' })
    return new Promise((resolve) => {
      const active: ActivePick = { requestId, resolve, selecting: false, timeout: setTimeout(() => this.cancel(requestId), 120_000) }
      this.#active = active
      void this.#queue(() => this.#enable()).catch(() => this.#finish(active, { status: 'unavailable' }))
    })
  }

  cancel(requestId?: string): void {
    const active = this.#active
    if (active && (!requestId || active.requestId === requestId))
      this.#finish(active, { status: 'cancelled' })
  }

  handleKey(input: Input): boolean {
    if (!this.#active)
      return false
    if (input.key === 'Escape')
      this.cancel()
    return true
  }

  handleMouse(input: MouseInputEvent, source: () => Extract<BrowserPickResult, { status: 'selected' }>['source']): boolean {
    if (input.type === 'mouseUp' && this.#swallowRelease) {
      this.#swallowRelease = false
      return true
    }
    const active = this.#active
    if (!active)
      return false
    const x = input.x / this.zoom()
    const y = input.y / this.zoom()
    if (input.type === 'mouseMove' && !active.selecting) {
      this.#hover = { active, x: Math.round(x), y: Math.round(y) }
      if (!this.#moving)
        this.#updateHover()
    }
    if (input.type === 'mouseDown') {
      this.#swallowRelease = true
      if (input.button === 'left' && !active.selecting) {
        active.selecting = true
        const capturedSource = source()
        void this.#queue(async () => {
          if (this.#active !== active)
            return
          const node = nodeLocationSchema.parse(await this.connection.sendCommand('DOM.getNodeForLocation', { x: Math.round(x), y: Math.round(y) }))
          const snapshot = await this.#collect(node)
          const { cssVisualViewport } = cdpLayoutMetricsSchema.parse(await this.connection.sendCommand('Page.getLayoutMetrics'))
          const result = browserPickResultSchema.safeParse({ ...snapshot, source: capturedSource, anchor: { x: x / cssVisualViewport.clientWidth, y: y / cssVisualViewport.clientHeight } })
          this.#finish(active, result.success ? result.data : { status: 'limit' })
        }).catch(() => this.#finish(active, { status: 'unavailable' }))
      }
    }
    return ['mouseDown', 'mouseUp', 'contextMenu'].includes(input.type)
  }

  async locate(input: BrowserLocateElementInput, current: () => boolean = () => true): Promise<boolean> {
    this.cancel()
    return this.#queue(async () => {
      try {
        await this.#enable()
        if (!current())
          return false
        const snapshot = await this.#collect(input.element.locator)
        if (snapshot.status !== 'selected' || snapshot.text !== input.text || snapshot.element.tagName !== input.element.tagName || !current())
          return false
        await this.connection.sendCommand('DOM.scrollIntoViewIfNeeded', { backendNodeId: input.element.locator.backendNodeId })
        if (!current())
          return false
        await this.#show(input.element.locator)
        this.#highlightTimer = setTimeout(() => void this.#queue(() => this.#hide()).catch(() => {}), 2400)
        return current()
      }
      catch {
        return false
      }
    })
  }

  dispose(): void {
    this.#disposed = true
    this.cancel()
    clearTimeout(this.#highlightTimer)
    void this.#queue(() => this.#hide()).catch(() => {})
  }

  #updateHover(): void {
    this.#moving = true
    void this.#queue(async () => {
      const point = this.#hover
      this.#hover = null
      if (!point || this.#active !== point.active || point.active.selecting)
        return
      try {
        const node = nodeLocationSchema.parse(await this.connection.sendCommand('DOM.getNodeForLocation', { x: point.x, y: point.y }))
        if (!this.#hover && this.#active === point.active && !point.active.selecting)
          await this.#show(node)
      }
      catch {
        await this.#hide()
      }
    }).finally(() => {
      this.#moving = false
      if (this.#hover)
        this.#updateHover()
    })
  }

  async #enable(): Promise<void> {
    clearTimeout(this.#highlightTimer)
    this.connection.ensureAttached()
    await this.connection.sendCommand('DOM.enable')
    await this.#hide()
  }

  async #collect(locator: z.infer<typeof nodeLocationSchema>) {
    const value = await this.#callOnElement(locator, BROWSER_ELEMENT_SNAPSHOT_SCRIPT)
    const snapshot = z.object({ status: z.literal('selected'), text: z.string(), element: z.object({ tagName: z.string() }).catchall(z.unknown()) }).parse(value)
    return { ...snapshot, element: { ...snapshot.element, locator } }
  }

  async #show(locator: z.infer<typeof nodeLocationSchema>): Promise<void> {
    await this.#callOnElement(locator, BROWSER_ELEMENT_HIGHLIGHT_SCRIPT, true)
  }

  async #callOnElement(locator: z.infer<typeof nodeLocationSchema>, functionDeclaration: string, highlight = false): Promise<unknown> {
    const { executionContextId } = z.object({ executionContextId: z.number().int() }).parse(await this.connection.sendCommand('Page.createIsolatedWorld', { frameId: locator.frameId, worldName: 'lexora-element-reference' }))
    if (highlight && this.#highlightContext !== executionContextId) {
      await this.#hide()
      this.#highlightContext = executionContextId
    }
    const { object } = cdpResolveNodeSchema.parse(await this.connection.sendCommand('DOM.resolveNode', { backendNodeId: locator.backendNodeId, executionContextId }))
    try {
      const result = cdpRuntimeResultSchema.parse(await this.connection.sendCommand('Runtime.callFunctionOn', { objectId: object.objectId, functionDeclaration, returnByValue: true }))
      if (result.exceptionDetails)
        throw new Error('Element reference evaluation failed')
      return result.result.value
    }
    finally {
      await this.connection.sendCommand('Runtime.releaseObject', { objectId: object.objectId }).catch(() => {})
    }
  }

  async #hide(): Promise<void> {
    const contextId = this.#highlightContext
    this.#highlightContext = undefined
    if (contextId !== undefined)
      await this.connection.sendCommand('Runtime.evaluate', { expression: BROWSER_ELEMENT_HIGHLIGHT_CLEAR_SCRIPT, contextId }).catch(() => {})
  }

  #queue<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.#operations.then(operation)
    this.#operations = result.catch(() => {})
    return result
  }

  #finish(active: ActivePick, result: BrowserPickResult): void {
    if (this.#active !== active)
      return
    this.#active = null
    clearTimeout(active.timeout)
    void this.#queue(() => this.#hide()).catch(() => {}).finally(() => active.resolve(result))
  }
}
