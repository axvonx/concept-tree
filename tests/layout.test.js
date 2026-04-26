import { describe, it, expect } from "vitest";
import { treeLayout, buildGraph, buildGroups } from "../src/layout.js";

// helpers
function makeNode(id, children = []) {
  return { id, title: id, children, tags: [], image: null };
}

describe("treeLayout", () => {
  it("single root leaf gets treeX=0, depth=0", () => {
    const roots = [makeNode("a")];
    const { pos, leafCount, maxDepth } = treeLayout(roots);
    expect(pos.get("a")).toEqual({ treeX: 0, depth: 0 });
    expect(leafCount).toBe(1);
    expect(maxDepth).toBe(0);
  });

  it("two children get consecutive leaf positions", () => {
    const roots = [makeNode("root", [makeNode("c1"), makeNode("c2")])];
    const { pos } = treeLayout(roots);
    expect(pos.get("c1").treeX).toBe(0);
    expect(pos.get("c2").treeX).toBe(1);
    expect(pos.get("root").treeX).toBe(0.5);
  });

  it("depth increments with each level", () => {
    const roots = [makeNode("a", [makeNode("b", [makeNode("c")])])];
    const { pos } = treeLayout(roots);
    expect(pos.get("a").depth).toBe(0);
    expect(pos.get("b").depth).toBe(1);
    expect(pos.get("c").depth).toBe(2);
  });

  it("multiple roots each start at their own leaf index", () => {
    const roots = [makeNode("r1"), makeNode("r2"), makeNode("r3")];
    const { pos, leafCount } = treeLayout(roots);
    expect(leafCount).toBe(3);
    expect(pos.get("r1").treeX).toBe(0);
    expect(pos.get("r2").treeX).toBe(1);
    expect(pos.get("r3").treeX).toBe(2);
  });

  it("maxDepth reflects the deepest node", () => {
    const roots = [
      makeNode("a", [
        makeNode("b", [makeNode("c"), makeNode("d")]),
        makeNode("e"),
      ]),
    ];
    const { maxDepth } = treeLayout(roots);
    expect(maxDepth).toBe(2);
  });

  it("internal node sits between its leftmost and rightmost children", () => {
    // root → [c1, c2, c3]; c1 is leaf=0, c3 is leaf=2, root should be at 1.0
    const roots = [makeNode("root", [makeNode("c1"), makeNode("c2"), makeNode("c3")])];
    const { pos } = treeLayout(roots);
    expect(pos.get("root").treeX).toBe(1);
  });
});

describe("buildGraph", () => {
  it("returns empty nodes/links for empty forest", () => {
    const { nodes, links } = buildGraph([]);
    expect(nodes).toEqual([]);
    expect(links).toEqual([]);
  });

  it("single node produces one sim node, no links", () => {
    const roots = [makeNode("a")];
    const { nodes, links } = buildGraph(roots);
    expect(nodes).toHaveLength(1);
    expect(links).toHaveLength(0);
    expect(nodes[0].id).toBe("a");
  });

  it("parent→child produces a link", () => {
    const roots = [makeNode("parent", [makeNode("child")])];
    const { nodes, links } = buildGraph(roots);
    expect(nodes).toHaveLength(2);
    expect(links).toHaveLength(1);
    expect(links[0]).toEqual({ source: "parent", target: "child" });
  });

  it("sim nodes have bx, by, x, y properties", () => {
    const roots = [makeNode("a", [makeNode("b")])];
    const { nodes } = buildGraph(roots);
    for (const n of nodes) {
      expect(n).toHaveProperty("bx");
      expect(n).toHaveProperty("by");
      expect(n).toHaveProperty("x");
      expect(n).toHaveProperty("y");
    }
  });

  it("sim nodes have variant, nw, nh properties", () => {
    const roots = [makeNode("a", [makeNode("b")])];
    const { nodes } = buildGraph(roots);
    for (const n of nodes) {
      expect(n).toHaveProperty("variant");
      expect(n).toHaveProperty("nw");
      expect(n).toHaveProperty("nh");
      expect(n.nw).toBeGreaterThan(0);
      expect(n.nh).toBeGreaterThan(0);
    }
  });

  it("root node (depth 0) gets pill variant (all non-photo nodes are pills)", () => {
    const roots = [makeNode("root", [makeNode("child")])];
    const { nodes } = buildGraph(roots);
    const root = nodes.find(n => n.id === "root");
    expect(root.variant).toBe("pill");
  });

  it("leaf node (depth > 0, no children) gets pill variant", () => {
    const roots = [makeNode("root", [makeNode("leaf")])];
    const { nodes } = buildGraph(roots);
    const leaf = nodes.find(n => n.id === "leaf");
    expect(leaf.variant).toBe("pill");
  });

  it("mid-tree node with children gets pill variant (uniform non-photo variant)", () => {
    const roots = [makeNode("root", [makeNode("mid", [makeNode("leaf")])])];
    const { nodes } = buildGraph(roots);
    const mid = nodes.find(n => n.id === "mid");
    expect(mid.variant).toBe("pill");
  });

  it("node with image gets photo variant regardless of depth", () => {
    const imgNode = { id: "img", title: "img", children: [], tags: [], image: "img.png" };
    const roots = [makeNode("root", [imgNode])];
    const { nodes } = buildGraph(roots);
    const n = nodes.find(n => n.id === "img");
    expect(n.variant).toBe("photo");
  });

  it("leaf count matches number of leaf nodes", () => {
    const roots = [makeNode("root", [makeNode("c1"), makeNode("c2"), makeNode("c3")])];
    const { leafCount } = buildGraph(roots);
    expect(leafCount).toBe(3);
  });

  it("respects xStep and yStep options", () => {
    const roots = [makeNode("root", [makeNode("c1")])];
    const { nodes: n1 } = buildGraph(roots, { xStep: 100, yStep: 80 });
    const { nodes: n2 } = buildGraph(roots, { xStep: 200, yStep: 160 });
    const child1 = n1.find(n => n.id === "c1");
    const child2 = n2.find(n => n.id === "c2") || n2.find(n => n.id === "c1");
    // Child by value should differ with different yStep
    expect(child1.by).not.toBe(child2.by);
  });
});

describe("buildGroups", () => {
  it("returns one group per node", () => {
    const roots = [makeNode("root", [makeNode("c1"), makeNode("c2")])];
    const { nodes } = buildGraph(roots);
    const groups = buildGroups(nodes);
    expect(groups).toHaveLength(nodes.length);
  });

  it("leaf nodes get _soloId", () => {
    const roots = [makeNode("root", [makeNode("leaf")])];
    const { nodes } = buildGraph(roots);
    const groups = buildGroups(nodes);
    const leafGroup = groups.find(g => g._soloId === "leaf");
    expect(leafGroup).toBeTruthy();
    expect(leafGroup.childIds).toEqual([]);
  });

  it("parent nodes get childIds", () => {
    const roots = [makeNode("root", [makeNode("c1"), makeNode("c2")])];
    const { nodes } = buildGraph(roots);
    const groups = buildGroups(nodes);
    const rootGroup = groups.find(g => g.parentId === "root");
    expect(rootGroup).toBeTruthy();
    expect(rootGroup.childIds).toHaveLength(2);
  });

  it("groups are sorted by depth", () => {
    const roots = [makeNode("a", [makeNode("b", [makeNode("c")])])];
    const { nodes } = buildGraph(roots);
    const groups = buildGroups(nodes);
    const depths = groups.map(g => g.depth);
    for (let i = 1; i < depths.length; i++) {
      expect(depths[i]).toBeGreaterThanOrEqual(depths[i - 1]);
    }
  });
});
