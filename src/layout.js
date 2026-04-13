/**
 * layout.js — Reingold-Tilford tree layout for concept trees.
 *
 * Takes a forest (array of root nodes) and assigns each node an initial
 * (treeX, depth) position. The treeX values are leaf-ordered integers;
 * internal nodes sit at the midpoint of their leftmost and rightmost children.
 */

import { nodeVariant, nodeDimsForTitle, nodeDepthScale } from "./nodes.js";

/**
 * Compute Reingold-Tilford positions for a forest of trees.
 *
 * Each node must have: { id: string, children: Node[] }
 *
 * Returns { pos: Map<id, {treeX, depth}>, leafCount, maxDepth }.
 */
export function treeLayout(roots) {
  const pos = new Map();
  let leaf = 0;

  function place(node, depth) {
    const kids = node.children || [];
    if (!kids.length) {
      pos.set(node.id, { treeX: leaf++, depth });
      return leaf - 1;
    }
    const xs = kids.map(c => place(c, depth + 1));
    const x = (xs[0] + xs[xs.length - 1]) / 2;
    pos.set(node.id, { treeX: x, depth });
    return x;
  }

  for (const r of roots) place(r, 0);

  let maxDepth = 0;
  for (const [, p] of pos) {
    if (p.depth > maxDepth) maxDepth = p.depth;
  }

  return { pos, leafCount: leaf, maxDepth };
}

/**
 * Build the simulation graph from a forest of concept nodes.
 *
 * Each concept node: { id, title, children: Node[], tags?: string[], image?: string }
 *
 * Returns { nodes: SimNode[], links: SimLink[], leafCount }.
 *   SimNode: { id, depth, concept, bx, by, x, y, vx, vy }
 *   SimLink: { source: id, target: id }
 */
export function buildGraph(roots, opts = {}) {
  const X_STEP = opts.xStep || 142;
  const Y_STEP = opts.yStep || 104;
  const radial = opts.radial !== false; // default true

  const { pos, leafCount } = treeLayout(roots);
  // Ring spacing: accounts for the larger root node size
  const R_STEP = radial ? Math.max(X_STEP, Y_STEP) * 1.4 : Y_STEP;
  const halfLeaf = (leafCount - 1) / 2;
  const nRoots = roots.length;

  /**
   * Cumulative ring radius that accounts for depth-scaled node sizes.
   * Each ring is spaced by the average scale of adjacent depth levels,
   * so larger nodes near the root create more breathing room.
   */
  function ringRadius(depth) {
    if (depth <= 0) return 0;
    let r = 0;
    for (let d = 0; d < depth; d++) {
      r += R_STEP * (nodeDepthScale(d) + nodeDepthScale(d + 1)) / 2;
    }
    return r;
  }

  const nodes = [];
  const links = [];

  function walk(node, parentId) {
    const p = pos.get(node.id) || { treeX: 0, depth: 0 };
    let bx, by;

    if (radial) {
      // Map treeX → angle in [0, 2π), radius proportional to depth.
      // Multiple roots all at depth 0 get an inner ring so they don't all
      // pile at (0,0); single roots sit at the centre.
      const theta = (p.treeX / Math.max(leafCount, 1)) * 2 * Math.PI;
      let r;
      if (p.depth === 0 && nRoots === 1) {
        r = 0;
      } else if (nRoots > 1 && p.depth === 0) {
        // Multiple roots: place on a small inner ring
        r = R_STEP * 0.6;
      } else {
        r = ringRadius(p.depth);
      }
      bx = r * Math.cos(theta - Math.PI / 2); // start from top
      by = r * Math.sin(theta - Math.PI / 2);
    } else {
      bx = (p.treeX - halfLeaf) * X_STEP;
      by = p.depth * Y_STEP;
    }

    const variant = nodeVariant(node, p.depth);
    const { w: nw, h: nh } = nodeDimsForTitle(variant, node.title || node.id, p.depth);
    nodes.push({
      id: node.id,
      depth: p.depth,
      concept: node,
      variant, nw, nh,
      bx, by,
      x: bx + (Math.random() - 0.5) * 10,
      y: by + (Math.random() - 0.5) * 6,
      vx: 0, vy: 0,
    });
    if (parentId) links.push({ source: parentId, target: node.id });
    for (const c of (node.children || [])) walk(c, node.id);
  }

  for (const r of roots) walk(r, null);
  return { nodes, links, leafCount };
}

/**
 * Detect trunk edges (parent → child with most descendants).
 * Returns a Set of "parentId→childId" strings.
 */
export function detectTrunk(nodes, links) {
  const childrenOf = new Map();
  for (const lk of links) {
    if (!childrenOf.has(lk.source)) childrenOf.set(lk.source, []);
    childrenOf.get(lk.source).push(lk.target);
  }

  const descCount = new Map();
  function countDesc(id) {
    if (descCount.has(id)) return descCount.get(id);
    const cs = childrenOf.get(id) || [];
    let n = cs.length;
    for (const c of cs) n += countDesc(c);
    descCount.set(id, n);
    return n;
  }
  for (const n of nodes) countDesc(n.id);

  const trunk = new Set();
  for (const [pid, children] of childrenOf) {
    const best = children.reduce((a, b) =>
      (descCount.get(b) || 0) > (descCount.get(a) || 0) ? b : a
    );
    trunk.add(`${pid}→${best}`);
  }
  return trunk;
}

/**
 * Propagate bx values down trunk chains so the main chain stays vertically aligned.
 */
export function alignTrunk(nodes, trunkSet) {
  const byId = new Map(nodes.map(n => [n.id, n]));
  let changed = true;
  while (changed) {
    changed = false;
    for (const key of trunkSet) {
      const [pid, cid] = key.split("→");
      const p = byId.get(pid), c = byId.get(cid);
      if (p && c && Math.abs(c.bx - p.bx) > 0.1) {
        c.bx = p.bx;
        changed = true;
      }
    }
  }
}

/**
 * Build groups for blob animation. Each parent→children cluster is one group;
 * leaf nodes get their own solo group.
 */
export function buildGroups(nodes) {
  const byId = new Map(nodes.map(n => [n.id, n]));
  const groups = [];

  for (const n of nodes) {
    const kids = (n.concept.children || []).map(c => byId.get(c.id)).filter(Boolean);
    if (kids.length) {
      groups.push({
        parentId: n.id,
        childIds: kids.map(k => k.id),
        ...makeGroupAnimParams(n.id, n.depth),
      });
    } else {
      const g = {
        parentId: n.id + "_leaf",
        childIds: [],
        _soloId: n.id,
        ...makeGroupAnimParams(n.id + "_leaf", n.depth),
      };
      groups.push(g);
    }
  }

  groups.sort((a, b) => a.depth - b.depth);
  return groups;
}

// Re-export makeGroupParams with the depth field baked in.
import { hashStr, seededFloat } from "./palette.js";

function makeGroupAnimParams(seedStr, depth) {
  const seed = hashStr(seedStr);
  return {
    depth,
    speed: 0.28 + seededFloat(seed, 1) * 0.52,
    amp: 2.2 + seededFloat(seed, 2) * 4.8,
    phase: seededFloat(seed, 3) * Math.PI * 6.28,
    vSeeds: Array.from({ length: 18 }, (_, i) => seededFloat(seed, i + 20)),
  };
}
