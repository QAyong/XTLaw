import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate'
import { describe, expect, it } from 'vitest'
import { withFirstSlide } from '../../../plugins/office-pptx/empty-deck.js'
import { validatePptx } from '../../../plugins/office-pptx/pptx.js'

const layout = type => `<?xml version="1.0"?><p:sldLayout xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"${type ? ` type="${type}"` : ''}><p:cSld/></p:sldLayout>`
const presentation = (slides = '') => `<?xml version="1.0"?><p:presentation xmlns:p="p" xmlns:r="r"><p:sldMasterIdLst><p:sldMasterId id="2147483648" r:id="rId1"/></p:sldMasterIdLst>${slides}<p:sldSz cx="12192000" cy="6858000"/></p:presentation>`
const relationships = (extra = '') => `<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="x/slideMaster" Target="slideMasters/slideMaster1.xml"/><Relationship Id="rId2" Type="x/theme" Target="theme/theme1.xml"/>${extra}</Relationships>`

function deck({ slides = false, layouts = ['title', 'blank', 'obj'] } = {}) {
  const files = {
    '[Content_Types].xml': strToU8('<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="xml" ContentType="application/xml"/></Types>'),
    'ppt/presentation.xml': strToU8(presentation(slides ? '<p:sldIdLst><p:sldId id="256" r:id="rId3"/></p:sldIdLst>' : '')),
    'ppt/_rels/presentation.xml.rels': strToU8(relationships(slides ? '<Relationship Id="rId3" Type="x/slide" Target="slides/slide1.xml"/>' : '')),
    'ppt/slideMasters/slideMaster1.xml': strToU8('<p:sldMaster/>'),
  }
  layouts.forEach((type, index) => {
    files[`ppt/slideLayouts/slideLayout${index + 1}.xml`] = strToU8(layout(type))
  })
  if (slides)
    files['ppt/slides/slide1.xml'] = strToU8('<p:sld/>')
  return zipSync(files)
}

describe('a new presentation without slides', () => {
  it('gets one blank slide on the blank layout and stays a valid package', () => {
    const input = deck()
    const output = withFirstSlide(input)
    expect(output).not.toBe(input)
    validatePptx(output)
    const files = unzipSync(output)
    expect(strFromU8(files['ppt/presentation.xml'])).toMatch(/<\/p:sldMasterIdLst><p:sldIdLst><p:sldId id="256" r:id="rId3"\/><\/p:sldIdLst><p:sldSz/)
    expect(strFromU8(files['ppt/_rels/presentation.xml.rels'])).toContain('<Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide1.xml"/>')
    expect(strFromU8(files['[Content_Types].xml'])).toContain('PartName="/ppt/slides/slide1.xml"')
    expect(strFromU8(files['ppt/slides/_rels/slide1.xml.rels'])).toContain('Target="../slideLayouts/slideLayout2.xml"')
    expect(strFromU8(files['ppt/slides/slide1.xml'])).toContain('<p:spTree>')
  })

  it('uses the first layout when none is blank, and leaves other parts as they were', () => {
    const files = unzipSync(withFirstSlide(deck({ layouts: ['title', 'obj'] })))
    expect(strFromU8(files['ppt/slides/_rels/slide1.xml.rels'])).toContain('slideLayout1.xml')
    expect(strFromU8(files['ppt/slideMasters/slideMaster1.xml'])).toBe('<p:sldMaster/>')
  })

  it('is left alone when it already has a slide, has no layout, or is not a package', () => {
    const withSlide = deck({ slides: true })
    expect(withFirstSlide(withSlide)).toBe(withSlide)
    const noLayouts = deck({ layouts: [] })
    expect(withFirstSlide(noLayouts)).toBe(noLayouts)
    const garbage = new Uint8Array([1, 2, 3])
    expect(withFirstSlide(garbage)).toBe(garbage)
  })

  it('does nothing the second time', () => {
    const once = withFirstSlide(deck())
    expect(withFirstSlide(once)).toBe(once)
  })
})
