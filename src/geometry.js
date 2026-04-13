/**
 * geometry.js — Convex hull, Minkowski-sum blobs, and wobble animation.
 *
 * Ported from thread-map.js: these produce the animated organic group blobs
 * that visually cluster parent→children sets in the concept tree.
 */

import { hashStr, seededFloat } from "./palette.js";

// ── Convex hull (Andrew's monotone chain) ────────────────────────────────────

export function convexHull(pts) {
  if (pts.length < 2) return [...pts];
  const p = [...pts].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const h = [];
  const cross = (o, a, b) =>
    (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  for (const pt of p) {
    while (h.length >= 2 && cross(h[h.length - 2], h[h.length - 1], pt) <= 0) h.pop();
    h.push(pt);
  }
  const lo = h.length + 1;
  for (let i = p.length - 2; i >= 0; i--) {
    while (h.length >= lo && cross(h[h.length - 2], h[h.length - 1], p[i]) <= 0) h.pop();
    h.push(p[i]);
  }
  h.pop();
  return h;
}

// ── Minkowski sum: inflated hull from circles at each point ──────────────────

export function groupPolygon(pts, pad) {
  const N = 12;
  const sp = [];
  for (const [x, y] of pts) {
    for (let i = 0; i < N; i++) {
      const a = (i / N) * Math.PI * 2;
      sp.push([x + Math.cos(a) * pad, y + Math.sin(a) * pad]);
    }
  }
  return convexHull(sp);
}

// ── Wobble animation for hull vertices ───────────────────────────────────────

export function wobbleHull(hull, t, groupParams) {
  const cx = hull.reduce((s, p) => s + p[0], 0) / hull.length;
  const cy = hull.reduce((s, p) => s + p[1], 0) / hull.length;
  return hull.map(([x, y], i) => {
    const dx = x - cx, dy = y - cy;
    const len = Math.hypot(dx, dy) || 1;
    const vp = groupParams.vSeeds[i % groupParams.vSeeds.length];
    const phi = t * groupParams.speed + groupParams.phase + vp * Math.PI * 2;
    const r = Math.sin(phi) * groupParams.amp + Math.cos(phi * 1.61 + 1.1) * groupParams.amp * 0.35;
    return [x + (dx / len) * r, y + (dy / len) * r];
  });
}

// ── Draw a smooth polygon via quadratic Bézier through midpoints ─────────────

export function drawSmoothPoly(ctx, pts) {
  const n = pts.length;
  if (n < 3) return;
  const start = [(pts[n - 1][0] + pts[0][0]) / 2, (pts[n - 1][1] + pts[0][1]) / 2];
  ctx.moveTo(start[0], start[1]);
  for (let i = 0; i < n; i++) {
    const c = pts[i], nx = pts[(i + 1) % n];
    ctx.quadraticCurveTo(c[0], c[1], (c[0] + nx[0]) / 2, (c[1] + nx[1]) / 2);
  }
  ctx.closePath();
}

// ── Rounded rect helper ──────────────────────────────────────────────────────

export function roundRect(ctx, x, y, w, h, rx) {
  ctx.beginPath();
  ctx.moveTo(x + rx, y);
  ctx.lineTo(x + w - rx, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + rx);
  ctx.lineTo(x + w, y + h - rx);
  ctx.quadraticCurveTo(x + w, y + h, x + w - rx, y + h);
  ctx.lineTo(x + rx, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - rx);
  ctx.lineTo(x, y + rx);
  ctx.quadraticCurveTo(x, y, x + rx, y);
  ctx.closePath();
}

// ── Build group animation params from a seed string ──────────────────────────

export function makeGroupParams(seedStr, depth) {
  const seed = hashStr(seedStr);
  return {
    depth,
    speed: 0.28 + seededFloat(seed, 1) * 0.52,
    amp: 2.2 + seededFloat(seed, 2) * 4.8,
    phase: seededFloat(seed, 3) * Math.PI * 6.28,
    vSeeds: Array.from({ length: 18 }, (_, i) => seededFloat(seed, i + 20)),
  };
}
