/**
 * main.js — Demo application showcasing the concept-tree library.
 *
 * Loads concept markdown files from the Python backend, renders the
 * interactive tree, and wires up the sidebar, tooltip, and add-concept modal.
 */

import { ConceptTree } from "/src/index.js";
import { getBookmarks } from "/src/bookmarks.js";

// ── Initialize ───────────────────────────────────────────────────────────────

const savedTheme = localStorage.getItem("concept-tree-theme") || "dark";

const tree = new ConceptTree(document.getElementById("tree-container"), {
  theme: savedTheme,
  physics: {
    chargeStrength: -45,
    collideRadius: 8,
  },
});

// Theme selector
const themeSelect = document.getElementById("theme-select");
themeSelect.value = savedTheme;
themeSelect.addEventListener("change", () => {
  const t = themeSelect.value;
  tree.setTheme(t);
  localStorage.setItem("concept-tree-theme", t);
});

// Make tree accessible from console for experimentation
window.conceptTree = tree;

// ── Load concepts from server ────────────────────────────────────────────────

// ── Overview minimap ─────────────────────────────────────────────────────────

let _miniOverview = null;

function initMiniOverview(sources) {
  const container = document.getElementById("map-minimap");
  if (!container || _miniOverview) return;
  _miniOverview = new ConceptTree(container, {
    theme: savedTheme,
    dotMode: true,
    xStep: 50,
    yStep: 42,
    physics: {
      chargeStrength: -12,
      collideRadius: 2,
      preSettleIterations: 220,
    },
  });
  _miniOverview.loadMarkdownSources(sources).then(() => {
    _miniOverview.fitAll();
    _miniOverview.on("nodeClick", concept => {
      tree.setActiveNode(concept.id);
    });
  });
}

// ── Load concepts from server ────────────────────────────────────────────────

async function loadConcepts() {
  try {
    const resp    = await fetch("/api/concepts");
    const sources = await resp.json();
    await tree.loadMarkdownSources(sources);
    tree.setBookmarks(getBookmarks());
    updateSidebar();
    initMiniOverview(sources);
  } catch (err) {
    console.error("Failed to load concepts:", err);
    document.getElementById("tree-container").innerHTML =
      '<p style="padding:20px;color:#f87171">Failed to load concepts. Is the server running?</p>';
  }
}

// ── Bookmark sync ────────────────────────────────────────────────────────────

let bookmarkFilterActive = false;

function syncBookmarks() {
  const bm = getBookmarks();
  tree.setBookmarks(bm);
  if (bookmarkFilterActive) {
    tree.highlightNodeIds(bm);
  }
  updateSidebar();
}

// Re-sync when returning from detail page (bfcache may skip a reload)
document.addEventListener("visibilitychange", () => { if (!document.hidden) syncBookmarks(); });
window.addEventListener("focus", syncBookmarks);

// ── Sidebar: tags (multi-select filter) ─────────────────────────────────────

const selectedTags = new Set();

function applyTagFilter() {
  tree.highlightTags(selectedTags);
}

function updateSidebar() {
  const tagList = document.getElementById("tag-list");
  const tags = tree.getTagCounts();
  tagList.innerHTML = "";

  // Bookmark filter — only shown when there are saved bookmarks
  const bm = getBookmarks();
  if (bm.size > 0) {
    const bmLi = document.createElement("li");
    bmLi.className = "tag-item" + (bookmarkFilterActive ? " active" : "");
    bmLi.innerHTML = `<span class="tag-bar" style="background:#f59e0b"></span>
      <span class="tag-name">bookmarked</span>
      <span class="tag-count">${bm.size}</span>`;
    bmLi.onclick = () => {
      bookmarkFilterActive = !bookmarkFilterActive;
      if (bookmarkFilterActive) {
        tree.highlightNodeIds(getBookmarks());
      } else {
        tree.highlightNodeIds(new Set());
      }
      renderTagList();
    };
    tagList.appendChild(bmLi);
  } else if (bookmarkFilterActive) {
    // Bookmarks were cleared externally; deactivate filter
    bookmarkFilterActive = false;
    tree.highlightNodeIds(new Set());
  }

  // "All" entry — clears selection
  const allLi = document.createElement("li");
  allLi.className = "tag-item" + (selectedTags.size === 0 && !bookmarkFilterActive ? " active" : "");
  allLi.innerHTML = `<span class="tag-bar" style="background:#7c3aed"></span>
    <span class="tag-name">all</span>
    <span class="tag-count">${tree.getNodes().length}</span>`;
  allLi.onclick = () => {
    selectedTags.clear();
    bookmarkFilterActive = false;
    tree.highlightNodeIds(new Set());
    applyTagFilter();
    renderTagList();
  };
  tagList.appendChild(allLi);

  for (const [tag, count] of tags) {
    const color = tree._state?.tagColors.get(tag) || "#888";
    const selected = selectedTags.has(tag);
    const li = document.createElement("li");
    li.className = "tag-item" + (selected ? " active" : "");
    li.innerHTML = `<span class="tag-bar" style="background:${color}"></span>
      <span class="tag-name">${tag}</span>
      ${selected ? `<button class="tag-remove" title="Remove filter" aria-label="Remove ${tag}">✕</button>` : ""}
      <span class="tag-count">${count}</span>`;
    li.onclick = (e) => {
      if (e.target.classList.contains("tag-remove")) {
        selectedTags.delete(tag);
      } else {
        if (selectedTags.has(tag)) selectedTags.delete(tag);
        else selectedTags.add(tag);
      }
      applyTagFilter();
      renderTagList();
    };
    tagList.appendChild(li);
  }
}

function renderTagList() { updateSidebar(); }

// ── Events ───────────────────────────────────────────────────────────────────

const tooltip = document.getElementById("tooltip");
const tipTitle = document.getElementById("tip-title");
const tipTags = document.getElementById("tip-tags");
const tipBody = document.getElementById("tip-body");
const tipImage = document.getElementById("tip-image");
const tipLinks = document.getElementById("tip-links");

tree.on("nodeClick", (concept, simNode) => {
  // Navigate to detail page
  window.location.href = `/detail.html?id=${encodeURIComponent(concept.id)}`;
});

tree.on("nodeHover", (concept, simNode, sx, sy) => {
  tipTitle.textContent = concept.title;
  tipTags.innerHTML = "";  // tags removed
  tipBody.textContent = concept.bodySnippet || "";

  if (concept.image) {
    tipImage.src = concept.image;
    tipImage.style.display = "block";
  } else {
    tipImage.style.display = "none";
  }

  // Linked concepts preview
  const linkedConcepts = (concept.links || [])
    .map(id => tree.getNode(id))
    .filter(Boolean);
  if (linkedConcepts.length) {
    tipLinks.innerHTML = linkedConcepts
      .map(n => {
        const color = (tagColors && n.tags?.[0]) ? tagColors.get(n.tags[0]) || "" : "";
        const style = color ? ` style="border-left:2px solid ${color}"` : "";
        const snippet = n.bodySnippet ? `<span class="tip-link-snippet">${n.bodySnippet.slice(0, 60)}${n.bodySnippet.length > 60 ? "…" : ""}</span>` : "";
        return `<a class="tip-link" href="/detail.html?id=${encodeURIComponent(n.id)}"${style}><span class="tip-link-title">${n.title}</span>${snippet}</a>`;
      })
      .join("");
    tipLinks.style.display = "flex";
  } else {
    tipLinks.style.display = "none";
  }

  // Position tooltip
  const container = document.getElementById("tree-container");
  const rect = container.getBoundingClientRect();
  const ttWidth = 280;
  const x = sx + 14 + ttWidth > rect.width ? sx - 14 - ttWidth : sx + 14;
  const y = Math.max(4, Math.min(sy - 10, rect.height - 260));
  tooltip.style.left = x + "px";
  tooltip.style.top = y + "px";
  tooltip.style.display = "block";
});

tree.on("nodeUnhover", () => {
  tooltip.style.display = "none";
});

// ── Zoom controls ────────────────────────────────────────────────────────────

document.getElementById("ctrl-zin").onclick = () => tree.zoomIn();
document.getElementById("ctrl-zout").onclick = () => tree.zoomOut();
document.getElementById("ctrl-fit").onclick = () => tree.fitAll();
document.getElementById("btn-fit").onclick = () => tree.fitAll();

// ── Boot ─────────────────────────────────────────────────────────────────────

loadConcepts();
