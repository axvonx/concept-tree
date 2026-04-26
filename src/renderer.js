/**
 * renderer.js — Canvas rendering for the concept tree.
 *
 * Draws group blobs, edges, node cards, and the bottom tag strip.
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
    logW, logH, dpr, tr, simNodes, simLinks, groups,
    tagColors, highlightTags, activeId, hoverNodeId, dragNode,
    theme, animT,
    bookmarks = new Set(),
    highlightNodeIds = new Set(),
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
    const sTags = s.concept.tags || [];
    const tTags = t.concept.tags || [];
    const sTag = sTags[0] || "";
    const tTag = tTags[0] || "";
    const dimmed = highlightTags.size && !sTags.some(t => highlightTags.has(t)) && !tTags.some(t => highlightTags.has(t));
    const dotDx   = t.x - s.x;
    const dotDy   = t.y - s.y;
    const dotDist = Math.hypot(dotDx, dotDy) || 1;
    const dux = dotDx / dotDist, duy = dotDy / dotDist;
    const pull = Math.max(dotDist * 0.35, 10);
    const col = tagColors.get(tTag) || tagColors.get(sTag) || textDim;
    ctx.lineWidth = 1 / tr.k; ctx.strokeStyle = col;
    ctx.globalAlpha = dimmed ? 0.05 : 0.35;
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
    const isActive     = n.id === activeId;
    const isHover      = n.id === hoverNodeId || n === dragNode;
    const isBookmarked = bookmarks.has(n.id);
    const nodeTag      = (n.concept.tags || [])[0] || "";
    const tCol         = tagColors.get(nodeTag) || accent;
    const hasTagFilter = highlightTags.size > 0;
    const hasIdFilter  = highlightNodeIds.size > 0;
    const isLit        = (!hasTagFilter && !hasIdFilter)
      || (hasTagFilter && (n.concept.tags || []).some(t => highlightTags.has(t)))
      || (hasIdFilter  && highlightNodeIds.has(n.id));

    ctx.globalAlpha = isLit ? 1 : 0.15;

    // Bookmark glow ring (drawn before box so it appears behind)
    if (isBookmarked) {
      ctx.save();
      ctx.shadowColor = tCol;
      ctx.shadowBlur  = 6 / tr.k;
      ctx.strokeStyle = rgba(tCol, 0.65);
      ctx.lineWidth   = 1.2 / tr.k;
      roundRect(ctx, n.x - mw / 2, n.y - mh / 2, mw, mh, mrx);
      ctx.stroke();
      ctx.restore();
    }

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

    // Tiny bookmark pip in the top-right corner of the mini box
    if (isBookmarked) {
      const pipW = mw * 0.22;
      const pipH = mh * 0.38;
      const px   = n.x + mw / 2 - pipW - 0.5 / tr.k;
      const py   = n.y - mh / 2 + 0.5 / tr.k;
      ctx.save();
      ctx.shadowColor = tCol;
      ctx.shadowBlur  = 5 / tr.k;
      ctx.fillStyle   = tCol;
      ctx.globalAlpha = 0.9;
      ctx.beginPath();
      ctx.moveTo(px, py);
      ctx.lineTo(px + pipW, py);
      ctx.lineTo(px + pipW, py + pipH);
      ctx.lineTo(px + pipW / 2, py + pipH * 0.7);
      ctx.lineTo(px, py + pipH);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }

    ctx.globalAlpha = 1;
  }
}

// ── Main render ───────────────────────────────────────────────────────────────

export function render(ctx, state) {
  if (state.dotMode) return renderDots(ctx, state);

  const {
    logW, logH, dpr, tr, simNodes, simLinks, groups,
    tagColors, highlightTags, activeId, hoverNodeId, focusedId, dragNode,
    theme, animT,
    bookmarks = new Set(),
    highlightNodeIds = new Set(),
  } = state;

  const bg      = theme.bg;
  const bg2     = theme.bg2;
  const text    = theme.text;
  const textDim = theme.textDim;
  const border  = theme.border;
  const accent  = theme.accent;

  // ── Clear (gradient background) ────────────────────────────────────────
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  if (state.gradient !== false) {
    const grad = ctx.createRadialGradient(
      logW * dpr * 0.5, logH * dpr * 0.4, 0,
      logW * dpr * 0.5, logH * dpr * 0.4, Math.hypot(logW * dpr, logH * dpr) * 0.7,
    );
    grad.addColorStop(0, bg2);
    grad.addColorStop(1, bg);
    ctx.fillStyle = grad;
  } else {
    ctx.fillStyle = bg;
  }
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
  for (const lk of simLinks) {
    const s = lk.source, t = lk.target;
    if (typeof s !== "object" || typeof t !== "object") continue;

    const sTags  = s.concept.tags || [];
    const tTags  = t.concept.tags || [];
    const sTag   = sTags[0] || "";
    const tTag   = tTags[0] || "";
    const dimmed = highlightTags.size && !sTags.some(t => highlightTags.has(t)) && !tTags.some(t => highlightTags.has(t));

    const sHW = (s.nw || NODE_W) / 2, sHH = (s.nh || NODE_H) / 2;
    const tHW = (t.nw || NODE_W) / 2, tHH = (t.nh || NODE_H) / 2;

    const edgeDx   = t.x - s.x;
    const edgeDy   = t.y - s.y;
    const edgeDist = Math.hypot(edgeDx, edgeDy) || 1;
    const ux = edgeDx / edgeDist;
    const uy = edgeDy / edgeDist;

    const sClip = Math.min(sHW / (Math.abs(ux) || 1e-6), sHH / (Math.abs(uy) || 1e-6));
    const tClip = Math.min(tHW / (Math.abs(ux) || 1e-6), tHH / (Math.abs(uy) || 1e-6));

    const sx  = s.x + ux * sClip;
    const sy0 = s.y + uy * sClip;
    const tx  = t.x - ux * tClip;
    const ty0 = t.y - uy * tClip;

    const pull = Math.max(edgeDist * 0.35, 18);
    const col  = tagColors.get(tTag) || tagColors.get(sTag) || textDim;
    ctx.lineWidth   = 1.5 / tr.k;
    ctx.strokeStyle = col;
    ctx.globalAlpha = dimmed ? 0.05 : 0.42;

    ctx.beginPath();
    ctx.moveTo(sx, sy0);
    ctx.bezierCurveTo(
      sx + ux * pull, sy0 + uy * pull,
      tx - ux * pull, ty0 - uy * pull,
      tx, ty0,
    );
    ctx.stroke();
  }
  ctx.globalAlpha = 1;

  // ── Node cards ────────────────────────────────────────────────────────────
  ctx.textBaseline = "middle";

  for (const n of simNodes) {
    const isActive     = n.id === activeId;
    const isFocused    = n.id === focusedId;
    const isHover      = n.id === hoverNodeId || n === dragNode;
    const isDragged    = n === dragNode;
    const isBookmarked = bookmarks.has(n.id);
    const nodeTag      = (n.concept.tags || [])[0] || "";
    const tCol         = tagColors.get(nodeTag) || text;
    const hasTagFilter  = highlightTags.size > 0;
    const hasIdFilter   = highlightNodeIds.size > 0;
    const isLit         = (!hasTagFilter && !hasIdFilter)
      || (hasTagFilter && (n.concept.tags || []).some(t => highlightTags.has(t)))
      || (hasIdFilter  && highlightNodeIds.has(n.id));
    const variant   = n.variant || "card";
    const nw        = n.nw || NODE_W;
    const nh        = n.nh || NODE_H;

    ctx.globalAlpha = isLit ? 1 : 0.15;

    if (isBookmarked) _bookmarkGlow(ctx, n, nw, nh, tCol, tr);

    switch (variant) {
      case "photo":  _drawPhotoNode(ctx, n, nw, nh, tCol, isActive, isHover, isDragged, isFocused, accent, bg, bg2, border, text, animT, tr, isBookmarked); break;
      case "badge":  _drawBadgeNode(ctx, n, nw, nh, tCol, isActive, isHover, isDragged, isFocused, accent, bg, bg2, border, text, animT, tr, isBookmarked); break;
      case "pill":   _drawPillNode (ctx, n, nw, nh, tCol, isActive, isHover, isDragged, isFocused, accent, bg, bg2, border, text, animT, tr, isBookmarked); break;
      default:       _drawCardNode (ctx, n, nw, nh, tCol, isActive, isHover, isDragged, isFocused, accent, bg, bg2, border, text, textDim, animT, tr, isBookmarked); break;
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

  // ── Hover tooltip ─────────────────────────────────────────────────────────
  const tipNode = hoverNodeId ? simNodes.find(n => n.id === hoverNodeId) : null;
  if (tipNode && state._tipX != null) {
    const title   = tipNode.concept.title || tipNode.id;
    const snippet = _tipSnippet(tipNode.concept.body);

    const TIP_PAD   = 10;
    const TIP_MAX_W = 220;
    const TITLE_SZ  = 13;
    const BODY_SZ   = 11;
    const LINE_H    = BODY_SZ * 1.5;

    ctx.font = `700 ${TITLE_SZ}px Inter, Segoe UI, system-ui, sans-serif`;
    const titleW = Math.min(ctx.measureText(title).width, TIP_MAX_W - TIP_PAD * 2);

    ctx.font = `${BODY_SZ}px Inter, Segoe UI, system-ui, sans-serif`;
    const bodyLines = snippet ? _wrapTipText(ctx, snippet, TIP_MAX_W - TIP_PAD * 2, 3) : [];

    const tipW = Math.max(titleW, ...bodyLines.map(l => ctx.measureText(l).width)) + TIP_PAD * 2;
    const tipH = TIP_PAD * 2 + TITLE_SZ + (bodyLines.length ? TIP_PAD * 0.5 + bodyLines.length * LINE_H : 0);

    // Position: offset from cursor, clamped to canvas
    let tx = state._tipX + 14;
    let ty = state._tipY - tipH - 8;
    if (tx + tipW > logW - 4) tx = state._tipX - tipW - 14;
    if (ty < 4) ty = state._tipY + 18;
    if (ty + tipH > stripY - 4) ty = stripY - tipH - 4;

    const isLight = bg && parseInt(bg.slice(1, 3), 16) > 150;
    ctx.shadowColor   = isLight ? "rgba(0,0,0,0.12)" : "rgba(0,0,0,0.5)";
    ctx.shadowBlur    = 12;
    ctx.shadowOffsetY = 3;

    // Background
    ctx.beginPath();
    _roundRectPath(ctx, tx, ty, tipW, tipH, 8);
    ctx.fillStyle = bg2;
    ctx.fill();

    ctx.shadowColor = "transparent"; ctx.shadowBlur = 0; ctx.shadowOffsetY = 0;

    // Border
    ctx.beginPath();
    _roundRectPath(ctx, tx, ty, tipW, tipH, 8);
    ctx.strokeStyle = rgba(border, 0.9);
    ctx.lineWidth   = 1;
    ctx.stroke();

    // Title
    ctx.font      = `700 ${TITLE_SZ}px Inter, Segoe UI, system-ui, sans-serif`;
    ctx.textAlign = "left";
    ctx.fillStyle = text;
    ctx.textBaseline = "top";
    ctx.fillText(title, tx + TIP_PAD, ty + TIP_PAD);

    // Body
    if (bodyLines.length) {
      ctx.font      = `${BODY_SZ}px Inter, Segoe UI, system-ui, sans-serif`;
      ctx.fillStyle = textDim;
      const bodyStartY = ty + TIP_PAD + TITLE_SZ + TIP_PAD * 0.5;
      for (let i = 0; i < bodyLines.length; i++) {
        ctx.fillText(bodyLines[i], tx + TIP_PAD, bodyStartY + i * LINE_H);
      }
    }

    ctx.textBaseline = "alphabetic";
  }
}

function _roundRectPath(ctx, x, y, w, h, r) {
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

function _tipSnippet(body, maxLen = 120) {
  if (!body) return "";
  const lines = body.split("\n");
  const kept = [];
  for (const l of lines) {
    const t = l.trim();
    if (!t || t.startsWith("#")) continue;
    const clean = t
      .replace(/!\[.*?\]\(.*?\)/g, "")
      .replace(/\[([^\]]*)\]\(.*?\)/g, "$1")
      .replace(/[*_`~]/g, "")
      .trim();
    if (!clean) continue;
    kept.push(clean);
    if (kept.join(" ").length >= maxLen) break;
  }
  const text = kept.join(" ").trim();
  return text.length > maxLen ? text.slice(0, maxLen - 1) + "…" : text;
}

function _wrapTipText(ctx, text, maxW, maxLines) {
  if (!text) return [];
  if (ctx.measureText(text).width <= maxW) return [text];
  const words = text.split(" ");
  const lines = [];
  let cur = "";
  for (const word of words) {
    const test = cur ? cur + " " + word : word;
    if (ctx.measureText(test).width <= maxW) {
      cur = test;
    } else {
      if (lines.length === maxLines - 1) {
        lines.push(cur + (cur ? " " : "") + "…");
        return lines;
      }
      if (cur) lines.push(cur);
      cur = word;
    }
  }
  if (cur && lines.length < maxLines) lines.push(cur);
  return lines;
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

// ── Bookmark rendering ────────────────────────────────────────────────────────

/**
 * Draw a bookmark ribbon icon centered vertically at (x + iconW/2, centerY).
 * x is the left edge of the icon. sz is the desired height.
 */
export function drawBookmarkFlag(ctx, x, centerY, sz, color, tr) {
  const w = sz * 0.52;
  const h = sz;
  const y = centerY - h / 2;
  ctx.save();
  ctx.shadowColor = color;
  ctx.shadowBlur  = 8 / tr.k;
  ctx.fillStyle   = color;
  ctx.globalAlpha = 0.88;
  ctx.beginPath();
  ctx.moveTo(x,         y);
  ctx.lineTo(x + w,     y);
  ctx.lineTo(x + w,     y + h);
  ctx.lineTo(x + w / 2, y + h * 0.68);
  ctx.lineTo(x,         y + h);
  ctx.closePath();
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.restore();
}

function _bookmarkGlow(ctx, n, nw, nh, tCol, tr) {
  ctx.save();
  ctx.shadowColor  = tCol;
  ctx.shadowBlur   = 14 / tr.k;
  ctx.strokeStyle  = rgba(tCol, 0.45);
  ctx.lineWidth    = 1.5 / tr.k;
  roundRect(ctx, n.x - nw / 2, n.y - nh / 2, nw, nh, NODE_RX);
  ctx.stroke();
  ctx.restore();
}

// ── Node variant drawing helpers ──────────────────────────────────────────────

function _shadow(ctx, n, nw, nh, isDragged, tr, bg, rx = NODE_RX) {
  const sOff = (isDragged ? 6 : 2) / tr.k;
  roundRect(ctx, n.x - nw / 2 + sOff, n.y - nh / 2 + sOff, nw, nh, rx);
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
                       accent, bg, bg2, border, text, textDim, animT, tr, isBookmarked) {
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
  const titleSz  = nh * 0.26;
  const iconOff  = isBookmarked ? titleSz * 0.56 + 3 / tr.k : 0;
  ctx.font       = `600 ${titleSz}px Inter, Segoe UI, system-ui, sans-serif`;
  ctx.textAlign  = "left";
  ctx.fillStyle  = isActive ? "#fff" : rgba(tCol, 0.95);
  const titleLines = _wrapTitle(ctx, n.concept.title || n.id, availW - iconOff);
  const titleX     = lx + PAD_X + iconOff;
  if (isBookmarked) {
    const centerY1 = titleLines.length === 1 ? n.y - nh * 0.18 : n.y - nh * 0.33;
    drawBookmarkFlag(ctx, lx + PAD_X, centerY1, titleSz, tCol, tr);
  }
  if (titleLines.length === 1) {
    ctx.fillText(titleLines[0], titleX, n.y - nh * 0.18);
  } else {
    const lineH = titleSz * 1.25;
    ctx.fillText(titleLines[0], titleX, n.y - nh * 0.33);
    ctx.fillText(titleLines[1], titleX, n.y - nh * 0.33 + lineH);
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
                        accent, bg, bg2, border, text, animT, tr, isBookmarked) {
  const lx = n.x - nw / 2, ty = n.y - nh / 2;
  const HEADER_H = nh * 0.38;
  const PAD_X = 8 / tr.k, availW = nw - PAD_X * 2;
  const rx = NODE_RX + 2;

  _shadow(ctx, n, nw, nh, isDragged, tr, bg, rx);

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
  const iconOff = isBookmarked ? titleSz * 0.56 + 3 / tr.k : 0;
  ctx.font      = `700 ${titleSz}px Inter, Segoe UI, system-ui, sans-serif`;
  ctx.textAlign = "left";
  ctx.fillStyle = isActive ? "#fff" : rgba(text, 0.95);
  if (isBookmarked) {
    drawBookmarkFlag(ctx, lx + PAD_X, ty + HEADER_H / 2, titleSz, tCol, tr);
  }
  ctx.fillText(
    clipText(ctx, n.concept.title || n.id, availW - iconOff),
    lx + PAD_X + iconOff,
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
                       accent, bg, bg2, border, text, animT, tr, isBookmarked) {
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

  _shadow(ctx, n, nw, nh, isDragged, tr, bg, rx);

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

  // Title — centered normally; with bookmark, icon+text group is centered as a unit
  const titleSz = baseH * 0.36;
  ctx.font      = `500 ${titleSz}px Inter, Segoe UI, system-ui, sans-serif`;
  ctx.fillStyle = isActive ? "#fff" : rgba(tCol, 0.9);

  const iconW   = isBookmarked ? titleSz * 0.52 + 3 / tr.k : 0;
  const titleLines = _wrapTitle(ctx, n.concept.title || n.id, availW - iconW, 6);
  const lineH   = titleSz * 1.25;
  const textBlockW = Math.max(...titleLines.map(l => ctx.measureText(l).width));
  const groupW  = iconW + textBlockW;
  const groupX  = n.x - groupW / 2;

  if (isBookmarked) {
    const iconCenterY = n.y + (0.5 - titleLines.length / 2) * lineH;
    drawBookmarkFlag(ctx, groupX, iconCenterY, titleSz, tCol, tr);
  }

  ctx.textAlign = "left";
  const textX   = groupX + iconW;
  for (let i = 0; i < titleLines.length; i++) {
    const yOff = (i + 0.5 - titleLines.length / 2) * lineH;
    ctx.fillText(titleLines[i], textX, n.y + yOff);
  }
  ctx.textAlign = "left";
}

// ── 'photo' — node with image thumbnail ──────────────────────────────────────

function _drawPhotoNode(ctx, n, nw, nh, tCol, isActive, isHover, isDragged, isFocused,
                        accent, bg, bg2, border, text, animT, tr, isBookmarked) {
  const lx = n.x - nw / 2, ty = n.y - nh / 2;
  const rx = NODE_RX + 1;
  const IMG_H  = PHOTO_IMG_H;
  const TEXT_H = nh - IMG_H;
  const PAD_X  = 7 / tr.k, availW = nw - PAD_X * 2;

  _shadow(ctx, n, nw, nh, isDragged, tr, bg, rx);

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
  const iconOff = isBookmarked ? titleSz * 0.56 + 3 / tr.k : 0;
  ctx.font      = `600 ${titleSz}px Inter, Segoe UI, system-ui, sans-serif`;
  ctx.textAlign = "left";
  ctx.fillStyle = isActive ? "#fff" : rgba(text, 0.95);
  if (isBookmarked) {
    drawBookmarkFlag(ctx, lx + PAD_X, ty + IMG_H + TEXT_H * 0.36, titleSz, tCol, tr);
  }
  ctx.fillText(
    clipText(ctx, n.concept.title || n.id, availW - iconOff),
    lx + PAD_X + iconOff,
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
