/**
 * mini-renderer.js — Compact tree preview for the detail/markdown view.
 *
 * Renders a small, non-interactive overview of the concept tree with the
 * active node highlighted. Used as a sidebar widget on the detail page.
 */

import { tierColor, rgba } from "./palette.js";
import { treeLayout } from "./layout.js";
import { roundRect } from "./geometry.js";

const MINI_NODE_W = 60;
const MINI_NODE_H = 20;
const MINI_NODE_RX = 3;
const MINI_X_STEP = 72;
const MINI_Y_STEP = 40;

/**
 * Render a static mini-map of the concept tree onto a canvas.
 *
 * @param {HTMLCanvasElement} canvas
 * @param {Array} roots - Forest of concept tree nodes
 * @param {string} activeId - Currently active concept ID
 * @param {Object} [theme] - Color theme
 */
export function renderMiniMap(canvas, roots, activeId, theme = {}) {
  const bg     = theme.bg     || "#1a1d23";
  const bg2    = theme.bg2    || "#1e2130";
  const text   = theme.text   || "#e0e0e0";
  const dim    = theme.textDim || "#555";
  const accent = theme.accent || "#7c3aed";
  const border = theme.border || "#2e3140";

  const dpr = window.devicePixelRatio || 1;
  const logW = canvas.clientWidth || canvas.width / dpr;
  const logH = canvas.clientHeight || canvas.height / dpr;
  canvas.width = Math.round(logW * dpr);
  canvas.height = Math.round(logH * dpr);

  const ctx = canvas.getContext("2d");
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  // Background
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, logW, logH);

  if (!roots || !roots.length) return;

  // Layout
  const { pos, leafCount, maxDepth } = treeLayout(roots);
  const halfLeaf = (leafCount - 1) / 2;

  // Compute positions
  const nodePositions = new Map();
  function walk(node) {
    const p = pos.get(node.id);
    if (p) {
      nodePositions.set(node.id, {
        x: (p.treeX - halfLeaf) * MINI_X_STEP,
        y: p.depth * MINI_Y_STEP,
        depth: p.depth,
        node,
      });
    }
    for (const c of (node.children || [])) walk(c);
  }
  for (const r of roots) walk(r);

  // Compute bounds and fit
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const [, np] of nodePositions) {
    if (np.x < minX) minX = np.x;
    if (np.x > maxX) maxX = np.x;
    if (np.y < minY) minY = np.y;
    if (np.y > maxY) maxY = np.y;
  }

  const spanX = maxX - minX + MINI_NODE_W + 20;
  const spanY = maxY - minY + MINI_NODE_H + 20;
  const k = Math.min(1, (logW - 20) / spanX, (logH - 20) / spanY);
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;
  const ox = logW / 2 - cx * k;
  const oy = logH / 2 - cy * k;

  ctx.save();
  ctx.translate(ox, oy);
  ctx.scale(k, k);

  // Draw edges
  const links = [];
  function collectLinks(node) {
    for (const c of (node.children || [])) {
      links.push({ source: node.id, target: c.id });
      collectLinks(c);
    }
  }
  for (const r of roots) collectLinks(r);

  for (const lk of links) {
    const s = nodePositions.get(lk.source);
    const t = nodePositions.get(lk.target);
    if (!s || !t) continue;

    const sy = s.y + MINI_NODE_H / 2;
    const ty = t.y - MINI_NODE_H / 2;
    const pull = Math.max(Math.abs(ty - sy) * 0.5, 10);

    ctx.beginPath();
    ctx.moveTo(s.x, sy);
    ctx.bezierCurveTo(s.x, sy + pull, t.x, ty - pull, t.x, ty);
    ctx.strokeStyle = rgba(dim, 0.4);
    ctx.lineWidth = 1 / k;
    ctx.stroke();
  }

  // Draw nodes
  const HW = MINI_NODE_W / 2;
  const HH = MINI_NODE_H / 2;
  ctx.textBaseline = "middle";
  ctx.textAlign = "center";

  for (const [id, np] of nodePositions) {
    const isActive = id === activeId;
    const col = tierColor(np.depth);

    roundRect(ctx, np.x - HW, np.y - HH, MINI_NODE_W, MINI_NODE_H, MINI_NODE_RX);
    ctx.fillStyle = isActive ? rgba(accent, 0.25) : bg2;
    ctx.fill();
    ctx.strokeStyle = isActive ? accent : rgba(border, 0.6);
    ctx.lineWidth = (isActive ? 2 : 0.8) / k;
    ctx.stroke();

    ctx.font = `${isActive ? "bold " : ""}${MINI_NODE_H * 0.5}px Inter, Segoe UI, system-ui, sans-serif`;
    ctx.fillStyle = isActive ? "#fff" : rgba(text, 0.7);
    const label = np.node.title || id;
    const maxW = MINI_NODE_W - 8;
    // Simple truncate for mini
    const display = ctx.measureText(label).width > maxW
      ? label.slice(0, Math.floor(maxW / (MINI_NODE_H * 0.3))) + "…"
      : label;
    ctx.fillText(display, np.x, np.y);
  }

  ctx.restore();
}

/**
 * Auto-size a mini-map canvas and render.
 */
export function initMiniMap(container, roots, activeId, theme) {
  const canvas = document.createElement("canvas");
  canvas.style.width = "100%";
  canvas.style.height = "100%";
  container.appendChild(canvas);

  function redraw() {
    renderMiniMap(canvas, roots, activeId, theme);
  }

  redraw();

  const ro = new ResizeObserver(redraw);
  ro.observe(container);

  return {
    canvas,
    update(newRoots, newActiveId) {
      roots = newRoots;
      activeId = newActiveId;
      redraw();
    },
    destroy() {
      ro.disconnect();
      container.removeChild(canvas);
    },
  };
}
