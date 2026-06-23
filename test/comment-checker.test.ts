/**
 * T5 comment-checker tests.
 *
 * Verifies the stripSlop() pure function detects and strips the canonical
 * AI-slop comment patterns without blocking good code.
 */
import { test, expect } from "bun:test";
import { stripSlop } from "../extensions/autodev/comment-checker/index.js";

test("returns zero matches for clean code", () => {
  const src = [
    "function add(a, b) {",
    "  return a + b;",
    "}",
  ].join("\n");
  const report = stripSlop(src);
  expect(report.stripped).toBe(0);
  expect(report.matches).toEqual([]);
  expect(report.cleaned).toBe(src);
});

test("detects 'This function does X' restating-name slop", () => {
  const src = [
    "function parseConfig() {",
    "  // This function parses the config",
    "  return {}",
    "}",
  ].join("\n");
  const report = stripSlop(src);
  expect(report.stripped).toBe(1);
  expect(report.matches[0]?.pattern).toBe("restates-name");
});

test("detects 'First, we ...' narrative filler", () => {
  const src = [
    "// First, we read the input",
    "const input = readInput();",
  ].join("\n");
  const report = stripSlop(src);
  expect(report.stripped).toBe(1);
  expect(report.matches[0]?.pattern).toBe("narrative-filler");
});

test("detects 'Note that ...' obvious observation", () => {
  const src = [
    "const x = 1; // Note that x is a number",
  ].join("\n");
  const report = stripSlop(src);
  expect(report.stripped).toBe(1);
  expect(report.matches[0]?.pattern).toBe("obvious-observation");
});

test("detects vague TODO without owner", () => {
  const src = [
    "// TODO: implement this later",
    "function stub() {}",
  ].join("\n");
  const report = stripSlop(src);
  expect(report.stripped).toBe(1);
  expect(report.matches[0]?.pattern).toBe("vague-todo");
});

test("detects 'This is a ...' doc-comment slop", () => {
  const src = [
    "/** This is a parser */",
    "class Parser {}",
  ].join("\n");
  const report = stripSlop(src);
  expect(report.stripped).toBe(1);
  expect(report.matches[0]?.pattern).toBe("declaration-restates-name");
});

test("strips comment-only lines entirely", () => {
  const src = [
    "function f() {",
    "  // Note that this is obvious",
    "  return 1;",
    "}",
  ].join("\n");
  const report = stripSlop(src);
  expect(report.cleaned).toContain("return 1;");
  expect(report.cleaned).not.toContain("Note that");
});

test("strips inline trailing comments but keeps code", () => {
  const src = "const x = 1; // Note that x is a number";
  const report = stripSlop(src);
  expect(report.cleaned).toBe("const x = 1;");
});

test("detects multiple slop patterns in one file", () => {
  const src = [
    "// First, we load the config",
    "// Note that the config is YAML",
    "function load() {",
    "  // This function loads config",
    "  return {}",
    "}",
  ].join("\n");
  const report = stripSlop(src);
  expect(report.stripped).toBe(3);
  const patterns = report.matches.map((m) => m.pattern);
  expect(patterns).toContain("narrative-filler");
  expect(patterns).toContain("obvious-observation");
  expect(patterns).toContain("restates-name");
});

test("match line and column numbers are 1-based", () => {
  const src = [
    "function f() {",
    "  // Note that this is obvious",
    "}",
  ].join("\n");
  const report = stripSlop(src);
  const match = report.matches[0];
  expect(match?.line).toBe(2);
  expect(match?.column).toBeGreaterThanOrEqual(1);
});