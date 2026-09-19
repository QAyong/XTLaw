import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";

const require = createRequire(import.meta.url);
const { bodyElements, ensureDocxParagraphIds, normalizeWordXml } = require(
  "../resources/plugins/pi.office/docx-paragraph-ids.cjs",
);

function crc32(data) {
  let value = 0xffffffff;
  for (const byte of data) {
    let current = (value ^ byte) & 0xff;
    for (let bit = 0; bit < 8; bit += 1) {
      current = current & 1 ? 0xedb88320 ^ (current >>> 1) : current >>> 1;
    }
    value = (value >>> 8) ^ current;
  }
  return (value ^ 0xffffffff) >>> 0;
}

function storedZip(parts) {
  const locals = [];
  const central = [];
  let offset = 0;
  for (const part of parts) {
    const name = Buffer.from(part.name, "utf8");
    const data = Buffer.from(part.data, "utf8");
    const checksum = crc32(data);
    const local = Buffer.alloc(30 + name.length);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(10, 4);
    local.writeUInt16LE(0x0800, 6);
    local.writeUInt16LE(0, 8);
    local.writeUInt32LE(checksum, 14);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(name.length, 26);
    name.copy(local, 30);
    locals.push(local, data);

    const record = Buffer.alloc(46 + name.length);
    record.writeUInt32LE(0x02014b50, 0);
    record.writeUInt16LE(20, 4);
    record.writeUInt16LE(10, 6);
    record.writeUInt16LE(0x0800, 8);
    record.writeUInt32LE(checksum, 16);
    record.writeUInt32LE(data.length, 20);
    record.writeUInt32LE(data.length, 24);
    record.writeUInt16LE(name.length, 28);
    record.writeUInt32LE(offset, 42);
    name.copy(record, 46);
    central.push(record);
    offset += local.length + data.length;
  }
  const localData = Buffer.concat(locals);
  const centralData = Buffer.concat(central);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(parts.length, 8);
  eocd.writeUInt16LE(parts.length, 10);
  eocd.writeUInt32LE(centralData.length, 12);
  eocd.writeUInt32LE(localData.length, 16);
  return Buffer.concat([localData, centralData, eocd]);
}

const documentXml = `<?xml version="1.0" encoding="UTF-8"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    <w:p><w:r><w:t>First</w:t></w:r></w:p>
    <w:tbl><w:tr><w:tc><w:p><w:r><w:t>Cell</w:t></w:r></w:p></w:tc></w:tr></w:tbl>
    <w:p w14:paraId="A1B2C3D4"><w:r><w:t>Second</w:t></w:r></w:p>
  </w:body>
</w:document>`;

test("normalizes missing native paragraph IDs and preserves body order", () => {
  const normalized = normalizeWordXml(documentXml, new Set());
  assert.equal(normalized.changed, true);
  assert.match(normalized.xml, /xmlns:w14="http:\/\/schemas\.microsoft\.com\/office\/word\/2010\/wordml"/);
  assert.equal(normalized.paragraphIds.length, 3);
  assert.equal(normalized.paragraphIds[2], "A1B2C3D4");
  assert.equal(new Set(normalized.paragraphIds).size, normalized.paragraphIds.length);
  assert.deepEqual(bodyElements(normalized.xml), [
    [normalized.paragraphIds[0]],
    [normalized.paragraphIds[1]],
    [normalized.paragraphIds[2]],
  ]);
});

test("replaces duplicate and invalid paragraph IDs", () => {
  const xml = `<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p w14:paraId="BAD"/><w:p w14:paraId="A1B2C3D4"/><w:p w14:paraId="A1B2C3D4"/></w:body></w:document>`;
  const normalized = normalizeWordXml(xml, new Set());
  assert.equal(normalized.changed, true);
  assert.equal(normalized.paragraphIds.length, 3);
  assert.equal(new Set(normalized.paragraphIds).size, 3);
  assert.equal(normalized.paragraphIds[1], "A1B2C3D4");
});

test("normalizes a DOCX ZIP once and remains idempotent", () => {
  const fixture = storedZip([
    { name: "[Content_Types].xml", data: "<Types/>" },
    { name: "word/document.xml", data: documentXml },
    {
      name: "word/header1.xml",
      data: `<w:hdr xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:p w14:paraId="A1B2C3D4"/></w:hdr>`,
    },
  ]);
  const first = ensureDocxParagraphIds(fixture);
  assert.equal(first.changed, true);
  assert.equal(first.paragraphIds.length, 3);
  assert.equal(first.paragraphIds[1].length, 1);
  const second = ensureDocxParagraphIds(first.data);
  assert.equal(second.changed, false);
  assert.deepEqual(second.paragraphIds, first.paragraphIds);
});
