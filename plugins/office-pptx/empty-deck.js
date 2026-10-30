import { strFromU8, strToU8, unzipSync, zipSync } from './vendor/fflate.js'

// A new presentation made outside the editor (the "New" menu of a desktop office suite) can hold a master and layouts but no slide.
// The editor shows "Opening…" for such a deck and never gets any further. Give it one blank slide before it is opened; the file on
// disk only changes if the user saves.
const NS = 'xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"'
const SLIDE = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<p:sld ${NS}><p:cSld><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr></p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sld>`
const REL_NS = 'http://schemas.openxmlformats.org/package/2006/relationships'
const REL_TYPE = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships'

/** Returns the package with a blank first slide when it has none, otherwise the same bytes. Anything unexpected leaves the bytes alone. */
export function withFirstSlide(bytes) {
  try {
    const files = unzipSync(bytes, { filter: file => /^(?:\[Content_Types\]\.xml|ppt\/presentation\.xml|ppt\/_rels\/presentation\.xml\.rels|ppt\/slideLayouts\/slideLayout\d+\.xml|ppt\/slides\/slide\d+\.xml)$/.test(file.name) })
    const presentation = files['ppt/presentation.xml'] && strFromU8(files['ppt/presentation.xml'])
    const relationships = files['ppt/_rels/presentation.xml.rels'] && strFromU8(files['ppt/_rels/presentation.xml.rels'])
    const types = files['[Content_Types].xml'] && strFromU8(files['[Content_Types].xml'])
    const layouts = Object.keys(files).filter(name => name.startsWith('ppt/slideLayouts/')).sort((a, b) => Number(a.match(/\d+/)) - Number(b.match(/\d+/)))
    if (!presentation || !relationships || !types || !layouts.length || /<p:sldId[\s/>]/.test(presentation) || Object.keys(files).some(name => name.startsWith('ppt/slides/')))
      return bytes
    const layout = layouts.find(name => /<p:sldLayout[^>]*\stype="blank"/.test(strFromU8(files[name]))) ?? layouts[0]
    const used = new Set([...relationships.matchAll(/\bId="(rId\d+)"/g)].map(match => match[1]))
    let id = 1
    while (used.has(`rId${id}`)) id++
    const rId = `rId${id}`
    const sizeAt = presentation.search(/<p:sldSz[\s/>]/)
    if (sizeAt < 0 || !relationships.includes('</Relationships>') || !types.includes('</Types>'))
      return bytes
    const everything = unzipSync(bytes)
    everything['ppt/presentation.xml'] = strToU8(`${presentation.slice(0, sizeAt)}<p:sldIdLst><p:sldId id="256" r:id="${rId}"/></p:sldIdLst>${presentation.slice(sizeAt)}`)
    everything['ppt/_rels/presentation.xml.rels'] = strToU8(relationships.replace('</Relationships>', `<Relationship Id="${rId}" Type="${REL_TYPE}/slide" Target="slides/slide1.xml"/></Relationships>`))
    everything['[Content_Types].xml'] = strToU8(types.replace('</Types>', '<Override PartName="/ppt/slides/slide1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/></Types>'))
    everything['ppt/slides/slide1.xml'] = strToU8(SLIDE)
    everything['ppt/slides/_rels/slide1.xml.rels'] = strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="${REL_NS}"><Relationship Id="rId1" Type="${REL_TYPE}/slideLayout" Target="../slideLayouts/${layout.split('/').at(-1)}"/></Relationships>`)
    return zipSync(everything)
  }
  catch {
    return bytes
  }
}
