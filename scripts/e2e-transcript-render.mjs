#!/usr/bin/env node
/** Real React/Chromium regression for E2E-083's stable completed activity groups. */
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { cp, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { resolveElectronBinary } from "./e2e/boot.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

/** A CSS selector is matched literally, so its dots must not read as wildcards. */
const escapeRegExp = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const require = createRequire(
  join(root, "packages/agent-runtime/package.json"),
);
const { build } = require("esbuild");
const { electronBinary } = resolveElectronBinary(root);
const temp = await mkdtemp(join(tmpdir(), "pi-transcript-render-"));
try {
  await build({
    entryPoints: [join(root, "scripts/e2e/transcript-render.tsx")],
    outfile: join(temp, "renderer.js"),
    bundle: true,
    platform: "browser",
    format: "iife",
    jsx: "automatic",
    define: { "process.env.NODE_ENV": '"production"' },
    // Styles are outside the render-count contract; component and hook code is real.
    loader: { ".css": "empty" },
    alias: {
      "@pi-desktop/i18n": join(root, "packages/i18n/src/index.ts"),
      // The fixture lives outside the desktop package; use its React instance.
      react: join(root, "apps/desktop/node_modules/react"),
      "react-dom": join(root, "apps/desktop/node_modules/react-dom"),
    },
    nodePaths: [join(root, "apps/desktop/node_modules")],
    plugins: [
      {
        name: "count-activity-group-renders",
        setup(build) {
          build.onLoad(
            { filter: /[/\\]ActivityGroup\.tsx$/ },
            async ({ path }) => {
              const source = await readFile(path, "utf8");
              const marker = "}: ActivityGroupProps) {";
              assert.equal(
                source.split(marker).length,
                2,
                "ActivityGroup instrumentation boundary changed",
              );
              return {
                contents: source.replace(
                  marker,
                  `${marker}\n  (globalThis.__activityGroupRenders ??= []).push(items[0]?.message.id);`,
                ),
                loader: "tsx",
              };
            },
          );
        },
      },
    ],
  });
  // The runtime-status scenario measures real geometry, so the page needs the
  // app's built stylesheet: the Tailwind reset, the design tokens (the
  // indicator's own type scale), and the transcript layers live there.
  const renderer = join(root, "apps/desktop/out/renderer");
  const appHtml = await readFile(join(renderer, "index.html"), "utf8");
  const css = [...appHtml.matchAll(/href="([^" ]+\.css)"/g)].map(
    (match) => match[1],
  );
  assert(
    css.length,
    "Build the app with pnpm build:js before running this check",
  );
  await cp(join(renderer, "assets"), join(temp, "assets"), { recursive: true });
  // The scenario measures rules that only exist in the built stylesheet, so a
  // stale build must fail loudly instead of passing a geometry check against CSS
  // that no longer describes the source. Every rule the scenario measures is
  // listed with the file that declares it.
  const measuredRules = [
    [".transcript-runtime-status", "chat-shell.css", "the runtime status lane"],
    [".working-indicator", "messages.css", "the status row's own box"],
    [".working-indicator-mark", "messages.css", "the status marker's column"],
  ];
  const builtCss = (
    await Promise.all(css.map((path) => readFile(join(renderer, path), "utf8")))
  )
    .join("\n")
    .replace(/\s+/g, "");
  // Comments inside a rule describe intent; only its declarations are compared.
  const declarations = (rule) =>
    new Set(rule.replace(/\s+/g, "").split(";").filter(Boolean));
  for (const [selector, file, what] of measuredRules) {
    const source = await readFile(
      join(root, "apps/desktop/src/styles", file),
      "utf8",
    );
    const sourceRule = source
      .match(new RegExp(`${escapeRegExp(selector)} \\{([\\s\\S]*?)\\}`))?.[1]
      .replace(/\/\*[\s\S]*?\*\//g, "");
    assert(sourceRule, `${file} declares no ${selector} rule`);
    const builtRule = builtCss.match(
      new RegExp(`${escapeRegExp(selector)}\\{([^}]*)\\}`),
    )?.[1];
    assert(
      builtRule,
      `the built stylesheet predates ${what} (${selector}); build with pnpm build:js`,
    );
    const sourceDeclarations = declarations(sourceRule);
    const builtDeclarations = declarations(builtRule);
    // A build still carrying a declaration the source has dropped (or missing
    // one the source added) fails here rather than measuring stale CSS.
    const drift = [
      ...[...builtDeclarations].filter(
        (value) => !sourceDeclarations.has(value),
      ),
      ...[...sourceDeclarations].filter(
        (value) => !builtDeclarations.has(value),
      ),
    ];
    assert(
      drift.length === 0,
      `the built stylesheet is stale for ${selector} (${drift.join(", ")}); build with pnpm build:js`,
    );
  }
  await writeFile(
    join(temp, "index.html"),
    `<!doctype html><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'self'; style-src 'self' 'unsafe-inline'; font-src 'self' data:"><title>Transcript render regression</title>${css
      .map((path) => `<link rel="stylesheet" href="${path}">`)
      .join("")}<script src="renderer.js"></script>`,
  );
  await writeFile(
    join(temp, "main.cjs"),
    `
const { app, BrowserWindow } = require("electron");
const path = require("node:path");
app.setPath("userData", path.join(__dirname, "profile"));
app.whenReady().then(async () => {
  const window = new BrowserWindow({ show: false, webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false } });
  window.webContents.on("console-message", (event) => console.error(event.message));
  try {
    await window.loadFile(path.join(__dirname, "index.html"));
    const result = await window.webContents.executeJavaScript("globalThis.transcriptRenderProbe().then((render) => globalThis.transcriptRuntimeSlotProbe().then((slot) => Object.assign({}, render, { runtimeSlot: slot, ok: render.ok && slot.ok })))");
    console.log("TRANSCRIPT_RENDER_PROBE " + JSON.stringify(result));
    app.quit();
  } catch (error) {
    console.error("TRANSCRIPT_RENDER_PROBE " + JSON.stringify({ ok: false, error: String(error) }));
    app.exit(1);
  }
});
`,
  );
  const env = { ...process.env };
  delete env.ELECTRON_RUN_AS_NODE;
  const child = spawn(electronBinary, [join(temp, "main.cjs")], {
    env,
    stdio: ["ignore", "pipe", "pipe"],
  });
  let output = "";
  for (const stream of [child.stdout, child.stderr])
    stream.on("data", (data) => {
      output += data;
    });
  const timeout = setTimeout(() => child.kill("SIGKILL"), 45_000);
  let code;
  try {
    code = await new Promise((resolve, reject) => {
      child.once("error", reject);
      child.once("close", resolve);
    });
  } finally {
    clearTimeout(timeout);
  }
  const line = output
    .split(/\r?\n/)
    .find((line) => line.startsWith("TRANSCRIPT_RENDER_PROBE "));
  assert(
    line,
    `renderer returned no probe result (exit=${code}): ${output.slice(-2000)}`,
  );
  const result = JSON.parse(line.slice("TRANSCRIPT_RENDER_PROBE ".length));
  console.log("TRANSCRIPT_RENDER_PROBE " + JSON.stringify(result));
  assert.equal(code, 0, output.slice(-6000));
  assert.equal(result.ok, true);
  // The merged result above already carries the geometry snapshots; this turns
  // a failed scenario into a message that names the checks that failed.
  // check can be read from the scenario output alone.
  assert.equal(
    result.runtimeSlot?.ok,
    true,
    `runtime status slot scenario failed: ${JSON.stringify(result.runtimeSlot?.failures)}`,
  );
} finally {
  await rm(temp, { recursive: true, force: true });
}
