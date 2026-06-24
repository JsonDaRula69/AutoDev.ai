// @ts-nocheck — bun:test mock types are complex for strict mode
import { test, expect } from "bun:test";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";

const PROJECT_ROOT = resolve(import.meta.dirname, "../..");

test("install.sh guards against running as root/sudo", () => {
  const installSh = readFileSync(join(PROJECT_ROOT, "install.sh"), "utf-8");
  expect(installSh).toContain("id -u");
  expect(installSh).toContain("-eq 0");
});

test("install.sh installs bun if missing", () => {
  const installSh = readFileSync(join(PROJECT_ROOT, "install.sh"), "utf-8");
  expect(installSh).toContain("bun.sh/install");
});

test("install.sh installs autodev-ai globally", () => {
  const installSh = readFileSync(join(PROJECT_ROOT, "install.sh"), "utf-8");
  expect(installSh).toContain("bun install -g autodev-ai");
});

test("install.sh clears stale bun cache on install failure", () => {
  const installSh = readFileSync(join(PROJECT_ROOT, "install.sh"), "utf-8");
  expect(installSh).toContain(".bun/install/cache");
});

test("install.sh sets PI_CODING_AGENT_DIR", () => {
  const installSh = readFileSync(join(PROJECT_ROOT, "install.sh"), "utf-8");
  expect(installSh).toContain("PI_CODING_AGENT_DIR");
  expect(installSh).toContain(".AutoDev/agent");
});

test("install.sh hands off to autodev doctor", () => {
  const installSh = readFileSync(join(PROJECT_ROOT, "install.sh"), "utf-8");
  expect(installSh).toContain("autodev doctor");
});

test("install.sh does not require git clone (no cp from local config)", () => {
  const installSh = readFileSync(join(PROJECT_ROOT, "install.sh"), "utf-8");
  expect(installSh).not.toContain("docs-sources.yaml");
  expect(installSh).not.toContain("docs rebuild central");
});

test("config/docs-sources.yaml has pi source uncommented with active: true", () => {
  const yaml = readFileSync(join(PROJECT_ROOT, "config", "docs-sources.yaml"), "utf-8");
  expect(yaml).toContain("sources:");
  const piBlock = yaml.match(/- name: pi[\s\S]*?(?=\n\s*- name:|$)/);
  expect(piBlock).not.toBeNull();
  expect(piBlock![0]).toContain("active: true");
  const lines = yaml.split("\n");
  const piNameLine = lines.findIndex((l) => l.trim() === "- name: pi");
  expect(piNameLine).toBeGreaterThan(-1);
  expect(lines[piNameLine].trim().startsWith("#")).toBe(false);
});