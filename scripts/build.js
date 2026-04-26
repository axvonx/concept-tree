#!/usr/bin/env node
/**
 * build.js — Compile the demo into a fully static site under dist/.
 *
 * Reads concept markdown from demo/concepts/, bundles them into a single
 * concepts.json, copies all assets, and patches HTML/JS so the site works
 * without any server — suitable for GitHub Pages or any static host.
 */

import { readFileSync, writeFileSync, mkdirSync, rmSync, cpSync, readdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const DEMO = join(ROOT, "demo");
const SRC = join(ROOT, "src");
const DIST = join(ROOT, "dist");

// ── Clean & create dist ─────────────────────────────────────────────────────

if (existsSync(DIST)) {
  rmSync(DIST, { recursive: true, force: true });
}
mkdirSync(DIST, { recursive: true });

// ── Generate concepts.json ──────────────────────────────────────────────────

const conceptsDir = join(DEMO, "concepts");
const concepts = {};
for (const file of readdirSync(conceptsDir).sort()) {
  if (!file.endsWith(".md")) continue;
  const id = file.replace(/\.md$/, "");
  let source = readFileSync(join(conceptsDir, file), "utf-8");
  // Fix absolute image paths so they work when served from a subdirectory (GitHub Pages)
  source = source.replace(/^(image:\s*)\/images\//gm, "$1images/");
  concepts[id] = source;
}
writeFileSync(join(DIST, "concepts.json"), JSON.stringify(concepts));
console.log(`  concepts.json: ${Object.keys(concepts).length} concepts`);

// ── Copy source files ───────────────────────────────────────────────────────

cpSync(SRC, join(DIST, "src"), { recursive: true });
console.log("  src/ copied");

// ── Copy demo assets ────────────────────────────────────────────────────────

cpSync(join(DEMO, "style.css"), join(DIST, "style.css"));

if (existsSync(join(DEMO, "images"))) {
  cpSync(join(DEMO, "images"), join(DIST, "images"), { recursive: true });
  console.log("  images/ copied");
}

// ── Patch and copy HTML/JS ──────────────────────────────────────────────────

// Helper: replace API fetch paths and absolute /src/ imports with relative ones,
// and make internal navigation links relative (no leading /).
function patchContent(content) {
  return content
    // API endpoint → static JSON
    .replace(/fetch\(\s*["']\/api\/concepts["']\s*\)/g, 'fetch("concepts.json")')
    // Absolute /src/ imports → relative ./src/
    .replace(/(from\s+["'])\/src\//g, "$1./src/")
    .replace(/(src=["'])\/src\//g, "$1./src/")
    // Absolute navigation links → relative
    .replace(/(href\s*=\s*["'])\/detail\.html/g, "$1detail.html")
    .replace(/(href\s*=\s*["'])\/(["'])/g, "$1index.html$2")  // href="/" → href="index.html"
    .replace(/(location\.href\s*=\s*["'])\/detail\.html/g, "$1detail.html")
    .replace(/(location\.href\s*=\s*['"])\//g, "$1./")
    // window.location.href template literals with /detail.html
    .replace(/`\/detail\.html\?/g, "`detail.html?");
}

// index.html
let indexHtml = readFileSync(join(DEMO, "index.html"), "utf-8");
indexHtml = patchContent(indexHtml);
writeFileSync(join(DIST, "index.html"), indexHtml);

// detail.html
let detailHtml = readFileSync(join(DEMO, "detail.html"), "utf-8");
detailHtml = patchContent(detailHtml);
writeFileSync(join(DIST, "detail.html"), detailHtml);

// main.js
let mainJs = readFileSync(join(DEMO, "main.js"), "utf-8");
mainJs = patchContent(mainJs);
writeFileSync(join(DIST, "main.js"), mainJs);

console.log("  HTML/JS patched and copied");
console.log(`\n  Static site built in dist/ (${Object.keys(concepts).length} concepts)`);
