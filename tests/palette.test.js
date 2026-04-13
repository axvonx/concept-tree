import { describe, it, expect } from "vitest";
import {
  TIER_COLORS, TAG_COLORS, tierColor, hexToRgb, rgba,
  hashStr, seededFloat, clipText, truncate,
  DARK_THEME, LIGHT_THEME, MIDNIGHT_THEME, FOREST_THEME, WARM_THEME, THEMES,
} from "../src/palette.js";

describe("palette constants", () => {
  it("has 15 tier colors", () => {
    expect(TIER_COLORS).toHaveLength(15);
  });

  it("has 20 tag colors", () => {
    expect(TAG_COLORS).toHaveLength(20);
  });

  it("all tier colors are valid hex", () => {
    for (const c of TIER_COLORS) {
      expect(c).toMatch(/^#[0-9a-f]{6}$/i);
    }
  });

  it("all tag colors are valid hex", () => {
    for (const c of TAG_COLORS) {
      expect(c).toMatch(/^#[0-9a-f]{6}$/i);
    }
  });
});

describe("tierColor", () => {
  it("returns first color for depth 0", () => {
    expect(tierColor(0)).toBe(TIER_COLORS[0]);
  });

  it("cycles past the palette length", () => {
    expect(tierColor(15)).toBe(TIER_COLORS[0]);
    expect(tierColor(16)).toBe(TIER_COLORS[1]);
    expect(tierColor(30)).toBe(TIER_COLORS[0]);
  });

  it("handles negative depths via modulo", () => {
    // (-1 % 15 + 15) % 15 = 14
    expect(tierColor(-1)).toBe(TIER_COLORS[14]);
  });
});

describe("hexToRgb", () => {
  it("converts #ff0000 to [255, 0, 0]", () => {
    expect(hexToRgb("#ff0000")).toEqual([255, 0, 0]);
  });

  it("converts #1a1d23 correctly", () => {
    expect(hexToRgb("#1a1d23")).toEqual([26, 29, 35]);
  });

  it("caches results", () => {
    const a = hexToRgb("#abcdef");
    const b = hexToRgb("#abcdef");
    expect(a).toBe(b); // same reference
  });
});

describe("rgba", () => {
  it("produces rgba string", () => {
    expect(rgba("#ff0000", 0.5)).toBe("rgba(255,0,0,0.500)");
  });

  it("handles alpha 0", () => {
    expect(rgba("#000000", 0)).toBe("rgba(0,0,0,0.000)");
  });

  it("handles alpha 1", () => {
    expect(rgba("#ffffff", 1)).toBe("rgba(255,255,255,1.000)");
  });
});

describe("hashStr", () => {
  it("returns a number", () => {
    expect(typeof hashStr("hello")).toBe("number");
  });

  it("is deterministic", () => {
    expect(hashStr("test")).toBe(hashStr("test"));
  });

  it("differs for different strings", () => {
    expect(hashStr("a")).not.toBe(hashStr("b"));
  });

  it("returns unsigned 32-bit integer", () => {
    const h = hashStr("anything");
    expect(h).toBeGreaterThanOrEqual(0);
    expect(h).toBeLessThan(2 ** 32);
  });
});

describe("seededFloat", () => {
  it("returns value between 0 and 1", () => {
    for (let i = 0; i < 100; i++) {
      const v = seededFloat(42, i);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it("is deterministic", () => {
    expect(seededFloat(123, 7)).toBe(seededFloat(123, 7));
  });

  it("varies with different seeds", () => {
    const a = seededFloat(1, 0);
    const b = seededFloat(2, 0);
    expect(a).not.toBe(b);
  });
});

describe("truncate", () => {
  it("returns short strings unchanged", () => {
    expect(truncate("hello", 40)).toBe("hello");
  });

  it("truncates long strings with ellipsis", () => {
    const long = "a".repeat(50);
    const result = truncate(long, 10);
    expect(result.length).toBe(10);
    expect(result.endsWith("…")).toBe(true);
  });

  it("handles empty string", () => {
    expect(truncate("")).toBe("");
  });

  it("handles null/undefined", () => {
    expect(truncate(null)).toBe("");
    expect(truncate(undefined)).toBe("");
  });
});

describe("clipText", () => {
  // clipText needs a canvas context mock
  const mockCtx = {
    measureText: (text) => ({ width: text.length * 8 }),
  };

  it("returns short text unchanged", () => {
    expect(clipText(mockCtx, "hi", 200)).toBe("hi");
  });

  it("clips long text", () => {
    const result = clipText(mockCtx, "a very long piece of text that exceeds the limit", 80);
    expect(result.endsWith("…")).toBe(true);
    expect(result.length).toBeLessThan(48);
  });

  it("handles empty string", () => {
    expect(clipText(mockCtx, "", 100)).toBe("");
  });

  it("handles null", () => {
    expect(clipText(mockCtx, null, 100)).toBe("");
  });
});

describe("themes", () => {
  const REQUIRED_KEYS = ["bg", "bg2", "text", "textDim", "border", "accent"];
  const ALL_THEMES = [
    ["dark",     DARK_THEME],
    ["light",    LIGHT_THEME],
    ["midnight", MIDNIGHT_THEME],
    ["forest",   FOREST_THEME],
    ["warm",     WARM_THEME],
  ];

  for (const [name, theme] of ALL_THEMES) {
    it(`${name} theme has all required keys`, () => {
      for (const k of REQUIRED_KEYS) expect(theme).toHaveProperty(k);
    });

    it(`${name} theme accent is a valid hex color`, () => {
      expect(theme.accent).toMatch(/^#[0-9a-f]{6}$/i);
    });
  }

  it("dark and light themes differ in bg", () => {
    expect(DARK_THEME.bg).not.toBe(LIGHT_THEME.bg);
  });

  it("all themes have different accent colors", () => {
    const accents = ALL_THEMES.map(([, t]) => t.accent);
    const unique = new Set(accents);
    expect(unique.size).toBe(ALL_THEMES.length);
  });
});

describe("THEMES map", () => {
  it("contains entries for dark, light, midnight, forest, warm", () => {
    const keys = Object.keys(THEMES);
    expect(keys).toContain("dark");
    expect(keys).toContain("light");
    expect(keys).toContain("midnight");
    expect(keys).toContain("forest");
    expect(keys).toContain("warm");
  });

  it("each entry has label and theme", () => {
    for (const [key, entry] of Object.entries(THEMES)) {
      expect(entry).toHaveProperty("label");
      expect(entry).toHaveProperty("theme");
      expect(typeof entry.label).toBe("string");
      expect(typeof entry.theme).toBe("object");
    }
  });

  it("THEMES.dark.theme matches DARK_THEME", () => {
    expect(THEMES.dark.theme).toBe(DARK_THEME);
  });
});
