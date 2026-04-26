import { describe, it, expect, beforeEach, vi } from "vitest";
import { getBookmarks, saveBookmarks, toggleBookmark, isBookmarked } from "../src/bookmarks.js";

// Mock localStorage (jsdom's implementation lacks clear())
const _store = {};
vi.stubGlobal("localStorage", {
  getItem:    (k)    => _store[k] ?? null,
  setItem:    (k, v) => { _store[k] = String(v); },
  removeItem: (k)    => { delete _store[k]; },
});

beforeEach(() => {
  delete _store["concept-tree-bookmarks"];
});

describe("getBookmarks", () => {
  it("returns empty set when nothing is stored", () => {
    expect(getBookmarks().size).toBe(0);
  });

  it("returns stored bookmarks", () => {
    localStorage.setItem("concept-tree-bookmarks", JSON.stringify(["a", "b"]));
    const bm = getBookmarks();
    expect(bm.has("a")).toBe(true);
    expect(bm.has("b")).toBe(true);
    expect(bm.size).toBe(2);
  });

  it("returns empty set on corrupt storage", () => {
    localStorage.setItem("concept-tree-bookmarks", "not-json{{");
    expect(getBookmarks().size).toBe(0);
  });
});

describe("saveBookmarks", () => {
  it("persists a set to localStorage", () => {
    saveBookmarks(new Set(["x", "y"]));
    const raw = JSON.parse(localStorage.getItem("concept-tree-bookmarks"));
    expect(raw).toContain("x");
    expect(raw).toContain("y");
  });

  it("overwrites previous value", () => {
    saveBookmarks(new Set(["old"]));
    saveBookmarks(new Set(["new"]));
    const raw = JSON.parse(localStorage.getItem("concept-tree-bookmarks"));
    expect(raw).not.toContain("old");
    expect(raw).toContain("new");
  });
});

describe("toggleBookmark", () => {
  it("adds a bookmark when not present", () => {
    const bm = toggleBookmark("physics");
    expect(bm.has("physics")).toBe(true);
  });

  it("removes a bookmark when already present", () => {
    toggleBookmark("physics");
    const bm = toggleBookmark("physics");
    expect(bm.has("physics")).toBe(false);
  });

  it("persists the change across calls", () => {
    toggleBookmark("biology");
    expect(getBookmarks().has("biology")).toBe(true);
    toggleBookmark("biology");
    expect(getBookmarks().has("biology")).toBe(false);
  });

  it("returns updated set including other bookmarks", () => {
    toggleBookmark("math");
    const bm = toggleBookmark("science");
    expect(bm.has("math")).toBe(true);
    expect(bm.has("science")).toBe(true);
  });
});

describe("isBookmarked", () => {
  it("returns false when not bookmarked", () => {
    expect(isBookmarked("chemistry")).toBe(false);
  });

  it("returns true after adding", () => {
    toggleBookmark("chemistry");
    expect(isBookmarked("chemistry")).toBe(true);
  });

  it("returns false after removing", () => {
    toggleBookmark("chemistry");
    toggleBookmark("chemistry");
    expect(isBookmarked("chemistry")).toBe(false);
  });
});
