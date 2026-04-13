/**
 * renderer.js — Canvas rendering for the concept tree.
 *
 * Draws group blobs, edges (trunk + branch), node cards, and the
 * breadcrumb/tag strip at the bottom.
 *
 * Node variants:
 *   'card'  — default rectangular card
 *   'badge' — wider root card with accent header strip
 *   'photo' — taller card with image thumbnail at top
 *   'pill'  — compact leaf capsule, organically animated border
 */

import { tierColor, rgba, clipText, hashStr, seededFloat, TAG_COLORS } from "./palette.js";
import {
  groupPolygon, wobbleHull, drawSmoothPoly, roundRect,
} from "./geometry.js";
import { NODE_VARIANTS, PHOTO_IMG_H, nodeDepthScale } from "./nodes.js";

// ── Public dimension constants (defaults / dot-mode) ─────────────────────────
export const NODE_W   = NODE_VARIANTS.card.w;
export const NODE_H   = NODE_VARIANTS.card.h;
export const NODE_RX  = 7;
export const STRIP_H  = 32;
export const DOT_R    = 8;

// ── Image cache ───────────────────────────────────────────────────────────────

const _imgCache = new Map();

function getImg(url) {
  if (!url) return null;
  if (!_imgCache.has(url)) {
    const entry = { img: null, ready: false, error: false };
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload  = () => { entry.img = img; entry.ready = true; };
    img.onerror = () => { entry.error = true; };
    img.src = url;
    _imgCache.set(url, entry);
  }
  return _imgCache.get(url);
}

// ── Acronym label (for dot/mini-map mode) ────────────────────────────────────

/**
 * Generate a compact acronym from a title for use in minimap nodes.
 * Single-word titles return first 4 chars uppercase; multi-word return initials.
 *
 * @param {string} title
 * @returns {string}
 */
export function acronymLabel(title) {
  if (!title) return "";
  const words = title.split(/[\s\-\/]+/).filter(w => w.length > 0);
  if (words.length === 1) return words[0].slice(0, 4).toUpperCase();
  return words.map(w => w[0]).join("").toUpperCase().slice(0, 5);
}

// Mini-map node dimensions (dot mode)
const MINI_W = 40;
const MINI_H = 20;

// ── Per-node animation seeds ──────────────────────────────────────────────────

function nodeAnimSeed(id) {
  const h = hashStr(id);
  return {
    speed: 0.35 + seededFloat(h, 1) * 0.45,
    phase: seededFloat(h, 2) * Math.PI * 2,
    hueShift: seededFloat(h, 3),
  };
}

// ── Dot-mode renderer (mini-map / preview) ────────────────────────────────────

export function renderDots(ctx, state) {
  const {
    logW, logH, dpr, tr, simNodes, simLinks, groups, trunkSet,
    tagColors, highlightTags, activeId, hoverNodeId, dragNode,
    theme, animT,
  } = state;

  const bg      = theme.bg;
  const textDim = theme.textDim;
  const accent  = theme.accent;

  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, logW * dpr, logH * dpr);
  ctx.setTransform(tr.k * dpr, 0, 0, tr.k * dpr, tr.tx * dpr, tr.ty * dpr);

  const byId = new Map(simNodes.map(n => [n.id, n]));
  const PAD  = DOT_R + 14;

  // Group blobs
  for (const g of groups) {
    let pts;
    if (g._soloId) {
      const n = byId.get(g._soloId);
      if (!n) continue;
      pts = [[n.x, n.y]];
    } else {
      const parent = byId.get(g.parentId);
      if (!parent) continue;
      pts = [[parent.x, parent.y]];
      for (const cid of g.childIds) {
        const c = byId.get(cid);
        if (c) pts.push([c.x, c.y]);
      }
    }
    const color   = tierColor(g.depth + (g._soloId ? 0 : 1));
    const breathe = Math.sin(animT * g.speed * 0.7 + g.phase);
    const fillA   = (g._soloId ? 0.04 : 0.06 + g.depth * 0.02) + breathe * 0.01;
    const strokeA = (g._soloId ? 0.2  : 0.4  + g.depth * 0.06) + breathe * 0.07;
    const pad     = g._soloId ? DOT_R + 4 : PAD;
    let hull = groupPolygon(pts, pad);
    hull = wobbleHull(hull, animT, g);
    ctx.beginPath();
    drawSmoothPoly(ctx, hull);
    ctx.fillStyle   = rgba(color, Math.min(fillA, 0.22));
    ctx.fill();
    ctx.strokeStyle = rgba(color, Math.min(strokeA, 0.85));
    ctx.lineWidth   = (g._soloId ? 0.6 : 1.0 + g.depth * 0.2) / tr.k;
    ctx.stroke();
  }

  // Edges
  for (const lk of simLinks) {
    const s = lk.source, t = lk.target;
    if (typeof s !== "object" || typeof t !== "object") continue;
    const isTrunk = trunkSet.has(`${s.id}→${t.id}`);
    const sTag = (s.concept.tags || [])[0] || "";
    const tTag = (t.concept.tags || [])[0] || "";
    const dimmed = highlightTags.size && !highlightTags.has(sTag) && !highlightTags.has(tTag);
    const dotDx   = t.x - s.x;
    const dotDy   = t.y - s.y;
    const dotDist = Math.hypot(dotDx, dotDy) || 1;
    const dux = dotDx / dotDist, duy = dotDy / dotDist;
    const pull = Math.max(dotDist * 0.35, 10);
    if (isTrunk) {
      ctx.lineWidth = 2 / tr.k; ctx.strokeStyle = textDim;
      ctx.globalAlpha = dimmed ? 0.08 : 0.55;
    } else {
      const col = tagColors.get(tTag) || tagColors.get(sTag) || textDim;
      ctx.lineWidth = 1 / tr.k; ctx.strokeStyle = col;
      ctx.globalAlpha = dimmed ? 0.05 : 0.35;
    }
    ctx.beginPath();
    ctx.moveTo(s.x, s.y);
    ctx.bezierCurveTo(
      s.x + dux * pull, s.y + duy * pull,
      t.x - dux * pull, t.y - duy * pull,
      t.x, t.y,
    );
    ctx.stroke();
  }
  ctx.globalAlpha = 1;

  // Mini labeled boxes with acronyms
  const mw = MINI_W / tr.k;
  const mh = MINI_H / tr.k;
  const mrx = 3 / tr.k;

  ctx.textBaseline = "middle";
  ctx.textAlign    = "center";

  for (const n of simNodes) {
    const isActive = n.id === activeId;
    const isHover  = n.id === hoverNodeId || n === dragNode;
    const nodeTag  = (n.concept.tags || [])[0] || "";
    const tCol     = tagColors.get(nodeTag) || accent;
    const isLit    = !highlightTags.size || highlightTags.has(nodeTag);

    ctx.globalAlpha = isLit ? 1 : 0.15;

    // Active pulse ring
    if (isActive) {
      const pulse = 0.5 + 0.5 * Math.sin(animT * 2.5);
      roundRect(ctx,
        n.x - mw / 2 - (3 + pulse * 2) / tr.k,
        n.y - mh / 2 - (3 + pulse * 2) / tr.k,
        mw + (6 + pulse * 4) / tr.k,
        mh + (6 + pulse * 4) / tr.k,
        mrx + 2 / tr.k,
      );
      ctx.strokeStyle = accent;
      ctx.lineWidth   = 1.5 / tr.k;
      ctx.globalAlpha = (0.5 + 0.35 * pulse) * (isLit ? 1 : 0.15);
      ctx.stroke();
      ctx.globalAlpha = isLit ? 1 : 0.15;
    }

    // Box fill
    roundRect(ctx, n.x - mw / 2, n.y - mh / 2, mw, mh, mrx);
    ctx.fillStyle = isActive
      ? rgba(accent, 0.28)
      : isHover
        ? rgba(tCol, 0.22)
        : rgba(tCol, 0.10);
    ctx.fill();

    // Box border
    roundRect(ctx, n.x - mw / 2, n.y - mh / 2, mw, mh, mrx);
    ctx.strokeStyle = isActive ? accent : rgba(tCol, isHover ? 0.75 : 0.45);
    ctx.lineWidth   = (isActive || isHover ? 1.5 : 0.8) / tr.k;
    ctx.stroke();

    // Acronym label
    const fsize = mh * 0.46;
    ctx.font      = `${isActive ? "700 " : "500 "}${fsize}px Inter, Segoe UI, system-ui, sans-serif`;
    ctx.fillStyle = isActive ? "#fff" : rgba(tCol, 0.88);
    ctx.fillText(acronymLabel(n.concept.title || n.id), n.x, n.y);

    ctx.globalAlpha = 1;
  }
}

// ── Main render ───────────────────────────────────────────────────────────────

export function render(ctx, state) {
  if (state.dotMode) return renderDots(ctx, state);

  const {
    logW, logH, dpr, tr, simNodes, simLinks, groups, trunkSet,
    tagColors, highlightTags, activeId, hoverNodeId, focusedId, dragNode,
    theme, animT,
  } = state;

  const bg      = theme.bg;
  const bg2     = theme.bg2;
  const text    = theme.text;
  const textDim = theme.textDim;
  const border  = theme.border;
  const accent  = theme.accent;

  // ── Clear ─────────────────────────────────────────────────────────────────
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, logW * dpr, logH * dpr);

  ctx.setTransform(tr.k * dpr, 0, 0, tr.k * dpr, tr.tx * dpr, tr.ty * dpr);

  const byId = new Map(simNodes.map(n => [n.id, n]));

  // ── Floating drift (visual only — restores positions before returning) ────
  // Three incommensurable frequency components per axis for non-periodic motion.
  const PHI = 1.6180339887;
  const SR2 = 1.4142135623;
  const FLOAT_AMP = 10.0;
  const _origPos = new Map();
  for (const n of simNodes) {
    const s = nodeAnimSeed(n.id);
    const fx = Math.sin(animT * s.speed * 0.78  + s.phase)             * FLOAT_AMP * 0.60
             + Math.sin(animT * s.speed * PHI   + s.phase * SR2)       * FLOAT_AMP * 0.25
             + Math.sin(animT * s.speed * 2.39  + s.phase * 0.71)      * FLOAT_AMP * 0.15;
    const fy = Math.cos(animT * s.speed * 0.61  + s.phase + 1.0)       * FLOAT_AMP * 0.60
             + Math.cos(animT * s.speed * SR2   + s.phase * PHI)       * FLOAT_AMP * 0.25
             + Math.cos(animT * s.speed * 1.87  + s.phase * 1.31)      * FLOAT_AMP * 0.15;
    _origPos.set(n.id, { x: n.x, y: n.y });
    n.x += fx;
    n.y += fy;
  }

  // ── Group blobs ───────────────────────────────────────────────────────────
  const PAD = NODE_H / 2 + 20;

  for (const g of groups) {
    let pts;
    if (g._soloId) {
      const n = byId.get(g._soloId);
      if (!n) continue;
      pts = [[n.x, n.y]];
    } else {
      const parent = byId.get(g.parentId);
      if (!parent) continue;
      pts = [[parent.x, parent.y]];
      for (const cid of g.childIds) {
        const c = byId.get(cid);
        if (c) pts.push([c.x, c.y]);
      }
    }

    const color   = tierColor(g.depth + (g._soloId ? 0 : 1));
    const breathe = Math.sin(animT * g.speed * 0.7 + g.phase);
    const fillA   = (g._soloId ? 0.04 : 0.055 + g.depth * 0.018) + breathe * 0.012;
    const strokeA = (g._soloId ? 0.18 : 0.38 + g.depth * 0.055) + breathe * 0.07;
    const lineW   = (g._soloId ? 0.6 : 1.1 + g.depth * 0.2) / tr.k;
    const pad     = g._soloId ? (byId.get(g._soloId)?.nh || NODE_H) / 2 + 7 : PAD;

    let hull = groupPolygon(pts, pad);
    hull = wobbleHull(hull, animT, g);
    ctx.beginPath();
    drawSmoothPoly(ctx, hull);
    ctx.fillStyle   = rgba(color, Math.min(fillA, 0.22));
    ctx.fill();
    ctx.strokeStyle = rgba(color, Math.min(strokeA, 0.85));
    ctx.lineWidth   = lineW;
    ctx.stroke();
  }

  // ── Edges ─────────────────────────────────────────────────────────────────
  for (let pass = 0; pass < 2; pass++) {
    for (const lk of simLinks) {
      const s = lk.source, t = lk.target;
      if (typeof s !== "object" || typeof t !== "object") continue;
      const isTrunk = trunkSet.has(`${s.id}→${t.id}`);
      if (isTrunk !== (pass === 1)) continue;

      const sTag   = (s.concept.tags || [])[0] || "";
      const tTag   = (t.concept.tags || [])[0] || "";
      const dimmed = highlightTags.size && !highlightTags.has(sTag) && !highlightTags.has(tTag);

      // Direction-aware edge: works for radial (any angle) and linear layouts.
      // Clip connection points to the rectangular node boundary surface.
      const sHW = (s.nw || NODE_W) / 2, sHH = (s.nh || NODE_H) / 2;
      const tHW = (t.nw || NODE_W) / 2, tHH = (t.nh || NODE_H) / 2;

      const edgeDx   = t.x - s.x;
      const edgeDy   = t.y - s.y;
      const edgeDist = Math.hypot(edgeDx, edgeDy) || 1;
      const ux = edgeDx / edgeDist;
      const uy = edgeDy / edgeDist;

      // Distance to rectangle edge along this direction (axis-clipped)
      const sClip = Math.min(sHW / (Math.abs(ux) || 1e-6), sHH / (Math.abs(uy) || 1e-6));
      const tClip = Math.min(tHW / (Math.abs(ux) || 1e-6), tHH / (Math.abs(uy) || 1e-6));

      const sx  = s.x + ux * sClip;
      const sy0 = s.y + uy * sClip;
      const tx  = t.x - ux * tClip;
      const ty0 = t.y - uy * tClip;

      const pull = Math.max(edgeDist * 0.35, 18);

      if (isTrunk) {
        ctx.lineWidth   = 5 / tr.k;
        ctx.strokeStyle = textDim;
        ctx.globalAlpha = dimmed ? 0.08 : 0.6;
      } else {
        const col = tagColors.get(tTag) || tagColors.get(sTag) || textDim;
        ctx.lineWidth   = 1.5 / tr.k;
        ctx.strokeStyle = col;
        ctx.globalAlpha = dimmed ? 0.05 : 0.42;
      }

      ctx.beginPath();
      ctx.moveTo(sx, sy0);
      ctx.bezierCurveTo(
        sx + ux * pull, sy0 + uy * pull,
        tx - ux * pull, ty0 - uy * pull,
        tx, ty0,
      );
      ctx.stroke();
    }
  }
  ctx.globalAlpha = 1;

  // ── Node cards ────────────────────────────────────────────────────────────
  ctx.textBaseline = "middle";

  for (const n of simNodes) {
    const isActive  = n.id === activeId;
    const isFocused = n.id === focusedId;
    const isHover   = n.id === hoverNodeId || n === dragNode;
    const isDragged = n === dragNode;
    const nodeTag   = (n.concept.tags || [])[0] || "";
    const tCol      = tagColors.get(nodeTag) || text;
    const isLit     = !highlightTags.size || highlightTags.has(nodeTag);
    const variant   = n.variant || "card";
    const nw        = n.nw || NODE_W;
    const nh        = n.nh || NODE_H;

    ctx.globalAlpha = isLit ? 1 : 0.15;

    switch (variant) {
      case "photo":  _drawPhotoNode(ctx, n, nw, nh, tCol, isActive, isHover, isDragged, isFocused, accent, bg, bg2, border, text, animT, tr); break;
      case "badge":  _drawBadgeNode(ctx, n, nw, nh, tCol, isActive, isHover, isDragged, isFocused, accent, bg, bg2, border, text, animT, tr); break;
      case "pill":   _drawPillNode (ctx, n, nw, nh, tCol, isActive, isHover, isDragged, isFocused, accent, bg, bg2, border, text, animT, tr); break;
      default:       _drawCardNode (ctx, n, nw, nh, tCol, isActive, isHover, isDragged, isFocused, accent, bg, bg2, border, text, textDim, animT, tr); break;
    }

    // Keyboard focus ring
    if (isFocused && !isActive) {
      roundRect(ctx, n.x - nw / 2 - 4 / tr.k, n.y - nh / 2 - 4 / tr.k,
                nw + 8 / tr.k, nh + 8 / tr.k, NODE_RX + 3 / tr.k);
      ctx.strokeStyle = rgba(text, 0.8);
      ctx.lineWidth   = 1.5 / tr.k;
      ctx.setLineDash([4 / tr.k, 3 / tr.k]);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    ctx.globalAlpha = 1;
  }

  // ── Restore original positions (float was visual-only) ───────────────────
  for (const n of simNodes) {
    const orig = _origPos.get(n.id);
    if (orig) { n.x = orig.x; n.y = orig.y; }
  }

  // ── Bottom info strip ─────────────────────────────────────────────────────
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.textBaseline = "alphabetic";
  const stripY = logH - STRIP_H;

  ctx.fillStyle = rgba(bg2, 0.97);
  ctx.fillRect(0, stripY, logW, STRIP_H);
  ctx.strokeStyle = border;
  ctx.lineWidth   = 1;
  ctx.beginPath();
  ctx.moveTo(0, stripY + 0.5);
  ctx.lineTo(logW, stripY + 0.5);
  ctx.stroke();

  ctx.font      = "12px Inter, Segoe UI, system-ui, sans-serif";
  ctx.textAlign = "left";
  ctx.fillStyle = textDim;
  const maxDepth = simNodes.length ? Math.max(...simNodes.map(n => n.depth)) : 0;
  ctx.fillText(
    `${simNodes.length} concepts · depth ${maxDepth}`,
    12, stripY + STRIP_H - 9,
  );
}

// ── Text wrapping helper ──────────────────────────────────────────────────────

/**
 * Split a title into up to maxLines lines that fit within maxW.
 * ctx must have the correct font already set.
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {string} title
 * @param {number} maxW - available pixel width per line
 * @param {number} [maxLines=6] - maximum number of lines
 * @returns {string[]}
 */
function _wrapTitle(ctx, title, maxW, maxLines = 6) {
  if (!title) return [""];
  if (ctx.measureText(title).width <= maxW) return [title];

  const words = title.split(" ");
  if (words.length === 1) return [clipText(ctx, title, maxW)];

  const lines = [];
  let current = "";

  for (let i = 0; i < words.length; i++) {
    const word = words[i];
    const test = current ? current + " " + word : word;

    if (ctx.measureText(test).width <= maxW) {
      current = test;
    } else {
      if (lines.length === maxLines - 1) {
        // Last allowed line — clip the remainder into it
        const rest = words.slice(i).join(" ");
        lines.push(clipText(ctx, current ? current + " " + rest : rest, maxW));
        current = "";
        break;
      }
      if (current) lines.push(current);
      current = word;
    }
  }
  if (current) {
    if (lines.length < maxLines) {
      lines.push(current);
    } else {
      // Overflow into last line
      lines[lines.length - 1] = clipText(ctx, lines[lines.length - 1] + " " + current, maxW);
    }
  }
  return lines.length ? lines : [clipText(ctx, title, maxW)];
}

// ── Node variant drawing helpers ──────────────────────────────────────────────

function _shadow(ctx, n, nw, nh, isDragged, tr, bg) {
  const sOff = (isDragged ? 6 : 2) / tr.k;
  roundRect(ctx, n.x - nw / 2 + sOff, n.y - nh / 2 + sOff, nw, nh, NODE_RX);
  // Light themes: skip heavy drop shadow (it shows as an ugly dark box)
  const isLight = bg && parseInt(bg.slice(1, 3), 16) > 150;
  ctx.fillStyle = isLight ? "rgba(0,0,0,0.07)" : "rgba(0,0,0,0.45)";
  ctx.fill();
}

function _activeBorder(ctx, n, nw, nh, accent, animT, tr) {
  const pulse = 0.5 + 0.5 * Math.sin(animT * 2.5);
  roundRect(ctx, n.x - nw / 2, n.y - nh / 2, nw, nh, NODE_RX);
  ctx.strokeStyle = accent;
  ctx.lineWidth   = (2.2 + pulse * 0.7) / tr.k;
  ctx.globalAlpha = 0.9 + 0.1 * pulse;
  ctx.stroke();
  ctx.globalAlpha = 1;
}

// ── 'card' — default mid-tree card ───────────────────────────────────────────

function _drawCardNode(ctx, n, nw, nh, tCol, isActive, isHover, isDragged, isFocused,
                       accent, bg, bg2, border, text, textDim, animT, tr) {
  const lx = n.x - nw / 2, ty = n.y - nh / 2;
  const PAD_X = 7 / tr.k, availW = nw - PAD_X * 2;

  _shadow(ctx, n, nw, nh, isDragged, tr, bg);

  // Background
  roundRect(ctx, lx, ty, nw, nh, NODE_RX);
  if (isActive) {
    const grad = ctx.createLinearGradient(lx, ty, lx, ty + nh);
    grad.addColorStop(0, rgba(accent, 0.14));
    grad.addColorStop(1, rgba(accent, 0.06));
    ctx.fillStyle = grad;
  } else {
    ctx.fillStyle = bg2;
  }
  ctx.fill();

  // Separator
  ctx.beginPath();
  ctx.moveTo(lx + PAD_X, n.y);
  ctx.lineTo(lx + nw - PAD_X, n.y);
  ctx.strokeStyle = rgba(border, 0.5);
  ctx.lineWidth   = 0.5 / tr.k;
  ctx.stroke();

  // Colored left accent stripe
  ctx.beginPath();
  ctx.moveTo(lx, ty + NODE_RX);
  ctx.quadraticCurveTo(lx, ty, lx + NODE_RX, ty);
  ctx.lineTo(lx + NODE_RX, ty + nh);
  ctx.lineTo(lx, ty + nh - NODE_RX);
  ctx.quadraticCurveTo(lx, ty + nh, lx, ty + nh - NODE_RX);
  ctx.closePath();
  ctx.fillStyle = rgba(tCol, isHover ? 0.22 : 0.12);
  ctx.fill();

  // Border
  if (isActive) {
    _activeBorder(ctx, n, nw, nh, accent, animT, tr);
  } else {
    roundRect(ctx, lx, ty, nw, nh, NODE_RX);
    ctx.strokeStyle = isDragged ? rgba(tCol, 0.9)
                    : isHover  ? rgba(tCol, 0.65)
                    :            rgba(border, 0.7);
    ctx.lineWidth   = (isDragged || isHover ? 1.4 : 0.7) / tr.k;
    ctx.stroke();
  }

  // Title (supports 2-line wrapping for long titles)
  const titleSz = nh * 0.26;
  ctx.font      = `600 ${titleSz}px Inter, Segoe UI, system-ui, sans-serif`;
  ctx.textAlign = "left";
  ctx.fillStyle = isActive ? "#fff" : rgba(tCol, 0.95);
  const titleLines = _wrapTitle(ctx, n.concept.title || n.id, availW);
  if (titleLines.length === 1) {
    ctx.fillText(titleLines[0], lx + PAD_X, n.y - nh * 0.18);
  } else {
    const lineH = titleSz * 1.25;
    ctx.fillText(titleLines[0], lx + PAD_X, n.y - nh * 0.33);
    ctx.fillText(titleLines[1], lx + PAD_X, n.y - nh * 0.33 + lineH);
  }

  // Tag / depth
  const tagSz = nh * 0.20;
  ctx.font      = `${tagSz}px Inter, Segoe UI, system-ui, sans-serif`;
  ctx.fillStyle = isActive ? rgba("#fff", 0.55) : rgba(textDim, 0.55);
  const nodeTag  = (n.concept.tags || [])[0] || "";
  const tagLabel = nodeTag || `depth ${n.depth}`;
  ctx.fillText(clipText(ctx, tagLabel, availW), lx + PAD_X, n.y + nh * 0.24);
}

// ── 'badge' — root/important node ────────────────────────────────────────────

function _drawBadgeNode(ctx, n, nw, nh, tCol, isActive, isHover, isDragged, isFocused,
                        accent, bg, bg2, border, text, animT, tr) {
  const lx = n.x - nw / 2, ty = n.y - nh / 2;
  const HEADER_H = nh * 0.38;
  const PAD_X = 8 / tr.k, availW = nw - PAD_X * 2;
  const rx = NODE_RX + 2;

  _shadow(ctx, n, nw, nh, isDragged, tr, bg);

  // Body background
  roundRect(ctx, lx, ty, nw, nh, rx);
  ctx.fillStyle = isActive ? rgba(accent, 0.1) : bg2;
  ctx.fill();

  // Header strip with gradient
  ctx.save();
  ctx.beginPath();
  roundRect(ctx, lx, ty, nw, HEADER_H + rx, rx);
  ctx.rect(lx, ty + rx, nw, HEADER_H);
  ctx.clip();
  const hGrad = ctx.createLinearGradient(lx, ty, lx + nw, ty);
  hGrad.addColorStop(0, rgba(tCol, isActive ? 0.4 : 0.22));
  hGrad.addColorStop(1, rgba(tCol, isActive ? 0.15 : 0.06));
  ctx.fillStyle = hGrad;
  ctx.fillRect(lx, ty, nw, HEADER_H);
  ctx.restore();

  // Separator
  ctx.beginPath();
  ctx.moveTo(lx + PAD_X, ty + HEADER_H);
  ctx.lineTo(lx + nw - PAD_X, ty + HEADER_H);
  ctx.strokeStyle = rgba(tCol, 0.25);
  ctx.lineWidth   = 0.5 / tr.k;
  ctx.stroke();

  // Border
  if (isActive) {
    _activeBorder(ctx, n, nw, nh, accent, animT, tr);
  } else {
    roundRect(ctx, lx, ty, nw, nh, rx);
    ctx.strokeStyle = isHover ? rgba(tCol, 0.7) : rgba(tCol, 0.35);
    ctx.lineWidth   = (isHover ? 1.6 : 1.0) / tr.k;
    ctx.stroke();
  }

  // Title in header
  const titleSz = HEADER_H * 0.52;
  ctx.font      = `700 ${titleSz}px Inter, Segoe UI, system-ui, sans-serif`;
  ctx.textAlign = "left";
  ctx.fillStyle = isActive ? "#fff" : rgba(text, 0.95);
  ctx.fillText(
    clipText(ctx, n.concept.title || n.id, availW),
    lx + PAD_X,
    ty + HEADER_H / 2,
  );

  // Tag below header
  const bodySz = (nh - HEADER_H) * 0.32;
  ctx.font      = `${bodySz}px Inter, Segoe UI, system-ui, sans-serif`;
  ctx.fillStyle = rgba(tCol, 0.55);
  const nodeTag  = (n.concept.tags || [])[0] || "";
  ctx.fillText(clipText(ctx, nodeTag, availW), lx + PAD_X, ty + HEADER_H + (nh - HEADER_H) * 0.55);
}

// ── 'pill' — uniform capsule node, size scales with depth ────────────────────

function _drawPillNode(ctx, n, nw, nh, tCol, isActive, isHover, isDragged, isFocused,
                       accent, bg, bg2, border, text, animT, tr) {
  const lx = n.x - nw / 2, ty = n.y - nh / 2;

  // Base height at this depth — determines font size and corner radius
  const baseH = Math.round(NODE_VARIANTS.pill.h * nodeDepthScale(n.depth || 0));
  // Cap the corner radius at baseH/2 so multi-line nodes don't over-round
  const rx = Math.min(nh / 2, baseH / 2);
  const PAD_X = rx * 0.6 + 2 / tr.k;
  const availW = nw - PAD_X * 2;

  // Organic border alpha animation (phase seeded per node)
  const seed = nodeAnimSeed(n.id);
  const wave = 0.5 + 0.5 * Math.sin(animT * seed.speed + seed.phase);

  _shadow(ctx, n, nw, nh, isDragged, tr, bg);

  // Background
  roundRect(ctx, lx, ty, nw, nh, rx);
  if (isActive) {
    ctx.fillStyle = rgba(accent, 0.15);
  } else if (isHover) {
    ctx.fillStyle = rgba(tCol, 0.12);
  } else {
    ctx.fillStyle = rgba(tCol, 0.05 + wave * 0.03);
  }
  ctx.fill();

  // Border (organically pulsing alpha)
  roundRect(ctx, lx, ty, nw, nh, rx);
  if (isActive) {
    _activeBorder(ctx, n, nw, nh, accent, animT, tr);
  } else {
    ctx.strokeStyle = rgba(tCol, isHover ? 0.65 : 0.28 + wave * 0.18);
    ctx.lineWidth   = (isHover ? 1.4 : 0.8 + wave * 0.3) / tr.k;
    ctx.stroke();
  }

  // Centered title — font based on single-line baseH, supports up to 6 lines
  const titleSz = baseH * 0.36;
  ctx.font      = `500 ${titleSz}px Inter, Segoe UI, system-ui, sans-serif`;
  ctx.textAlign = "center";
  ctx.fillStyle = isActive ? "#fff" : rgba(tCol, 0.9);
  const titleLines = _wrapTitle(ctx, n.concept.title || n.id, availW, 6);
  const lineH = titleSz * 1.25;
  for (let i = 0; i < titleLines.length; i++) {
    const yOff = (i + 0.5 - titleLines.length / 2) * lineH;
    ctx.fillText(titleLines[i], n.x, n.y + yOff);
  }
  ctx.textAlign = "left";
}

// ── 'photo' — node with image thumbnail ──────────────────────────────────────

function _drawPhotoNode(ctx, n, nw, nh, tCol, isActive, isHover, isDragged, isFocused,
                        accent, bg, bg2, border, text, animT, tr) {
  const lx = n.x - nw / 2, ty = n.y - nh / 2;
  const rx = NODE_RX + 1;
  const IMG_H  = PHOTO_IMG_H;
  const TEXT_H = nh - IMG_H;
  const PAD_X  = 7 / tr.k, availW = nw - PAD_X * 2;

  _shadow(ctx, n, nw, nh, isDragged, tr, bg);

  // Card background
  roundRect(ctx, lx, ty, nw, nh, rx);
  ctx.fillStyle = bg2;
  ctx.fill();

  // ── Image section ──────────────────────────────────────────────────────────
  const entry = getImg(n.concept.image);
  ctx.save();
  ctx.beginPath();
  // Top-rounded clip for image area
  ctx.moveTo(lx + rx, ty);
  ctx.lineTo(lx + nw - rx, ty);
  ctx.quadraticCurveTo(lx + nw, ty, lx + nw, ty + rx);
  ctx.lineTo(lx + nw, ty + IMG_H);
  ctx.lineTo(lx, ty + IMG_H);
  ctx.lineTo(lx, ty + rx);
  ctx.quadraticCurveTo(lx, ty, lx + rx, ty);
  ctx.closePath();
  ctx.clip();

  if (entry?.ready) {
    // Draw image with object-fit: cover simulation
    const imgAspect = entry.img.naturalWidth / entry.img.naturalHeight;
    const boxAspect = nw / IMG_H;
    let sx2 = 0, sy2 = 0, sw = entry.img.naturalWidth, sh = entry.img.naturalHeight;
    if (imgAspect > boxAspect) {
      sw = sh * boxAspect;
      sx2 = (entry.img.naturalWidth - sw) / 2;
    } else {
      sh = sw / boxAspect;
      sy2 = (entry.img.naturalHeight - sh) / 2;
    }
    ctx.drawImage(entry.img, sx2, sy2, sw, sh, lx, ty, nw, IMG_H);

    // Gradient overlay bottom of image -> bg2 (smooth bleed into text area)
    const fadeGrad = ctx.createLinearGradient(0, ty + IMG_H - IMG_H * 0.35, 0, ty + IMG_H);
    fadeGrad.addColorStop(0, "rgba(0,0,0,0)");
    fadeGrad.addColorStop(1, bg2);
    ctx.fillStyle = fadeGrad;
    ctx.fillRect(lx, ty + IMG_H - IMG_H * 0.35, nw, IMG_H * 0.35);
  } else {
    // Placeholder: patterned background while loading
    ctx.fillStyle = rgba(tCol, 0.08);
    ctx.fillRect(lx, ty, nw, IMG_H);
    const placeholderSz = IMG_H * 0.32;
    ctx.font = `${placeholderSz}px sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = rgba(tCol, entry?.error ? 0.18 : 0.25);
    ctx.fillText(entry?.error ? "⚠" : "⬡", n.x, ty + IMG_H / 2);
    ctx.textBaseline = "middle";
  }
  ctx.restore();

  // ── Text section ───────────────────────────────────────────────────────────
  // Title
  const titleSz = TEXT_H * 0.34;
  ctx.font      = `600 ${titleSz}px Inter, Segoe UI, system-ui, sans-serif`;
  ctx.textAlign = "left";
  ctx.fillStyle = isActive ? "#fff" : rgba(text, 0.95);
  ctx.fillText(
    clipText(ctx, n.concept.title || n.id, availW),
    lx + PAD_X,
    ty + IMG_H + TEXT_H * 0.36,
  );

  // Tag
  const tagSz   = TEXT_H * 0.24;
  const nodeTag  = (n.concept.tags || [])[0] || "";
  ctx.font       = `${tagSz}px Inter, Segoe UI, system-ui, sans-serif`;
  ctx.fillStyle  = rgba(tCol, 0.55);
  ctx.fillText(
    clipText(ctx, nodeTag || `depth ${n.depth}`, availW),
    lx + PAD_X,
    ty + IMG_H + TEXT_H * 0.72,
  );

  // Separator between image and text
  ctx.beginPath();
  ctx.moveTo(lx, ty + IMG_H);
  ctx.lineTo(lx + nw, ty + IMG_H);
  ctx.strokeStyle = rgba(border, 0.4);
  ctx.lineWidth   = 0.5 / tr.k;
  ctx.stroke();

  // Outer border
  if (isActive) {
    _activeBorder(ctx, n, nw, nh, accent, animT, tr);
  } else {
    roundRect(ctx, lx, ty, nw, nh, rx);
    ctx.strokeStyle = isHover ? rgba(tCol, 0.65) : rgba(border, 0.6);
    ctx.lineWidth   = (isHover ? 1.5 : 0.7) / tr.k;
    ctx.stroke();
  }
}
