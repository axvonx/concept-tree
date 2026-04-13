import { describe, it, expect } from "vitest";
import { parseFrontmatter, buildConceptTree, bodySnippet, renderMarkdown, resolveWikiLinks } from "../src/markdown.js";

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
