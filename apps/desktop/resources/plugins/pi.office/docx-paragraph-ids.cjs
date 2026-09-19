"use strict";

const crypto = require("node:crypto");
const zlib = require("node:zlib");

const W14_NAMESPACE = "http://schemas.microsoft.com/office/word/2010/wordml";
const MAX_XML_BYTES = 16 * 1024 * 1024;
const EOCD_SIGNATURE = 0x06054b50;
const CENTRAL_SIGNATURE = 0x02014b50;
const LOCAL_SIGNATURE = 0x04034b50;

const CRC_TABLE = new Uint32Array(256);
for (let index = 0; index < CRC_TABLE.length; index += 1) {
  let value = index;
  for (let bit = 0; bit < 8; bit += 1) {
    value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
  }
  CRC_TABLE[index] = value >>> 0;
}

function crc32(data) {
  let value = 0xffffffff;
  for (const byte of data) value = CRC_TABLE[(value ^ byte) & 0xff] ^ (value >>> 8);
  return (value ^ 0xffffffff) >>> 0;
}

function zipError(message) {
  const error = new Error(message);
  error.code = "INVALID_DOCX";
  return error;
}

function findEndOfCentralDirectory(data) {
  const minimum = Math.max(0, data.length - 22 - 0xffff);
  for (let offset = data.length - 22; offset >= minimum; offset -= 1) {
    if (data.readUInt32LE(offset) === EOCD_SIGNATURE) return offset;
  }
  throw zipError("DOCX ZIP end record is missing");
}

function decodeZipName(buffer, flags) {
  return buffer.toString(flags & 0x0800 ? "utf8" : "utf8");
}

function parseZip(input) {
  const data = Buffer.isBuffer(input) ? input : Buffer.from(input);
  if (data.length < 22) throw zipError("DOCX ZIP is too short");
  const eocd = findEndOfCentralDirectory(data);
  const disk = data.readUInt16LE(eocd + 4);
  const centralDisk = data.readUInt16LE(eocd + 6);
  const entryCount = data.readUInt16LE(eocd + 10);
  const centralSize = data.readUInt32LE(eocd + 12);
  const centralOffset = data.readUInt32LE(eocd + 16);
  const commentLength = data.readUInt16LE(eocd + 20);
  if (disk !== 0 || centralDisk !== 0 || entryCount === 0xffff || centralSize === 0xffffffff || centralOffset === 0xffffffff) {
    throw zipError("ZIP64 and multi-disk DOCX files are not supported");
  }
  if (eocd + 22 + commentLength > data.length || centralOffset + centralSize > data.length) {
    throw zipError("DOCX ZIP central directory is truncated");
  }

  const entries = [];
  let cursor = centralOffset;
  for (let index = 0; index < entryCount; index += 1) {
    if (cursor + 46 > centralOffset + centralSize || data.readUInt32LE(cursor) !== CENTRAL_SIGNATURE) {
      throw zipError("DOCX ZIP central directory entry is invalid");
    }
    const versionMadeBy = data.readUInt16LE(cursor + 4);
    const versionNeeded = data.readUInt16LE(cursor + 6);
    const flags = data.readUInt16LE(cursor + 8);
    const method = data.readUInt16LE(cursor + 10);
    const modTime = data.readUInt16LE(cursor + 12);
    const modDate = data.readUInt16LE(cursor + 14);
    const checksum = data.readUInt32LE(cursor + 16);
    const compressedSize = data.readUInt32LE(cursor + 20);
    const uncompressedSize = data.readUInt32LE(cursor + 24);
    const nameLength = data.readUInt16LE(cursor + 28);
    const extraLength = data.readUInt16LE(cursor + 30);
    const entryCommentLength = data.readUInt16LE(cursor + 32);
    const diskStart = data.readUInt16LE(cursor + 34);
    const internalAttributes = data.readUInt16LE(cursor + 36);
    const externalAttributes = data.readUInt32LE(cursor + 38);
    const localOffset = data.readUInt32LE(cursor + 42);
    const end = cursor + 46 + nameLength + extraLength + entryCommentLength;
    if (end > centralOffset + centralSize || diskStart !== 0 || localOffset === 0xffffffff || compressedSize === 0xffffffff || uncompressedSize === 0xffffffff) {
      throw zipError("DOCX ZIP entry uses unsupported ZIP64 metadata");
    }
    if (flags & 0x0001) throw zipError("encrypted DOCX files are not supported");

    const nameBytes = Buffer.from(data.subarray(cursor + 46, cursor + 46 + nameLength));
    const extra = Buffer.from(data.subarray(cursor + 46 + nameLength, cursor + 46 + nameLength + extraLength));
    const comment = Buffer.from(data.subarray(cursor + 46 + nameLength + extraLength, end));
    if (localOffset + 30 > data.length || data.readUInt32LE(localOffset) !== LOCAL_SIGNATURE) {
      throw zipError("DOCX ZIP local entry is invalid");
    }
    const localNameLength = data.readUInt16LE(localOffset + 26);
    const localExtraLength = data.readUInt16LE(localOffset + 28);
    const contentStart = localOffset + 30 + localNameLength + localExtraLength;
    const contentEnd = contentStart + compressedSize;
    if (contentEnd > data.length) throw zipError("DOCX ZIP entry data is truncated");

    entries.push({
      name: decodeZipName(nameBytes, flags),
      nameBytes,
      localExtra: Buffer.from(data.subarray(localOffset + 30 + localNameLength, contentStart)),
      centralExtra: extra,
      comment,
      versionMadeBy,
      versionNeeded,
      flags,
      method,
      modTime,
      modDate,
      checksum,
      compressedSize,
      uncompressedSize,
      internalAttributes,
      externalAttributes,
      compressedData: Buffer.from(data.subarray(contentStart, contentEnd)),
    });
    cursor = end;
  }
  return entries;
}

function readEntry(entry) {
  if (entry.method === 0) return Buffer.from(entry.compressedData);
  if (entry.method === 8) return zlib.inflateRawSync(entry.compressedData);
  throw zipError(`DOCX ZIP compression method ${entry.method} is not supported`);
}

function replaceBufferEntry(entry, data) {
  const compressedData = zlib.deflateRawSync(data);
  return {
    ...entry,
    method: 8,
    versionNeeded: Math.max(20, entry.versionNeeded),
    flags: entry.flags & ~0x0008,
    checksum: crc32(data),
    compressedSize: compressedData.length,
    uncompressedSize: data.length,
    compressedData,
  };
}

function writeUInt16(buffer, offset, value) {
  buffer.writeUInt16LE(value & 0xffff, offset);
}

function writeUInt32(buffer, offset, value) {
  buffer.writeUInt32LE(value >>> 0, offset);
}

function buildZip(entries) {
  const localParts = [];
  const centralParts = [];
  let offset = 0;
  for (const entry of entries) {
    const flags = entry.flags & ~0x0008;
    const localExtra = entry.localExtra;
    const local = Buffer.alloc(30 + entry.nameBytes.length + localExtra.length);
    writeUInt32(local, 0, LOCAL_SIGNATURE);
    writeUInt16(local, 4, Math.max(20, entry.versionNeeded));
    writeUInt16(local, 6, flags);
    writeUInt16(local, 8, entry.method);
    writeUInt16(local, 10, entry.modTime);
    writeUInt16(local, 12, entry.modDate);
    writeUInt32(local, 14, entry.checksum);
    writeUInt32(local, 18, entry.compressedData.length);
    writeUInt32(local, 22, entry.uncompressedSize);
    writeUInt16(local, 26, entry.nameBytes.length);
    writeUInt16(local, 28, localExtra.length);
    entry.nameBytes.copy(local, 30);
    localExtra.copy(local, 30 + entry.nameBytes.length);
    localParts.push(local, entry.compressedData);

    const centralExtra = entry.centralExtra;
    const central = Buffer.alloc(46 + entry.nameBytes.length + centralExtra.length + entry.comment.length);
    writeUInt32(central, 0, CENTRAL_SIGNATURE);
    writeUInt16(central, 4, entry.versionMadeBy);
    writeUInt16(central, 6, Math.max(20, entry.versionNeeded));
    writeUInt16(central, 8, flags);
    writeUInt16(central, 10, entry.method);
    writeUInt16(central, 12, entry.modTime);
    writeUInt16(central, 14, entry.modDate);
    writeUInt32(central, 16, entry.checksum);
    writeUInt32(central, 20, entry.compressedData.length);
    writeUInt32(central, 24, entry.uncompressedSize);
    writeUInt16(central, 28, entry.nameBytes.length);
    writeUInt16(central, 30, centralExtra.length);
    writeUInt16(central, 32, entry.comment.length);
    writeUInt16(central, 34, 0);
    writeUInt16(central, 36, entry.internalAttributes);
    writeUInt32(central, 38, entry.externalAttributes);
    writeUInt32(central, 42, offset);
    entry.nameBytes.copy(central, 46);
    centralExtra.copy(central, 46 + entry.nameBytes.length);
    entry.comment.copy(central, 46 + entry.nameBytes.length + centralExtra.length);
    centralParts.push(central);
    offset += local.length + entry.compressedData.length;
  }

  const localData = Buffer.concat(localParts);
  const centralData = Buffer.concat(centralParts);
  if (entries.length > 0xffff || localData.length > 0xffffffff || centralData.length > 0xffffffff) {
    throw zipError("normalized DOCX is too large for a classic ZIP container");
  }
  const eocd = Buffer.alloc(22);
  writeUInt32(eocd, 0, EOCD_SIGNATURE);
  writeUInt16(eocd, 4, 0);
  writeUInt16(eocd, 6, 0);
  writeUInt16(eocd, 8, entries.length);
  writeUInt16(eocd, 10, entries.length);
  writeUInt32(eocd, 12, centralData.length);
  writeUInt32(eocd, 16, localData.length);
  writeUInt16(eocd, 20, 0);
  return Buffer.concat([localData, centralData, eocd]);
}

function addW14Namespace(xml) {
  const root = xml.match(/<w:document\b[^>]*>/);
  if (!root || /\bxmlns:w14\s*=/.test(root[0])) return xml;
  const replacement = root[0].replace(/>$/, ` xmlns:w14="${W14_NAMESPACE}">`);
  return xml.slice(0, root.index) + replacement + xml.slice(root.index + root[0].length);
}

function generatedParagraphId(used) {
  let id = "";
  do {
    id = crypto.randomBytes(4).toString("hex").toUpperCase();
  } while (id === "00000000" || used.has(id));
  used.add(id);
  return id;
}

function normalizeWordXml(xml, used) {
  let changed = false;
  let hasParaId = false;
  const paragraphIds = [];
  const normalized = xml.replace(/<w:p(?=\s|>)([^>]*)>/g, (tag, rawAttributes) => {
    const attributes = String(rawAttributes || "");
    const matches = [...attributes.matchAll(/\bw14:paraId\s*=\s*(["'])(.*?)\1/g)];
    const existing = matches.length === 1 && /^[0-9a-f]{8}$/i.test(matches[0][2])
      ? matches[0][2].toUpperCase()
      : null;
    if (existing && !used.has(existing)) {
      used.add(existing);
      hasParaId = true;
      paragraphIds.push(existing);
      return tag;
    }

    const id = generatedParagraphId(used);
    paragraphIds.push(id);
    hasParaId = true;
    changed = true;
    const withoutParaId = attributes.replace(/\s*\bw14:paraId\s*=\s*(?:"[^"]*"|'[^']*')/g, "");
    const selfClosing = /\/\s*$/.test(withoutParaId);
    const cleanAttributes = withoutParaId.replace(/\/\s*$/, "").trim();
    return `<w:p${cleanAttributes ? ` ${cleanAttributes}` : ""} w14:paraId="${id}"${selfClosing ? "/>" : ">"}`;
  });
  if (!changed && !hasParaId) return { xml, changed: false, paragraphIds };
  const withNamespace = hasParaId ? addW14Namespace(normalized) : normalized;
  if (withNamespace !== xml) changed = true;
  return { xml: withNamespace, changed, paragraphIds };
}

function directElements(xml, start, end) {
  const result = [];
  const tags = /<!--[\s\S]*?-->|<\?[^>]*>|<![^>]*>|<[^>]+>/g;
  tags.lastIndex = start;
  let depth = 0;
  let elementStart = -1;
  let elementName = "";
  let match;
  while ((match = tags.exec(xml)) && match.index < end) {
    const tag = match[0];
    if (tag.startsWith("<!--") || tag.startsWith("<?") || tag.startsWith("<!")) continue;
    const closing = /^<\/\s*([A-Za-z_][\w:.-]*)/.exec(tag);
    if (closing) {
      if (depth === 0) break;
      depth -= 1;
      if (depth === 0 && elementStart >= 0) {
        result.push({
          name: elementName,
          xml: xml.slice(elementStart, match.index + tag.length),
        });
        elementStart = -1;
        elementName = "";
      }
      continue;
    }
    const opening = /^<\s*([A-Za-z_][\w:.-]*)/.exec(tag);
    if (!opening) continue;
    const selfClosing = /\/\s*>$/.test(tag);
    if (depth === 0) {
      elementStart = match.index;
      elementName = opening[1];
      if (selfClosing) {
        result.push({ name: elementName, xml: tag });
        elementStart = -1;
        elementName = "";
      } else {
        depth = 1;
      }
    } else if (!selfClosing) {
      depth += 1;
    }
  }
  return result;
}

function paragraphIdsInXml(xml) {
  return [...xml.matchAll(/<w:p(?=\s|>)([^>]*)>/g)]
    .map((match) => /\bw14:paraId\s*=\s*(["'])([0-9a-f]{8})\1/i.exec(match[0])?.[2]?.toUpperCase())
    .filter(Boolean);
}

function bodyElements(xml) {
  const body = /<w:body\b[^>]*>/.exec(xml);
  if (!body) throw zipError("DOCX document.xml has no w:body element");
  const start = body.index + body[0].length;
  const closing = /<\/w:body\s*>/.exec(xml.slice(start));
  const end = closing ? start + closing.index : xml.length;
  const result = [];
  for (const element of directElements(xml, start, end)) {
    if (element.name === "w:sdt") {
      const content = /<w:sdtContent\b[^>]*>/.exec(element.xml);
      const contentEnd = content
        ? element.xml.lastIndexOf("</w:sdtContent>")
        : -1;
      const children = content && contentEnd > content.index + content[0].length
        ? directElements(element.xml, content.index + content[0].length, contentEnd)
            .filter((child) => child.name === "w:p" || child.name === "w:tbl")
        : [];
      // GenOffice expands an SDT into its direct paragraph/table children only
      // when it contains at least two such blocks. Mirror that indexing rule.
      if (children.length >= 2) {
        result.push(...children.map((child) => paragraphIdsInXml(child.xml)));
        continue;
      }
    }
    const paragraphIds = paragraphIdsInXml(element.xml);
    result.push(paragraphIds.length > 0 ? paragraphIds : null);
  }
  return result;
}

function isWordXml(name) {
  return /^word\/.+\.xml$/i.test(name);
}

function isSignatureEntry(name) {
  return /^_xmlsignatures\//i.test(name);
}

/**
 * Ensure every Word paragraph has a native w14:paraId and return the IDs of
 * direct document-body blocks in the same order used by GenOffice's docxIndex.
 */
function ensureDocxParagraphIds(input) {
  const original = Buffer.isBuffer(input) ? input : Buffer.from(input);
  const entries = parseZip(original);
  const documentEntry = entries.find((entry) => entry.name.toLowerCase() === "word/document.xml");
  if (!documentEntry) throw zipError("DOCX word/document.xml is missing");

  const used = new Set();
  let changed = false;
  let paragraphIds = [];
  const ordered = [documentEntry, ...entries.filter((entry) => entry !== documentEntry && isWordXml(entry.name)).sort((left, right) => left.name.localeCompare(right.name))];
  for (const entry of ordered) {
    const xml = readEntry(entry);
    if (xml.length > MAX_XML_BYTES) throw zipError("DOCX XML part is too large");
    const normalized = normalizeWordXml(xml.toString("utf8"), used);
    if (normalized.changed) {
      if (entries.some((candidate) => isSignatureEntry(candidate.name))) {
        const error = zipError("signed DOCX cannot be normalized without invalidating its signature");
        error.code = "DOCX_SIGNATURE_UNSUPPORTED";
        throw error;
      }
      entry.normalized = replaceBufferEntry(entry, Buffer.from(normalized.xml, "utf8"));
      changed = true;
    }
    if (entry === documentEntry) {
      paragraphIds = bodyElements(normalized.xml);
    }
  }
  if (!changed) return { data: original, changed: false, paragraphIds };
  const rebuilt = entries.map((entry) => entry.normalized || entry);
  return { data: buildZip(rebuilt), changed: true, paragraphIds };
}

module.exports = {
  ensureDocxParagraphIds,
  normalizeWordXml,
  bodyElements,
};
