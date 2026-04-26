import { describe, it, expect } from "vitest";
import {
  nearestNode, zoomTo, zoomIn, zoomOut, fitAll, lerpTransform,
} from "../src/interaction.js";

// ── State factory ─────────────────────────────────────────────────────────────

function makeState(overrides = {}) {
  return {
    tr:       { k: 1, tx: 0, ty: 0 },
    trTarget: { k: 1, tx: 0, ty: 0 },
    minZoom:  0.1,
    logW:     800,
    logH:     600,
    simNodes: [],
    simLinks: [],
    fitParams: { k: 0.8, cx: 100, cy: 50 },
    _drag:    null,
    ...overrides,
  };
}

function makeNode(id, x, y, extra = {}) {
  return { id, x, y, vx: 0, vy: 0, bx: x, by: y, depth: 0, concept: { id, title: id, children: [], tags: [] }, ...extra };
}

// ── nearestNode ───────────────────────────────────────────────────────────────

describe("nearestNode", () => {
  it("returns null when there are no nodes", () => {
    const state = makeState({ simNodes: [] });
    expect(nearestNode(400, 300, state)).toBeNull();
  });

  it("finds a node at screen-center with identity transform", () => {
    const n = makeNode("a", 400, 300);
    const state = makeState({ simNodes: [n] });
    const found = nearestNode(400, 300, state);
    expect(found).not.toBeNull();
    expect(found.id).toBe("a");
  });

  it("returns null when pointer is far from any node", () => {
    const n = makeNode("a", 400, 300);
    const state = makeState({ simNodes: [n] });
    // well outside default NODE_W/2 + 4 and NODE_H/2 + 6
    expect(nearestNode(600, 500, state)).toBeNull();
  });

  it("respects the transform translation", () => {
    const n = makeNode("a", 0, 0);
    const state = makeState({
      simNodes: [n],
      tr: { k: 1, tx: 200, ty: 100 },
      trTarget: { k: 1, tx: 200, ty: 100 },
    });
    expect(nearestNode(200, 100, state)).not.toBeNull();
    expect(nearestNode(0, 0, state)).toBeNull();
  });

  it("respects the transform scale (zoomed in)", () => {
    const n = makeNode("a", 100, 100);
    const state = makeState({
      simNodes: [n],
      tr: { k: 2, tx: 0, ty: 0 },
      trTarget: { k: 2, tx: 0, ty: 0 },
    });
    expect(nearestNode(200, 200, state)).not.toBeNull();
  });

  it("picks the closest node when two overlap", () => {
    const n1 = makeNode("a", 400, 300);
    const n2 = makeNode("b", 410, 300);
    const state = makeState({ simNodes: [n1, n2] });
    const found = nearestNode(400, 300, state);
    expect(found.id).toBe("a");
  });

  it("uses per-node nw/nh for hit bounds — wider node is hit at its edge", () => {
    // Node with nw=200 (much wider) — should be hittable at x±100
    const n = makeNode("wide", 400, 300, { nw: 200, nh: 60 });
    const state = makeState({ simNodes: [n] });
    // x=305, which is 95px from center — within nw/2+4 = 104
    expect(nearestNode(305, 300, state)).not.toBeNull();
  });

  it("uses per-node nw/nh — narrow node is NOT hit outside its bounds", () => {
    // pill-sized node nw=136, nh=40 — should miss at x+80
    const n = makeNode("narrow", 400, 300, { nw: 136, nh: 40 });
    const state = makeState({ simNodes: [n] });
    // x=480 is 80px from center; nw/2+4 = 72 — outside
    expect(nearestNode(480, 300, state)).toBeNull();
  });

  it("dotMode uses small hit radius — hits close to node center", () => {
    // In dotMode, hit radius = (DOT_R + 4) / k = (8+4)/1 = 12 world units
    const n = makeNode("dot", 400, 300);
    const state = makeState({ simNodes: [n], dotMode: true });
    // 10px from center — within radius 12
    expect(nearestNode(410, 300, state)).not.toBeNull();
  });

  it("dotMode uses small hit radius — misses far from node (would hit with full card bounds)", () => {
    // Without dotMode, nw default (180) means hw = 180/2+4 = 94 — would hit at x+80
    // With dotMode, radius = 12 — should miss at x+80
    const n = makeNode("dot", 400, 300, { nw: 180, nh: 72 });
    const state = makeState({ simNodes: [n], dotMode: true });
    expect(nearestNode(480, 300, state)).toBeNull();
  });

  it("hitScale=0.5 tightens hit area — misses at nw/2 boundary", () => {
    // nw=200 → hw normally = 200/2+4 = 104; with hitScale=0.5 → 52
    // pointer at x+80 from center: 80 < 104 (would hit at 1.0) but > 52 (misses at 0.5)
    const n = makeNode("a", 400, 300, { nw: 200, nh: 60 });
    const state = makeState({ simNodes: [n] });
    expect(nearestNode(480, 300, state, 1.0)).not.toBeNull();
    expect(nearestNode(480, 300, state, 0.5)).toBeNull();
  });

  it("hitScale=0.5 still hits node near center", () => {
    const n = makeNode("a", 400, 300, { nw: 200, nh: 60 });
    const state = makeState({ simNodes: [n] });
    // x+20 from center — inside even tightened bounds
    expect(nearestNode(420, 300, state, 0.5)).not.toBeNull();
  });
});

// ── zoomTo ────────────────────────────────────────────────────────────────────

describe("zoomTo", () => {
  it("scales trTarget.k by factor", () => {
    const state = makeState();
    zoomTo(2, 400, 300, state);
    expect(state.trTarget.k).toBeCloseTo(2);
  });

  it("does not exceed max zoom (8) when maxZoom not set", () => {
    const state = makeState({ trTarget: { k: 7, tx: 0, ty: 0 } });
    zoomTo(10, 400, 300, state);
    expect(state.trTarget.k).toBeLessThanOrEqual(8);
  });

  it("respects state.maxZoom when set", () => {
    const state = makeState({ maxZoom: 2.0, trTarget: { k: 1.9, tx: 0, ty: 0 } });
    zoomTo(10, 400, 300, state);
    expect(state.trTarget.k).toBeCloseTo(2.0);
    expect(state.trTarget.k).toBeLessThanOrEqual(2.0);
  });

  it("maxZoom lower than default 8 — cannot zoom past it", () => {
    const state = makeState({ maxZoom: 1.5, trTarget: { k: 1, tx: 0, ty: 0 } });
    for (let i = 0; i < 20; i++) zoomTo(1.2, 400, 300, state);
    expect(state.trTarget.k).toBeLessThanOrEqual(1.5);
  });

  it("does not go below minZoom", () => {
    const state = makeState({ minZoom: 0.5, trTarget: { k: 0.6, tx: 0, ty: 0 } });
    zoomTo(0.01, 400, 300, state);
    expect(state.trTarget.k).toBeGreaterThanOrEqual(0.5);
  });

  it("adjusts translation so zoom origin stays fixed", () => {
    const state = makeState({ trTarget: { k: 1, tx: 0, ty: 0 } });
    // Zoom in 2× around point (100, 100) with initial k=1, tx=0, ty=0
    // Expected: new_tx = 100 - (100 - 0) * 2 = 100 - 200 = -100
    zoomTo(2, 100, 100, state);
    expect(state.trTarget.tx).toBeCloseTo(-100);
    expect(state.trTarget.ty).toBeCloseTo(-100);
  });

  it("does not mutate tr (only trTarget)", () => {
    const state = makeState();
    const before = { ...state.tr };
    zoomTo(2, 400, 300, state);
    expect(state.tr.k).toBe(before.k);
    expect(state.tr.tx).toBe(before.tx);
  });
});

// ── zoomIn / zoomOut ──────────────────────────────────────────────────────────

describe("zoomIn", () => {
  it("increases trTarget.k", () => {
    const state = makeState();
    const before = state.trTarget.k;
    zoomIn(state);
    expect(state.trTarget.k).toBeGreaterThan(before);
  });

  it("zooms toward the canvas center", () => {
    const state = makeState({ trTarget: { k: 1, tx: 0, ty: 0 } });
    zoomIn(state);
    // After zoom toward center (400, 300), tx should be adjusted
    expect(state.trTarget.k).toBeGreaterThan(1);
  });
});

describe("zoomOut", () => {
  it("decreases trTarget.k", () => {
    const state = makeState({ trTarget: { k: 2, tx: 0, ty: 0 } });
    const before = state.trTarget.k;
    zoomOut(state);
    expect(state.trTarget.k).toBeLessThan(before);
  });

  it("respects minZoom floor", () => {
    const state = makeState({ minZoom: 0.9, trTarget: { k: 1, tx: 0, ty: 0 } });
    for (let i = 0; i < 20; i++) zoomOut(state);
    expect(state.trTarget.k).toBeGreaterThanOrEqual(0.9);
  });
});

// ── fitAll ────────────────────────────────────────────────────────────────────

describe("fitAll", () => {
  it("resets trTarget to fitParams", () => {
    const state = makeState({
      trTarget: { k: 3, tx: 500, ty: 500 },
      fitParams: { k: 0.8, cx: 100, cy: 50 },
    });
    fitAll(state);
    expect(state.trTarget.k).toBe(0.8);
    // tx = logW/2 - cx*k = 400 - 100*0.8 = 320
    expect(state.trTarget.tx).toBeCloseTo(320);
    // ty = (logH-32)/2 - cy*k = (600-32)/2 - 50*0.8 = 284 - 40 = 244
    expect(state.trTarget.ty).toBeCloseTo(244);
  });

  it("does not mutate tr directly", () => {
    const state = makeState({ tr: { k: 1, tx: 0, ty: 0 } });
    fitAll(state);
    expect(state.tr.k).toBe(1); // tr untouched; lerpTransform would update it
  });
});

// ── lerpTransform ─────────────────────────────────────────────────────────────

describe("lerpTransform", () => {
  it("moves tr toward trTarget", () => {
    const state = makeState({
      tr:       { k: 1, tx: 0, ty: 0 },
      trTarget: { k: 2, tx: 100, ty: 50 },
    });
    lerpTransform(state);
    expect(state.tr.k).toBeGreaterThan(1);
    expect(state.tr.tx).toBeGreaterThan(0);
    expect(state.tr.ty).toBeGreaterThan(0);
  });

  it("does not overshoot trTarget", () => {
    const state = makeState({
      tr:       { k: 1, tx: 0, ty: 0 },
      trTarget: { k: 2, tx: 100, ty: 50 },
    });
    // Run many iterations — should converge but not overshoot
    for (let i = 0; i < 200; i++) lerpTransform(state);
    expect(state.tr.k).toBeCloseTo(2, 1);
    expect(state.tr.tx).toBeCloseTo(100, 1);
    expect(state.tr.ty).toBeCloseTo(50, 1);
  });

  it("does nothing while dragging", () => {
    const state = makeState({
      tr:       { k: 1, tx: 0, ty: 0 },
      trTarget: { k: 2, tx: 100, ty: 50 },
      _drag:    { sx: 0, sy: 0, tx0: 0, ty0: 0, moved: false },
    });
    lerpTransform(state);
    // tr should not change while drag is active
    expect(state.tr.k).toBe(1);
    expect(state.tr.tx).toBe(0);
  });

  it("stays at target when already there", () => {
    const state = makeState({
      tr:       { k: 1.5, tx: 40, ty: 20 },
      trTarget: { k: 1.5, tx: 40, ty: 20 },
    });
    lerpTransform(state);
    expect(state.tr.k).toBeCloseTo(1.5);
    expect(state.tr.tx).toBeCloseTo(40);
    expect(state.tr.ty).toBeCloseTo(20);
  });
});
