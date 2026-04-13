/**
 * interaction.js — Mouse, wheel, keyboard, and touch handlers for the concept tree.
 *
 * Each handler mutates the shared `state` object passed in from the ConceptTree
 * instance, keeping interaction logic separate from rendering.
 */

import { NODE_W, NODE_H, DOT_R } from "./renderer.js";

// ── Hit testing ──────────────────────────────────────────────────────────────

function toWorld(sx, sy, tr) {
  return { x: (sx - tr.tx) / tr.k, y: (sy - tr.ty) / tr.k };
}

/**
 * Find the nearest node to screen position (sx, sy).
 *
 * @param {number} sx - screen x
 * @param {number} sy - screen y
 * @param {Object} state
 * @param {number} [hitScale=1] - multiplier for hit bounds (use <1 for tighter touch-tap areas)
 */
export function nearestNode(sx, sy, state, hitScale = 1) {
  const { x: wx, y: wy } = toWorld(sx, sy, state.tr);
  let best = null, bd = Infinity;
  for (const n of state.simNodes) {
    let hw, hh;
    if (state.dotMode) {
      // Dot-mode nodes are tiny dots — use a small fixed screen-space hit radius
      const hitR = (DOT_R + 4) * hitScale / state.tr.k;
      hw = hitR; hh = hitR;
    } else {
      hw = ((n.nw || NODE_W) / 2 + 4) * hitScale / state.tr.k;
      hh = ((n.nh || NODE_H) / 2 + 6) * hitScale / state.tr.k;
    }
    if (Math.abs(n.x - wx) < hw && Math.abs(n.y - wy) < hh) {
      const d = Math.hypot(n.x - wx, n.y - wy);
      if (d < bd) { bd = d; best = n; }
    }
  }
  return best;
}

// ── Zoom helpers ─────────────────────────────────────────────────────────────

export function zoomTo(factor, sx, sy, state) {
  const k1 = Math.max(state.minZoom, Math.min(8, state.trTarget.k * factor));
  state.trTarget.tx = sx - (sx - state.trTarget.tx) * (k1 / state.trTarget.k);
  state.trTarget.ty = sy - (sy - state.trTarget.ty) * (k1 / state.trTarget.k);
  state.trTarget.k = k1;
}

export function zoomIn(state) {
  zoomTo(1.35, state.logW / 2, state.logH / 2, state);
}

export function zoomOut(state) {
  zoomTo(1 / 1.35, state.logW / 2, state.logH / 2, state);
}

export function fitAll(state) {
  state.trTarget.k  = state.fitParams.k;
  state.trTarget.tx = state.logW / 2 - state.fitParams.cx * state.fitParams.k;
  state.trTarget.ty = (state.logH - 32) / 2 - state.fitParams.cy * state.fitParams.k;
}

// ── Smooth pan/zoom lerp ─────────────────────────────────────────────────────

export function lerpTransform(state) {
  if (state._drag) return;
  const L = 0.15;
  state.tr.k  += (state.trTarget.k  - state.tr.k)  * L;
  state.tr.tx += (state.trTarget.tx - state.tr.tx) * L;
  state.tr.ty += (state.trTarget.ty - state.tr.ty) * L;
}

// ── Event handler factories ──────────────────────────────────────────────────

export function createHandlers(state, callbacks = {}) {
  const { onNodeClick, onNodeHover, onNodeUnhover } = callbacks;

  function onWheel(e) {
    e.preventDefault();
    const rect = state.canvas.getBoundingClientRect();
    zoomTo(e.deltaY < 0 ? 1.13 : 0.885, e.clientX - rect.left, e.clientY - rect.top, state);
  }

  function onMouseDown(e) {
    if (e.button !== 0) return;
    const rect = state.canvas.getBoundingClientRect();
    const sx = e.clientX - rect.left, sy = e.clientY - rect.top;
    const n = nearestNode(sx, sy, state);

    if (n) {
      state.dragNode = n;
      state._dragNodeMoved = false;
      state._dragNodeStartSX = sx;
      state._dragNodeStartSY = sy;
      n.fx = n.x;
      n.fy = n.y;
      if (state.sim) state.sim.alphaTarget(0.25).restart();
      state.canvas.style.cursor = "grabbing";
    } else {
      state._drag = {
        sx: e.clientX, sy: e.clientY,
        tx0: state.trTarget.tx, ty0: state.trTarget.ty,
        moved: false,
      };
      state.canvas.style.cursor = "grabbing";
    }
  }

  function onMouseMove(e) {
    if (!state.canvas) return;

    if (state.dragNode) {
      const rect = state.canvas.getBoundingClientRect();
      const sx = e.clientX - rect.left, sy = e.clientY - rect.top;
      const { x: wx, y: wy } = toWorld(sx, sy, state.tr);
      // Use screen-space threshold (6px) so click vs drag works at any zoom level
      if (Math.hypot(sx - state._dragNodeStartSX, sy - state._dragNodeStartSY) > 6) {
        state._dragNodeMoved = true;
      }
      state.dragNode.fx = wx;
      state.dragNode.fy = wy;
      state.hoverNodeId = null;
      return;
    }

    if (state._drag) {
      const dx = e.clientX - state._drag.sx;
      const dy = e.clientY - state._drag.sy;
      if (Math.hypot(dx, dy) > 6) state._drag.moved = true;
      state.trTarget.tx = state._drag.tx0 + dx;
      state.trTarget.ty = state._drag.ty0 + dy;
      state.tr.tx = state.trTarget.tx;
      state.tr.ty = state.trTarget.ty;
      state.hoverNodeId = null;
      return;
    }

    const rect = state.canvas.getBoundingClientRect();
    const sx = e.clientX - rect.left, sy = e.clientY - rect.top;
    const n = nearestNode(sx, sy, state);

    if (n) {
      state.hoverNodeId = n.id;
      state._tipX = sx;
      state._tipY = sy;
      state.canvas.style.cursor = "pointer";
      if (onNodeHover) onNodeHover(n, sx, sy);
    } else {
      if (state.hoverNodeId && onNodeUnhover) onNodeUnhover();
      state.hoverNodeId = null;
      state.canvas.style.cursor = "grab";
    }
  }

  function onMouseUp(e) {
    if (state.dragNode) {
      const dn = state.dragNode;
      const moved = state._dragNodeMoved;
      dn.fx = null;
      dn.fy = null;
      if (state.sim) state.sim.alphaTarget(0).alpha(0.45).restart();
      state.dragNode = null;
      state._dragNodeMoved = false;
      if (!moved && onNodeClick) onNodeClick(dn);
      if (state.canvas) state.canvas.style.cursor = "grab";
      return;
    }

    if (state._drag) {
      if (!state._drag.moved) {
        const rect = state.canvas.getBoundingClientRect();
        const n = nearestNode(e.clientX - rect.left, e.clientY - rect.top, state);
        if (n && onNodeClick) onNodeClick(n);
      }
      state._drag = null;
      if (state.canvas) state.canvas.style.cursor = "grab";
    }
  }

  function onMouseLeave() {
    state._drag = null;
    if (state.dragNode) {
      state.dragNode.fx = null;
      state.dragNode.fy = null;
      state.dragNode = null;
      if (state.sim) state.sim.alphaTarget(0).alpha(0.3).restart();
    }
    state.hoverNodeId = null;
    if (onNodeUnhover) onNodeUnhover();
  }

  function onKeydown(e) {
    if (e.key === "f" || e.key === "F") { fitAll(state); return; }

    const ARROWS = ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"];
    if (!ARROWS.includes(e.key) && e.key !== "Enter") return;
    e.preventDefault();

    const startId = state.focusedId || state.activeId || state.simNodes[0]?.id;
    if (!startId) return;

    // Build parent/children maps
    const parentOf = new Map();
    const childrenOf = new Map();
    for (const lk of state.simLinks) {
      const sid = typeof lk.source === "object" ? lk.source.id : lk.source;
      const tid = typeof lk.target === "object" ? lk.target.id : lk.target;
      parentOf.set(tid, sid);
      if (!childrenOf.has(sid)) childrenOf.set(sid, []);
      childrenOf.get(sid).push(tid);
    }

    if (e.key === "Enter") {
      const n = state.simNodes.find(n => n.id === startId);
      if (n && onNodeClick) onNodeClick(n);
      return;
    }

    let next = null;
    if (e.key === "ArrowUp") next = parentOf.get(startId) ?? null;
    if (e.key === "ArrowDown") next = (childrenOf.get(startId) || [])[0] ?? null;
    if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
      const par = parentOf.get(startId);
      const sibs = par ? (childrenOf.get(par) || [])
                       : state.simNodes.filter(n => !parentOf.has(n.id)).map(n => n.id);
      const idx = sibs.indexOf(startId);
      next = e.key === "ArrowLeft"
        ? (sibs[idx - 1] ?? sibs[sibs.length - 1])
        : (sibs[idx + 1] ?? sibs[0]);
    }

    if (next) {
      state.focusedId = next;
      const byId = new Map(state.simNodes.map(n => [n.id, n]));
      const n = byId.get(next);
      if (n) {
        state.trTarget.tx = state.logW / 2 - n.x * state.trTarget.k;
        state.trTarget.ty = state.logH / 2 - n.y * state.trTarget.k;
      }
    }
  }

  // Touch support (basic: single-finger pan, pinch zoom)
  let lastTouches = null;

  function onTouchStart(e) {
    if (e.touches.length === 1) {
      const t = e.touches[0];
      const rect = state.canvas.getBoundingClientRect();
      const sx = t.clientX - rect.left, sy = t.clientY - rect.top;
      const n = nearestNode(sx, sy, state);
      if (n) {
        state.dragNode = n;
        state._dragNodeMoved = false;
        state._dragNodeStartSX = sx;
        state._dragNodeStartSY = sy;
        n.fx = n.x; n.fy = n.y;
        if (state.sim) state.sim.alphaTarget(0.25).restart();
      } else {
        state._drag = {
          sx: t.clientX, sy: t.clientY,
          tx0: state.trTarget.tx, ty0: state.trTarget.ty,
          moved: false,
        };
      }
    }
    lastTouches = [...e.touches].map(t => ({ x: t.clientX, y: t.clientY }));
  }

  function onTouchMove(e) {
    e.preventDefault();
    if (e.touches.length === 2 && lastTouches && lastTouches.length === 2) {
      // Pinch zoom
      const d1 = Math.hypot(lastTouches[0].x - lastTouches[1].x, lastTouches[0].y - lastTouches[1].y);
      const d2 = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY);
      const cx = (e.touches[0].clientX + e.touches[1].clientX) / 2;
      const cy = (e.touches[0].clientY + e.touches[1].clientY) / 2;
      const rect = state.canvas.getBoundingClientRect();
      zoomTo(d2 / d1, cx - rect.left, cy - rect.top, state);
    } else if (e.touches.length === 1) {
      const t = e.touches[0];
      if (state.dragNode) {
        const rect = state.canvas.getBoundingClientRect();
        const tsx = t.clientX - rect.left, tsy = t.clientY - rect.top;
        const { x: wx, y: wy } = toWorld(tsx, tsy, state.tr);
        // 10px screen-space threshold before treating as a drag (vs tap)
        if (Math.hypot(tsx - (state._dragNodeStartSX || tsx), tsy - (state._dragNodeStartSY || tsy)) > 10) {
          state._dragNodeMoved = true;
        }
        state.dragNode.fx = wx; state.dragNode.fy = wy;
      } else if (state._drag) {
        const dx = t.clientX - state._drag.sx;
        const dy = t.clientY - state._drag.sy;
        if (Math.hypot(dx, dy) > 12) state._drag.moved = true;
        state.trTarget.tx = state._drag.tx0 + dx;
        state.trTarget.ty = state._drag.ty0 + dy;
        state.tr.tx = state.trTarget.tx;
        state.tr.ty = state.trTarget.ty;
      }
    }
    lastTouches = [...e.touches].map(t => ({ x: t.clientX, y: t.clientY }));
  }

  function onTouchEnd(e) {
    if (state.dragNode) {
      const moved = state._dragNodeMoved;
      state.dragNode.fx = null; state.dragNode.fy = null;
      if (state.sim) state.sim.alphaTarget(0).alpha(0.45).restart();
      if (!moved && onNodeClick) onNodeClick(state.dragNode);
      state.dragNode = null;
      state._dragNodeMoved = false;
    }
    if (state._drag) {
      if (!state._drag.moved && e.changedTouches.length === 1) {
        const t = e.changedTouches[0];
        const rect = state.canvas.getBoundingClientRect();
        // Use tighter hit area (0.5) so stray taps near empty space don't fire
        const n = nearestNode(t.clientX - rect.left, t.clientY - rect.top, state, 0.5);
        if (n && onNodeClick) onNodeClick(n);
      }
      state._drag = null;
    }
    lastTouches = null;
  }

  return {
    onWheel, onMouseDown, onMouseMove, onMouseUp, onMouseLeave,
    onKeydown, onTouchStart, onTouchMove, onTouchEnd,
  };
}

/**
 * Attach all event handlers to the canvas and document.
 * Returns a cleanup function.
 */
export function attachHandlers(canvas, handlers) {
  canvas.addEventListener("wheel", handlers.onWheel, { passive: false });
  canvas.addEventListener("mousedown", handlers.onMouseDown);
  canvas.addEventListener("mousemove", handlers.onMouseMove);
  canvas.addEventListener("mouseup", handlers.onMouseUp);
  canvas.addEventListener("mouseleave", handlers.onMouseLeave);
  canvas.addEventListener("touchstart", handlers.onTouchStart, { passive: false });
  canvas.addEventListener("touchmove", handlers.onTouchMove, { passive: false });
  canvas.addEventListener("touchend", handlers.onTouchEnd);
  document.addEventListener("keydown", handlers.onKeydown);
  canvas.style.cursor = "grab";

  return function detach() {
    canvas.removeEventListener("wheel", handlers.onWheel);
    canvas.removeEventListener("mousedown", handlers.onMouseDown);
    canvas.removeEventListener("mousemove", handlers.onMouseMove);
    canvas.removeEventListener("mouseup", handlers.onMouseUp);
    canvas.removeEventListener("mouseleave", handlers.onMouseLeave);
    canvas.removeEventListener("touchstart", handlers.onTouchStart);
    canvas.removeEventListener("touchmove", handlers.onTouchMove);
    canvas.removeEventListener("touchend", handlers.onTouchEnd);
    document.removeEventListener("keydown", handlers.onKeydown);
  };
}
