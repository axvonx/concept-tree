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

    // Protect LaTeX blocks from marked's markdown processing.
    const mathBlocks = [];
    processed = processed.replace(/\$\$([\s\S]*?)\$\$/g, (match) => {
      mathBlocks.push(match);
      return `MATHPLACEHOLDER${mathBlocks.length - 1}END`;
    });
    processed = processed.replace(/\$([^\$\n]+?)\$/g, (match) => {
      mathBlocks.push(match);
      return `MATHPLACEHOLDER${mathBlocks.length - 1}END`;
    });

    // Configure marked renderer for syntax highlighting and task lists
    const renderer = new globalThis.marked.Renderer();

    // Syntax highlighting via highlight.js (if available)
    renderer.code = function ({ text, lang }) {
      if (typeof globalThis.hljs !== "undefined" && lang && globalThis.hljs.getLanguage(lang)) {
        const highlighted = globalThis.hljs.highlight(text, { language: lang }).value;
        return `<pre><code class="hljs language-${lang}">${highlighted}</code></pre>`;
      }
      if (typeof globalThis.hljs !== "undefined") {
        const highlighted = globalThis.hljs.highlightAuto(text).value;
        return `<pre><code class="hljs">${highlighted}</code></pre>`;
      }
      const escaped = text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
      const cls = lang ? ` class="language-${lang}"` : "";
      return `<pre><code${cls}>${escaped}</code></pre>`;
    };

    // Task list checkboxes — must parse inline tokens for bold/italic/etc.
    renderer.listitem = function (token) {
      const body = this.parser.parseInline(token.tokens);
      if (token.task) {
        return `<li class="task-list-item">${body}</li>\n`;
      }
      return `<li>${body}</li>\n`;
    };

    // Auto-embed YouTube and Vimeo links that appear alone on a line
    renderer.link = function ({ href, title, text }) {
      const embed = _tryEmbed(href, text);
      if (embed) return embed;
      const titleAttr = title ? ` title="${title}"` : "";
      return `<a href="${href}"${titleAttr}>${text}</a>`;
    };

    // Responsive images with optional figcaption
    renderer.image = function ({ href, title, text }) {
      const titleAttr = title ? ` title="${title}"` : "";
      if (text) {
        return `<figure class="md-figure"><img src="${href}" alt="${text}"${titleAttr} loading="lazy"><figcaption>${text}</figcaption></figure>`;
      }
      return `<img src="${href}" alt=""${titleAttr} loading="lazy">`;
    };

    let html = globalThis.marked.parse(processed, {
      breaks: true,
      gfm: true,
      renderer,
    });

    html = html.replace(/MATHPLACEHOLDER(\d+)END/g, (_, i) => mathBlocks[Number(i)]);
    return html;
  }

  return _fallbackRender(src, options);
}

/**
 * Try to convert a URL into an embed iframe (YouTube, Vimeo).
 * Returns HTML string or null.
 */
function _tryEmbed(href, text) {
  // Only auto-embed when the link text is the URL itself (bare link)
  if (text !== href) return null;

  // YouTube: youtube.com/watch?v=ID, youtu.be/ID, youtube.com/embed/ID
  let m = href.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([\w-]{11})/);
  if (m) {
    return `<div class="md-embed"><iframe src="https://www.youtube-nocookie.com/embed/${m[1]}" frameborder="0" allowfullscreen loading="lazy"></iframe></div>`;
  }

  // Vimeo: vimeo.com/ID
  m = href.match(/vimeo\.com\/(\d+)/);
  if (m) {
    return `<div class="md-embed"><iframe src="https://player.vimeo.com/video/${m[1]}" frameborder="0" allowfullscreen loading="lazy"></iframe></div>`;
  }

  return null;
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

/**
 * Build the HTML for a concept's frontmatter header image.
 * Rendered as a block-level element (left-aligned, no float).
 */
export function buildHeaderImageHtml(src, alt) {
  const escapedAlt = (alt || "").replace(/"/g, "&quot;");
  return `<img src="${src}" alt="${escapedAlt}" class="detail-header-img">`;
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

  // GFM tables: header row, separator row, data rows
  text = text.replace(/(^\|.+\|[ \t]*\n\|[ \t]*[-:|][-:| \t]*\|[ \t]*\n(\|.+\|[ \t]*\n?)*)/gm, m => {
    const rows = m.trim().split("\n");
    if (rows.length < 2) return m;

    const parseRow = r => r.replace(/^\|/, "").replace(/\|$/, "").split("|").map(c => c.trim());
    const headers = parseRow(rows[0]);

    // Parse alignment from separator row
    const seps = parseRow(rows[1]);
    const aligns = seps.map(s => {
      if (/^:-+:$/.test(s)) return "center";
      if (/^-+:$/.test(s)) return "right";
      return "left";
    });

    let html = "<table><thead><tr>";
    for (let i = 0; i < headers.length; i++) {
      html += `<th style="text-align:${aligns[i] || "left"}">${headers[i]}</th>`;
    }
    html += "</tr></thead><tbody>";
    for (let r = 2; r < rows.length; r++) {
      const cells = parseRow(rows[r]);
      html += "<tr>";
      for (let i = 0; i < headers.length; i++) {
        html += `<td style="text-align:${aligns[i] || "left"}">${cells[i] || ""}</td>`;
      }
      html += "</tr>";
    }
    html += "</tbody></table>";
    return html;
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
    .replace(/^#### (.+)$/gm, "<h4>$1</h4>")
    .replace(/^### (.+)$/gm, "<h3>$1</h3>")
    .replace(/^## (.+)$/gm, "<h2>$1</h2>")
    .replace(/^# (.+)$/gm, "<h1>$1</h1>");

  // Images — with figcaption when alt text is present
  text = text.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, (_, alt, url) => {
    if (alt) {
      return `<figure class="md-figure"><img src="${url}" alt="${alt}" loading="lazy"><figcaption>${alt}</figcaption></figure>`;
    }
    return `<img src="${url}" alt="" loading="lazy">`;
  });

  // Auto-embed bare YouTube/Vimeo links
  text = text.replace(/\[([^\]]*)\]\(([^)]+)\)/g, (full, linkText, href) => {
    if (linkText === href) {
      const embed = _tryEmbed(href, linkText);
      if (embed) return embed;
    }
    return `<a href="${href}">${linkText}</a>`;
  });

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

  // Unordered lists with task list support: lines starting with "- " or "* "
  text = text.replace(/(^[-*] .+$(\n|$))+/gm, m => {
    const items = m.trim().split("\n").map(l => {
      const content = l.replace(/^[-*] /, "");
      // Task list items: "- [x] done" or "- [ ] todo"
      const taskMatch = content.match(/^\[([ xX])\] (.*)$/);
      if (taskMatch) {
        const checked = taskMatch[1].toLowerCase() === "x";
        const checkbox = `<input type="checkbox" disabled${checked ? " checked" : ""}>`;
        return `<li class="task-list-item">${checkbox} ${taskMatch[2]}</li>`;
      }
      return `<li>${content}</li>`;
    });
    return `<ul>${items.join("")}</ul>`;
  });

  // Paragraphs
  text = text
    .replace(/\n{2,}/g, "</p><p>")
    .replace(/^(?!<[houbdptf])/gm, s => s ? `<p>${s}` : "")
    .replace(/<p><\/p>/g, "")
    .replace(/<p>(<(?:h[1-6]|ul|ol|blockquote|pre|hr|table|figure|div)[^>]*>)/g, "$1")
    .replace(/(<\/(?:h[1-6]|ul|ol|blockquote|pre|table|figure|div)>)<\/p>/g, "$1");

  return text;
}
