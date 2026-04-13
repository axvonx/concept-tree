/**
 * markdown.js — Frontmatter parser and markdown-to-tree converter.
 *
 * Markdown concept files use YAML-like frontmatter:
 *
 *   ---
 *   title: Quantum Mechanics
 *   tags: [physics, quantum]
 *   image: quantum.png
 *   links:
 *     - wave-particle-duality
 *     - uncertainty-principle
 *   ---
 *
 *   # Quantum Mechanics
 *   Content here...
 *
 * The `links` field lists child concept IDs. The tree structure is built
 * by resolving these references.
 */

/**
 * Parse YAML-like frontmatter from a markdown string.
 * Returns { meta: Object, body: string }.
 */
export function parseFrontmatter(src) {
  const fm = { meta: {}, body: src };
  if (!src.startsWith("---")) return fm;

  const end = src.indexOf("\n---", 3);
  if (end === -1) return fm;

  const yaml = src.slice(4, end).trim();
  const body = src.slice(end + 4).trim();

  const meta = {};
  let currentKey = null;
  let currentList = null;

  for (const rawLine of yaml.split("\n")) {
    const line = rawLine.trimEnd();

    // List continuation: "  - value"
    if (currentList !== null && /^\s+-\s+/.test(line)) {
      currentList.push(line.replace(/^\s+-\s+/, "").trim());
      continue;
    }

    // Flush any pending list
    if (currentList !== null) {
      meta[currentKey] = currentList;
      currentList = null;
      currentKey = null;
    }

    // "key: value" or "key:"
    const m = line.match(/^(\w[\w-]*)\s*:\s*(.*)/);
    if (!m) continue;

    const [, key, val] = m;
    const trimVal = val.trim();

    // Inline array: [a, b, c]
    if (trimVal.startsWith("[") && trimVal.endsWith("]")) {
      meta[key] = trimVal.slice(1, -1).split(",").map(s => s.trim()).filter(Boolean);
      continue;
    }

    // Start of block list (value is empty, next lines are "  - ...")
    if (trimVal === "") {
      currentKey = key;
      currentList = [];
      continue;
    }

    // Boolean
    if (trimVal === "true") { meta[key] = true; continue; }
    if (trimVal === "false") { meta[key] = false; continue; }

    // Number
    if (/^-?\d+(\.\d+)?$/.test(trimVal)) { meta[key] = Number(trimVal); continue; }

    // String (strip surrounding quotes if present)
    meta[key] = trimVal.replace(/^["']|["']$/g, "");
  }

  // Flush trailing list
  if (currentList !== null) {
    meta[currentKey] = currentList;
  }

  return { meta, body };
}

/**
 * Build a forest of concept tree nodes from a map of { id → markdown_source }.
 *
 * Each node in the tree: { id, title, body, tags, image, children, filePaths }
 *
 * Nodes whose parent doesn't reference them become roots.
 */
export function buildConceptTree(sources) {
  // Parse all sources
  const parsed = new Map();
  for (const [id, src] of Object.entries(sources)) {
    const { meta, body } = parseFrontmatter(src);
    parsed.set(id, {
      id,
      title: meta.title || id,
      body,
      tags: meta.tags || [],
      image: meta.image || null,
      filePaths: meta.filePaths || meta.files || [],
      links: meta.links || [],
      children: [],
    });
  }

  // Resolve children links.
  // Each concept can belong to at most one parent — first reference wins.
  // This prevents a node from appearing twice in the simulation when two
  // parents both list it in their `links:` field.
  const childClaimed = new Set();
  const referenced   = new Set();
  for (const [, node] of parsed) {
    node.children = [];
    for (const linkId of node.links) {
      const child = parsed.get(linkId);
      if (!child || childClaimed.has(child.id)) continue;
      childClaimed.add(child.id);
      node.children.push(child);
      referenced.add(child.id);
    }
  }

  // Roots = nodes not referenced by anyone
  const roots = [];
  for (const [id, node] of parsed) {
    if (!referenced.has(id)) roots.push(node);
  }

  return roots;
}

/**
 * Extract a plain-text snippet from markdown body (first ~200 chars of real content).
 */
export function bodySnippet(body, maxLen = 200) {
  if (!body) return "";
  const lines = body.split("\n");
  const kept = [];
  for (const l of lines) {
    const t = l.trim();
    if (!t) continue;
    // Skip headings (for snippet)
    if (t.startsWith("#")) continue;
    // Strip markdown formatting
    const clean = t
      .replace(/!\[.*?\]\(.*?\)/g, "")     // images
      .replace(/\[([^\]]*)\]\(.*?\)/g, "$1") // links
      .replace(/[*_`~]/g, "")              // emphasis
      .trim();
    if (!clean) continue;
    kept.push(clean);
    if (kept.join(" ").length >= maxLen) break;
  }
  const text = kept.join(" ").trim();
  return text.length > maxLen ? text.slice(0, maxLen - 3) + "…" : text;
}

/**
 * Render markdown to HTML. Uses the `marked` library if available,
 * otherwise falls back to a basic converter.
 *
 * @param {string} src - Markdown source
 * @param {Object} [options]
 * @param {Object} [options.concepts] - Map of { id → title } for [[wiki-link]] resolution.
 *   Wiki links [[id]] or [[Title|id]] become internal /detail.html?id=... anchors.
 */
export function renderMarkdown(src, options = {}) {
  // If marked is available globally (loaded via CDN in the browser)
  if (typeof globalThis.marked !== "undefined") {
    let processed = src;
    if (options.concepts) processed = _resolveWikiLinks(processed, options.concepts);
    return globalThis.marked.parse(processed, {
      breaks: true,
      gfm: true,
    });
  }

  return _fallbackRender(src, options);
}

/** Expand [[id]] and [[Title|id]] wiki links to internal detail page anchors. */
export function resolveWikiLinks(src, concepts) {
  return _resolveWikiLinks(src, concepts);
}

function _resolveWikiLinks(src, concepts) {
  return src.replace(/\[\[([^\]|]+?)(?:\|([^\]]+?))?\]\]/g, (_, a, b) => {
    const id    = b ? b.trim() : a.trim();
    const title = b ? a.trim() : (concepts[id] || id);
    return `[${title}](/detail.html?id=${encodeURIComponent(id)})`;
  });
}

function _fallbackRender(src, options = {}) {
  let text = src;

  if (options.concepts) text = _resolveWikiLinks(text, options.concepts);

  // Fenced code blocks: ```lang\n...\n```
  text = text.replace(/```(\w*)\n([\s\S]*?)```/g, (_, lang, code) => {
    const escaped = code
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .trimEnd();
    const cls = lang ? ` class="language-${lang}"` : "";
    return `<pre><code${cls}>${escaped}</code></pre>`;
  });

  // Blockquotes (consecutive "> " lines)
  text = text.replace(/(^> .+$(\n|$))+/gm, m => {
    const inner = m.replace(/^> ?/gm, "").trim();
    return `<blockquote>${_fallbackRender(inner)}</blockquote>`;
  });

  // Horizontal rules: --- or *** or ___ (own line)
  text = text.replace(/^[ \t]*([-*_])([ \t]*\1){2,}[ \t]*$/gm, "<hr>");

  // Headings
  text = text
    .replace(/^### (.+)$/gm, "<h3>$1</h3>")
    .replace(/^## (.+)$/gm, "<h2>$1</h2>")
    .replace(/^# (.+)$/gm, "<h1>$1</h1>");

  // Images before links (order matters)
  text = text.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, '<img src="$2" alt="$1" />');

  // Links
  text = text.replace(/\[([^\]]*)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');

  // Inline formatting
  text = text
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/__(.+?)__/g, "<strong>$1</strong>")
    .replace(/\*(.+?)\*/g, "<em>$1</em>")
    .replace(/_(.+?)_/g, "<em>$1</em>")
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/~~(.+?)~~/g, "<del>$1</del>");

  // Ordered lists: lines starting with "N. "
  text = text.replace(/(^[0-9]+\. .+$(\n|$))+/gm, m => {
    const items = m.trim().split("\n").map(l => `<li>${l.replace(/^[0-9]+\. /, "")}</li>`);
    return `<ol>${items.join("")}</ol>`;
  });

  // Unordered lists: lines starting with "- " or "* "
  text = text.replace(/(^[-*] .+$(\n|$))+/gm, m => {
    const items = m.trim().split("\n").map(l => `<li>${l.replace(/^[-*] /, "")}</li>`);
    return `<ul>${items.join("")}</ul>`;
  });

  // Paragraphs
  text = text
    .replace(/\n{2,}/g, "</p><p>")
    .replace(/^(?!<[houbdp])/gm, s => s ? `<p>${s}` : "")
    .replace(/<p><\/p>/g, "")
    .replace(/<p>(<(?:h[1-6]|ul|ol|blockquote|pre|hr)[^>]*>)/g, "$1")
    .replace(/(<\/(?:h[1-6]|ul|ol|blockquote|pre)>)<\/p>/g, "$1");

  return text;
}
