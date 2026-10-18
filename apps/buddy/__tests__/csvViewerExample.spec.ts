// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { extensionQuoteInputSchema } from '../shared/extensions/extensionApi'

const { parseCsv, selectionText } = await import('../extensions/examples/csv-viewer/csv.js')
const { render } = await import('../extensions/examples/csv-viewer/view.js')

const cleanup: Array<() => void | Promise<void>> = []
afterEach(async () => {
  for (const action of cleanup.splice(0).reverse()) await action()
  document.body.innerHTML = ''
})

describe('csv viewer example: reader', () => {
  it('reads quoted cells, escaped quotes, embedded line breaks, CRLF and a byte order mark', () => {
    const text = '﻿name,note\r\n"Li, Wei","said ""hi"""\r\n"two\nlines",end\n'
    expect(parseCsv(text).rows).toEqual([['name', 'note'], ['Li, Wei', 'said "hi"'], ['two\nlines', 'end']])
    expect(parseCsv('a,b').rows).toEqual([['a', 'b']])
    expect(parseCsv('').rows).toEqual([])
    expect(selectionText([['a', 'b', 'c'], ['d', 'e', 'f']], [0, 1], [1, 2])).toBe('b\tc\ne\tf')
  })

  it('shows only the start of a huge file and says so', () => {
    const many = Array.from({ length: 3000 }, (_, index) => `${index},x`).join('\n')
    const result = parseCsv(many)
    expect(result.rows).toHaveLength(2000)
    expect(result.truncated).toBe(true)
    const wide = parseCsv(Array.from({ length: 300 }, (_, index) => index).join(','))
    expect(wide.rows[0]).toHaveLength(128)
    expect(wide.truncated).toBe(true)
  })
})

describe('csv viewer example: view', () => {
  function context(csv: string, name = 'data.csv') {
    const bytes = new TextEncoder().encode(csv)
    const abort = new AbortController()
    cleanup.push(() => abort.abort())
    const composer = {
      captureQuote: vi.fn(async () => ({ id: 'capture', defaultId: null, targets: [{ id: 'one', label: 'Task one' }, { id: 'two', label: 'Task two' }] })),
      addQuote: vi.fn(async () => 'added'),
    }
    return {
      composer,
      value: {
        resource: { id: '3b241101-e2bb-4255-8caf-4136c566a962', name, size: bytes.length },
        resources: { readBytes: async (_file: unknown, { offset, length }: { offset: number, length: number }) => ({ data: bytes.slice(offset, offset + length), size: bytes.length, eof: offset + length >= bytes.length }) },
        signal: abort.signal,
        environment: { language: 'en-US' },
        onEnvironmentChange: () => ({ dispose() {} }),
        composer,
      },
    }
  }
  async function open(csv: string, name?: string) {
    const fixture = context(csv, name)
    const container = document.createElement('div')
    document.body.append(container)
    await render(fixture.value, container)
    return { ...fixture, container }
  }
  const cell = (container: HTMLElement, r: number, c: number) => container.querySelector(`td[data-r="${r}"][data-c="${c}"]`) as HTMLElement
  const fire = (target: HTMLElement, type: string) => target.dispatchEvent(new MouseEvent(type, { bubbles: true }))

  it('shows the table and quotes the selected cells with a kind and a bounded location the host accepts', async () => {
    const view = await open('a,b,c\n1,2,3\n4,5,6\n')
    expect(view.container.querySelectorAll('td')).toHaveLength(9)
    const button = view.container.querySelector('button') as HTMLButtonElement
    expect(button.disabled).toBe(true)
    fire(cell(view.container, 1, 0), 'mousedown')
    fire(cell(view.container, 2, 1), 'mouseover')
    expect(button.disabled).toBe(false)
    expect(view.container.querySelectorAll('td.is-selected')).toHaveLength(4)
    button.click()
    await vi.waitFor(() => expect(view.container.textContent).toContain('Add to:'))
    const [resource, selection] = view.composer.captureQuote.mock.calls[0] as unknown as [{ id: string }, { text: string, kind: string, location: unknown }]
    expect(selection).toEqual({ text: '1\t2\n4\t5', kind: 'cells', location: { from: [1, 0], to: [2, 1] } })
    // The same call passes the host's input validation, so the host will take it.
    expect(extensionQuoteInputSchema.safeParse({ resourceId: resource.id, ...selection }).success).toBe(true)
    const targets = [...view.container.querySelectorAll('.csv__bar span button')] as HTMLButtonElement[]
    expect(targets.map(target => target.textContent)).toEqual(['Task one', 'Task two'])
    targets[1]!.click()
    await vi.waitFor(() => expect(view.composer.addQuote).toHaveBeenCalledWith('capture', 'two'))
  })

  it('refuses to quote a selection that is too long without calling the host', async () => {
    const view = await open(`${'x'.repeat(40000)}\n`)
    fire(cell(view.container, 0, 0), 'mousedown')
    ;(view.container.querySelector('button') as HTMLButtonElement).click()
    await vi.waitFor(() => expect(view.container.textContent).toContain('too long'))
    expect(view.composer.captureQuote).not.toHaveBeenCalled()
  })

  it('says so when the file is not a readable CSV or changes while it is read', async () => {
    expect((await open('a,b', 'notes.txt')).container.textContent).toContain('cannot be read')
    const fixture = context('a,b\n1,2\n')
    fixture.value.resources.readBytes = async () => ({ data: new Uint8Array(3), size: 99, eof: true })
    const container = document.createElement('div')
    document.body.append(container)
    await render(fixture.value, container)
    expect(container.textContent).toContain('changed by another program')
  })
})
