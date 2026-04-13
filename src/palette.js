/**
 * palette.js — Color palettes, seeded RNG, and text helpers for concept-tree.
 */

// 15 depth-tier colors — cycling continuously so deep trees stay distinct.
export const TIER_COLORS = [
  "#64748b", "#60a5fa", "#34d399", "#a78bfa", "#fbbf24",
  "#f97316", "#f43f5e", "#22d3ee", "#4ade80", "#e879f9",
  "#facc15", "#818cf8", "#fb923c", "#2dd4bf", "#f472b6",
];

// 20 tag/category colors for the author/tag legend.
export const TAG_COLORS = [
  "#f87171", "#fb923c", "#facc15", "#4ade80", "#22d3ee",
  "#818cf8", "#e879f9", "#f472b6", "#34d399", "#60a5fa",
  "#a3e635", "#f97316", "#c084fc", "#f43f5e", "#0ea5e9",
  "#fbbf24", "#d946ef", "#14b8a6", "#a78bfa", "#38bdf8",
];

/** Return the tier color for depth `d`, cycling through the palette. */
export function tierColor(d) {
  return TIER_COLORS[((d % TIER_COLORS.length) + TIER_COLORS.length) % TIER_COLORS.length];
}

// ── Hex → RGB cache ──────────────────────────────────────────────────────────
const _rgbCache = new Map();

export function hexToRgb(hex) {
  if (!_rgbCache.has(hex)) {
    _rgbCache.set(hex, [
      parseInt(hex.slice(1, 3), 16),
      parseInt(hex.slice(3, 5), 16),
      parseInt(hex.slice(5, 7), 16),
    ]);
  }
  return _rgbCache.get(hex);
}

export function rgba(hex, a) {
  const [r, g, b] = hexToRgb(hex);
  return `rgba(${r},${g},${b},${a.toFixed(3)})`;
}

// ── Seeded RNG (FNV-1a) ─────────────────────────────────────────────────────

export function hashStr(s) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) {
    h = Math.imul(h ^ s.charCodeAt(i), 16777619) >>> 0;
  }
  return h;
}

export function seededFloat(seed, n) {
  const x = Math.sin(seed * 0.000012345 + n * 6.7891) * 43758.5453;
  return x - Math.floor(x);
}

// ── Text helpers ─────────────────────────────────────────────────────────────

/** Clip `text` to fit within `maxW` canvas units, appending "…". */
export function clipText(ctx, text, maxW) {
  if (!text) return "";
  if (ctx.measureText(text).width <= maxW) return text;
  let lo = 0, hi = text.length;
  while (lo < hi - 1) {
    const mid = (lo + hi) >> 1;
    if (ctx.measureText(text.slice(0, mid) + "…").width <= maxW) lo = mid;
    else hi = mid;
  }
  return text.slice(0, lo) + "…";
}

/** Truncate title to at most `max` characters. */
export function truncate(str, max = 40) {
  if (!str) return "";
  return str.length > max ? str.slice(0, max - 1) + "…" : str;
}

// ── Default theme ────────────────────────────────────────────────────────────

export const DARK_THEME = {
  bg:      "#0c0f14",
  bg2:     "#111620",
  text:    "#d0dce8",
  textDim: "#304060",
  border:  "#1c2a3c",
  accent:  "#e8b84b",
};

export const LIGHT_THEME = {
  bg:      "#f0f2f5",
  bg2:     "#ffffff",
  text:    "#1a1a2e",
  textDim: "#8896aa",
  border:  "#d0d8e4",
  accent:  "#b07d1a",
};

export const MIDNIGHT_THEME = {
  bg:      "#06080c",
  bg2:     "#0d1117",
  text:    "#c9d1d9",
  textDim: "#21262d",
  border:  "#161b22",
  accent:  "#58a6ff",
};

export const FOREST_THEME = {
  bg:      "#0a0f0d",
  bg2:     "#111a14",
  text:    "#c8ddc2",
  textDim: "#2a4030",
  border:  "#1a3020",
  accent:  "#4caf6f",
};

export const WARM_THEME = {
  bg:      "#100c08",
  bg2:     "#1a1208",
  text:    "#e8dcc8",
  textDim: "#3a2c18",
  border:  "#2e2010",
  accent:  "#e07040",
};

// Named map for theme selector UI
export const THEMES = {
  dark:     { label: "dark",     theme: DARK_THEME },
  light:    { label: "light",    theme: LIGHT_THEME },
  midnight: { label: "midnight", theme: MIDNIGHT_THEME },
  forest:   { label: "forest",   theme: FOREST_THEME },
  warm:     { label: "warm",     theme: WARM_THEME },
};
