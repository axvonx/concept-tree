import { describe, it, expect } from "vitest";
import {
  NODE_VARIANTS, PHOTO_IMG_H, nodeVariant, nodeDims, nodeDimsForTitle, nodeDepthScale,
} from "../src/nodes.js";

// ── helpers ───────────────────────────────────────────────────────────────────

function concept(overrides = {}) {
  return { id: "x", title: "X", children: [], tags: [], image: null, ...overrides };
}

// ── NODE_VARIANTS ─────────────────────────────────────────────────────────────

describe("NODE_VARIANTS", () => {
  it("defines card, badge, photo, pill variants", () => {
    expect(NODE_VARIANTS).toHaveProperty("card");
    expect(NODE_VARIANTS).toHaveProperty("badge");
    expect(NODE_VARIANTS).toHaveProperty("photo");
    expect(NODE_VARIANTS).toHaveProperty("pill");
  });

  it("each variant has w and h", () => {
    for (const [, dims] of Object.entries(NODE_VARIANTS)) {
      expect(dims).toHaveProperty("w");
      expect(dims).toHaveProperty("h");
      expect(dims.w).toBeGreaterThan(0);
      expect(dims.h).toBeGreaterThan(0);
    }
  });

  it("badge is wider than card", () => {
    expect(NODE_VARIANTS.badge.w).toBeGreaterThan(NODE_VARIANTS.card.w);
  });

  it("badge is taller than card", () => {
    expect(NODE_VARIANTS.badge.h).toBeGreaterThan(NODE_VARIANTS.card.h);
  });

  it("photo is taller than card", () => {
    expect(NODE_VARIANTS.photo.h).toBeGreaterThan(NODE_VARIANTS.card.h);
  });

  it("pill is shorter than card", () => {
    expect(NODE_VARIANTS.pill.h).toBeLessThan(NODE_VARIANTS.card.h);
  });
});

describe("PHOTO_IMG_H", () => {
  it("is a positive number", () => {
    expect(PHOTO_IMG_H).toBeGreaterThan(0);
  });

  it("is less than photo node height", () => {
    expect(PHOTO_IMG_H).toBeLessThan(NODE_VARIANTS.photo.h);
  });
});

// ── nodeDepthScale ────────────────────────────────────────────────────────────

describe("nodeDepthScale", () => {
  it("depth 0 (root) returns the largest scale", () => {
    expect(nodeDepthScale(0)).toBeGreaterThan(nodeDepthScale(1));
  });

  it("scale decreases with depth", () => {
    const s0 = nodeDepthScale(0);
    const s1 = nodeDepthScale(1);
    const s2 = nodeDepthScale(2);
    const s3 = nodeDepthScale(3);
    expect(s0).toBeGreaterThan(s1);
    expect(s1).toBeGreaterThan(s2);
    expect(s2).toBeGreaterThan(s3);
  });

  it("clamps at the last entry for very deep nodes", () => {
    expect(nodeDepthScale(10)).toBe(nodeDepthScale(4));
    expect(nodeDepthScale(100)).toBe(nodeDepthScale(4));
  });

  it("returns a positive number for any depth", () => {
    for (let d = 0; d <= 10; d++) {
      expect(nodeDepthScale(d)).toBeGreaterThan(0);
    }
  });
});

// ── nodeVariant ───────────────────────────────────────────────────────────────

describe("nodeVariant", () => {
  it("returns 'photo' for a concept with an image, regardless of depth", () => {
    expect(nodeVariant(concept({ image: "cover.png" }), 0)).toBe("photo");
    expect(nodeVariant(concept({ image: "cover.png" }), 1)).toBe("photo");
    expect(nodeVariant(concept({ image: "cover.png" }), 5)).toBe("photo");
  });

  it("photo takes priority at depth 0", () => {
    expect(nodeVariant(concept({ image: "x.jpg" }), 0)).toBe("photo");
  });

  it("returns 'pill' for depth-0 node without image (all non-photo are pills)", () => {
    expect(nodeVariant(concept({ children: [{ id: "child" }] }), 0)).toBe("pill");
    expect(nodeVariant(concept({ children: [] }), 0)).toBe("pill");
  });

  it("returns 'pill' for leaf nodes at any depth", () => {
    expect(nodeVariant(concept({ children: [] }), 1)).toBe("pill");
    expect(nodeVariant(concept({ children: [] }), 3)).toBe("pill");
  });

  it("returns 'pill' for mid-tree nodes with children (all non-photo are uniform pills)", () => {
    const c = concept({ children: [{ id: "child" }] });
    expect(nodeVariant(c, 1)).toBe("pill");
    expect(nodeVariant(c, 2)).toBe("pill");
  });

  it("returns 'pill' when children is undefined", () => {
    const c = { id: "x", title: "X", tags: [], image: null };
    expect(nodeVariant(c, 2)).toBe("pill");
  });

  it("returns 'pill' when children is null", () => {
    expect(nodeVariant(concept({ children: null }), 1)).toBe("pill");
  });
});

// ── nodeDims ──────────────────────────────────────────────────────────────────

describe("nodeDims", () => {
  it("returns correct dimensions for each known variant", () => {
    for (const [name, expected] of Object.entries(NODE_VARIANTS)) {
      expect(nodeDims(name)).toEqual(expected);
    }
  });

  it("falls back to card dimensions for unknown variant", () => {
    expect(nodeDims("unknown")).toEqual(NODE_VARIANTS.card);
    expect(nodeDims("")).toEqual(NODE_VARIANTS.card);
    expect(nodeDims(undefined)).toEqual(NODE_VARIANTS.card);
  });

  it("returns a reference with w and h properties", () => {
    const dims = nodeDims("pill");
    expect(typeof dims.w).toBe("number");
    expect(typeof dims.h).toBe("number");
  });
});

// ── nodeDimsForTitle ──────────────────────────────────────────────────────────

describe("nodeDimsForTitle", () => {
  it("returns at least depth-scaled base width for a short title (depth=1, scale=1.0)", () => {
    // At depth=1, nodeDepthScale(1)=1.0, so scaled base == raw base
    for (const [v, base] of Object.entries(NODE_VARIANTS)) {
      const d = nodeDimsForTitle(v, "Hi", 1);
      expect(d.w).toBeGreaterThanOrEqual(base.w);
    }
  });

  it("root (depth=0) pill node is larger than depth-1", () => {
    const d0 = nodeDimsForTitle("pill", "Hi", 0);
    const d1 = nodeDimsForTitle("pill", "Hi", 1);
    expect(d0.w).toBeGreaterThan(d1.w);
    expect(d0.h).toBeGreaterThan(d1.h);
  });

  it("deeper nodes shrink in base dimensions", () => {
    const d1 = nodeDimsForTitle("pill", "Hi", 1);
    const d4 = nodeDimsForTitle("pill", "Hi", 4);
    expect(d1.w).toBeGreaterThan(d4.w);
  });

  it("short title preserves base height (no multi-line expansion)", () => {
    // Photo uses fixed layout with no depth scaling
    expect(nodeDimsForTitle("photo", "Hi", 1).h).toBe(NODE_VARIANTS.photo.h);
    // Non-photo at depth=1, short title → 1 line → h = baseH
    const d = nodeDimsForTitle("pill", "Hi", 1);
    expect(d.h).toBe(Math.round(NODE_VARIANTS.pill.h * nodeDepthScale(1)));
  });

  it("long title expands height via multi-line wrapping", () => {
    const short = nodeDimsForTitle("pill", "Hi", 1);
    const long  = nodeDimsForTitle("pill", "This Is A Very Long Concept Title That Should Wrap Across Multiple Lines", 1);
    expect(long.h).toBeGreaterThan(short.h);
  });

  it("height expansion caps at 6 lines", () => {
    const veryLong = "Word ".repeat(60).trim();
    const d = nodeDimsForTitle("pill", veryLong, 1);
    const baseH = Math.round(NODE_VARIANTS.pill.h * nodeDepthScale(1));
    const maxLineH = Math.round(baseH * 0.35);
    expect(d.h).toBeLessThanOrEqual(baseH + 5 * maxLineH + 2); // at most 6 lines
  });

  it("expands width when title is long", () => {
    const short = nodeDimsForTitle("card", "Hi", 1);
    const long  = nodeDimsForTitle("card", "This Is A Very Long Concept Title Indeed", 1);
    expect(long.w).toBeGreaterThan(short.w);
  });

  it("caps width at a maximum for extremely long titles", () => {
    const veryLong = "x".repeat(200);
    expect(nodeDimsForTitle("card",  veryLong, 1).w).toBeLessThanOrEqual(350);
    expect(nodeDimsForTitle("pill",  veryLong, 1).w).toBeLessThanOrEqual(300);
    expect(nodeDimsForTitle("badge", veryLong, 1).w).toBeLessThanOrEqual(400);
    expect(nodeDimsForTitle("photo", veryLong, 1).w).toBeLessThanOrEqual(350);
  });

  it("falls back to card for an unknown variant (at depth=1)", () => {
    const d = nodeDimsForTitle("unknown", "test", 1);
    expect(d.h).toBe(Math.round(NODE_VARIANTS.card.h * nodeDepthScale(1)));
  });

  it("treats empty and undefined title identically", () => {
    const d1 = nodeDimsForTitle("pill", "", 1);
    const d2 = nodeDimsForTitle("pill", undefined, 1);
    expect(d1.w).toBe(d2.w);
    expect(d1.h).toBe(d2.h);
  });

  it("badge expands wider than card for the same long title", () => {
    const title = "Wave-Particle Duality And Its Implications";
    const badge = nodeDimsForTitle("badge", title, 1);
    const card  = nodeDimsForTitle("card",  title, 1);
    expect(badge.w).toBeGreaterThanOrEqual(card.w);
  });
});

// ── integration: variant + dims roundtrip ─────────────────────────────────────

describe("nodeVariant + nodeDims roundtrip", () => {
  it("photo concept gets photo dimensions", () => {
    const c = concept({ image: "img.png", children: [{ id: "a" }] });
    const v = nodeVariant(c, 1);
    expect(v).toBe("photo");
    expect(nodeDims(v)).toEqual(NODE_VARIANTS.photo);
  });

  it("root node (no image) gets pill variant — size is controlled by depth scale", () => {
    const c = concept({ children: [{ id: "a" }] });
    const v = nodeVariant(c, 0);
    expect(v).toBe("pill");
    // At depth 0, nodeDepthScale(0) > 1 → scaled dims exceed raw pill dims
    const d = nodeDimsForTitle(v, "Root", 0);
    expect(d.w).toBeGreaterThan(NODE_VARIANTS.pill.w);
  });

  it("leaf pill at depth 2 is smaller than depth 1", () => {
    const c = concept({ children: [] });
    const v = nodeVariant(c, 2);
    expect(v).toBe("pill");
    const d2 = nodeDimsForTitle(v, "Hi", 2);
    const d1 = nodeDimsForTitle(v, "Hi", 1);
    expect(d2.w).toBeLessThan(d1.w);
  });
});
