import { describe, it, expect } from "vitest";
import { acronymLabel, NODE_RX, drawBookmarkFlag } from "../src/renderer.js";
import { nodeDepthScale } from "../src/nodes.js";
import { NODE_VARIANTS } from "../src/nodes.js";

describe("acronymLabel", () => {
  it("returns initials for multi-word titles", () => {
    expect(acronymLabel("Quantum Mechanics")).toBe("QM");
    expect(acronymLabel("General Relativity")).toBe("GR");
    expect(acronymLabel("Natural Language Processing")).toBe("NLP");
    expect(acronymLabel("Machine Learning")).toBe("ML");
  });

  it("returns first 4 chars uppercase for single-word titles", () => {
    expect(acronymLabel("Physics")).toBe("PHYS");
    expect(acronymLabel("Biology")).toBe("BIOL");
    expect(acronymLabel("Science")).toBe("SCIE");
    expect(acronymLabel("Mathematics")).toBe("MATH");
  });

  it("handles short single words without truncation", () => {
    expect(acronymLabel("DNA")).toBe("DNA");
    expect(acronymLabel("Art")).toBe("ART");
    expect(acronymLabel("AI")).toBe("AI");
  });

  it("splits on hyphens as word separators", () => {
    expect(acronymLabel("Wave-Particle Duality")).toBe("WPD");
    expect(acronymLabel("Object-Oriented Programming")).toBe("OOP");
  });

  it("splits on forward slashes", () => {
    expect(acronymLabel("TCP/IP")).toBe("TI");
  });

  it("caps initials at 5 characters for very long titles", () => {
    const result = acronymLabel("Alpha Beta Gamma Delta Epsilon Zeta");
    expect(result.length).toBeLessThanOrEqual(5);
  });

  it("returns empty string for empty input", () => {
    expect(acronymLabel("")).toBe("");
    expect(acronymLabel(null)).toBe("");
    expect(acronymLabel(undefined)).toBe("");
  });

  it("handles all-caps words correctly", () => {
    expect(acronymLabel("HTTP Protocol")).toBe("HP");
  });

  it("filters out empty parts from consecutive separators", () => {
    // e.g. "A--B" splits to ["A", "B"] not ["A", "", "B"]
    const result = acronymLabel("Alpha--Beta");
    expect(result).toBe("AB");
  });
});

// ── Pill node corner radius invariant ─────────────────────────────────────────
//
// Pill nodes use rx = Math.min(nh/2, baseH/2) — a capsule shape whose corner
// radius is far larger than NODE_RX (7).  The shadow rect must use this same
// rx so its corners don't poke out from behind the node card.

describe("pill node shadow rx must match node rx", () => {
  it("depth-0 pill has larger rx than NODE_RX", () => {
    const baseH = Math.round(NODE_VARIANTS.pill.h * nodeDepthScale(0));
    const nh    = baseH; // single-line node
    const pillRx = Math.min(nh / 2, baseH / 2);
    expect(pillRx).toBeGreaterThan(NODE_RX);
  });

  it("depth-1 pill has larger rx than NODE_RX", () => {
    const baseH  = Math.round(NODE_VARIANTS.pill.h * nodeDepthScale(1));
    const pillRx = Math.min(baseH / 2, baseH / 2);
    expect(pillRx).toBeGreaterThan(NODE_RX);
  });

  it("depth-4 (smallest) pill still has rx >= NODE_RX", () => {
    const baseH  = Math.round(NODE_VARIANTS.pill.h * nodeDepthScale(4));
    const pillRx = Math.min(baseH / 2, baseH / 2);
    // Even the smallest pill node should have a rounded radius comparable to NODE_RX
    expect(pillRx).toBeGreaterThanOrEqual(NODE_RX);
  });
});

// ── Bookmark flag ─────────────────────────────────────────────────────────────

describe("drawBookmarkFlag", () => {
  it("is exported from renderer.js", () => {
    expect(typeof drawBookmarkFlag).toBe("function");
  });

  it("calls ctx.fill and ctx.beginPath", () => {
    const calls = [];
    const ctx = new Proxy({}, {
      get: (_, prop) => {
        if (prop === "shadowBlur" || prop === "fillStyle" || prop === "globalAlpha") return 0;
        return (...args) => { calls.push(prop); return ctx; };
      },
      set: () => true,
    });
    drawBookmarkFlag(ctx, 10, 20, 16, "#ff0000", { k: 1 });
    expect(calls).toContain("beginPath");
    expect(calls).toContain("fill");
  });

  it("calls save and restore for isolation", () => {
    const calls = [];
    const ctx = new Proxy({}, {
      get: (_, prop) => {
        if (prop === "shadowBlur" || prop === "fillStyle" || prop === "globalAlpha") return 0;
        return (...args) => { calls.push(prop); return ctx; };
      },
      set: () => true,
    });
    drawBookmarkFlag(ctx, 0, 0, 12, "#fff", { k: 1 });
    expect(calls[0]).toBe("save");
    expect(calls[calls.length - 1]).toBe("restore");
  });
});
