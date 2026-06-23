/**
 * Symlink-or-copy primitive with Windows/EPERM fallback.
 *
 * `linkOrCopy` creates a symlink from `linkPath` to `target`. On `EPERM` (or
 * on win32 without dev mode) it falls back to `fs.cpSync` and returns a
 * `copied: true` flag plus a warning detail so callers can surface it.
 */
import { cpSync, existsSync, lstatSync, mkdirSync, symlinkSync } from "node:fs";

export const COPY_FALLBACK_WARNING =
  "symlink failed (EPERM) — copied instead. Enable Developer Mode or run as admin for auto-updating symlinks.";

export interface LinkOrCopyResult {
  readonly ok: boolean;
  readonly detail: string;
  readonly created: boolean;
  readonly copied: boolean;
}

export interface SymlinkOverrides {
  readonly symlinkOverride?: (
    target: string,
    path: string,
    type?: "dir" | "file" | "junction",
  ) => void;
}

function isBrokenSymlink(path: string): boolean {
  try {
    return lstatSync(path).isSymbolicLink();
  } catch {
    return false;
  }
}

export function linkOrCopy(
  target: string,
  linkPath: string,
  isDir: boolean,
  overrides?: SymlinkOverrides,
): LinkOrCopyResult {
  if (existsSync(linkPath) || isBrokenSymlink(linkPath)) {
    return { ok: true, detail: "exists", created: false, copied: false };
  }

  const parent = linkPath.substring(0, linkPath.lastIndexOf("/"));
  if (parent && !existsSync(parent)) {
    mkdirSync(parent, { recursive: true });
  }

  try {
    const fn = overrides?.symlinkOverride ?? symlinkSync;
    fn(target, linkPath, isDir ? "dir" : "file");
    return { ok: true, detail: "symlinked", created: true, copied: false };
  } catch (e) {
    const code = (e as NodeJS.ErrnoException).code;
    if (code === "EPERM" || process.platform === "win32") {
      try {
        cpSync(target, linkPath, { recursive: isDir });
        return { ok: true, detail: COPY_FALLBACK_WARNING, created: true, copied: true };
      } catch (copyErr) {
        return {
          ok: false,
          detail: `copy fallback failed: ${(copyErr as Error).message}`,
          created: false,
          copied: false,
        };
      }
    }
    return {
      ok: false,
      detail: `symlink failed: ${(e as Error).message}`,
      created: false,
      copied: false,
    };
  }
}

export function detailFor(
  r: LinkOrCopyResult,
  createdMsg: string,
): string {
  if (!r.ok) return r.detail;
  if (r.copied) return r.detail;
  return r.created ? createdMsg : "exists";
}