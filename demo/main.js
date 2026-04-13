/**
 * main.js — Demo application showcasing the concept-tree library.
 *
 * Loads concept markdown files from the Python backend, renders the
 * interactive tree, and wires up the sidebar, tooltip, and add-concept modal.
 */

import { ConceptTree } from "/src/index.js";

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
    updateSidebar();
    initMiniOverview(sources);
  } catch (err) {
    console.error("Failed to load concepts:", err);
    document.getElementById("tree-container").innerHTML =
      '<p style="padding:20px;color:#f87171">Failed to load concepts. Is the server running?</p>';
  }
}

// ── Sidebar: tags (multi-select filter) ─────────────────────────────────────

const selectedTags = new Set();

function applyTagFilter() {
  tree.highlightTags(selectedTags);
}

function updateSidebar() {
  const tagList = document.getElementById("tag-list");
  const tags = tree.getTagCounts();
  tagList.innerHTML = "";

  // "All" entry — clears selection
  const allLi = document.createElement("li");
  allLi.className = "tag-item" + (selectedTags.size === 0 ? " active" : "");
  allLi.innerHTML = `<span class="tag-bar" style="background:#7c3aed"></span>
    <span class="tag-name">all</span>
    <span class="tag-count">${tree.getNodes().length}</span>`;
  allLi.onclick = () => {
    selectedTags.clear();
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

// ── Add concept modal ────────────────────────────────────────────────────────

const addModal = document.getElementById("add-modal");

document.getElementById("btn-add").onclick = () => {
  addModal.style.display = "flex";
};

document.getElementById("modal-cancel").onclick = () => {
  addModal.style.display = "none";
};

addModal.onclick = (e) => {
  if (e.target === addModal) addModal.style.display = "none";
};

document.getElementById("modal-save").onclick = async () => {
  const id = document.getElementById("new-id").value.trim();
  const title = document.getElementById("new-title").value.trim();
  const tags = document.getElementById("new-tags").value.trim();
  const parent = document.getElementById("new-parent").value.trim();
  const image = document.getElementById("new-image").value.trim();
  const body = document.getElementById("new-body").value.trim();

  if (!id || !title) {
    alert("ID and Title are required");
    return;
  }

  // Build markdown source
  let md = "---\n";
  md += `title: ${title}\n`;
  if (tags) md += `tags: [${tags}]\n`;
  if (image) md += `image: ${image}\n`;
  md += "---\n\n";
  md += body || `# ${title}\n`;

  // Save to server
  try {
    await fetch(`/api/concept/${id}`, {
      method: "POST",
      headers: { "Content-Type": "text/markdown" },
      body: md,
    });

    // If parent specified, update parent's links to include this new concept
    if (parent) {
      const parentResp = await fetch(`/api/concept/${parent}`);
      if (parentResp.ok) {
        const { source } = await parentResp.json();
        // Add link to parent's frontmatter
        let updated;
        if (source.includes("links:")) {
          // Append to existing links
          updated = source.replace(/(links:\s*\n(?:\s+-\s+\S+\n)*)/, `$1  - ${id}\n`);
        } else {
          // Add links field before end of frontmatter
          updated = source.replace(/\n---\n/, `\nlinks:\n  - ${id}\n---\n`);
        }
        await fetch(`/api/concept/${parent}`, {
          method: "POST",
          headers: { "Content-Type": "text/markdown" },
          body: updated,
        });
      }
    }

    // Reload
    addModal.style.display = "none";
    await loadConcepts();
  } catch (err) {
    alert("Failed to save: " + err.message);
  }
};

// ── Boot ─────────────────────────────────────────────────────────────────────

loadConcepts();
