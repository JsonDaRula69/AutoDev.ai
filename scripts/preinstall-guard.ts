#!/usr/bin/env bun
/**
 * preinstall guard — abort local installs.
 *
 * Bun skips root lifecycle scripts during `bun install -g <pkg>` (see
 * `src/install/PackageManager/install_with_manager.zig`: the
 * `!manager.options.global` guard on root-script execution). That means
 * this script ONLY runs for `bun install <pkg>` (local), never for the
 * global case. So an unconditional abort cleanly blocks local installs
 * while leaving global installs untouched — no env-var sniffing needed.
 *
 * AutoDev is a machine-level tool, not a project dependency. Local
 * installs create a half-installed package on disk and a confusing
 * postinstall warning; the preinstall abort prevents that entirely.
 */
console.error("AutoDev is a machine-level tool, not a project dependency.");
console.error("Install it globally instead:  bun install -g autodev");
process.exit(1);