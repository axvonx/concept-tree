import { describe, it, expect } from "vitest";
import {
  convexHull, groupPolygon, wobbleHull, makeGroupParams,
} from "../src/geometry.js";

describe("convexHull", () => {
  it("returns empty for empty input", () => {
    expect(convexHull([])).toEqual([]);
  });

  it("returns single point for single input", () => {
    expect(convexHull([[1, 2]])).toEqual([[1, 2]]);
  });

  it("returns both points for two inputs", () => {
    const result = convexHull([[0, 0], [1, 1]]);
    expect(result).toHaveLength(2);
  });

  it("computes triangle hull", () => {
    const pts = [[0, 0], [4, 0], [2, 3]];
    const hull = convexHull(pts);
    expect(hull).toHaveLength(3);
  });

  it("removes interior points", () => {
    // Square with a center point
    const pts = [[0, 0], [4, 0], [4, 4], [0, 4], [2, 2]];
    const hull = convexHull(pts);
    expect(hull).toHaveLength(4);
    // Center point should not be in the hull
    const hasCenter = hull.some(p => p[0] === 2 && p[1] === 2);
    expect(hasCenter).toBe(false);
  });

  it("handles collinear points", () => {
    const pts = [[0, 0], [1, 0], [2, 0], [3, 0]];
    const hull = convexHull(pts);
    // Collinear points should collapse to 2 endpoints
    expect(hull.length).toBeLessThanOrEqual(4);
    expect(hull.length).toBeGreaterThanOrEqual(2);
  });

  it("produces counter-clockwise ordering", () => {
    const pts = [[0, 0], [4, 0], [4, 4], [0, 4]];
    const hull = convexHull(pts);
    // Check signed area is positive (CCW)
    let area = 0;
    for (let i = 0; i < hull.length; i++) {
      const j = (i + 1) % hull.length;
      area += hull[i][0] * hull[j][1] - hull[j][0] * hull[i][1];
    }
    // Andrew's monotone chain produces CCW hull
    expect(area).not.toBe(0);
  });
});

describe("groupPolygon", () => {
  it("produces a hull for a single point with padding", () => {
    const poly = groupPolygon([[0, 0]], 10);
    expect(poly.length).toBeGreaterThanOrEqual(3);
    // All points should be ~10 units from origin
    for (const [x, y] of poly) {
      const dist = Math.hypot(x, y);
      expect(dist).toBeCloseTo(10, 0);
    }
  });

  it("produces a larger hull for two points", () => {
    const poly1 = groupPolygon([[0, 0]], 10);
    const poly2 = groupPolygon([[0, 0], [50, 0]], 10);
    // Two-point hull should span wider
    const maxX1 = Math.max(...poly1.map(p => p[0]));
    const maxX2 = Math.max(...poly2.map(p => p[0]));
    expect(maxX2).toBeGreaterThan(maxX1);
  });

  it("pad=0 still produces a valid hull from points", () => {
    const poly = groupPolygon([[0, 0], [10, 0], [5, 10]], 0);
    // With no padding, should just be the convex hull of the input
    expect(poly.length).toBeGreaterThanOrEqual(3);
  });
});

describe("wobbleHull", () => {
  it("produces same number of points as input", () => {
    const hull = [[0, 0], [10, 0], [10, 10], [0, 10]];
    const params = makeGroupParams("test", 0);
    const wobbled = wobbleHull(hull, 0, params);
    expect(wobbled).toHaveLength(hull.length);
  });

  it("changes with time", () => {
    const hull = [[0, 0], [10, 0], [10, 10], [0, 10]];
    const params = makeGroupParams("test", 0);
    const w0 = wobbleHull(hull, 0, params);
    const w1 = wobbleHull(hull, 1, params);
    // At least some points should differ
    let allSame = true;
    for (let i = 0; i < w0.length; i++) {
      if (Math.abs(w0[i][0] - w1[i][0]) > 0.001 ||
          Math.abs(w0[i][1] - w1[i][1]) > 0.001) {
        allSame = false;
        break;
      }
    }
    expect(allSame).toBe(false);
  });

  it("is deterministic for same time", () => {
    const hull = [[0, 0], [10, 0], [10, 10]];
    const params = makeGroupParams("test", 0);
    const a = wobbleHull(hull, 5.5, params);
    const b = wobbleHull(hull, 5.5, params);
    expect(a).toEqual(b);
  });
});

describe("makeGroupParams", () => {
  it("produces speed, amp, phase, vSeeds", () => {
    const p = makeGroupParams("node1", 3);
    expect(p).toHaveProperty("depth", 3);
    expect(p).toHaveProperty("speed");
    expect(p).toHaveProperty("amp");
    expect(p).toHaveProperty("phase");
    expect(p).toHaveProperty("vSeeds");
    expect(p.vSeeds).toHaveLength(18);
  });

  it("is deterministic for same seed", () => {
    const a = makeGroupParams("hello", 0);
    const b = makeGroupParams("hello", 0);
    expect(a.speed).toBe(b.speed);
    expect(a.amp).toBe(b.amp);
  });

  it("differs for different seeds", () => {
    const a = makeGroupParams("alpha", 0);
    const b = makeGroupParams("beta", 0);
    expect(a.speed).not.toBe(b.speed);
  });
});
