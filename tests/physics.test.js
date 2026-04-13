import { describe, it, expect, vi } from "vitest";
import { DEFAULT_PHYSICS, setD3Force, computeBounds } from "../src/physics.js";

describe("DEFAULT_PHYSICS", () => {
  it("has all required keys", () => {
    const keys = [
      "chargeStrength", "linkDistance", "linkStrength",
      "xStrength", "yStrength", "collideRadius", "collideStrength",
      "trunkAlignStrength", "yOrderStrength", "yOrderGap",
      "alphaDecay", "preSettleIterations",
    ];
    for (const k of keys) {
      expect(DEFAULT_PHYSICS).toHaveProperty(k);
    }
  });

  it("preSettleIterations is a positive integer", () => {
    expect(DEFAULT_PHYSICS.preSettleIterations).toBeGreaterThan(0);
    expect(Number.isInteger(DEFAULT_PHYSICS.preSettleIterations)).toBe(true);
  });

  it("alphaDecay is between 0 and 1", () => {
    expect(DEFAULT_PHYSICS.alphaDecay).toBeGreaterThan(0);
    expect(DEFAULT_PHYSICS.alphaDecay).toBeLessThan(1);
  });
});

describe("computeBounds", () => {
  it("handles a single node", () => {
    const nodes = [{ x: 10, y: 20 }];
    const b = computeBounds(nodes, 130, 50);
    expect(b.minX).toBe(10);
    expect(b.maxX).toBe(10);
    expect(b.cx).toBe(10);
    expect(b.cy).toBe(20);
    // spanX = 0 + 130 + 40 = 170
    expect(b.spanX).toBe(170);
    expect(b.spanY).toBe(90);
  });

  it("computes correct span for multiple nodes", () => {
    const nodes = [{ x: 0, y: 0 }, { x: 100, y: 200 }];
    const b = computeBounds(nodes, 130, 50);
    expect(b.minX).toBe(0);
    expect(b.maxX).toBe(100);
    expect(b.minY).toBe(0);
    expect(b.maxY).toBe(200);
    expect(b.spanX).toBe(100 + 130 + 40);
    expect(b.spanY).toBe(200 + 50 + 40);
    expect(b.cx).toBe(50);
    expect(b.cy).toBe(100);
  });

  it("handles negative coordinates", () => {
    const nodes = [{ x: -50, y: -30 }, { x: 50, y: 30 }];
    const b = computeBounds(nodes, 0, 0);
    expect(b.minX).toBe(-50);
    expect(b.maxX).toBe(50);
    expect(b.cx).toBe(0);
    expect(b.cy).toBe(0);
  });
});

describe("DEFAULT_PHYSICS y-ordering", () => {
  it("yOrderStrength is positive and less than 1", () => {
    expect(DEFAULT_PHYSICS.yOrderStrength).toBeGreaterThan(0);
    expect(DEFAULT_PHYSICS.yOrderStrength).toBeLessThan(1);
  });

  it("yOrderGap is a positive number", () => {
    expect(DEFAULT_PHYSICS.yOrderGap).toBeGreaterThan(0);
  });

  it("yStrength is high enough to anchor depth layers", () => {
    // yStrength >= 0.9 ensures strong depth-based y positioning
    expect(DEFAULT_PHYSICS.yStrength).toBeGreaterThanOrEqual(0.9);
  });
});

describe("setD3Force", () => {
  it("accepts a module without throwing", () => {
    // Just verify the setter doesn't throw with a mock
    expect(() => setD3Force({})).not.toThrow();
  });
});
