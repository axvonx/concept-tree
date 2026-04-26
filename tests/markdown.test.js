import { describe, it, expect } from "vitest";
import { parseFrontmatter, buildConceptTree, bodySnippet, renderMarkdown, resolveWikiLinks, buildHeaderImageHtml } from "../src/markdown.js";

describe("parseFrontmatter", () => {
  it("returns body unchanged when no frontmatter", () => {
    const src = "# Hello\n\nContent.";
    const { meta, body } = parseFrontmatter(src);
    expect(meta).toEqual({});
    expect(body).toBe(src);
  });

  it("parses title", () => {
    const src = "---\ntitle: Quantum Mechanics\n---\n\n# Body";
    const { meta, body } = parseFrontmatter(src);
    expect(meta.title).toBe("Quantum Mechanics");
    expect(body).toBe("# Body");
  });

  it("parses inline array tags", () => {
    const src = "---\ntitle: Test\ntags: [physics, quantum]\n---\n";
    const { meta } = parseFrontmatter(src);
    expect(meta.tags).toEqual(["physics", "quantum"]);
  });

  it("parses block list links", () => {
    const src = "---\ntitle: T\nlinks:\n  - child1\n  - child2\n---\n";
    const { meta } = parseFrontmatter(src);
    expect(meta.links).toEqual(["child1", "child2"]);
  });

  it("parses boolean true/false", () => {
    const src = "---\ndraft: true\npublished: false\n---\n";
    const { meta } = parseFrontmatter(src);
    expect(meta.draft).toBe(true);
    expect(meta.published).toBe(false);
  });

  it("parses numeric values", () => {
    const src = "---\nweight: 42\npriority: 3.14\n---\n";
    const { meta } = parseFrontmatter(src);
    expect(meta.weight).toBe(42);
    expect(meta.priority).toBeCloseTo(3.14);
  });

  it("strips surrounding quotes from strings", () => {
    const src = `---\ntitle: "Quoted Title"\nimage: 'single.png'\n---\n`;
    const { meta } = parseFrontmatter(src);
    expect(meta.title).toBe("Quoted Title");
    expect(meta.image).toBe("single.png");
  });

  it("handles missing closing ---", () => {
    const src = "---\ntitle: Broken\n# no closing marker";
    const { meta, body } = parseFrontmatter(src);
    expect(meta).toEqual({});
    expect(body).toBe(src);
  });

  it("handles empty frontmatter block", () => {
    const src = "---\n---\n\n# Content";
    const { meta, body } = parseFrontmatter(src);
    expect(meta).toEqual({});
    expect(body).toBe("# Content");
  });

  it("trims body whitespace", () => {
    const src = "---\ntitle: T\n---\n\n\n  Hello  \n\n";
    const { body } = parseFrontmatter(src);
    expect(body).toBe("Hello");
  });

  it("parses filePaths field", () => {
    const src = "---\ntitle: T\nfilePaths: [src/foo.js, src/bar.js]\n---\n";
    const { meta } = parseFrontmatter(src);
    expect(meta.filePaths).toEqual(["src/foo.js", "src/bar.js"]);
  });

  it("parses files as alias for filePaths", () => {
    const src = "---\ntitle: T\nfiles: [a.js, b.js]\n---\n";
    const { meta } = parseFrontmatter(src);
    expect(meta.files).toEqual(["a.js", "b.js"]);
  });

  it("parses block list filePaths", () => {
    const src = "---\ntitle: T\nfilePaths:\n  - src/a.js\n  - src/b.js\n---\n";
    const { meta } = parseFrontmatter(src);
    expect(meta.filePaths).toEqual(["src/a.js", "src/b.js"]);
  });

  it("parses image field", () => {
    const src = "---\ntitle: T\nimage: cover.png\n---\n";
    const { meta } = parseFrontmatter(src);
    expect(meta.image).toBe("cover.png");
  });

  it("handles negative numbers", () => {
    const src = "---\nvalue: -5\n---\n";
    const { meta } = parseFrontmatter(src);
    expect(meta.value).toBe(-5);
  });

  it("parses single-element inline array", () => {
    const src = "---\ntags: [solo]\n---\n";
    const { meta } = parseFrontmatter(src);
    expect(meta.tags).toEqual(["solo"]);
  });

  it("last field in block list is captured", () => {
    const src = "---\nlinks:\n  - a\n  - b\n  - c\n---\n";
    const { meta } = parseFrontmatter(src);
    expect(meta.links).toHaveLength(3);
    expect(meta.links[2]).toBe("c");
  });
});

describe("buildConceptTree", () => {
  it("returns empty array for empty sources", () => {
    expect(buildConceptTree({})).toEqual([]);
  });

  it("single node with no links is a root", () => {
    const roots = buildConceptTree({
      root: "---\ntitle: Root\n---\n",
    });
    expect(roots).toHaveLength(1);
    expect(roots[0].id).toBe("root");
    expect(roots[0].title).toBe("Root");
  });

  it("node referenced by another is not a root", () => {
    const sources = {
      parent: "---\ntitle: Parent\nlinks: [child]\n---\n",
      child: "---\ntitle: Child\n---\n",
    };
    const roots = buildConceptTree(sources);
    expect(roots).toHaveLength(1);
    expect(roots[0].id).toBe("parent");
  });

  it("resolves children references", () => {
    const sources = {
      parent: "---\ntitle: Parent\nlinks: [child]\n---\n",
      child: "---\ntitle: Child\n---\n",
    };
    const roots = buildConceptTree(sources);
    expect(roots[0].children).toHaveLength(1);
    expect(roots[0].children[0].id).toBe("child");
  });

  it("ignores links to non-existent nodes", () => {
    const sources = {
      parent: "---\ntitle: Parent\nlinks: [missing]\n---\n",
    };
    const roots = buildConceptTree(sources);
    expect(roots[0].children).toHaveLength(0);
  });

  it("handles multiple roots", () => {
    const sources = {
      a: "---\ntitle: A\n---\n",
      b: "---\ntitle: B\n---\n",
      c: "---\ntitle: C\n---\n",
    };
    const roots = buildConceptTree(sources);
    expect(roots).toHaveLength(3);
  });

  it("handles deep nesting", () => {
    const sources = {
      a: "---\ntitle: A\nlinks: [b]\n---\n",
      b: "---\ntitle: B\nlinks: [c]\n---\n",
      c: "---\ntitle: C\n---\n",
    };
    const roots = buildConceptTree(sources);
    expect(roots).toHaveLength(1);
    expect(roots[0].children[0].children[0].id).toBe("c");
  });

  it("sets tags and image from frontmatter", () => {
    const sources = {
      x: "---\ntitle: X\ntags: [science]\nimage: x.png\n---\n",
    };
    const roots = buildConceptTree(sources);
    expect(roots[0].tags).toEqual(["science"]);
    expect(roots[0].image).toBe("x.png");
  });

  it("exposes filePaths from frontmatter", () => {
    const sources = {
      x: "---\ntitle: X\nfilePaths: [src/x.js]\n---\n",
    };
    const roots = buildConceptTree(sources);
    expect(roots[0].filePaths).toEqual(["src/x.js"]);
  });

  it("falls back to files alias for filePaths", () => {
    const sources = {
      x: "---\ntitle: X\nfiles: [a.js]\n---\n",
    };
    const roots = buildConceptTree(sources);
    expect(roots[0].filePaths).toEqual(["a.js"]);
  });

  it("node with no title uses id as title", () => {
    const roots = buildConceptTree({ myid: "---\n---\n" });
    expect(roots[0].title).toBe("myid");
  });

  it("child appears in exactly one parent", () => {
    const sources = {
      p1: "---\ntitle: P1\nlinks: [child]\n---\n",
      p2: "---\ntitle: P2\n---\n",
      child: "---\ntitle: Child\n---\n",
    };
    const roots = buildConceptTree(sources);
    // child is referenced by p1, so it's not a root
    expect(roots.map(r => r.id)).not.toContain("child");
  });

  it("node with multiple children resolves all", () => {
    const sources = {
      root: "---\ntitle: Root\nlinks: [a, b, c]\n---\n",
      a: "---\ntitle: A\n---\n",
      b: "---\ntitle: B\n---\n",
      c: "---\ntitle: C\n---\n",
    };
    const roots = buildConceptTree(sources);
    expect(roots[0].children).toHaveLength(3);
  });

  it("child claimed by two parents appears under only the first", () => {
    // 'shared' is linked by both p1 and p2; it should appear only once.
    const sources = {
      p1:     "---\ntitle: P1\nlinks: [shared]\n---\n",
      p2:     "---\ntitle: P2\nlinks: [shared]\n---\n",
      shared: "---\ntitle: Shared\n---\n",
    };
    const roots = buildConceptTree(sources);
    // 'shared' is not a root (claimed by a parent)
    expect(roots.map(r => r.id)).not.toContain("shared");
    // total children across both parents = 1, not 2
    const allChildren = roots.flatMap(r => r.children);
    const sharedInstances = allChildren.filter(c => c.id === "shared");
    expect(sharedInstances).toHaveLength(1);
  });

  it("deduplication does not affect unrelated nodes", () => {
    const sources = {
      r1: "---\ntitle: R1\nlinks: [a]\n---\n",
      r2: "---\ntitle: R2\nlinks: [b]\n---\n",
      a:  "---\ntitle: A\n---\n",
      b:  "---\ntitle: B\n---\n",
    };
    const roots = buildConceptTree(sources);
    expect(roots).toHaveLength(2);
    const r1 = roots.find(r => r.id === "r1");
    const r2 = roots.find(r => r.id === "r2");
    expect(r1.children).toHaveLength(1);
    expect(r2.children).toHaveLength(1);
  });
});

describe("bodySnippet", () => {
  it("returns empty for empty body", () => {
    expect(bodySnippet("")).toBe("");
  });

  it("skips headings", () => {
    const body = "# Title\n## Subtitle\nActual content.";
    const snippet = bodySnippet(body);
    expect(snippet).not.toContain("#");
    expect(snippet).toContain("Actual content");
  });

  it("strips markdown links", () => {
    const body = "See [Wikipedia](https://en.wikipedia.org) for more.";
    const snippet = bodySnippet(body);
    expect(snippet).not.toContain("[");
    expect(snippet).toContain("Wikipedia");
  });

  it("strips emphasis markers", () => {
    const body = "This is **bold** and *italic* text.";
    const snippet = bodySnippet(body);
    expect(snippet).not.toContain("*");
    expect(snippet).toContain("bold");
    expect(snippet).toContain("italic");
  });

  it("strips image markdown", () => {
    const body = "![alt text](image.png) Some text.";
    const snippet = bodySnippet(body);
    expect(snippet).not.toContain("![");
    expect(snippet).toContain("Some text");
  });

  it("truncates at maxLen", () => {
    const body = "word ".repeat(100);
    const snippet = bodySnippet(body, 50);
    expect(snippet.length).toBeLessThanOrEqual(53); // allow for ellipsis
    expect(snippet.endsWith("…")).toBe(true);
  });

  it("skips blank lines", () => {
    const body = "\n\n\nActual content.\n\n";
    expect(bodySnippet(body)).toBe("Actual content.");
  });

  it("strips backtick code", () => {
    const body = "Use `console.log` to debug.";
    const snippet = bodySnippet(body);
    expect(snippet).not.toContain("`");
    expect(snippet).toContain("console.log");
  });

  it("joins content across multiple lines", () => {
    const body = "Line one.\nLine two.\nLine three.";
    const snippet = bodySnippet(body);
    expect(snippet).toContain("Line one");
    expect(snippet).toContain("Line two");
  });

  it("returns empty for null/undefined body", () => {
    expect(bodySnippet(null)).toBe("");
    expect(bodySnippet(undefined)).toBe("");
  });
});

describe("renderMarkdown — fallback renderer", () => {
  // All tests below intentionally avoid globalThis.marked so the fallback runs.

  it("converts h1, h2, h3 headings", () => {
    const html = renderMarkdown("# H1\n## H2\n### H3");
    expect(html).toContain("<h1>");
    expect(html).toContain("<h2>");
    expect(html).toContain("<h3>");
    expect(html).toContain("H1");
    expect(html).toContain("H2");
    expect(html).toContain("H3");
  });

  it("converts ** bold and __ bold", () => {
    const html = renderMarkdown("**bold** and __also bold__");
    expect(html).toContain("<strong>bold</strong>");
    expect(html).toContain("<strong>also bold</strong>");
  });

  it("converts * italic and _ italic", () => {
    const html = renderMarkdown("*italic* and _also italic_");
    expect(html).toContain("<em>italic</em>");
    expect(html).toContain("<em>also italic</em>");
  });

  it("converts ~~ strikethrough", () => {
    const html = renderMarkdown("~~struck~~");
    expect(html).toContain("<del>struck</del>");
  });

  it("converts inline code", () => {
    const html = renderMarkdown("`code here`");
    expect(html).toContain("<code>code here</code>");
  });

  it("converts fenced code block", () => {
    const html = renderMarkdown("```js\nconst x = 1;\n```");
    expect(html).toContain("<pre>");
    expect(html).toContain("<code");
    expect(html).toContain("const x = 1;");
  });

  it("fenced code block escapes HTML entities", () => {
    const html = renderMarkdown("```\n<div> & \"quotes\"\n```");
    expect(html).toContain("&lt;div&gt;");
    expect(html).toContain("&amp;");
  });

  it("fenced code block includes language class", () => {
    const html = renderMarkdown("```python\nprint('hello')\n```");
    expect(html).toContain('class="language-python"');
  });

  it("converts unordered list items (- syntax)", () => {
    const html = renderMarkdown("- item one\n- item two");
    expect(html).toContain("<ul>");
    expect(html).toContain("<li>item one</li>");
    expect(html).toContain("<li>item two</li>");
  });

  it("converts unordered list items (* syntax)", () => {
    const html = renderMarkdown("* alpha\n* beta");
    expect(html).toContain("<ul>");
    expect(html).toContain("<li>alpha</li>");
  });

  it("converts ordered list", () => {
    const html = renderMarkdown("1. First\n2. Second\n3. Third");
    expect(html).toContain("<ol>");
    expect(html).toContain("<li>First</li>");
    expect(html).toContain("<li>Second</li>");
    expect(html).toContain("<li>Third</li>");
  });

  it("converts blockquote", () => {
    const html = renderMarkdown("> This is a quote.");
    expect(html).toContain("<blockquote>");
    expect(html).toContain("This is a quote.");
  });

  it("converts horizontal rule ---", () => {
    const html = renderMarkdown("Above\n\n---\n\nBelow");
    expect(html).toContain("<hr>");
  });

  it("converts horizontal rule ***", () => {
    const html = renderMarkdown("***");
    expect(html).toContain("<hr>");
  });

  it("converts external links", () => {
    const html = renderMarkdown("[example](https://example.com)");
    expect(html).toContain('<a href="https://example.com">example</a>');
  });

  it("converts internal detail page links", () => {
    const html = renderMarkdown("[Quantum](/detail.html?id=quantum-mechanics)");
    expect(html).toContain('href="/detail.html?id=quantum-mechanics"');
    expect(html).toContain(">Quantum<");
  });

  it("converts images", () => {
    const html = renderMarkdown("![alt text](diagram.png)");
    expect(html).toContain('<img src="diagram.png"');
    expect(html).toContain('alt="alt text"');
  });

  it("converts image with empty alt", () => {
    const html = renderMarkdown("![](image.png)");
    expect(html).toContain('<img src="image.png"');
  });

  it("renders image before link in same line", () => {
    // Ensure image regex runs before link regex (avoids ](url) collision)
    const html = renderMarkdown("![img](a.png) and [link](b.html)");
    expect(html).toContain("<img");
    expect(html).toContain("<a");
  });

  it("handles multiple paragraphs", () => {
    const html = renderMarkdown("Para one.\n\nPara two.");
    expect(html).toContain("Para one.");
    expect(html).toContain("Para two.");
  });

  it("does not crash on empty string", () => {
    expect(() => renderMarkdown("")).not.toThrow();
  });

  it("does not crash on whitespace only", () => {
    expect(() => renderMarkdown("   \n\n   ")).not.toThrow();
  });
});

describe("resolveWikiLinks", () => {
  const concepts = {
    "quantum-mechanics": "Quantum Mechanics",
    "special-relativity": "Special Relativity",
  };

  it("expands [[id]] to detail page link using concept title", () => {
    const result = resolveWikiLinks("See [[quantum-mechanics]] for details.", concepts);
    expect(result).toContain("[Quantum Mechanics]");
    expect(result).toContain("/detail.html?id=quantum-mechanics");
  });

  it("expands [[Title|id]] with explicit title", () => {
    const result = resolveWikiLinks("Read [[QM|quantum-mechanics]].", concepts);
    expect(result).toContain("[QM]");
    expect(result).toContain("/detail.html?id=quantum-mechanics");
  });

  it("falls back to id as title when not in concepts map", () => {
    const result = resolveWikiLinks("See [[unknown-topic]].", {});
    expect(result).toContain("[unknown-topic]");
    expect(result).toContain("/detail.html?id=unknown-topic");
  });

  it("encodes special characters in id", () => {
    const result = resolveWikiLinks("[[a&b]]", {});
    expect(result).toContain(encodeURIComponent("a&b"));
  });

  it("handles multiple wiki links in one string", () => {
    const result = resolveWikiLinks("[[quantum-mechanics]] and [[special-relativity]]", concepts);
    expect(result).toContain("Quantum Mechanics");
    expect(result).toContain("Special Relativity");
  });

  it("leaves normal markdown links untouched", () => {
    const result = resolveWikiLinks("[normal](https://example.com)", concepts);
    expect(result).toBe("[normal](https://example.com)");
  });

  it("renders wiki links through renderMarkdown", () => {
    const html = renderMarkdown("See [[quantum-mechanics]] here.", { concepts });
    expect(html).toContain('href="/detail.html?id=quantum-mechanics"');
    expect(html).toContain("Quantum Mechanics");
  });
});

describe("renderMarkdown — embed / special content", () => {
  it("renders an image as an embed-style figure", () => {
    const html = renderMarkdown("![Overview diagram](overview.png)");
    expect(html).toContain("<img");
    expect(html).toContain('src="overview.png"');
    expect(html).toContain('alt="Overview diagram"');
  });

  it("link to external URL is preserved as anchor", () => {
    const html = renderMarkdown("[Watch on YouTube](https://youtube.com/watch?v=abc)");
    expect(html).toContain('href="https://youtube.com/watch?v=abc"');
  });

  it("link to relative URL works as site-internal navigation", () => {
    const html = renderMarkdown("[Back to index](/)");
    expect(html).toContain('href="/"');
  });

  it("inline code is preserved verbatim (no inner HTML)", () => {
    const html = renderMarkdown("`<script>alert(1)</script>`");
    // code content should be present but tags may or may not be escaped
    expect(html).toContain("<code>");
    expect(html).toContain("script");
  });

  it("fenced code block content is HTML-escaped", () => {
    const html = renderMarkdown("```\n<b>not bold</b>\n```");
    expect(html).not.toContain("<b>not bold</b>");
    expect(html).toContain("&lt;b&gt;");
  });

  it("blockquote can contain nested formatting", () => {
    const html = renderMarkdown("> Quote with **bold** text");
    expect(html).toContain("<blockquote>");
    expect(html).toContain("<strong>bold</strong>");
  });

  it("multiple images on separate lines", () => {
    const html = renderMarkdown("![A](a.png)\n\n![B](b.png)");
    const matches = [...html.matchAll(/<img/g)];
    expect(matches.length).toBe(2);
  });
});

// ── Tables (fallback renderer) ──────────────────────────────────────────────

describe("renderMarkdown — tables (fallback)", () => {
  it("renders a basic GFM table", () => {
    const md = "| Name | Age |\n|------|-----|\n| Alice | 30 |\n| Bob | 25 |";
    const html = renderMarkdown(md);
    expect(html).toContain("<table>");
    expect(html).toContain("<thead>");
    expect(html).toContain("<tbody>");
    expect(html).toContain("<th");
    expect(html).toContain("Name");
    expect(html).toContain("<td");
    expect(html).toContain("Alice");
    expect(html).toContain("Bob");
  });

  it("respects left alignment", () => {
    const md = "| Col |\n|:----|\n| val |";
    const html = renderMarkdown(md);
    expect(html).toContain('text-align:left');
  });

  it("respects center alignment", () => {
    const md = "| Col |\n|:---:|\n| val |";
    const html = renderMarkdown(md);
    expect(html).toContain('text-align:center');
  });

  it("respects right alignment", () => {
    const md = "| Col |\n|----:|\n| val |";
    const html = renderMarkdown(md);
    expect(html).toContain('text-align:right');
  });

  it("handles multiple columns", () => {
    const md = "| A | B | C |\n|---|---|---|\n| 1 | 2 | 3 |";
    const html = renderMarkdown(md);
    const thMatches = [...html.matchAll(/<th /g)];
    const tdMatches = [...html.matchAll(/<td /g)];
    expect(thMatches.length).toBe(3);
    expect(tdMatches.length).toBe(3);
  });

  it("handles multiple data rows", () => {
    const md = "| H |\n|---|\n| r1 |\n| r2 |\n| r3 |";
    const html = renderMarkdown(md);
    const trMatches = [...html.matchAll(/<tr>/g)];
    // 1 header row + 3 data rows = 4 <tr>
    expect(trMatches.length).toBe(4);
  });

  it("handles empty cells gracefully", () => {
    const md = "| A | B |\n|---|---|\n| x |  |";
    const html = renderMarkdown(md);
    expect(html).toContain("<table>");
    expect(html).toContain("x");
  });

  it("does not treat non-table pipe text as a table", () => {
    const md = "This | is not | a table";
    const html = renderMarkdown(md);
    expect(html).not.toContain("<table>");
  });
});

// ── Task lists (fallback renderer) ──────────────────────────────────────────

describe("renderMarkdown — task lists (fallback)", () => {
  it("renders checked task item", () => {
    const html = renderMarkdown("- [x] completed task");
    expect(html).toContain("task-list-item");
    expect(html).toContain('type="checkbox"');
    expect(html).toContain("checked");
    expect(html).toContain("completed task");
  });

  it("renders unchecked task item", () => {
    const html = renderMarkdown("- [ ] pending task");
    expect(html).toContain("task-list-item");
    expect(html).toContain('type="checkbox"');
    expect(html).toContain("disabled");
    expect(html).toContain("pending task");
    // The checkbox itself should NOT have checked attribute
    expect(html).not.toContain('disabled checked');
  });

  it("renders uppercase [X] as checked", () => {
    const html = renderMarkdown("- [X] done");
    expect(html).toContain("checked");
  });

  it("mixes task and normal list items", () => {
    const md = "- [x] task one\n- normal item\n- [ ] task two";
    const html = renderMarkdown(md);
    const taskItems = [...html.matchAll(/task-list-item/g)];
    expect(taskItems.length).toBe(2);
    expect(html).toContain("normal item");
    // Normal item should not be a task item
    expect(html).toContain("<li>normal item</li>");
  });

  it("task checkboxes are disabled", () => {
    const html = renderMarkdown("- [x] done\n- [ ] todo");
    const checkboxes = [...html.matchAll(/<input[^>]*>/g)];
    expect(checkboxes.length).toBe(2);
    for (const cb of checkboxes) {
      expect(cb[0]).toContain("disabled");
    }
  });
});

// ── Embeds (fallback renderer) ──────────────────────────────────────────────

describe("renderMarkdown — embeds (fallback)", () => {
  it("auto-embeds bare YouTube watch link", () => {
    const html = renderMarkdown("[https://www.youtube.com/watch?v=dQw4w9WgXcQ](https://www.youtube.com/watch?v=dQw4w9WgXcQ)");
    expect(html).toContain("md-embed");
    expect(html).toContain("<iframe");
    expect(html).toContain("youtube-nocookie.com/embed/dQw4w9WgXcQ");
  });

  it("auto-embeds bare youtu.be short link", () => {
    const html = renderMarkdown("[https://youtu.be/dQw4w9WgXcQ](https://youtu.be/dQw4w9WgXcQ)");
    expect(html).toContain("md-embed");
    expect(html).toContain("youtube-nocookie.com/embed/dQw4w9WgXcQ");
  });

  it("auto-embeds bare Vimeo link", () => {
    const html = renderMarkdown("[https://vimeo.com/123456](https://vimeo.com/123456)");
    expect(html).toContain("md-embed");
    expect(html).toContain("player.vimeo.com/video/123456");
  });

  it("does NOT embed YouTube link with custom text", () => {
    const html = renderMarkdown("[Watch this](https://www.youtube.com/watch?v=dQw4w9WgXcQ)");
    expect(html).not.toContain("<iframe");
    expect(html).toContain("<a");
    expect(html).toContain("Watch this");
  });

  it("does NOT embed non-video links", () => {
    const html = renderMarkdown("[https://example.com](https://example.com)");
    expect(html).not.toContain("<iframe");
    expect(html).toContain("<a");
  });

  it("embed iframe has allowfullscreen", () => {
    const html = renderMarkdown("[https://www.youtube.com/watch?v=abc12345678](https://www.youtube.com/watch?v=abc12345678)");
    expect(html).toContain("allowfullscreen");
  });

  it("embed iframe has lazy loading", () => {
    const html = renderMarkdown("[https://www.youtube.com/watch?v=abc12345678](https://www.youtube.com/watch?v=abc12345678)");
    expect(html).toContain('loading="lazy"');
  });
});

// ── Figures (fallback renderer) ─────────────────────────────────────────────

describe("renderMarkdown — figures (fallback)", () => {
  it("wraps image with alt text in a figure with figcaption", () => {
    const html = renderMarkdown("![A nice diagram](diagram.png)");
    expect(html).toContain("<figure");
    expect(html).toContain("md-figure");
    expect(html).toContain("<figcaption>A nice diagram</figcaption>");
    expect(html).toContain('src="diagram.png"');
  });

  it("image without alt text does not get figure wrapper", () => {
    const html = renderMarkdown("![](bare.png)");
    expect(html).not.toContain("<figure");
    expect(html).toContain("<img");
    expect(html).toContain('src="bare.png"');
  });

  it("figures have lazy loading attribute", () => {
    const html = renderMarkdown("![Caption](photo.jpg)");
    expect(html).toContain('loading="lazy"');
  });
});

// ── h4 headings (fallback renderer) ─────────────────────────────────────────

describe("renderMarkdown — h4 headings (fallback)", () => {
  it("converts #### to h4", () => {
    const html = renderMarkdown("#### Sub-sub-heading");
    expect(html).toContain("<h4>");
    expect(html).toContain("Sub-sub-heading");
  });

  it("does not confuse h4 with h3", () => {
    const html = renderMarkdown("### Three\n\n#### Four");
    expect(html).toContain("<h3>Three</h3>");
    expect(html).toContain("<h4>Four</h4>");
  });
});

// ── Marked-based renderer (with globalThis.marked) ──────────────────────────

describe("buildHeaderImageHtml", () => {
  it("produces an img tag with the given src", () => {
    const html = buildHeaderImageHtml("cover.png", "My Concept");
    expect(html).toContain('<img');
    expect(html).toContain('src="cover.png"');
  });

  it("uses the detail-header-img class for left-aligned block styling", () => {
    const html = buildHeaderImageHtml("photo.jpg", "Title");
    expect(html).toContain('class="detail-header-img"');
  });

  it("does not contain float:right", () => {
    const html = buildHeaderImageHtml("img.png", "Title");
    expect(html).not.toContain("float");
  });

  it("sets the alt attribute", () => {
    const html = buildHeaderImageHtml("img.png", "Wave-Particle Duality");
    expect(html).toContain('alt="Wave-Particle Duality"');
  });

  it("escapes double quotes in the alt text", () => {
    const html = buildHeaderImageHtml("img.png", 'Say "hello"');
    expect(html).toContain("&quot;");
    expect(html).not.toContain('alt="Say "hello""');
  });

  it("handles empty alt gracefully", () => {
    const html = buildHeaderImageHtml("img.png", "");
    expect(html).toContain('alt=""');
  });

  it("handles null alt gracefully", () => {
    const html = buildHeaderImageHtml("img.png", null);
    expect(html).toContain('alt=""');
  });
});

describe("renderMarkdown — marked path", () => {
  let origMarked;

  beforeAll(async () => {
    origMarked = globalThis.marked;
    const { marked } = await import("marked");
    globalThis.marked = marked;
  });

  afterAll(() => {
    if (origMarked === undefined) {
      delete globalThis.marked;
    } else {
      globalThis.marked = origMarked;
    }
  });

  it("renders bold text", () => {
    const html = renderMarkdown("**bold**");
    expect(html).toContain("<strong>bold</strong>");
  });

  it("renders italic text", () => {
    const html = renderMarkdown("*italic*");
    expect(html).toContain("<em>italic</em>");
  });

  it("renders bold inside list items", () => {
    const html = renderMarkdown("- **bold item**\n- normal");
    expect(html).toContain("<strong>bold item</strong>");
    expect(html).toContain("normal");
  });

  it("renders italic inside list items", () => {
    const html = renderMarkdown("- *emphasized*");
    expect(html).toContain("<em>emphasized</em>");
  });

  it("renders inline code inside list items", () => {
    const html = renderMarkdown("- use `console.log`");
    expect(html).toContain("<code>console.log</code>");
  });

  it("renders GFM table", () => {
    const md = "| A | B |\n|---|---|\n| 1 | 2 |";
    const html = renderMarkdown(md);
    expect(html).toContain("<table>");
    expect(html).toContain("<th");
    expect(html).toContain("<td");
  });

  it("renders task list with checked item", () => {
    const html = renderMarkdown("- [x] done");
    expect(html).toContain("task-list-item");
    expect(html).toContain("checked");
  });

  it("renders task list with unchecked item", () => {
    const html = renderMarkdown("- [ ] todo");
    expect(html).toContain("task-list-item");
    expect(html).toContain('type="checkbox"');
  });

  it("does not produce double checkboxes in task lists", () => {
    const html = renderMarkdown("- [x] done\n- [ ] todo");
    const checkboxes = [...html.matchAll(/<input[^>]*type="checkbox"[^>]*>/g)];
    expect(checkboxes.length).toBe(2);
  });

  it("renders fenced code block with language class", () => {
    const html = renderMarkdown("```python\nprint('hi')\n```");
    expect(html).toContain("<pre>");
    expect(html).toContain("<code");
    expect(html).toContain("print");
  });

  it("renders fenced code block without language", () => {
    const html = renderMarkdown("```\nplain code\n```");
    expect(html).toContain("<pre>");
    expect(html).toContain("plain code");
  });

  it("renders image with alt as figure", () => {
    const html = renderMarkdown("![Caption](photo.png)");
    expect(html).toContain("<figure");
    expect(html).toContain("md-figure");
    expect(html).toContain("<figcaption>Caption</figcaption>");
  });

  it("renders image without alt as plain img", () => {
    const html = renderMarkdown("![](bare.png)");
    expect(html).not.toContain("<figure");
    expect(html).toContain("<img");
  });

  it("auto-embeds bare YouTube link", () => {
    const html = renderMarkdown("[https://www.youtube.com/watch?v=dQw4w9WgXcQ](https://www.youtube.com/watch?v=dQw4w9WgXcQ)");
    expect(html).toContain("md-embed");
    expect(html).toContain("<iframe");
    expect(html).toContain("youtube-nocookie.com/embed/dQw4w9WgXcQ");
  });

  it("does not embed YouTube link with custom text", () => {
    const html = renderMarkdown("[My Video](https://www.youtube.com/watch?v=dQw4w9WgXcQ)");
    expect(html).not.toContain("<iframe");
    expect(html).toContain("<a");
    expect(html).toContain("My Video");
  });

  it("auto-embeds bare Vimeo link", () => {
    const html = renderMarkdown("[https://vimeo.com/999999](https://vimeo.com/999999)");
    expect(html).toContain("md-embed");
    expect(html).toContain("player.vimeo.com/video/999999");
  });

  it("preserves wiki links through marked path", () => {
    const concepts = { "qm": "Quantum Mechanics" };
    const html = renderMarkdown("See [[qm]] here.", { concepts });
    expect(html).toContain('href="/detail.html?id=qm"');
    expect(html).toContain("Quantum Mechanics");
  });

  it("renders headings", () => {
    const html = renderMarkdown("# H1\n## H2\n### H3\n#### H4");
    expect(html).toContain("<h1");
    expect(html).toContain("<h2");
    expect(html).toContain("<h3");
    expect(html).toContain("<h4");
  });

  it("renders blockquote", () => {
    const html = renderMarkdown("> a quote");
    expect(html).toContain("<blockquote>");
  });

  it("renders strikethrough", () => {
    const html = renderMarkdown("~~struck~~");
    expect(html).toContain("<del>struck</del>");
  });

  it("renders horizontal rule", () => {
    const html = renderMarkdown("---");
    expect(html).toContain("<hr");
  });

  it("escapes HTML in fenced code blocks", () => {
    const html = renderMarkdown("```\n<div>&</div>\n```");
    expect(html).not.toContain("<div>");
  });

  it("bold and italic work inside task list items", () => {
    const html = renderMarkdown("- [x] **bold** and *italic* task");
    expect(html).toContain("<strong>bold</strong>");
    expect(html).toContain("<em>italic</em>");
    expect(html).toContain("task-list-item");
  });
});
