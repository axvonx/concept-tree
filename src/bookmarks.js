const STORAGE_KEY = "concept-tree-bookmarks";

export function getBookmarks() {
  try {
    return new Set(JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]"));
  } catch {
    return new Set();
  }
}

export function saveBookmarks(set) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify([...set]));
}

export function toggleBookmark(id) {
  const bm = getBookmarks();
  if (bm.has(id)) bm.delete(id);
  else bm.add(id);
  saveBookmarks(bm);
  return bm;
}

export function isBookmarked(id) {
  return getBookmarks().has(id);
}
