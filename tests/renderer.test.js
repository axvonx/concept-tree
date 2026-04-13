import { describe, it, expect } from "vitest";
import { acronymLabel } from "../src/renderer.js";

describe("acronymLabel", () => {
  it("returns initials for multi-word titles", () => {
    expect(acronymLabel("Quantum Mechanics")).toBe("QM");
    expect(acronymLabel("General Relativity")).toBe("GR");
    expect(acronymLabel("Natural Language Processing")).toBe("NLP");
    expect(acronymLabel("Machine Learning")).toBe("ML");
  });

  it("returns first 4 chars uppercase for single-word titles", () => {
    expect(acronymLabel("Physics")).toBe("PHYS");
    expect(acronymLabel("Biology")).toBe("BIOL");
    expect(acronymLabel("Science")).toBe("SCIE");
    expect(acronymLabel("Mathematics")).toBe("MATH");
  });

  it("handles short single words without truncation", () => {
    expect(acronymLabel("DNA")).toBe("DNA");
    expect(acronymLabel("Art")).toBe("ART");
    expect(acronymLabel("AI")).toBe("AI");
  });

  it("splits on hyphens as word separators", () => {
    expect(acronymLabel("Wave-Particle Duality")).toBe("WPD");
    expect(acronymLabel("Object-Oriented Programming")).toBe("OOP");
  });

  it("splits on forward slashes", () => {
    expect(acronymLabel("TCP/IP")).toBe("TI");
  });

  it("caps initials at 5 characters for very long titles", () => {
    const result = acronymLabel("Alpha Beta Gamma Delta Epsilon Zeta");
    expect(result.length).toBeLessThanOrEqual(5);
  });

  it("returns empty string for empty input", () => {
    expect(acronymLabel("")).toBe("");
    expect(acronymLabel(null)).toBe("");
    expect(acronymLabel(undefined)).toBe("");
  });

  it("handles all-caps words correctly", () => {
    expect(acronymLabel("HTTP Protocol")).toBe("HP");
  });

  it("filters out empty parts from consecutive separators", () => {
    // e.g. "A--B" splits to ["A", "B"] not ["A", "", "B"]
    const result = acronymLabel("Alpha--Beta");
    expect(result).toBe("AB");
  });
});
