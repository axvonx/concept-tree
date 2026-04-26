/**
 * index.test.js — Integration tests for the ConceptTree public API.
 *
 * These tests run in jsdom so DOM APIs are available. The d3-force
 * simulation is mocked (no CDN needed) so tests run fully offline.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { setD3Force } from "../src/physics.js";
import { ConceptTree, parseFrontmatter, buildConceptTree } from "../src/index.js";

// ── D3-force mock ────────────────────────────────────────────────────────────
// Provides the minimum API surface that createSimulation calls.

function makeMockSim(nodes) {
  const sim = {
    nodes,
    _forces: {},
    force(name, f) {
      if (f === undefined) return this._forces[name];
      this._forces[name] = f;
      return this;
    },
    alphaDecay() { return this; },
    stop() { return this; },
    restart() { return this; },
    alphaTarget() { return this; },
    alpha() { return this; },
    tick() {
      // Assign stable positions based on bx/by so bounds are predictable
      for (const n of nodes) {
        n.x = n.bx || 0;
        n.y = n.by || 0;
        n.vx = 0;
        n.vy = 0;
      }
      return this;
    },
  };
  return sim;
}

const mockD3 = {
  forceSimulation(nodes) { return makeMockSim(nodes); },
  forceLink(links) {
    const fl = {
      id(fn)       { return this; },
      distance(d)  { return this; },
      strength(s)  { return this; },
    };
    return fl;
  },
  forceManyBody() {
    return { strength(s) { return this; } };
  },
  forceX(fn) { return { strength(s) { return this; } }; },
  forceY(fn) { return { strength(s) { return this; } }; },
  forceCollide(r) { return { strength(s) { return this; } }; },
};

setD3Force(mockD3);

// ── Canvas mock ──────────────────────────────────────────────────────────────
// jsdom doesn't implement canvas — stub getContext so the render loop doesn't crash.
const noop = () => {};
const mockCtx2d = new Proxy({}, {
  get: () => function() { return mockCtx2d; },
});
HTMLCanvasElement.prototype.getContext = () => mockCtx2d;

// ── Sample markdown sources ──────────────────────────────────────────────────

const SOURCES = {
  root: "---\ntitle: Root\ntags: [science]\nlinks: [child1, child2]\n---\n\n# Root\nRoot content.",
  child1: "---\ntitle: Child One\ntags: [science]\n---\n\n# Child One\nChild 1 content.",
  child2: "---\ntitle: Child Two\ntags: [math]\n---\n\n# Child Two\nChild 2 content.",
};

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeContainer() {
  const div = document.createElement("div");
  div.style.width = "800px";
  div.style.height = "600px";
  Object.defineProperty(div, "clientWidth", { get: () => 800, configurable: true });
  document.body.appendChild(div);
  return div;
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("ConceptTree constructor", () => {
  it("constructs without throwing", () => {
    const div = makeContainer();
    expect(() => new ConceptTree(div)).not.toThrow();
    div.remove();
  });

  it("accepts dark theme string", () => {
    const div = makeContainer();
    const t = new ConceptTree(div, { theme: "dark" });
    expect(t._theme.bg).toBeDefined();
    div.remove();
  });

  it("accepts light theme string", () => {
    const div = makeContainer();
    const t = new ConceptTree(div, { theme: "light" });
    expect(t._theme.bg).not.toBe("#1a1d23");
    div.remove();
  });

  it("accepts custom theme object", () => {
    const div = makeContainer();
    const t = new ConceptTree(div, { theme: { bg: "#ff0000", accent: "#00ff00" } });
    expect(t._theme.bg).toBe("#ff0000");
    expect(t._theme.accent).toBe("#00ff00");
    div.remove();
  });
});

describe("ConceptTree.loadMarkdownSources", () => {
  let container, tree;

  beforeEach(async () => {
    container = makeContainer();
    tree = new ConceptTree(container, { physics: { preSettleIterations: 1 } });
    await tree.loadMarkdownSources(SOURCES);
  });

  afterEach(() => {
    tree.destroy();
    container.remove();
  });

  it("creates a canvas element inside the container", () => {
    const canvas = container.querySelector("canvas");
    expect(canvas).toBeTruthy();
  });

  it("getNodes returns all concepts", () => {
    const nodes = tree.getNodes();
    expect(nodes).toHaveLength(3);
    const ids = nodes.map(n => n.id).sort();
    expect(ids).toEqual(["child1", "child2", "root"]);
  });

  it("getNode returns full concept data", () => {
    const node = tree.getNode("root");
    expect(node.title).toBe("Root");
    expect(node.tags).toEqual(["science"]);
    expect(node.body).toContain("Root content");
    expect(node.bodyHtml).toContain("<h1>");
    expect(node.links).toEqual(["child1", "child2"]);
  });

  it("getNode returns null for unknown id", () => {
    expect(tree.getNode("nonexistent")).toBeNull();
  });

  it("getRoots returns the forest roots", () => {
    const roots = tree.getRoots();
    expect(roots).toHaveLength(1);
    expect(roots[0].id).toBe("root");
  });

  it("getTagCounts returns tag frequencies", () => {
    const counts = tree.getTagCounts();
    const tags = Object.fromEntries(counts);
    expect(tags.science).toBe(2);
    expect(tags.math).toBe(1);
  });
});

describe("ConceptTree.addNode / removeNode", () => {
  let container, tree;

  beforeEach(async () => {
    container = makeContainer();
    tree = new ConceptTree(container, { physics: { preSettleIterations: 1 } });
    await tree.loadMarkdownSources({
      root: "---\ntitle: Root\nlinks: [child]\n---\n# Root",
      child: "---\ntitle: Child\n---\n# Child",
    });
  });

  afterEach(() => {
    tree.destroy();
    container.remove();
  });

  it("addNode adds a new concept", async () => {
    await tree.addNode("new-node", "---\ntitle: New\n---\n# New");
    const node = tree.getNode("new-node");
    expect(node).toBeTruthy();
    expect(node.title).toBe("New");
  });

  it("addNode increases node count", async () => {
    const before = tree.getNodes().length;
    await tree.addNode("extra", "---\ntitle: Extra\n---\n# Extra");
    expect(tree.getNodes().length).toBe(before + 1);
  });

  it("removeNode removes the concept", async () => {
    await tree.removeNode("child");
    expect(tree.getNode("child")).toBeNull();
  });

  it("removeNode decreases node count", async () => {
    const before = tree.getNodes().length;
    await tree.removeNode("child");
    expect(tree.getNodes().length).toBe(before - 1);
  });
});

describe("ConceptTree.setPhysics / getPhysics", () => {
  let container, tree;

  beforeEach(async () => {
    container = makeContainer();
    tree = new ConceptTree(container, { physics: { preSettleIterations: 1 } });
    await tree.loadMarkdownSources(SOURCES);
  });

  afterEach(() => {
    tree.destroy();
    container.remove();
  });

  it("getPhysics returns merged defaults", () => {
    const physics = tree.getPhysics();
    expect(physics.chargeStrength).toBeDefined();
    expect(physics.preSettleIterations).toBe(1);
  });

  it("setPhysics merges with existing", async () => {
    await tree.setPhysics({ chargeStrength: -99 });
    expect(tree.getPhysics().chargeStrength).toBe(-99);
  });
});

describe("ConceptTree events", () => {
  let container, tree;

  beforeEach(async () => {
    container = makeContainer();
    tree = new ConceptTree(container, { physics: { preSettleIterations: 1 } });
    await tree.loadMarkdownSources(SOURCES);
  });

  afterEach(() => {
    tree.destroy();
    container.remove();
  });

  it("on/off work without throwing", () => {
    const fn = vi.fn();
    tree.on("nodeClick", fn);
    tree.off("nodeClick", fn);
    tree._emit("nodeClick", {});
    expect(fn).not.toHaveBeenCalled();
  });

  it("emit triggers registered listeners", () => {
    const fn = vi.fn();
    tree.on("nodeClick", fn);
    tree._emit("nodeClick", { id: "test" });
    expect(fn).toHaveBeenCalledWith({ id: "test" });
  });

  it("multiple listeners on same event all fire", () => {
    const fn1 = vi.fn(), fn2 = vi.fn();
    tree.on("nodeHover", fn1);
    tree.on("nodeHover", fn2);
    tree._emit("nodeHover", {});
    expect(fn1).toHaveBeenCalled();
    expect(fn2).toHaveBeenCalled();
  });
});

describe("ConceptTree.setActiveNode", () => {
  let container, tree;

  beforeEach(async () => {
    container = makeContainer();
    tree = new ConceptTree(container, { physics: { preSettleIterations: 1 } });
    await tree.loadMarkdownSources(SOURCES);
  });

  afterEach(() => {
    tree.destroy();
    container.remove();
  });

  it("sets activeId in state", () => {
    tree.setActiveNode("root");
    expect(tree._state.activeId).toBe("root");
  });

  it("does not throw for unknown id", () => {
    expect(() => tree.setActiveNode("nonexistent")).not.toThrow();
  });
});

describe("ConceptTree.highlightTag / highlightTags", () => {
  let container, tree;

  beforeEach(async () => {
    container = makeContainer();
    tree = new ConceptTree(container, { physics: { preSettleIterations: 1 } });
    await tree.loadMarkdownSources(SOURCES);
  });

  afterEach(() => {
    tree.destroy();
    container.remove();
  });

  it("highlightTag stores a singleton Set in state", () => {
    tree.highlightTag("science");
    expect(tree._state.highlightTags).toBeInstanceOf(Set);
    expect(tree._state.highlightTags.has("science")).toBe(true);
    expect(tree._state.highlightTags.size).toBe(1);
  });

  it("highlightTag('') clears the highlight Set", () => {
    tree.highlightTag("science");
    tree.highlightTag("");
    expect(tree._state.highlightTags.size).toBe(0);
  });

  it("highlightTags stores multiple tags", () => {
    tree.highlightTags(["science", "math"]);
    expect(tree._state.highlightTags.has("science")).toBe(true);
    expect(tree._state.highlightTags.has("math")).toBe(true);
    expect(tree._state.highlightTags.size).toBe(2);
  });

  it("highlightTags with empty array clears filter", () => {
    tree.highlightTags(["science"]);
    tree.highlightTags([]);
    expect(tree._state.highlightTags.size).toBe(0);
  });

  it("initial state has empty highlightTags Set", () => {
    expect(tree._state.highlightTags).toBeInstanceOf(Set);
    expect(tree._state.highlightTags.size).toBe(0);
  });
});

describe("ConceptTree.setBookmarks / highlightNodeIds", () => {
  let container, tree;

  beforeEach(async () => {
    container = makeContainer();
    tree = new ConceptTree(container, { physics: { preSettleIterations: 1 } });
    await tree.loadMarkdownSources(SOURCES);
  });

  afterEach(() => {
    tree.destroy();
    container.remove();
  });

  it("initial state has empty bookmarks Set", () => {
    expect(tree._state.bookmarks).toBeInstanceOf(Set);
    expect(tree._state.bookmarks.size).toBe(0);
  });

  it("setBookmarks stores IDs as a Set", () => {
    tree.setBookmarks(["root", "child1"]);
    expect(tree._state.bookmarks.has("root")).toBe(true);
    expect(tree._state.bookmarks.has("child1")).toBe(true);
    expect(tree._state.bookmarks.size).toBe(2);
  });

  it("setBookmarks with empty array clears bookmarks", () => {
    tree.setBookmarks(["root"]);
    tree.setBookmarks([]);
    expect(tree._state.bookmarks.size).toBe(0);
  });

  it("initial state has empty highlightNodeIds Set", () => {
    expect(tree._state.highlightNodeIds).toBeInstanceOf(Set);
    expect(tree._state.highlightNodeIds.size).toBe(0);
  });

  it("highlightNodeIds stores IDs in state", () => {
    tree.highlightNodeIds(["root"]);
    expect(tree._state.highlightNodeIds.has("root")).toBe(true);
  });

  it("highlightNodeIds with empty array clears filter", () => {
    tree.highlightNodeIds(["root"]);
    tree.highlightNodeIds([]);
    expect(tree._state.highlightNodeIds.size).toBe(0);
  });
});

describe("ConceptTree.setTheme", () => {
  let container, tree;

  beforeEach(() => {
    container = makeContainer();
    tree = new ConceptTree(container);
  });

  afterEach(() => {
    tree.destroy();
    container.remove();
  });

  it("switches to light theme", () => {
    tree.setTheme("light");
    expect(tree._theme.bg).not.toBe("#1a1d23");
  });

  it("switches to dark theme", () => {
    tree.setTheme("light");
    tree.setTheme("dark");
    expect(tree._theme.bg).toBe("#0c0f14");
  });

  it("accepts partial custom theme", () => {
    tree.setTheme({ accent: "#ff0000" });
    expect(tree._theme.accent).toBe("#ff0000");
    expect(tree._theme.bg).toBeDefined();
  });
});

describe("ConceptTree.destroy", () => {
  it("clears the container", async () => {
    const container = makeContainer();
    const tree = new ConceptTree(container, { physics: { preSettleIterations: 1 } });
    await tree.loadMarkdownSources(SOURCES);
    expect(container.querySelector("canvas")).toBeTruthy();
    tree.destroy();
    expect(container.querySelector("canvas")).toBeFalsy();
    container.remove();
  });

  it("calling destroy twice does not throw", async () => {
    const container = makeContainer();
    const tree = new ConceptTree(container, { physics: { preSettleIterations: 1 } });
    await tree.loadMarkdownSources(SOURCES);
    tree.destroy();
    expect(() => tree.destroy()).not.toThrow();
    container.remove();
  });
});

// ── Re-exported utilities ─────────────────────────────────────────────────────

describe("re-exported utilities", () => {
  it("parseFrontmatter is exported", () => {
    expect(typeof parseFrontmatter).toBe("function");
  });

  it("buildConceptTree is exported", () => {
    expect(typeof buildConceptTree).toBe("function");
  });
});

// ── spacing option ────────────────────────────────────────────────────────────

describe("ConceptTree spacing option", () => {
  it("accepts spacing option without throwing", async () => {
    const container = makeContainer();
    const tree = new ConceptTree(container, {
      spacing: 1.5,
      physics: { preSettleIterations: 1 },
    });
    await expect(tree.loadMarkdownSources(SOURCES)).resolves.not.toThrow();
    tree.destroy();
    container.remove();
  });

  it("nodes spread further with spacing > 1", async () => {
    const container1 = makeContainer();
    const container2 = makeContainer();
    const tight = new ConceptTree(container1, { spacing: 0.5, physics: { preSettleIterations: 1 } });
    const spread = new ConceptTree(container2, { spacing: 2.0, physics: { preSettleIterations: 1 } });
    await tight.loadMarkdownSources(SOURCES);
    await spread.loadMarkdownSources(SOURCES);

    const tightNodes  = tight.getNodes().filter(n => n.id !== "root");
    const spreadNodes = spread.getNodes().filter(n => n.id !== "root");

    // Average distance from root in the spread tree should be larger
    const avgDist = nodes => {
      const root = nodes.find ? nodes : [];
      return nodes.reduce((s, n) => s + Math.hypot(n.x, n.y), 0) / Math.max(nodes.length, 1);
    };

    expect(avgDist(spreadNodes)).toBeGreaterThan(avgDist(tightNodes));
    tight.destroy(); spread.destroy();
    container1.remove(); container2.remove();
  });
});

// ── Resize recalculates fitParams ─────────────────────────────────────────────

describe("ConceptTree resize handling", () => {
  it("stores _effW, _effH, _fixedHeight after loadMarkdownSources", async () => {
    const container = makeContainer();
    const tree = new ConceptTree(container, { physics: { preSettleIterations: 1 } });
    await tree.loadMarkdownSources(SOURCES);
    expect(tree._effW).toBeGreaterThan(0);
    expect(tree._effH).toBeGreaterThan(0);
    expect(typeof tree._fixedHeight).toBe("number");
    tree.destroy();
    container.remove();
  });

  it("ResizeObserver callback updates logW and recalculates fitParams", async () => {
    let observerCallback;
    const origRO = globalThis.ResizeObserver;
    globalThis.ResizeObserver = class MockRO {
      constructor(cb) { observerCallback = cb; }
      observe() {}
      disconnect() {}
    };

    const container = makeContainer(); // clientWidth = 800
    const tree = new ConceptTree(container, { physics: { preSettleIterations: 1 } });
    await tree.loadMarkdownSources(SOURCES);

    const originalFitK = tree._state.fitParams.k;

    // Simulate resize to a wider container
    Object.defineProperty(container, "clientWidth", { get: () => 1600, configurable: true });
    // canvas pixel dimensions would differ — trigger the observer
    observerCallback([{}]);

    expect(tree._state.logW).toBe(1600);
    // fitParams should have been refreshed (cx/cy exist, k is a positive number)
    expect(tree._state.fitParams.k).toBeGreaterThan(0);
    expect(tree._state.fitParams.cx).toBeDefined();

    tree.destroy();
    container.remove();
    if (origRO) globalThis.ResizeObserver = origRO;
    else delete globalThis.ResizeObserver;
  });

  it("maxZoom option is stored on state", async () => {
    const container = makeContainer();
    const tree = new ConceptTree(container, {
      physics: { preSettleIterations: 1 },
      maxZoom: 3.0,
    });
    await tree.loadMarkdownSources(SOURCES);
    expect(tree._state.maxZoom).toBe(3.0);
    tree.destroy();
    container.remove();
  });

  it("window resize event updates logW and fitParams", async () => {
    const container = makeContainer(); // clientWidth = 800
    const tree = new ConceptTree(container, { physics: { preSettleIterations: 1 } });
    await tree.loadMarkdownSources(SOURCES);

    // Change the simulated container width
    Object.defineProperty(container, "clientWidth", { get: () => 1400, configurable: true });
    // Fire the native window resize event — our handler should pick this up
    window.dispatchEvent(new Event("resize"));

    expect(tree._state.logW).toBe(1400);
    expect(tree._state.fitParams.k).toBeGreaterThan(0);
    tree.destroy();
    container.remove();
  });

  it("destroy removes window resize listener", async () => {
    const container = makeContainer();
    const tree = new ConceptTree(container, { physics: { preSettleIterations: 1 } });
    await tree.loadMarkdownSources(SOURCES);
    tree.destroy();

    // After destroy, state is null — dispatching resize should not throw
    Object.defineProperty(container, "clientWidth", { get: () => 999, configurable: true });
    expect(() => window.dispatchEvent(new Event("resize"))).not.toThrow();
    container.remove();
  });
});
