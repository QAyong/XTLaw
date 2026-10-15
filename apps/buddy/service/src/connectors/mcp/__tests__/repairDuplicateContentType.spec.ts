import { describe, expect, it } from 'vitest'
import { repairDuplicateContentType } from '../createMcpTransport'

describe('repairDuplicateContentType', () => {
  it('keeps one value when the same media type is repeated', async () => {
    const headers = new Headers()
    headers.append('content-type', 'application/json')
    headers.append('content-type', 'application/json; charset=UTF-8')
    const original = new Response('{"ok":true}', { headers, status: 200, statusText: 'OK' })
    expect(original.headers.get('content-type')).toBe('application/json, application/json; charset=UTF-8')
    const repaired = repairDuplicateContentType(original)
    expect(repaired.headers.get('content-type')).toBe('application/json; charset=UTF-8')
    expect(repaired.status).toBe(200)
    expect(await repaired.json()).toEqual({ ok: true })
  })

  it('also repairs a value that arrived already joined without a space', () => {
    const response = new Response('{}', { headers: { 'content-type': 'application/json,application/json; charset=UTF-8' } })
    expect(repairDuplicateContentType(response).headers.get('content-type')).toBe('application/json; charset=UTF-8')
  })

  it('returns well-formed responses unchanged', () => {
    const single = new Response('{}', { headers: { 'content-type': 'application/json; charset=UTF-8' } })
    expect(repairDuplicateContentType(single)).toBe(single)
    const stream = new Response('data: {}\n\n', { headers: { 'content-type': 'text/event-stream; charset=UTF-8' } })
    expect(repairDuplicateContentType(stream)).toBe(stream)
    const empty = new Response(null, { status: 202 })
    expect(repairDuplicateContentType(empty)).toBe(empty)
  })

  it('does not guess when the parts name different media types', () => {
    const response = new Response('{}', { headers: { 'content-type': 'text/event-stream, application/json' } })
    expect(repairDuplicateContentType(response)).toBe(response)
    expect(response.headers.get('content-type')).toBe('text/event-stream, application/json')
  })
})
