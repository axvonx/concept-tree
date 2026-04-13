# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
# Run all tests (single pass)
npm test

# Run tests in watch mode
npm run test:watch

# Run a single test file
npx vitest run tests/markdown.test.js

# Start the demo server (then open http://localhost:8420)
npm run demo
```

Tests run in jsdom via Vitest. The project is ESM (`"type": "module"`).

## Architecture

`ConceptTree` in `src/index.js` is the single public class. It orchestrates a pipeline:

1. **Markdown parsing** (`src/markdown.js`) — `parseFrontmatter` reads YAML frontmatter from concept files. `buildConceptTree` resolves `links:` fields into a forest of tree nodes. Nodes without a parent become roots.

2. **Layout** (`src/layout.js`) — `treeLayout` runs Reingold-Tilford to assign integer leaf positions. `buildGraph` converts the forest into `SimNode[]` / `SimLink[]` with `bx`/`by` base positions. `detectTrunk` finds the heaviest-descendant path per parent for visual styling.

3. **Physics** (`src/physics.js`) — wraps d3-force. `createSimulation` builds the force graph and pre-settles it (`preSettleIterations` ticks synchronously) before handing back the sim. `setD3Force()` must be called in test environments (no CDN available) to inject a mock.

4. **Rendering** (`src/renderer.js`) — pure Canvas 2D. Draws animated group blobs (via `src/geometry.js` convex hulls), edges, node cards, and a bottom tag strip. `render()` is called every RAF tick.

5. **Interaction** (`src/interaction.js`) — attaches pointer/wheel/touch listeners to the canvas, manages pan/zoom state, hit-tests nodes, and emits `nodeClick`/`nodeHover`/`nodeUnhover` events.

6. **Mini-map** (`src/mini-renderer.js`) — secondary canvas overlay using dot-mode rendering for an overview.

### State object

`ConceptTree._state` is the shared mutable object threaded through rendering and interaction. It holds `simNodes`, `simLinks`, `groups`, `tr` (current transform), `trTarget` (lerp target), `activeId`, `hoverNodeId`, `highlightTag`, and more. Rendering reads from it; interaction mutates it.

### Concept file format

Each concept is a markdown file with YAML-like frontmatter:

```markdown
---
title: Quantum Mechanics
tags: [physics, quantum]
image: quantum.png
links:
  - wave-particle-duality
  - uncertainty-principle
---

Body content here…
```

The `links` field defines parent→child relationships. Nodes not listed in any `links` field become tree roots.

### Demo server

`demo/server.py` is a plain Python HTTP server. It serves `demo/index.html`, `demo/detail.html`, and the `/src/` directory. The REST API (`GET/POST/DELETE /api/concept/:id`, `GET /api/concepts`) reads/writes `.md` files under `demo/concepts/`.

### Testing pattern

Tests that exercise `ConceptTree` (which needs d3-force and DOM) must call `setD3Force(mockD3)` before creating a simulation. See `tests/index.test.js` for the mock shape. Tests for pure functions (`markdown`, `layout`, `palette`, `geometry`) need no special setup.
