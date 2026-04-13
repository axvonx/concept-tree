/**
 * concept-tree — Interactive physics-based concept tree renderer.
 *
 * Usage:
 *   import { ConceptTree } from "concept-tree";
 *
 *   const tree = new ConceptTree(document.getElementById("container"), {
 *     theme: "dark",
 *     physics: { chargeStrength: -50 },
 *   });
 *
 *   tree.loadMarkdownSources({
 *     "science":  "---\ntitle: Science\nlinks:\n  - physics\n  - biology\n---\n# Science\n...",
 *     "physics":  "---\ntitle: Physics\n---\n# Physics\n...",
 *     "biology":  "---\ntitle: Biology\n---\n# Biology\n...",
 *   });
 *
 *   tree.on("nodeClick", (node) => console.log("Clicked:", node.id));
 */

import { DARK_THEME, LIGHT_THEME, TAG_COLORS, THEMES } from "./palette.js";
import { NODE_VARIANTS } from "./nodes.js";
import { buildConceptTree, parseFrontmatter, bodySnippet, renderMarkdown } from "./markdown.js";
import { buildGraph, detectTrunk, alignTrunk, buildGroups, treeLayout } from "./layout.js";
import { createSimulation, computeBounds, DEFAULT_PHYSICS, setD3Force } from "./physics.js";
import { render, NODE_W, NODE_H, STRIP_H, DOT_R } from "./renderer.js";
import { createHandlers, attachHandlers, lerpTransform, zoomIn, zoomOut, fitAll } from "./interaction.js";
import { initMiniMap, renderMiniMap } from "./mini-renderer.js";

export class ConceptTree {
  /**
   * @param {HTMLElement} container - DOM element to mount the canvas into
   * @param {Object} [options]
   * @param {string|Object} [options.theme="dark"] - "dark", "light", or custom theme object
   * @param {Object} [options.physics] - Physics overrides (see DEFAULT_PHYSICS)
   * @param {number} [options.xStep=142] - Horizontal spacing between nodes
   * @param {number} [options.yStep=104] - Vertical spacing between depth levels
   * @param {number} [options.spacing=1.0] - Global node density multiplier (>1 = more spread, <1 = tighter)
   */
  constructor(container, options = {}) {
    this._container = container;
    this._options = options;
    this._listeners = new Map();
    this._alive = false;
    this._state = null;
    this._detachHandlers = null;
    this._rafId = null;

    // Resolve theme
    if (typeof options.theme === "object") {
      this._theme = { ...DARK_THEME, ...options.theme };
    } else {
      this._theme = { ...(THEMES[options.theme]?.theme ?? DARK_THEME) };
    }

    // Apply initial CSS variables so page chrome matches theme from the start
    this.setTheme(this._theme);

    // Sources storage
    this._sources = {};
    this._roots = [];
  }

  // ── Event emitter ──────────────────────────────────────────────────────────

  on(event, fn) {
    if (!this._listeners.has(event)) this._listeners.set(event, []);
    this._listeners.get(event).push(fn);
    return this;
  }

  off(event, fn) {
    const fns = this._listeners.get(event);
    if (fns) {
      const idx = fns.indexOf(fn);
      if (idx !== -1) fns.splice(idx, 1);
    }
    return this;
  }

  _emit(event, ...args) {
    const fns = this._listeners.get(event) || [];
    for (const fn of fns) fn(...args);
  }

  // ── Data loading ───────────────────────────────────────────────────────────

  /**
   * Load concepts from a map of { id → markdown_source }.
   * Builds the tree and starts (or restarts) the visualization.
   */
  async loadMarkdownSources(sources) {
    this._sources = { ...this._sources, ...sources };
    this._roots = buildConceptTree(this._sources);
    await this._rebuild();
  }

  /**
   * Load concepts from a URL that returns JSON: { id: markdown_source, ... }
   */
  async loadFromURL(url) {
    const resp = await fetch(url);
    const sources = await resp.json();
    await this.loadMarkdownSources(sources);
  }

  /**
   * Add a single concept. If it references children that exist, they link up.
   */
  async addNode(id, markdownSource) {
    this._sources[id] = markdownSource;
    this._roots = buildConceptTree(this._sources);
    await this._rebuild();
  }

  /**
   * Remove a concept by ID.
   */
  async removeNode(id) {
    delete this._sources[id];
    // Also clean up references to this node in other sources
    for (const [key, src] of Object.entries(this._sources)) {
      const { meta, body } = parseFrontmatter(src);
      if (meta.links && meta.links.includes(id)) {
        meta.links = meta.links.filter(l => l !== id);
        this._sources[key] = this._rebuildSource(meta, body);
      }
    }
    this._roots = buildConceptTree(this._sources);
    await this._rebuild();
  }

  _rebuildSource(meta, body) {
    let fm = "---\n";
    for (const [k, v] of Object.entries(meta)) {
      if (Array.isArray(v)) {
        fm += `${k}: [${v.join(", ")}]\n`;
      } else {
        fm += `${k}: ${v}\n`;
      }
    }
    fm += "---\n\n";
    return fm + body;
  }

  // ── Physics ────────────────────────────────────────────────────────────────

  /**
   * Update physics configuration and restart simulation.
   */
  async setPhysics(overrides) {
    this._options.physics = { ...(this._options.physics || {}), ...overrides };
    if (this._state && this._state.sim) {
      await this._rebuild();
    }
  }

  /**
   * Get current physics configuration.
   */
  getPhysics() {
    return { ...DEFAULT_PHYSICS, ...(this._options.physics || {}) };
  }

  // ── Theme ──────────────────────────────────────────────────────────────────

  setTheme(theme) {
    if (typeof theme === "object") {
      this._theme = { ...DARK_THEME, ...theme };
    } else {
      this._theme = { ...(THEMES[theme]?.theme ?? DARK_THEME) };
    }
    if (this._state) this._state.theme = this._theme;
    // Sync CSS custom properties so the page chrome matches the theme
    if (typeof document !== "undefined") {
      const t = this._theme;
      const r = document.documentElement.style;
      if (t.bg)      r.setProperty("--bg",      t.bg);
      if (t.bg2)     r.setProperty("--bg2",     t.bg2);
      if (t.text)    r.setProperty("--text",    t.text);
      if (t.textDim) r.setProperty("--text2",   t.textDim);
      if (t.border)  r.setProperty("--border",  t.border);
      if (t.border)  r.setProperty("--border2", t.border);
      if (t.accent)  r.setProperty("--accent",  t.accent);
      if (t.accent)  r.setProperty("--accent2", t.accent);
      if (t.bg)      document.body.style.background = t.bg;
    }
  }

  // ── Active node ────────────────────────────────────────────────────────────

  setActiveNode(id) {
    if (this._state) {
      this._state.activeId = id;
      // Pan to the node
      const n = this._state.simNodes.find(n => n.id === id);
      if (n) {
        this._state.trTarget.tx = this._state.logW / 2 - n.x * this._state.trTarget.k;
        this._state.trTarget.ty = this._state.logH / 2 - n.y * this._state.trTarget.k;
      }
    }
  }

  /**
   * Highlight nodes with a specific tag. Pass "" or null to clear.
   * For multi-select, prefer highlightTags(Set).
   */
  highlightTag(tag) {
    if (this._state) this._state.highlightTags = tag ? new Set([tag]) : new Set();
  }

  /**
   * Highlight nodes matching any tag in the given iterable.
   * Pass an empty Set/array to show all nodes.
   */
  highlightTags(tags) {
    if (this._state) this._state.highlightTags = new Set(tags || []);
  }

  // ── Zoom controls ──────────────────────────────────────────────────────────

  zoomIn() { if (this._state) zoomIn(this._state); }
  zoomOut() { if (this._state) zoomOut(this._state); }
  fitAll() { if (this._state) fitAll(this._state); }

  // ── Query ──────────────────────────────────────────────────────────────────

  /** Get all concept nodes (parsed metadata). */
  getNodes() {
    if (!this._state) return [];
    return this._state.simNodes.map(n => ({
      id: n.id,
      title: n.concept.title,
      tags: n.concept.tags,
      image: n.concept.image,
      depth: n.depth,
      x: n.x,
      y: n.y,
    }));
  }

  /** Get the full concept data for a node by ID. */
  getNode(id) {
    const src = this._sources[id];
    if (!src) return null;
    const { meta, body } = parseFrontmatter(src);
    return {
      id,
      title: meta.title || id,
      body,
      bodyHtml: renderMarkdown(body),
      bodySnippet: bodySnippet(body),
      tags: meta.tags || [],
      image: meta.image || null,
      links: meta.links || [],
      filePaths: meta.filePaths || meta.files || [],
    };
  }

  /** Get the forest of tree roots. */
  getRoots() { return this._roots; }

  /** Get all tag names and their counts. */
  getTagCounts() {
    const counts = new Map();
    for (const src of Object.values(this._sources)) {
      const { meta } = parseFrontmatter(src);
      for (const tag of (meta.tags || [])) {
        counts.set(tag, (counts.get(tag) || 0) + 1);
      }
    }
    return [...counts.entries()].sort((a, b) => b[1] - a[1]);
  }

  // ── Lifecycle ──────────────────────────────────────────────────────────────

  destroy() {
    this._alive = false;
    if (this._rafId) {
      cancelAnimationFrame(this._rafId);
      this._rafId = null;
    }
    if (this._detachHandlers) {
      this._detachHandlers();
      this._detachHandlers = null;
    }
    if (this._state && this._state.sim) {
      this._state.sim.stop();
    }
    this._state = null;
    this._container.innerHTML = "";
  }

  // ── Internal ───────────────────────────────────────────────────────────────

  async _rebuild() {
    // Clean up old state
    if (this._alive) {
      this.destroy();
    }

    if (!this._roots.length) return;

    const spacing = this._options.spacing ?? 1.0;
    const xStep   = (this._options.xStep || 142) * spacing;
    const yStep   = (this._options.yStep || 104) * spacing;
    const dotMode = !!this._options.dotMode;
    // Use the largest variant dimensions as the physics/bounds defaults
    const maxVariantW = Math.max(...Object.values(NODE_VARIANTS).map(v => v.w));
    const maxVariantH = Math.max(...Object.values(NODE_VARIANTS).map(v => v.h));
    const effW    = dotMode ? DOT_R * 2 + 4 : maxVariantW;
    const effH    = dotMode ? DOT_R * 2 + 4 : maxVariantH;

    // Radial layout is on by default for the main tree; dotMode minimap uses linear
    const radial = this._options.radial !== undefined ? this._options.radial : !dotMode;

    // Build graph
    const { nodes, links, leafCount } = buildGraph(this._roots, { xStep, yStep, radial });
    const trunkSet = detectTrunk(nodes, links);
    // NOTE: alignTrunk intentionally not called — it shifts trunk nodes onto
    // their parent's bx, which collapses sibling subtrees together visually.
    // The trunk-x simulation force provides a gentler version of this effect.
    const groups = buildGroups(nodes);

    // Build tag colors
    const tagColors = new Map();
    const tagCounts = new Map();
    for (const n of nodes) {
      for (const tag of (n.concept.tags || [])) {
        tagCounts.set(tag, (tagCounts.get(tag) || 0) + 1);
      }
    }
    const sortedTags = [...tagCounts.entries()].sort((a, b) => b[1] - a[1]);
    sortedTags.forEach(([tag], i) => {
      tagColors.set(tag, TAG_COLORS[i % TAG_COLORS.length]);
    });

    // Create canvas
    this._container.innerHTML = "";
    const canvas = document.createElement("canvas");
    canvas.style.display = "block";
    canvas.style.width = "100%";
    this._container.appendChild(canvas);

    const dpr = window.devicePixelRatio || 1;
    const logW = this._container.clientWidth;

    // If the container has a CSS-defined height, respect it (sidebar / embedded use).
    // Otherwise auto-size based on the graph + window height.
    const containerH = this._container.clientHeight;
    const fixedHeight = this._options.height || (containerH > 80 ? containerH : 0);

    // Create simulation first so we can measure graph bounds.
    const sim = await createSimulation({
      nodes, links, trunkSet,
      dims: { nodeW: effW, nodeH: effH, xStep, yStep },
      physics: this._options.physics,
      radial,
    });

    // Compute bounds from settled positions.
    const bounds = computeBounds(nodes, effW, effH);

    const treeW = Math.max(1, leafCount - 1) * xStep;
    const initK = Math.min(1, (logW - 80) / treeW);

    let finalH;
    if (fixedHeight) {
      finalH = fixedHeight;
    } else {
      const fitK = Math.min(1,
        (logW - 60) / Math.max(1, bounds.spanX),
        (window.innerHeight * 0.72 - STRIP_H) / Math.max(1, bounds.spanY),
      );
      const displayH = bounds.spanY * Math.max(fitK, 0.45) + STRIP_H + 120;
      finalH = Math.round(Math.max(460, Math.min(displayH, window.innerHeight * 0.88)));
    }

    canvas.width = Math.round(logW * dpr);
    canvas.height = Math.round(finalH * dpr);
    // Always set CSS height — without it, HiDPI screens render the canvas at
    // attribute-height CSS pixels (finalH * dpr), overflowing the container.
    canvas.style.height = finalH + "px";

    const fitK = Math.min(1,
      (logW - 60) / Math.max(1, bounds.spanX),
      (finalH - STRIP_H - 40) / Math.max(1, bounds.spanY),
    );

    // minZoom = half of "fit all" — lets you always see the whole tree,
    // plus a bit of breathing room. Using Math.max(minDim/spanX, minDim/spanY)
    // was wrong: on a wide shallow tree it produces ~0.93, locking out zoom.
    const minZoom = Math.max(fitK * 0.75, 0.08);

    // Build state object
    this._state = {
      canvas,
      logW, logH: finalH, dpr,

      simNodes: nodes, simLinks: links,
      groups, trunkSet, tagColors,
      sim,
      // Start zoomed in at 1.0 so the center node is readable; fitAll (F key) shows whole tree.
      // For dotMode (minimap) keep the fit-all zoom so everything is visible.
      tr:       { k: dotMode ? fitK : 1.0, tx: logW / 2 - bounds.cx * (dotMode ? fitK : 1.0), ty: (finalH - STRIP_H) / 2 - bounds.cy * (dotMode ? fitK : 1.0) },
      trTarget: { k: dotMode ? fitK : 1.0, tx: logW / 2 - bounds.cx * (dotMode ? fitK : 1.0), ty: (finalH - STRIP_H) / 2 - bounds.cy * (dotMode ? fitK : 1.0) },
      minZoom: Math.max(minZoom, 0.05),
      fitParams: { k: Math.max(fitK, minZoom), cx: bounds.cx, cy: bounds.cy },
      activeId: "",
      hoverNodeId: null,
      focusedId: "",
      dragNode: null,
      highlightTags: new Set(),
      dotMode,
      theme: this._theme,
      animT: 0,
      _drag: null,
      _dragNodeMoved: false,
    };

    // Handlers
    const handlers = createHandlers(this._state, {
      onNodeClick: (n) => this._emit("nodeClick", this.getNode(n.id), n),
      onNodeHover: (n, sx, sy) => this._emit("nodeHover", this.getNode(n.id), n, sx, sy),
      onNodeUnhover: () => this._emit("nodeUnhover"),
    });

    this._detachHandlers = attachHandlers(canvas, handlers);

    // Keep canvas pixel dimensions in sync with container (handles browser zoom + resize)
    if (typeof ResizeObserver !== "undefined") {
      const ro = new ResizeObserver(() => {
        if (!this._state) return;
        const newDpr = window.devicePixelRatio || 1;
        const newW = this._container.clientWidth;
        const newH = this._container.clientHeight || this._state.logH;
        if (
          Math.abs(canvas.width  - Math.round(newW * newDpr)) > 1 ||
          Math.abs(canvas.height - Math.round(newH * newDpr)) > 1
        ) {
          canvas.width  = Math.round(newW * newDpr);
          canvas.height = Math.round(newH * newDpr);
          this._state.dpr  = newDpr;
          this._state.logW = newW;
          this._state.logH = newH;
        }
      });
      ro.observe(this._container);
      const origDetach = this._detachHandlers;
      this._detachHandlers = () => { origDetach(); ro.disconnect(); };
    }

    // Start render loop
    this._alive = true;
    sim.alphaDecay(0.045).restart();

    const ctx = canvas.getContext("2d");
    const loop = () => {
      if (!this._alive) return;
      lerpTransform(this._state);
      this._state.animT += 0.03;
      if (ctx) render(ctx, this._state);
      this._rafId = requestAnimationFrame(loop);
    };
    loop();
  }
}

// Re-export utilities for advanced usage
export { parseFrontmatter, buildConceptTree, bodySnippet, renderMarkdown } from "./markdown.js";
export { treeLayout, buildGraph, detectTrunk, buildGroups } from "./layout.js";
export { DEFAULT_PHYSICS, setD3Force, computeBounds } from "./physics.js";
export { DARK_THEME, LIGHT_THEME, TIER_COLORS, TAG_COLORS, tierColor, rgba, THEMES } from "./palette.js";
export { initMiniMap, renderMiniMap } from "./mini-renderer.js";
export { NODE_W, NODE_H, DOT_R } from "./renderer.js";
export { nodeVariant, nodeDims, NODE_VARIANTS } from "./nodes.js";
