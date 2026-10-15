import type { BuddyBrowserQuote } from '../../conversation/buddyUserContent'

export const browserQuote: BuddyBrowserQuote = {
  id: 'web-quote',
  contentKind: 'element',
  text: 'Frozen button',
  source: { kind: 'browser', title: 'Example', url: 'https://example.com/', sessionId: 'session', pageId: 'page', documentVersion: 1 },
  element: { locator: { backendNodeId: 1, frameId: 'main' }, attributes: { id: 'submit' }, tagName: 'button', selector: 'html > body:nth-child(2) > button:nth-child(1)', role: 'button', name: 'Submit', rect: { x: 20, y: 30, width: 80, height: 40 }, style: { color: 'rgb(0,0,0)', backgroundColor: 'transparent', fontSize: '16px', fontFamily: 'sans-serif', display: 'block', position: 'static', gap: 'normal', padding: '0px', margin: '0px', borderRadius: '0px' } },
}
