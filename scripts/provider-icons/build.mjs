#!/usr/bin/env node
/**
 * Provider icon sprite generator.
 *
 * Turns the vendored monochrome provider marks in
 * `scripts/provider-icons/vendors/*.svg` into the single SVG sprite the
 * renderer loads: `apps/desktop/public/provider-icons.svg`.
 *
 * The sprite is a build artifact: change a vendor file and regenerate, never
 * hand-edit the sprite.
 *
 * Usage:
 *   node scripts/provider-icons/build.mjs           # regenerate the sprite
 *   node scripts/provider-icons/build.mjs --check   # fail when it is stale
 *   pnpm build:provider-icons / pnpm check:provider-icons
 *
 * Enforced:
 *   1. Every `symbol: "<id>"` in `src/lib/model-icons.tsx` has a matching
 *      vendor file, so the provider map can never point at a missing glyph.
 *   2. Every `<symbol>` carries `fill="currentColor"` (plus the upstream
 *      `fill-rule` when the source declares one). Root attributes of an
 *      external sprite do not reach the `<use>` site, so without this the mark
 *      would paint black and ignore the theme.
 *   3. Symbols are emitted in sorted order, so regenerating the same sources
 *      never produces an incidental diff.
 *
 * Artwork provenance, the upstream refresh procedure, and the differences
 * against the PiLaw reference sprite: scripts/provider-icons/README.md.
 */
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const scriptDir = join(root, "scripts", "provider-icons");
const vendorsDir = join(scriptDir, "vendors");
const spritePath = join(root, "apps", "desktop", "public", "provider-icons.svg");
const componentPath = join(root, "apps", "desktop", "src", "lib", "model-icons.tsx");

const checkOnly = process.argv.includes("--check");

function fail(message) {
  console.error(`provider-icons: ${message}`);
  process.exit(1);
}

/** One vendored SVG file -> one `<symbol>` line. */
function symbolMarkup(file) {
  const id = basename(file, ".svg");
  const source = readFileSync(join(vendorsDir, file), "utf8");
  const openTag = /<svg([^>]*)>/.exec(source);
  if (!openTag) fail(`vendors/${file} has no <svg> root`);
  const viewBox = /\bviewBox="([^"]+)"/.exec(openTag[1])?.[1];
  if (!viewBox) fail(`vendors/${file} declares no viewBox`);
  const body = source
    .replace(/^[\s\S]*?<svg[^>]*>/, "")
    .replace(/<\/svg>[\s\S]*$/, "")
    .replace(/\s+/g, " ")
    .trim();
  if (!body) fail(`vendors/${file} has no glyph body`);
  const attributes = [`id="${id}"`, `viewBox="${viewBox}"`, 'fill="currentColor"'];
  const fillRule = /\bfill-rule="([^"]+)"/.exec(openTag[1])?.[1];
  if (fillRule) attributes.push(`fill-rule="${fillRule}"`);
  return `  <symbol ${attributes.join(" ")}>${body}</symbol>`;
}

function buildSprite(ids) {
  const notice = readFileSync(join(scriptDir, "NOTICE.txt"), "utf8")
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((line) => `    ${line}`);
  return [
    '<svg xmlns="http://www.w3.org/2000/svg" fill="currentColor">',
    "  <!--",
    ...notice,
    "  -->",
    ...ids.map((id) => symbolMarkup(`${id}.svg`)),
    "</svg>",
    "",
  ].join("\n");
}

const ids = readdirSync(vendorsDir)
  .filter((name) => name.endsWith(".svg"))
  .map((name) => basename(name, ".svg"))
  .sort();
if (ids.length === 0) fail("vendors/ holds no .svg sources");

const component = readFileSync(componentPath, "utf8");
const referenced = [...component.matchAll(/symbol:\s*"([^"]+)"/g)].map((match) => match[1]);
const missing = referenced.filter((id) => !ids.includes(id));
if (missing.length > 0) {
  fail(
    `src/lib/model-icons.tsx references symbols with no vendor source: ${missing.join(", ")}. ` +
      "Add scripts/provider-icons/vendors/<id>.svg (see README.md).",
  );
}
const unused = ids.filter((id) => !referenced.includes(id));

const sprite = buildSprite(ids);

if (checkOnly) {
  const current = readFileSync(spritePath, "utf8");
  if (current !== sprite) {
    fail(
      "apps/desktop/public/provider-icons.svg is stale. " +
        "Run `pnpm build:provider-icons` and commit the regenerated sprite.",
    );
  }
  console.log(`provider-icons: sprite is up to date (${ids.length} symbols)`);
} else {
  mkdirSync(dirname(spritePath), { recursive: true });
  writeFileSync(spritePath, sprite);
  console.log(
    `provider-icons: wrote apps/desktop/public/provider-icons.svg ` +
      `(${ids.length} symbols, ${sprite.length} bytes)`,
  );
}

if (unused.length > 0) {
  console.warn(`provider-icons: vendored but unreferenced: ${unused.join(", ")}`);
}
