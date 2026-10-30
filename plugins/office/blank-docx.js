import { strToU8, zipSync } from './vendor/fflate.js'

// A new Word file made outside the editor (the "New" menu of a desktop office suite) can be completely empty: zero bytes, not even a
// package. Open such a file as one blank page; the first save writes a real document into it.
const RELS = 'http://schemas.openxmlformats.org/package/2006/relationships'
const DOC = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships'
const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main'
const HEAD = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n'

const PARTS = {
  '[Content_Types].xml': `${HEAD}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/></Types>`,
  '_rels/.rels': `${HEAD}<Relationships xmlns="${RELS}"><Relationship Id="rId1" Type="${DOC}/officeDocument" Target="word/document.xml"/></Relationships>`,
  'word/_rels/document.xml.rels': `${HEAD}<Relationships xmlns="${RELS}"><Relationship Id="rId1" Type="${DOC}/styles" Target="styles.xml"/></Relationships>`,
  'word/styles.xml': `${HEAD}<w:styles xmlns:w="${W}"><w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri" w:eastAsia="SimSun" w:cs="Calibri"/><w:sz w:val="22"/><w:szCs w:val="22"/><w:lang w:val="en-US" w:eastAsia="zh-CN" w:bidi="ar-SA"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:spacing w:after="160" w:line="259" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults><w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:qFormat/></w:style></w:styles>`,
  'word/document.xml': `${HEAD}<w:document xmlns:w="${W}" xmlns:r="${DOC}"><w:body><w:p><w:pPr><w:pStyle w:val="Normal"/></w:pPr></w:p><w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440" w:header="708" w:footer="708" w:gutter="0"/></w:sectPr></w:body></w:document>`,
}

export function blankDocx() {
  return zipSync(Object.fromEntries(Object.entries(PARTS).map(([name, text]) => [name, strToU8(text)])))
}
