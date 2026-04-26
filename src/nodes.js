/**
 * nodes.js — Per-node variant and dimension logic for concept-tree.
 *
 * All non-photo nodes use the 'pill' variant.  Size scales with depth:
 * root (depth 0) nodes are largest; deeper nodes shrink progressively.
 *
 *   'photo' — nodes with an image field, taller card with image strip
 *   'pill'  — all other nodes (formerly card/badge) — uniform capsule shape
 */

// Base pixel dimensions for each variant { w, h }
export const NODE_VARIANTS = {
  card:  { w: 180, h: 72  },
  badge: { w: 224, h: 88  },
  photo: { w: 196, h: 138 },
  pill:  { w: 162, h: 54  },
};

// Height of the image strip inside a 'photo' node
export const PHOTO_IMG_H = 82;

/**
 * Scale factor for node dimensions based on depth.
 * Root (depth 0) is largest; nodes shrink as depth increases.
 *
 * @param {number} depth
 * @returns {number}
 */
export function nodeDepthScale(depth) {
  const scales = [1.8, 1.0, 0.78, 0.64, 0.54];
  return scales[Math.min(depth, scales.length - 1)];
}

/**
 * Determine the visual variant for a concept node.
 * All non-photo nodes are uniform 'pill' shapes; size is controlled by depth.
 *
 * @param {Object} concept - The concept node
 * @param {number} depth   - Tree depth (0 = root)
 * @returns {string} variant name
 */
export function nodeVariant(concept, depth) {
  if (concept.image) return "photo";
  return "pill";
}

/**
 * Return the pixel dimensions for a variant.
 * @param {string} variant
 * @returns {{ w: number, h: number }}
 */
export function nodeDims(variant) {
  return NODE_VARIANTS[variant] || NODE_VARIANTS.card;
}

// Estimated average character widths and total horizontal padding per variant.
const _CHAR_W = { card: 9.4, badge: 9.8, photo: 9.4, pill: 9.4 };
const _PAD_X  = { card: 34,  badge: 40,  photo: 34,  pill: 44 };
const _MAX_W  = { card: 340, badge: 380, photo: 320, pill: 300 };

/**
 * Return dimensions for a variant, scaling by depth and expanding height
 * to accommodate multi-line titles (up to 6 lines).
 *
 * Width grows beyond the depth-scaled minimum only when the title is long
 * enough to overflow, capped at a per-variant absolute maximum.
 * Height grows by ~35% of the base height per additional line.
 *
 * @param {string} variant
 * @param {string} title
 * @param {number} [depth=1]
 * @returns {{ w: number, h: number }}
 */
export function nodeDimsForTitle(variant, title, depth = 1) {
  // Photo nodes: image strip has fixed layout — no depth scaling, no height expansion
  if (variant === "photo") {
    const base  = NODE_VARIANTS.photo;
    const textW = (title || "").length * 9.4 + 34;
    return { w: Math.max(base.w, Math.min(Math.ceil(textW), _MAX_W.photo)), h: base.h };
  }

  const scale   = nodeDepthScale(depth);
  const raw     = NODE_VARIANTS[variant] || NODE_VARIANTS.card;
  const baseW   = Math.round(raw.w * scale);
  const baseH   = Math.round(raw.h * scale);

  // Character metrics scale with node size (font is proportional to height)
  const cw  = (_CHAR_W[variant] || 9.4) * scale;
  const pad = (_PAD_X[variant]  || 44)  * scale;
  // Max width is an absolute screen cap — does not scale up with depth
  const mx  = _MAX_W[variant] || 260;

  const textW = (title || "").length * cw + pad;
  const w     = Math.max(baseW, Math.min(Math.ceil(textW), mx));

  // Estimate number of lines needed (used for height expansion only)
  const availW      = Math.max(1, w - pad);
  const charsPerLine = Math.max(1, Math.floor(availW / cw));
  const titleLen    = (title || "").length;
  const lines       = titleLen < 2 ? 1 : Math.min(6, Math.ceil(titleLen / charsPerLine));
  const lineH       = Math.round(baseH * 0.35);

  return { w, h: baseH + (lines - 1) * lineH };
}

/**
 * Re-measure node dimensions using actual canvas text metrics.
 * Call this after buildGraph, using any CanvasRenderingContext2D (e.g. an offscreen canvas).
 * Updates n.nw and n.nh in-place on each node.
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {Array} nodes - sim nodes with .variant, .depth, .concept
 */
export function remeasureNodeDims(ctx, nodes) {
  for (const n of nodes) {
    if (n.variant === "photo") continue;
    const depth   = n.depth || 0;
    const scale   = nodeDepthScale(depth);
    const raw     = NODE_VARIANTS[n.variant] || NODE_VARIANTS.pill;
    const baseW   = Math.round(raw.w * scale);
    const baseH   = Math.round(raw.h * scale);
    const mx      = _MAX_W[n.variant] || 300;
    const title   = n.concept?.title || n.id || "";

    let titleSz, padX, fontWeight;
    if (n.variant === "pill") {
      titleSz    = baseH * 0.36;
      padX       = (baseH / 2) * 0.6 + 2;  // rx * 0.6 + 2 (rx = baseH/2 for any line count)
      fontWeight = "500";
    } else if (n.variant === "card") {
      titleSz    = baseH * 0.26;
      padX       = 7;
      fontWeight = "600";
    } else if (n.variant === "badge") {
      const HEADER_H = baseH * 0.38;
      titleSz    = HEADER_H * 0.52;
      padX       = 8;
      fontWeight = "700";
    } else {
      continue;
    }

    ctx.font = `${fontWeight} ${titleSz}px Inter, Segoe UI, system-ui, sans-serif`;
    const fullW = ctx.measureText(title).width;
    const w     = Math.max(baseW, Math.min(Math.ceil(fullW + padX * 2), mx));

    // Count wrap lines at the computed width
    const availW = w - padX * 2;
    let lines = 1;
    if (fullW > availW && title.includes(" ")) {
      const words = title.split(" ");
      lines = 0;
      let cur = "";
      for (const word of words) {
        const test = cur ? cur + " " + word : word;
        if (ctx.measureText(test).width <= availW) {
          cur = test;
        } else {
          lines++;
          cur = word;
        }
      }
      if (cur) lines++;
      lines = Math.min(lines, 6);
    }

    const lineH = Math.round(baseH * 0.35);
    n.nw = w;
    n.nh = baseH + (lines - 1) * lineH;
  }
}
