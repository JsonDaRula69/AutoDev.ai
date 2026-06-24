// @ts-nocheck — bun:test mock types are complex for strict mode
/**
 * T19 Install script tests — install.sh content assertions.
 *
 * Tests:
 *  - install.sh contains `pi install npm:pi-ollama-cloud` after bun install
 *  - config/docs-sources.yaml has the `pi` source uncommented with active: true
 *  - install.sh creates ~/.AutoDev/config/ and copies docs-sources.yaml there
 *  - install.sh contains `autodev docs rebuild central` to trigger seeding
 */
import { test, expect } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";

const PROJECT_ROOT = resolve(import.meta.dirname, "../..");

// ---------------------------------------------------------------------------
// install.sh content tests
// ---------------------------------------------------------------------------

test("install.sh contains pi install npm:pi-ollama-cloud", () => {
  const installSh = readFileSync(join(PROJECT_ROOT, "install.sh"), "utf-8");
  expect(installSh).toContain("pi-ollama-cloud");
});

test("install.sh uses autodev install-provider (not bunx pi)", () => {
  const installSh = readFileSync(join(PROJECT_ROOT, "install.sh"), "utf-8");
  expect(installSh).toContain("autodev install-provider pi-ollama-cloud");
});

test("install.sh guards against running as root/sudo", () => {
  const installSh = readFileSync(join(PROJECT_ROOT, "install.sh"), "utf-8");
  expect(installSh).toContain('id -u');
  expect(installSh).toContain("-eq 0");
});

test("install.sh clears stale bun cache on install failure", () => {
  const installSh = readFileSync(join(PROJECT_ROOT, "install.sh"), "utf-8");
  expect(installSh).toContain(".bun/install/cache");
});

test("install.sh contains autodev docs rebuild central", () => {
  const installSh = readFileSync(join(PROJECT_ROOT, "install.sh"), "utf-8");
  expect(installSh).toContain("autodev docs rebuild central");
});

test("install.sh creates ~/.AutoDev/config/ and copies docs-sources.yaml", () => {
  const installSh = readFileSync(join(PROJECT_ROOT, "install.sh"), "utf-8");
  // Must create the central config directory
  expect(installSh).toContain(".AutoDev/config");
  // Must copy the project-local docs-sources.yaml to the central path
  expect(installSh).toContain("docs-sources.yaml");
});

test("pi install command appears after bun install -g autodev", () => {
  const installSh = readFileSync(join(PROJECT_ROOT, "install.sh"), "utf-8");
  const bunInstallIdx = installSh.indexOf("bun install -g autodev");
  const piInstallIdx = installSh.indexOf("pi-ollama-cloud");
  expect(bunInstallIdx).toBeGreaterThan(-1);
  expect(piInstallIdx).toBeGreaterThan(bunInstallIdx);
});

test("docs rebuild appears after config copy", () => {
  const installSh = readFileSync(join(PROJECT_ROOT, "install.sh"), "utf-8");
  const configCopyIdx = installSh.indexOf("docs-sources.yaml");
  const rebuildIdx = installSh.indexOf("autodev docs rebuild central");
  expect(configCopyIdx).toBeGreaterThan(-1);
  expect(rebuildIdx).toBeGreaterThan(configCopyIdx);
});

// ---------------------------------------------------------------------------
// config/docs-sources.yaml content tests
// ---------------------------------------------------------------------------

test("config/docs-sources.yaml has pi source uncommented with active: true", () => {
  const yaml = readFileSync(join(PROJECT_ROOT, "config", "docs-sources.yaml"), "utf-8");
  // The pi source should be in the `sources:` list (not commented out)
  expect(yaml).toContain("sources:");
  // The pi source entry should be uncommented
  const piBlock = yaml.match(/- name: pi[\s\S]*?(?=\n\s*- name:|$)/);
  expect(piBlock).not.toBeNull();
  expect(piBlock![0]).toContain("active: true");
  // The pi source should NOT be commented out (no leading `#` on the name line)
  const lines = yaml.split("\n");
  const piNameLine = lines.findIndex((l) => l.trim() === "- name: pi");
  expect(piNameLine).toBeGreaterThan(-1);
  expect(lines[piNameLine].trim().startsWith("#")).toBe(false);
});
