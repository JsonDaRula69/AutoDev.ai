/**
 * Debate module — registers `autodev debate start` and `autodev debate status`
 * CLI commands.
 *
 * `autodev debate start "topic"` — classifies the topic via Cynefin, then
 *   executes the appropriate debate protocol (Simple → no debate, Complicated
 *   → single-round, Complex → full 5-phase, Chaotic → Watch Officer).
 *
 * `autodev debate status` — shows the current debate state.
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { getBackgroundManager } from "../background/index.js";
import {
  classifyTopic,
  createDebateState,
  type CynefinDomain,
  type DebateState,
  type DebatePhase,
} from "./protocol.js";
import {
  executePhase1,
  executePhase2,
  executePhase3,
  executePhase4,
  executePhase5,
  type SessionSpawnConfig,
} from "./sessions.js";
import { writeTranscripts } from "./transcript.js";

// ─── Active debate state ─────────────────────────────────────────────────────

const activeDebates = new Map<string, DebateState>();

// ─── Debate orchestrator ──────────────────────────────────────────────────────

export interface DebateResult {
  readonly slug: string;
  readonly classification: CynefinDomain;
  readonly phase: DebatePhase;
  readonly verdict: string;
  readonly transcriptDir: string | undefined;
  readonly error: string | undefined;
}

/**
 * Run a full debate on a topic.
 * 1. Classify the topic (Cynefin)
 * 2. Execute the appropriate protocol
 * 3. Write transcripts
 * 4. Return the result
 */
export async function runDebate(
  topic: string,
  config?: SessionSpawnConfig,
): Promise<DebateResult> {
  const classification = classifyTopic(topic);
  const state = createDebateState(topic, classification);
  const slug = state.slug;
  activeDebates.set(slug, state);

  const manager = getBackgroundManager();

  try {
    // Simple → no debate
    if (classification.domain === "simple") {
      state.phase = "completed";
      state.completedAt = Date.now();
      const dir = await writeTranscripts(state);
      return {
        slug,
        classification: classification.domain,
        phase: "completed",
        verdict: "not-required",
        transcriptDir: dir,
        error: undefined,
      };
    }

    // Chaotic → route to Watch Officer
    if (classification.domain === "chaotic") {
      state.phase = "blocked";
      state.error = "Chaotic topic — route to Watch Officer for emergency response";
      const dir = await writeTranscripts(state);
      return {
        slug,
        classification: classification.domain,
        phase: "blocked",
        verdict: "watch-officer",
        transcriptDir: dir,
        error: state.error,
      };
    }

    // Phase 1: Independent preparation
    const phase1 = executePhase1(manager, state, config);

    // Phase 2: Structured arguments
    const phase2Result = await executePhase2(manager, state, phase1);
    if (!phase2Result.success) {
      state.phase = "blocked";
      state.error = phase2Result.error;
      const dir = await writeTranscripts(state);
      return {
        slug,
        classification: classification.domain,
        phase: "blocked",
        verdict: "error",
        transcriptDir: dir,
        error: phase2Result.error,
      };
    }

    // Phase 3: Cross-examination (Complex only)
    const phase3Result = await executePhase3(manager, state, config);
    if (!phase3Result.success) {
      state.phase = "blocked";
      state.error = phase3Result.error;
      const dir = await writeTranscripts(state);
      return {
        slug,
        classification: classification.domain,
        phase: "blocked",
        verdict: "error",
        transcriptDir: dir,
        error: phase3Result.error,
      };
    }

    // Phase 4: Verdict
    const phase4Result = await executePhase4(manager, state, config);
    if (!phase4Result.success) {
      const dir = await writeTranscripts(state);
      return {
        slug,
        classification: classification.domain,
        phase: "blocked",
        verdict: "error",
        transcriptDir: dir,
        error: state.error,
      };
    }

    // Phase 5: Implementation verification
    const phase5Result = await executePhase5(manager, state, config);
    if (!phase5Result.success) {
      const dir = await writeTranscripts(state);
      return {
        slug,
        classification: classification.domain,
        phase: "blocked",
        verdict: "verification-failed",
        transcriptDir: dir,
        error: phase5Result.error,
      };
    }

    // All phases complete
    state.phase = "completed";
    state.completedAt = Date.now();
    const dir = await writeTranscripts(state);

    return {
      slug,
      classification: classification.domain,
      phase: "completed",
      verdict: state.verdicts.length > 0
        ? state.verdicts.map((v) => `${v.judge}: ${v.verdict}`).join("; ")
        : "unknown",
      transcriptDir: dir,
      error: undefined,
    };
  } catch (e) {
    state.phase = "blocked";
    state.error = (e as Error).message;
    const dir = await writeTranscripts(state);
    return {
      slug,
      classification: classification.domain,
      phase: "blocked",
      verdict: "error",
      transcriptDir: dir,
      error: (e as Error).message,
    };
  }
}

// ─── Module registration ─────────────────────────────────────────────────────

export function register(pi: ExtensionAPI): void {
  // `autodev debate start "topic"` — start a new debate
  pi.registerCommand("autodev", {
    description: "Start a debate on a topic",
    handler: async (args, ctx) => {
      const topic = args.trim();
      if (topic.length === 0) {
        ctx.ui.notify("Usage: autodev debate start \"topic\"", "error");
        return;
      }

      ctx.ui.notify(`Starting debate: "${topic}"`, "info");
      const result = await runDebate(topic);

      if (result.error !== undefined) {
        ctx.ui.notify(`Debate blocked: ${result.error}`, "error");
        return;
      }

      ctx.ui.notify(
        `Debate complete. Classification: ${result.classification}. ` +
        `Verdict: ${result.verdict}. Transcripts: ${result.transcriptDir ?? "N/A"}`,
        "info",
      );
    },
  });

  // `autodev debate status` — show current debate state
  pi.registerCommand("autodev", {
    description: "Show debate status",
    handler: async (_args, ctx) => {
      if (activeDebates.size === 0) {
        ctx.ui.notify("No active debates.", "info");
        return;
      }

      for (const [slug, state] of activeDebates) {
        ctx.ui.notify(
          `[${slug}] Topic: "${state.topic}" | Phase: ${state.phase} | ` +
          `Classification: ${state.classification.domain}` +
          (state.error !== undefined ? ` | Error: ${state.error}` : ""),
          "info",
        );
      }
    },
  });
}
