import type { ReadonlyJsonValue } from '../workbench/workbenchState'
import { z } from 'zod'

// A plugin-defined place inside a file, kept only so the same plugin can show it again.
// The host never interprets it, so everything about its shape is bounded here.
export const EXTENSION_QUOTE_LOCATION_BYTES = 4096
export const EXTENSION_QUOTE_LOCATION_DEPTH = 4
export const EXTENSION_QUOTE_LOCATION_KEYS = 32
export const EXTENSION_QUOTE_LOCATION_ITEMS = 64
export const EXTENSION_QUOTE_LOCATION_NODES = 256
export const EXTENSION_QUOTE_LOCATION_STRING = 512

// The interface-based JSON type: a plain recursive alias makes the readonly snapshot types of user content infinitely deep.
export type ExtensionQuoteLocation = ReadonlyJsonValue

const keyPattern = /^[A-Z_][\w-]{0,31}$/i
const reservedKeys = new Set(['__proto__', 'constructor', 'prototype'])

// Returns why the value is rejected, or null when it is plain bounded JSON.
export function extensionQuoteLocationIssue(value: unknown): string | null {
  let nodes = 0
  let keys = 0
  const visit = (item: unknown, depth: number): string | null => {
    if (++nodes > EXTENSION_QUOTE_LOCATION_NODES)
      return 'too many values'
    if (item === null || typeof item === 'boolean')
      return null
    if (typeof item === 'number')
      return Number.isFinite(item) ? null : 'numbers must be finite'
    if (typeof item === 'string')
      return item.length <= EXTENSION_QUOTE_LOCATION_STRING ? null : 'string too long'
    if (typeof item !== 'object')
      return 'only JSON values are allowed'
    if (depth >= EXTENSION_QUOTE_LOCATION_DEPTH)
      return 'nested too deeply'
    if (Object.getOwnPropertySymbols(item).length)
      return 'symbol keys are not allowed'
    const names = Object.keys(item)
    for (const name of names) {
      const descriptor = Object.getOwnPropertyDescriptor(item, name)!
      if (!('value' in descriptor))
        return 'accessors are not allowed'
    }
    if (Array.isArray(item)) {
      if (Object.getPrototypeOf(item) !== Array.prototype || item.length > EXTENSION_QUOTE_LOCATION_ITEMS || names.length !== item.length)
        return 'invalid array'
      for (const entry of item) {
        const issue = visit(entry, depth + 1)
        if (issue)
          return issue
      }
      return null
    }
    const prototype = Object.getPrototypeOf(item)
    if (prototype !== Object.prototype && prototype !== null)
      return 'only plain objects are allowed'
    keys += names.length
    if (keys > EXTENSION_QUOTE_LOCATION_KEYS)
      return 'too many keys'
    for (const name of names) {
      if (!keyPattern.test(name) || reservedKeys.has(name))
        return 'invalid key'
      const issue = visit((item as Record<string, unknown>)[name], depth + 1)
      if (issue)
        return issue
    }
    return null
  }
  const issue = visit(value, 0)
  if (issue)
    return issue
  return new TextEncoder().encode(JSON.stringify(value)).length <= EXTENSION_QUOTE_LOCATION_BYTES ? null : 'serialized location too large'
}

export const extensionQuoteKindSchema = z.string().regex(/^[a-z][a-z0-9-]{0,31}$/)
export const extensionQuoteLocationSchema = z.custom<ExtensionQuoteLocation>(value => value !== undefined && extensionQuoteLocationIssue(value) === null, 'Invalid extension quote location')
export function extensionQuoteLocationLength(location: ExtensionQuoteLocation): number {
  return JSON.stringify(location).length
}

// The extension ID is filled in by the host from the plugin that captured the quote, never taken from plugin input.
export const extensionQuoteSourceSchema = z.object({
  extensionId: z.string().max(120).regex(/^[a-z][a-z0-9-]*\.[a-z][a-z0-9-]*$/),
  kind: extensionQuoteKindSchema,
  hash: z.string().regex(/^[a-f0-9]{64}$/),
  location: extensionQuoteLocationSchema,
}).strict().readonly()
