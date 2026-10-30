// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createQuoteReveal as pdfReveal } from '../../../plugins/office-pdf/reveal-quote.js'
import { createQuoteReveal as pptxReveal } from '../../../plugins/office-pptx/reveal-quote.js'
import { createQuoteReveal as xlsxReveal } from '../../../plugins/office-xlsx/reveal-quote.js'
import { createQuoteReveal as docxReveal } from '../../../plugins/office/reveal-quote.js'
import { findTextRange, registerReveal } from '../extensions/document-kit/reveal.js'

const request = (text, data, signal = new AbortController().signal) => ({ text, data, signal })
afterEach(() => {
  delete window.__aidocs
  delete window.__genofficeControl
  delete window.slidesApi
  document.body.replaceChildren()
})

describe('document kit: registerReveal', () => {
  function host() {
    const lifetime = new AbortController()
    let handler
    const dispose = vi.fn()
    const context = { signal: lifetime.signal, references: { onReveal: (next) => {
      handler = next
      return { dispose }
    } } }
    return { context, lifetime, dispose, ask: (input, signal = new AbortController().signal) => handler(input, signal) }
  }

  it('waits for the document, then hands over the text and the stored position', async () => {
    const h = host()
    const seen = vi.fn(async () => true)
    const reveal = registerReveal(h.context, seen)
    const pending = h.ask({ text: 'Words', locator: { version: 1, data: { page: 2 } } })
    await Promise.resolve()
    expect(seen).not.toHaveBeenCalled()
    reveal.ready(true)
    expect(await pending).toBe(true)
    expect(seen).toHaveBeenCalledWith({ text: 'Words', data: { page: 2 }, signal: expect.any(AbortSignal) })
  })

  it('answers false when the document failed to load, the position is unusable, the handler fails or answers loosely', async () => {
    const failed = host()
    registerReveal(failed.context, async () => true).ready(false)
    expect(await failed.ask({ text: 'a', locator: null })).toBe(false)
    const h = host()
    const handler = vi.fn(async () => 'yes')
    registerReveal(h.context, handler).ready()
    expect(await h.ask({ text: 'a', locator: { version: 2, data: { a: 1 } } })).toBe(false)
    expect(handler).toHaveBeenLastCalledWith({ text: 'a', data: null, signal: expect.any(AbortSignal) })
    handler.mockRejectedValueOnce(new Error('boom'))
    expect(await h.ask({ text: 'a', locator: null })).toBe(false)
  })

  it('stops waiting when the request is cancelled and unregisters with the view', async () => {
    const h = host()
    registerReveal(h.context, async () => true)
    const cancel = new AbortController()
    const pending = h.ask({ text: 'a', locator: null }, cancel.signal)
    cancel.abort()
    expect(await pending).toBe(false)
    h.lifetime.abort()
    expect(h.dispose).toHaveBeenCalledOnce()
  })

  it('does nothing on a host that cannot ask', () => {
    const lifetime = new AbortController()
    expect(() => registerReveal({ signal: lifetime.signal }, async () => true).ready()).not.toThrow()
    lifetime.abort()
  })
})

describe('document kit: findTextRange', () => {
  it('finds text across elements ignoring whitespace and returns null when it is not there', () => {
    document.body.innerHTML = '<div id="root"><span>Hello </span><span>wor</span><span>ld</span><p>Second  line</p></div>'
    const root = document.getElementById('root')
    expect(findTextRange(root, 'Hello world').toString()).toBe('Hello world')
    expect(findTextRange(root, 'world\nSecond line').toString()).toBe('world' + 'Second  line')
    expect(findTextRange(root, 'missing')).toBeNull()
    expect(findTextRange(root, '   ')).toBeNull()
  })
})

describe('locating a quote in a DOCX', () => {
  const paragraphs = ['Intro paragraph here.', 'The agreed delivery date is the fifteenth of March.', 'Payment is due within thirty days.']
  function editor() {
    const nodes = []
    let pos = 1
    for (const text of paragraphs) {
      nodes.push({ text, pos: pos + 1 })
      pos += text.length + 2
    }
    const doc = {
      content: { size: pos },
      textBetween: (from, to) => nodes.map(node => node.text.slice(Math.max(0, from - node.pos), Math.max(0, to - node.pos))).join(''),
      descendants: (visit) => {
        for (const node of nodes) visit({ isText: true, text: node.text }, node.pos)
      },
    }
    const state = { doc, selection: { from: 1, to: 1 } }
    return { nodes, state, commands: { setTextSelection: vi.fn(({ from, to }) => {
      state.selection = { from, to }
    }), scrollIntoView: vi.fn() }, view: { focus: vi.fn() } }
  }
  const at = (e, index, text) => ({ format: 'docx', from: e.nodes[index].pos + e.nodes[index].text.indexOf(text), to: e.nodes[index].pos + e.nodes[index].text.indexOf(text) + text.length })

  it('selects the stored positions while the text there still matches, and scrolls to them', async () => {
    const e = editor()
    window.__aidocs = { editor: e }
    const range = at(e, 1, 'delivery date')
    expect(await docxReveal()(request('delivery  date', range))).toBe(true)
    expect(e.state.selection).toEqual({ from: range.from, to: range.to })
    expect(e.commands.scrollIntoView).toHaveBeenCalled()
  })

  it('looks for the text when the positions are stale, preferring the nearest match', async () => {
    const e = editor()
    window.__aidocs = { editor: e }
    expect(await docxReveal()(request('thirty days', { format: 'docx', from: 3, to: 14 }))).toBe(true)
    const expected = at(e, 2, 'thirty days')
    expect(e.state.selection).toEqual({ from: expected.from, to: expected.to })
  })

  it('answers false for text that is gone, another format or no text', async () => {
    window.__aidocs = { editor: editor() }
    expect(await docxReveal()(request('deleted sentence', { format: 'docx', from: 3, to: 9 }))).toBe(false)
    expect(await docxReveal()(request('thirty days', { format: 'xlsx' }))).toBe(false)
    expect(await docxReveal()(request('   ', { format: 'docx', from: 3, to: 9 }))).toBe(false)
  })

  it('gives up when the request is cancelled before the editor exists', async () => {
    const cancel = new AbortController()
    const pending = docxReveal()(request('thirty days', { format: 'docx', from: 3, to: 9 }, cancel.signal))
    cancel.abort()
    expect(await pending).toBe(false)
  })
})

describe('locating a quote in a PPTX', () => {
  const textNode = (sourceId, text, extra = {}) => ({ type: 'text', sourceId, text: { lines: [{ runs: [{ text }] }] }, ...extra })
  function deck() {
    const slides = [
      { nodes: [textNode('e_2', 'Quarterly review'), textNode('e_3', 'Revenue grew twelve percent.')] },
      { nodes: [{ type: 'group', sourceId: 'g_1', children: [textNode('e_5', 'The audit finishes in November.')] }, textNode('e_6', 'Footer', { decoration: true })] },
    ]
    const control = vi.fn((message) => {
      if (message.cmd === 'selection')
        return { status: 'ok', result: {} }
      const { slide, el } = message.target
      if (!Number.isInteger(slide) || slide < 0 || slide >= slides.length)
        return { status: 'error', error: { reason: 'out_of_range' } }
      return { status: 'ok', result: { slide, el } }
    })
    window.__genofficeControl = control
    window.slidesApi = { getRenderSlides: async () => slides }
    return control
  }
  const data = slide => ({ format: 'pptx', indexes: [slide], from: 0, to: 5 })

  it('goes to the slide and selects the smallest element holding the text, even inside a group', async () => {
    const control = deck()
    expect(await pptxReveal()(request('Revenue grew\ntwelve percent.', data(0)))).toBe(true)
    expect(control).toHaveBeenLastCalledWith({ cmd: 'select', target: { slide: 0, el: 'e_3' } })
    expect(await pptxReveal()(request('The audit finishes in November.', data(1)))).toBe(true)
    expect(control).toHaveBeenLastCalledWith({ cmd: 'select', target: { slide: 1, el: 'e_5' } })
  })

  it('shows the slide but answers false when no single element holds the text', async () => {
    const control = deck()
    expect(await pptxReveal()(request('Quarterly review\nRevenue grew twelve percent.', data(0)))).toBe(false)
    expect(control).toHaveBeenCalledWith({ cmd: 'goto', target: { slide: 0 } })
    expect(control).not.toHaveBeenCalledWith(expect.objectContaining({ cmd: 'select' }))
    expect(await pptxReveal()(request('Footer', data(1)))).toBe(false)
  })

  it('answers false for a slide that does not exist, another format or no position', async () => {
    deck()
    expect(await pptxReveal()(request('Revenue', data(9)))).toBe(false)
    expect(await pptxReveal()(request('Revenue', { format: 'docx', indexes: [0] }))).toBe(false)
    expect(await pptxReveal()(request('Revenue', null))).toBe(false)
  })

  it('waits for the deck to load', async () => {
    const control = deck()
    let ready = false
    const loaded = window.__genofficeControl
    window.__genofficeControl = message => (ready ? loaded(message) : { status: 'not_ready' })
    const pending = pptxReveal()(request('Revenue grew twelve percent.', data(0)))
    await new Promise(resolve => setTimeout(resolve, 250))
    expect(control).not.toHaveBeenCalled()
    ready = true
    expect(await pending).toBe(true)
  })
})

describe('locating a quote in an XLSX', () => {
  function book(cells) {
    const sheets = ['Sales', 'Summary']
    const control = vi.fn((message) => {
      if (message.cmd === 'lexora-selection-text')
        return control.last ? { status: 'ok', result: { text: cells[`${control.last.sheet}!${control.last.range}`] ?? '' } } : { status: 'error', error: { reason: 'no_selection' } }
      const { sheet, range } = message.target
      if (!/^[A-Z]+\d+(?::[A-Z]+\d+)?$/.test(range))
        return { status: 'error', error: { reason: 'invalid_argument' } }
      if (!sheets.includes(sheet))
        return { status: 'error', error: { reason: 'sheet_not_found', detail: { sheets } } }
      control.last = { sheet, range }
      return { status: 'ok', result: { sheet, range } }
    })
    window.__genofficeControl = control
    return control
  }
  const data = (sheetIndex, sheet, range) => ({ format: 'xlsx', sheetIndex, sheet, range })
  const cells = { 'Sales!A1:B2': 'Item\tBudget\nItem 1\t100', 'Summary!A1:B1': 'Total\t43500' }

  it('selects the range and reports a match only when the cells still read the same', async () => {
    const control = book(cells)
    expect(await xlsxReveal()(request('Item\tBudget\nItem 1\t100', data(0, 'Sales', 'A1:B2')))).toBe(true)
    expect(control).toHaveBeenCalledWith({ cmd: 'open', target: { sheet: 'Sales', range: 'A1:B2' } })
    expect(await xlsxReveal()(request('Item\tBudget\nItem 1\t999', data(0, 'Sales', 'A1:B2')))).toBe(false)
  })

  it('falls back to the sheet at the same position when the name changed', async () => {
    book(cells)
    expect(await xlsxReveal()(request('Total 43500', data(1, 'Old name', 'A1:B1')))).toBe(true)
  })

  it('answers false for a missing sheet, a bad range, another format or no position', async () => {
    book(cells)
    expect(await xlsxReveal()(request('x', data(7, 'Gone', 'A1:B1')))).toBe(false)
    expect(await xlsxReveal()(request('x', data(0, 'Sales', 'nope')))).toBe(false)
    expect(await xlsxReveal()(request('x', { format: 'docx' }))).toBe(false)
    expect(await xlsxReveal()(request('x', null))).toBe(false)
  })
})

describe('locating a quote in a PDF', () => {
  function pages() {
    document.body.innerHTML = '<div id="root"><div class="pdf-page" data-page="0"><div class="textLayer"><span>Hello PDF</span><span> page one</span></div></div>'
      + '<div class="pdf-page" data-page="1"><div class="textLayer"><span>Second</span> <span>page</span></div></div></div>'
    Element.prototype.scrollIntoView = vi.fn()
    return document.getElementById('root')
  }
  const data = page => ({ format: 'extension', kind: 'pdf-page', location: { page } })

  it('finds the text on the quoted page, ignoring whitespace, and falls back to the first line of a longer quote', async () => {
    const root = pages()
    const lifetime = new AbortController()
    const reveal = pdfReveal(root, lifetime.signal)
    expect(await reveal(request('Second\n page', data(2)))).toBe(true)
    expect(window.getSelection().toString()).toBe('Second page')
    expect(await reveal(request('Hello PDF page one\nSecond page', data(1)))).toBe(true)
    expect(window.getSelection().toString()).toBe('Hello PDF page one')
    lifetime.abort()
  })

  it('answers false for text that is not on that page, a missing page or another kind of position', async () => {
    const root = pages()
    const lifetime = new AbortController()
    const reveal = pdfReveal(root, lifetime.signal)
    expect(await reveal(request('Second page', data(1)))).toBe(false)
    expect(await reveal(request('Hello', data(9)))).toBe(false)
    expect(await reveal(request('Hello', { format: 'extension', kind: 'other', location: { page: 1 } }))).toBe(false)
    expect(await reveal(request('Hello', null))).toBe(false)
    lifetime.abort()
  })
})
