/**
 * physics.js — D3-force simulation wrapper for concept trees.
 *
 * Encapsulates the force configuration so callers can create, tune, and
 * restart the simulation through a clean API.
 */

// d3-force is loaded from CDN at runtime; for Node/test environments
// we provide a lazy import mechanism.
let _d3Force = null;

/**
 * Set the d3-force module. Call this before creating a simulation in
 * non-browser environments (tests).
 */
export function setD3Force(mod) {
  _d3Force = mod;
}

async function getD3Force() {
  if (_d3Force) return _d3Force;
  // Browser: dynamic import from CDN
  _d3Force = await import("https://cdn.jsdelivr.net/npm/d3-force@3/+esm");
  return _d3Force;
}

/** Default physics configuration. */
export const DEFAULT_PHYSICS = {
  chargeStrength: -40,
  linkDistance: 0.85,     // multiplied by min(X_STEP, Y_STEP)
  linkStrength: 0.3,
  xStrength: 0.82,        // strong enough to keep RT layout intact
  yStrength: 0.96,        // stronger y-anchoring to depth layers
  collideRadius: 6,       // added to hypot(NODE_W/2, NODE_H/2)
  collideStrength: 0.8,
  trunkAlignStrength: 0.02, // gentle nudge only; alignTrunk pre-pass removed
  yOrderStrength: 0.06,   // gentle force keeping children below parents (linear mode)
  yOrderGap: 10,          // extra y gap (px) beyond combined half-heights
  radialOrderStrength: 0.08, // ensure children are farther from center than parents
  radialOrderGap: 8,      // minimum extra radial distance (px) beyond half-heights
  alphaDecay: 0.045,
  preSettleIterations: 180,
};

/**
 * Create and configure a d3-force simulation.
 *
 * @param {Object} params
 * @param {Array} params.nodes  - Simulation nodes (must have .bx, .by)
 * @param {Array} params.links  - { source, target } links
 * @param {Set}   params.trunkSet - Set of "parentId→childId" trunk edge keys
 * @param {Object} params.dims  - { nodeW, nodeH, xStep, yStep }
 * @param {Object} [params.physics] - Override DEFAULT_PHYSICS values
 * @param {boolean} [params.radial=false] - Use radial ordering instead of y-ordering
 * @returns {Promise<Object>} The d3 simulation instance
 */
export async function createSimulation({ nodes, links, trunkSet, dims, physics = {}, radial = false }) {
  const d3 = await getD3Force();
  const cfg = { ...DEFAULT_PHYSICS, ...physics };
  const { nodeW, nodeH, xStep, yStep } = dims;

  const sim = d3.forceSimulation(nodes)
    .force("link", d3.forceLink(links)
      .id(d => d.id)
      .distance(Math.min(xStep, yStep) * cfg.linkDistance)
      .strength(cfg.linkStrength))
    .force("charge", d3.forceManyBody().strength(cfg.chargeStrength))
    .force("x", d3.forceX(d => d.bx).strength(cfg.xStrength))
    .force("y", d3.forceY(d => d.by).strength(cfg.yStrength))
    .force("collide", d3.forceCollide(
      n => Math.hypot((n.nw || nodeW) / 2, (n.nh || nodeH) / 2) + cfg.collideRadius
    ).strength(cfg.collideStrength))
    .force("trunk-x", radial ? null : alpha => {
      for (const lk of links) {
        const s = lk.source, t = lk.target;
        if (typeof s !== "object" || typeof t !== "object") continue;
        if (trunkSet.has(`${s.id}→${t.id}`)) {
          t.vx += (s.x - t.x) * cfg.trunkAlignStrength * alpha;
        }
      }
    })
    .force("depth-order", radial
      // Radial mode: push children to larger radius than parents
      ? alpha => {
          for (const lk of links) {
            const s = lk.source, t = lk.target;
            if (typeof s !== "object" || typeof t !== "object") continue;
            const rParent = Math.hypot(s.x, s.y);
            const rChild  = Math.hypot(t.x, t.y);
            const minR    = rParent + cfg.radialOrderGap;
            if (rChild < minR) {
              // Push child outward along its current angle from centre
              const ang  = Math.atan2(t.y || 0.01, t.x || 0.01);
              const push = Math.min((minR - rChild) * cfg.radialOrderStrength, 1.5);
              t.vx += Math.cos(ang) * push * alpha;
              t.vy += Math.sin(ang) * push * alpha;
            }
          }
        }
      // Linear mode: keep children below parents
      : alpha => {
          for (const lk of links) {
            const s = lk.source, t = lk.target;
            if (typeof s !== "object" || typeof t !== "object") continue;
            const minY = s.y + (s.nh || nodeH) / 2 + (t.nh || nodeH) / 2 + cfg.yOrderGap;
            if (t.y < minY) {
              const push = Math.min((minY - t.y) * cfg.yOrderStrength, 1.5);
              t.vy += push * alpha;
              s.vy -= push * 0.15 * alpha;
            }
          }
        }
    )
    .alphaDecay(cfg.alphaDecay)
    .stop();

  // Pre-settle
  for (let i = 0; i < cfg.preSettleIterations; i++) sim.tick();

  return sim;
}

/**
 * Compute graph bounds from settled node positions.
 * Uses per-node nw/nh when available, falling back to nodeW/nodeH defaults.
 */
export function computeBounds(nodes, nodeW = 162, nodeH = 64) {
  let minX = Infinity, maxX = -Infinity;
  let minY = Infinity, maxY = -Infinity;
  let maxNW = nodeW, maxNH = nodeH;
  for (const n of nodes) {
    if (n.x < minX) minX = n.x;
    if (n.x > maxX) maxX = n.x;
    if (n.y < minY) minY = n.y;
    if (n.y > maxY) maxY = n.y;
    if (n.nw && n.nw > maxNW) maxNW = n.nw;
    if (n.nh && n.nh > maxNH) maxNH = n.nh;
  }
  return {
    minX, maxX, minY, maxY,
    spanX: maxX - minX + maxNW + 40,
    spanY: maxY - minY + maxNH + 40,
    cx: (minX + maxX) / 2,
    cy: (minY + maxY) / 2,
  };
}
