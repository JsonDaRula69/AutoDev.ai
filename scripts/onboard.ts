/**
 * Harbor Master onboarding session launcher.
 *
 * Creates a first-class, extension-enabled pi `AgentSession` for the Harbor
 * Master onboarding conversation. The session loads the Harbor Master persona
 * from the central agent directory, injects the onboarding compass skill,
 * analyzes user intent before starting, accumulates the conversation log,
 * and writes the Harbor Log artifacts after the session ends.
 *
 * The session runs with the full AutoDev pi extension active: guardrails,
 * context injection, comment checker, and all registered tools are available.
 * NO `noExtensions`, NO `noContextFiles`.
 *
 * Called from `scripts/cli.ts` `cmdOnboard()` and from
 * `extensions/autodev/installer/init-module.ts` step 10.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import type {
  AgentSession,
  AuthStorage,
  ModelRegistry,
  SessionManager,
  DefaultResourceLoader,
  createAgentSession,
  ExtensionAPI,
} from "@earendil-works/pi-coding-agent";
import { analyzeOnboardingIntent } from "../extensions/autodev/intent-gate/index.js";
import { setConversationLog, analyzeCoverage } from "../extensions/autodev/onboarding/index.js";
import { writeHarborLog, writeHarborLogSummary } from "../extensions/autodev/onboarding/harbor-log.js";
import { startOnboardingTeam, endOnboardingTeam } from "../extensions/autodev/onboarding/mailbox.js";
import { runHyperplan, type SpawnCriticDeps } from "../extensions/autodev/onboarding/hyperplan.js";
import { createVerboseLogger, createSubAgentLogger, resolveVerboseConfig, type VerboseLogger } from "../extensions/autodev/onboarding/verbose.js";
import { fireCodebaseExploration, fireTargetedResearch, fireRiskAssessment, type BackgroundResearchDeps } from "../extensions/autodev/onboarding/background-research.js";
import { postObservation } from "../extensions/autodev/onboarding/mailbox.js";
import { formatMessage, formatSessionHeader, formatPrompt } from "../extensions/autodev/onboarding/cli-format.js";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Default Harbor Master agent name (file stem under central agents dir). */
const HARBOR_MASTER_AGENT = "harbor-master";

/** Skill name for the Harbor Master onboarding compass. */
const HM_SKILL_NAME = "autodev-onboarding-harbor-master";

/** Skill description used when overriding the skill discovery. */
const HM_SKILL_DESCRIPTION =
  "Conversational compass for Harbor Master onboarding. Guides through six discovery goals, failure modes, artifact requirements, dispatch guidance, and progress checking.";

/** Tools allowlist for the Harbor Master onboarding session. */
const HM_TOOLS_ALLOWLIST: readonly string[] = [
  "read",
  "bash",
  "grep",
  "glob",
  "write",
  "onboarding_progress",
  "onboarding_dispatch_hint",
  "onboarding_finalize",
  "onboarding_check_mailbox",
  "task",
];

// ---------------------------------------------------------------------------
// Options interface
// ---------------------------------------------------------------------------

/** Options for runOnboard. */
export interface OnboardOptions {
  /** Project root (cwd for the session + where memory files are written). */
  readonly projectRoot: string;
  /** Optional initial project description text (e.g., CLI args or README). */
  readonly initialText?: string;
  /** Notify sink (maps to ctx.ui.notify / CLI stdout). */
  readonly notify: (message: string, level: "info" | "warning" | "error") => void;
  /**
   * Optional injected pi SDK dependency object for tests.
   * Production lazily imports from `@earendil-works/pi-coding-agent`.
   */
  readonly piSdkOverride?: Partial<PiSdkDeps>;
  /**
   * Optional injected agent-loader. Tests pass a fake returning a fixed agent
   * definition; production calls `loadAgent` from the delegation module.
   */
  readonly loadAgentOverride?: () => AgentDefinition | undefined;
  /**
   * Optional injected IntentGate analyzer. Tests pass a fake;
   * production calls `analyzeOnboardingIntent`.
   */
  readonly analyzeOnboardingIntentOverride?: (text: string) => OnboardingIntentAnalysis;
  readonly skipHyperplan?: boolean;
  readonly verbose?: boolean;
  readonly skipBackgroundResearch?: boolean;
}

/** Minimal shape of a Harbor Master agent definition returned by loadAgent. */
interface AgentDefinition {
  readonly name: string;
  readonly description?: string;
  readonly model?: string;
  readonly tools?: readonly string[];
  readonly systemPrompt: string;
}

/** Result shape from analyzeOnboardingIntent (subset used here). */
interface OnboardingIntentAnalysis {
  readonly hiddenIntentions: readonly { theme: string; evidence: string; question: string }[];
  readonly probingQuestions: readonly string[];
  readonly stake: "low" | "medium" | "high" | "critical" | "unknown";
  readonly technicalDepth: "non-technical" | "mixed" | "technical";
}

/** Production pi SDK dependencies. */
interface PiSdkDeps {
  getAgentDir: () => string;
  AuthStorage: typeof AuthStorage;
  ModelRegistry: typeof ModelRegistry;
  SessionManager: typeof SessionManager;
  DefaultResourceLoader: typeof DefaultResourceLoader;
  createAgentSession: typeof createAgentSession;
}

interface ModelRegistryLike {
  find: (provider: string, model: string) => SdkModel;
  getAvailable: () => readonly unknown[];
  getDefault?: () => SdkModel;
}

interface ModelLike {
  readonly id: string;
  readonly provider: string;
  readonly [key: string]: unknown;
}

type RegistryInstance = ReturnType<typeof ModelRegistry.create>;

type SdkModel = ReturnType<RegistryInstance["find"]>;

type SdkSessionManager = ReturnType<typeof SessionManager.create>;

type SdkResourceLoader = InstanceType<typeof DefaultResourceLoader>;

type SdkCreateAgentSessionResult = Awaited<ReturnType<typeof createAgentSession>>;

type SdkAgentSession = SdkCreateAgentSessionResult extends { session: infer S } ? S : AgentSession;

interface ResourceLoaderLike {
  reload: () => Promise<void>;
  getSkills: () => { skills: unknown[]; diagnostics: unknown[] };
}

interface DefaultResourceLoaderOptions {
  cwd: string;
  agentDir: string;
  systemPromptOverride: () => string;
  skillsOverride: (current: { skills: unknown[]; diagnostics: unknown[] }) => { skills: unknown[]; diagnostics: unknown[] };
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

/**
 * Launch the Harbor Master onboarding session.
 *
 * Returns 0 on success, non-zero when the session cannot be launched.
 */
export async function runOnboard(opts: OnboardOptions): Promise<number> {
  const { projectRoot, notify } = opts;

  // 1. Resolve the Harbor Master agent definition (system prompt body).
  const agentDef = resolveAgentDefinition(opts);
  if (agentDef === undefined) {
    notify("Harbor Master agent definition not found. Run `autodev init` first.", "warning");
    return 1;
  }

  // 2. Analyze onboarding intent from any initial user-provided text.
  const intentAnalysis = analyzeOnboardingIntentText(opts);

  // 3. Inject the conversation log reference so the extension tools can read it.
  const conversationLog: Array<{ role: string; content: string; timestamp: string }> = [];
  setConversationLog(conversationLog);

  // 3b. Start the onboarding team mailbox so crew observers (Conseil, Metis,
  // Momus) can post observations without interrupting the conversation.
  startOnboardingTeam();

  // 4. Resolve the pi SDK (production) or use injected deps (tests).
  const sdk = await resolvePiSdk(opts);
  const agentDir = sdk.getAgentDir();
  const verboseConfig = resolveVerboseConfig(agentDir);
  const vlog = createVerboseLogger({ ...(opts.verbose !== undefined ? { cliFlag: opts.verbose } : {}), config: verboseConfig });
  const authStorage = sdk.AuthStorage.create(join(agentDir, "auth.json"));

  const modelRegistry = sdk.ModelRegistry.create(authStorage, join(agentDir, "models.json"));
  const model = resolveModel(modelRegistry, agentDef.model);

  // 6. Build the resource loader with system prompt override and skill override.
  const resourceLoader = buildResourceLoader(sdk, projectRoot, agentDir, agentDef.systemPrompt);
  await resourceLoader.reload();

  // 7. Build the session manager — resumes most recent session if one exists.
  const sessionManager = buildSessionManager(sdk, agentDir, projectRoot, notify);

  // 7a. Check if resuming an existing session — aware of time elapsed and onboarding progress.
  const existingEntries = sessionManager.getEntries?.() ?? [];
  const isResuming = existingEntries.length > 0;
  let resumeContext = "";
  if (isResuming) {
    const lastEntry = existingEntries[existingEntries.length - 1];
    const lastTimestamp = lastEntry?.timestamp ? new Date(lastEntry.timestamp).getTime() : 0;
    const elapsedMs = Date.now() - lastTimestamp;
    const elapsedHours = Math.floor(elapsedMs / 3_600_000);
    const elapsedMin = Math.floor(elapsedMs / 60_000);
    const coverage = analyzeCoverage(existingEntries.map((e: any) => {
      if (e.type === "message" && e.message) return e.message;
      return { role: e.type, content: "" };
    }));
    const missing = coverage.gaps.length > 0
      ? `Still need to cover: ${coverage.gaps.join(", ")}.`
      : "All onboarding coverage areas are filled.";
    const timeStr = elapsedHours > 0
      ? `${elapsedHours} hour${elapsedHours > 1 ? "s" : ""}`
      : elapsedMin > 0
        ? `${elapsedMin} minute${elapsedMin > 1 ? "s" : ""}`
        : "moments";

    const recentTopics = existingEntries
      .filter((e: any) => e.type === "message" && e.message?.role === "user")
      .slice(-3)
      .map((e: any) => e.message?.content?.slice(0, 100) ?? "")
      .filter((c: string) => c.trim());

    resumeContext = `[SYSTEM] The user has returned after ${timeStr}. You are resuming an onboarding session that has ${existingEntries.length} messages.

Onboarding progress:
${missing}

Recent topics discussed:
${recentTopics.length > 0 ? recentTopics.map((t: string, i: number) => `${i + 1}. ${t}`).join("\n") : "No recent user messages found."}

Greet the user warmly. Acknowledge the time gap. Provide a brief progress update on what we've covered so far and what's still ahead. Then ask what they'd like to focus on next.

Do NOT repeat the opening onboarding prompt. This is a continuation, not a fresh start.`;
    notify(`Resuming onboarding session (${existingEntries.length} messages, last activity ${timeStr} ago).`, "info");
  }

  // 7b. Build background research deps — fires subagents during onboarding.
  const bgDeps: BackgroundResearchDeps = {
    projectRoot,
    createSession: async (prompt: string, systemPrompt: string, modelId: string) => {
      const bgModel = resolveModel(modelRegistry, modelId);
      const bgSessionManager = sdk.SessionManager.inMemory();
      const { session: bgSession } = await sdk.createAgentSession({
        cwd: projectRoot,
        model: bgModel,
        thinkingLevel: "medium",
        tools: ["read", "bash", "grep", "glob"],
        sessionManager: bgSessionManager,
        resourceLoader,
        modelRegistry,
        authStorage,
      } as never);
      return {
        session: bgSession,
        dispose: () => { try { bgSession.dispose(); } catch { /* ignore */ } },
      };
    },
    postToMailbox: (from: string, kind: "note" | "flag" | "question" | "blocker", content: string) => {
      postObservation(from, kind, content);
      if (vlog.active) {
        vlog.logToolCall("harbor-master", "mailbox", { from, kind, preview: content.slice(0, 100) });
      }
    },
  };

  // 8. Create the session with the full extension active.
  process.stdout.write(formatSessionHeader(projectRoot, isResuming));
  const { session } = await sdk.createAgentSession({
    cwd: projectRoot,
    model,
    thinkingLevel: "medium",
    tools: HM_TOOLS_ALLOWLIST,
    sessionManager,
    resourceLoader,
    modelRegistry,
    authStorage,
  } as never);

  // 9. Subscribe to message_end to accumulate assistant messages into the log.
  const unsubscribe = subscribeToAssistantMessages(session, conversationLog);

  if (vlog.active) {
    session.subscribe((event: any) => {
      vlog.logEvent("harbor-master", event);
    });
  }

  // 10. Send opening prompt (only for fresh sessions), then enter interactive loop.
  const openingPrompt = buildOpeningPrompt(intentAnalysis);
  try {
    if (!isResuming) {
      conversationLog.push({ role: "user", content: openingPrompt, timestamp: new Date().toISOString() });
      vlog.logPrompt("harbor-master", openingPrompt.length);
      await session.prompt(openingPrompt);
      vlog.logPromptResult("harbor-master", conversationLog.length, conversationLog.filter(e => e.role === "assistant").length);

      if (!opts.skipBackgroundResearch) {
        fireCodebaseExploration(bgDeps, openingPrompt.slice(0, 500)).catch(() => {});
      }

      const lastAssistant = [...conversationLog].reverse().find((e) => e.role === "assistant");
      if (lastAssistant) {
        process.stdout.write(formatMessage("agent", lastAssistant.content, { agent: "harbor-master" }));
      } else if (vlog.active) {
        process.stderr.write(formatMessage("warning", "No assistant message found after opening prompt", { agent: "harbor-master" }));
      }
    } else {
      conversationLog.push({ role: "user", content: resumeContext, timestamp: new Date().toISOString() });
      vlog.logPrompt("harbor-master", resumeContext.length);
      await session.prompt(resumeContext);
      vlog.logPromptResult("harbor-master", conversationLog.length, conversationLog.filter(e => e.role === "assistant").length);

      if (!opts.skipBackgroundResearch) {
        fireCodebaseExploration(bgDeps, resumeContext.slice(0, 500)).catch(() => {});
      }

      const lastAssistant = [...conversationLog].reverse().find((e) => e.role === "assistant");
      if (lastAssistant) {
        process.stdout.write(formatMessage("agent", lastAssistant.content, { agent: "harbor-master" }));
      }
    }

    // 10b. Interactive readline loop — let the user converse with the Harbor Master.
    // Only enter the loop when stdin is a TTY (interactive terminal).
    // In non-interactive mode (piped stdin, tests, CI), the session ends after
    // the opening prompt.
    if (process.stdin.isTTY === true) {
      const { createInterface } = await import("node:readline");
      const rl = createInterface({
        input: process.stdin,
        output: process.stdout,
        terminal: true,
      });

      const askQuestion = (): Promise<string> =>
        new Promise((resolve) => {
          rl.question(formatPrompt(""), (answer) => resolve(answer));
        });

      while (true) {
        const userInput = await askQuestion();
        const trimmed = userInput.trim();

        if (trimmed === "" || trimmed === "exit" || trimmed === "quit" || trimmed === "/done") {
          break;
        }

        if (trimmed === "/finalize") {
          const { executeOnboardingFinalize } = await import(
            "../extensions/autodev/onboarding/index.js"
          );
          const result = executeOnboardingFinalize(undefined);
          const details = result.details as { ready: boolean; missing: string[] };
          if (details.ready) {
            notify("Onboarding finalized — all coverage requirements met.", "info");
            break;
          } else {
            process.stdout.write(formatMessage("warning", `Not ready yet. Missing: ${details.missing.join(", ")}`));
            continue;
          }
        }

        conversationLog.push({ role: "user", content: trimmed, timestamp: new Date().toISOString() });
        const logLengthBefore = conversationLog.length;
        vlog.logPrompt("harbor-master", trimmed.length);

        // Fire background research based on user's response — runs in parallel with the HM's reply.
        const conversationContext = conversationLog.map(e => `${e.role}: ${e.content.slice(0, 200)}`).join("\n");
        if (!opts.skipBackgroundResearch) {
          fireTargetedResearch(bgDeps, trimmed, conversationContext).catch(() => {});
        }

        await session.prompt(trimmed);
        vlog.logPromptResult("harbor-master", conversationLog.length - logLengthBefore, conversationLog.slice(logLengthBefore).filter(e => e.role === "assistant").length);

        // Fire risk assessment every 3rd user message.
        const userMsgCount = conversationLog.filter(e => e.role === "user").length;
        if (userMsgCount % 3 === 0 && !opts.skipBackgroundResearch) {
          const ctx = conversationLog.map(e => `${e.role}: ${e.content.slice(0, 200)}`).join("\n");
          fireRiskAssessment(bgDeps, ctx).catch(() => {});
        }

        // Print any new assistant messages from this prompt.
        const newEntries = conversationLog.slice(logLengthBefore);
        const newAssistant = newEntries.filter((e) => e.role === "assistant");
        for (const msg of newAssistant) {
          process.stdout.write(formatMessage("agent", msg.content, { agent: "harbor-master" }));
        }
      }

      rl.close();
    } else {
      notify("Non-interactive stdin detected. Onboarding session completed with opening prompt only.", "info");
      notify("To run interactive onboarding, run 'autodev onboard' in a terminal.", "info");
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    notify(`Onboarding session ended with error: ${msg}`, "warning");
  } finally {
    unsubscribe();
    safeDispose(session);
    endOnboardingTeam();
  }

  // 11. Write Harbor Log artifacts.
  try {
    const coverage = analyzeCoverage(conversationLog);
    await writeHarborLog(projectRoot, conversationLog);
    await writeHarborLogSummary(projectRoot, conversationLog, coverage);
    notify("Onboarding complete. Harbor Log written.", "info");
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    notify(`Warning: could not write Harbor Log: ${msg}`, "warning");
  }

  // 12. Run hyperplan — 5 hostile critics cross-examine onboarding results.
  if (!opts.skipHyperplan) {
    try {
      notify("Launching hyperplan — 5 critics reviewing onboarding results...", "info");
      const { runHyperplan: runHp } = await import("../extensions/autodev/onboarding/hyperplan.js");
      const criticDeps: SpawnCriticDeps = {
        prompt: async (criticId: string, systemPrompt: string, userPrompt: string): Promise<string> => {
          const criticSessionManager = sdk.SessionManager.inMemory();
          const { session: criticSession } = await sdk.createAgentSession({
            cwd: projectRoot,
            model,
            thinkingLevel: "low",
            tools: [],
            sessionManager: criticSessionManager,
            resourceLoader,
            modelRegistry,
            authStorage,
          } as never) as { session: { prompt: (p: string) => Promise<void>; messages?: Array<{ role?: string; content?: string }>; dispose?: () => void; subscribe?: (fn: (e: any) => void) => () => void } };
          try {
            if (vlog.active) {
              const subLogger = createSubAgentLogger(vlog, verboseConfig);
              criticSession.subscribe?.((event: any) => {
                subLogger.logEvent(criticId, event);
              });
            }
            const fullPrompt = `${systemPrompt}\n\n${userPrompt}`;
            vlog.logPrompt(criticId, fullPrompt.length);
            await criticSession.prompt(fullPrompt);
            const messages = criticSession.messages ?? [];
            const lastAssistant = [...messages].reverse().find((m) => m.role === "assistant");
            vlog.logPromptResult(criticId, messages.length, lastAssistant ? 1 : 0);
            return lastAssistant?.content ?? "(no response)";
          } finally {
            criticSession.dispose?.();
          }
        },
      };
      const hpResult = await runHp(projectRoot, conversationLog, criticDeps);
      const icon = hpResult.verdict === "pass" ? "✓" : hpResult.verdict === "revise" ? "⚠" : "✗";
      notify(`  ${icon} Hyperplan verdict: ${hpResult.verdict.toUpperCase()}`, hpResult.verdict === "pass" ? "info" : "warning");
      notify(`  ${hpResult.critiques.length} critics reviewed. ${hpResult.summary}`, "info");
      if (hpResult.verdictPath) {
        notify(`  Verdict written to: ${hpResult.verdictPath}`, "info");
      }
      if (hpResult.verdict === "block") {
        notify("  Onboarding has critical misunderstandings. Consider re-running 'autodev onboard'.", "warning");
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      notify(`Warning: hyperplan failed (non-fatal): ${msg}`, "warning");
    }
  }

  return 0;
}

// ---------------------------------------------------------------------------
// Default implementations (production wiring)
// ---------------------------------------------------------------------------

async function resolvePiSdk(opts: OnboardOptions): Promise<PiSdkDeps> {
  if (opts.piSdkOverride !== undefined) {
    const override = opts.piSdkOverride;
    const { getAgentDir, AuthStorage, ModelRegistry, SessionManager, DefaultResourceLoader, createAgentSession } = override;
    return {
      getAgentDir,
      AuthStorage,
      ModelRegistry,
      SessionManager,
      DefaultResourceLoader,
      createAgentSession,
    } as PiSdkDeps;
  }

  const mod = await import("@earendil-works/pi-coding-agent");
  return {
    getAgentDir: mod.getAgentDir,
    AuthStorage: mod.AuthStorage,
    ModelRegistry: mod.ModelRegistry,
    SessionManager: mod.SessionManager,
    DefaultResourceLoader: mod.DefaultResourceLoader,
    createAgentSession: mod.createAgentSession,
  };
}

function resolveAgentDefinition(opts: OnboardOptions): AgentDefinition | undefined {
  if (opts.loadAgentOverride !== undefined) {
    return opts.loadAgentOverride();
  }

  try {
    const { loadAgent } = require("../extensions/autodev/delegation/agents.js") as {
      loadAgent: (_projectRoot: string, name: string) => AgentDefinition | undefined;
    };
    return loadAgent(opts.projectRoot, HARBOR_MASTER_AGENT);
  } catch {
    return undefined;
  }
}

function analyzeOnboardingIntentText(opts: OnboardOptions): OnboardingIntentAnalysis {
  const text = opts.initialText?.trim() ?? "";
  if (opts.analyzeOnboardingIntentOverride !== undefined) {
    return opts.analyzeOnboardingIntentOverride(text);
  }
  const result = analyzeOnboardingIntent(text);
  return {
    hiddenIntentions: result.hiddenIntentions,
    probingQuestions: result.probingQuestions,
    stake: result.stake,
    technicalDepth: result.technicalDepth,
  };
}

function resolveModel(modelRegistry: ModelRegistryLike, agentModel: string | undefined): ModelLike {
  let model: ModelLike | null = null;
  if (agentModel !== undefined && agentModel.trim().length > 0) {
    const [provider, modelId] = agentModel.split("/");
    if (provider !== undefined) {
      const found = modelRegistry.find(provider, modelId ?? agentModel);
      if (found !== undefined && found !== null) {
        model = found as unknown as ModelLike;
      }
    }
  }
  if (model === null) {
    const available = modelRegistry.getAvailable();
    const first = available[0];
    if (first !== undefined && first !== null) {
      model = first as unknown as ModelLike;
    } else if (typeof modelRegistry.getDefault === "function") {
      const fallback = modelRegistry.getDefault();
      if (fallback !== undefined && fallback !== null) {
        model = fallback as unknown as ModelLike;
      }
    }
  }
  if (model === null) {
    throw new Error(
      "No usable model found for Harbor Master onboarding. " +
        "Configure a model in ~/.pi/agent/models.json or set a default provider.",
    );
  }
  return model;
}

function buildResourceLoader(
  sdk: PiSdkDeps,
  projectRoot: string,
  agentDir: string,
  systemPrompt: string,
): ResourceLoaderLike {
  return new (sdk.DefaultResourceLoader as unknown as new (opts: DefaultResourceLoaderOptions) => ResourceLoaderLike)({
    cwd: projectRoot,
    agentDir,
    systemPromptOverride: () => systemPrompt,
    skillsOverride: (current) => ({
      skills: [
        ...current.skills,
        {
          name: HM_SKILL_NAME,
          description: HM_SKILL_DESCRIPTION,
          filePath: resolveSkillPath(agentDir),
          baseDir: agentDir,
          source: "custom",
        } as unknown,
      ],
      diagnostics: current.diagnostics,
    }),
  }) as ResourceLoaderLike;
}

function buildSessionManager(
  sdk: PiSdkDeps,
  agentDir: string,
  projectRoot: string,
  notify: (message: string, level: "info" | "warning" | "error") => void,
): SdkSessionManager {
  try {
    const sessionDir = join(agentDir, "..", "memory", "harbor-master-session");
    mkdirSync(sessionDir, { recursive: true });
    return sdk.SessionManager.continueRecent(projectRoot, sessionDir);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    notify(`Warning: could not resume persistent session (${msg}); using in-memory session.`, "warning");
    return sdk.SessionManager.inMemory();
  }
}

function safeDispose(session: AgentSession): void {
  try {
    session.dispose();
  } catch {
    // ignore
  }
}

function subscribeToAssistantMessages(
  session: AgentSession,
  conversationLog: Array<{ role: string; content: string; timestamp: string }>,
): () => void {
  let currentAssistantText = "";
  return session.subscribe((event: any) => {
    if (event.type === "message_start") {
      currentAssistantText = "";
    }
    if (event.type === "message_update" && "assistantMessageEvent" in event) {
      const ae = event.assistantMessageEvent;
      if (ae.type === "text_delta") {
        currentAssistantText += ae.delta;
      }
    }
    if (event.type === "message_end") {
      if (event.message && event.message.role !== "assistant") {
        currentAssistantText = "";
        return;
      }
      let text = currentAssistantText;
      if (text.length === 0 && event.message) {
        const msg = event.message;
        const content = msg.content;
        if (typeof content === "string") {
          text = content;
        } else if (Array.isArray(content)) {
          text = content
            .filter((part: any) => part?.type === "text" && typeof part.text === "string")
            .map((part: any) => part.text)
            .join("");
        }
      }
      if (text.length > 0) {
        conversationLog.push({
          role: "assistant",
          content: text,
          timestamp: new Date().toISOString(),
        });
      }
      currentAssistantText = "";
    }
  });
}

function buildOpeningPrompt(intent: OnboardingIntentAnalysis): string {
  const lines: string[] = [
    "The visitor just arrived. Begin the onboarding conversation now.",
    "",
    `Stake tier: ${intent.stake}`,
    `Technical depth: ${intent.technicalDepth}`,
  ];

  if (intent.hiddenIntentions.length > 0) {
    lines.push("", "Hidden intentions to probe:");
    for (const hi of intent.hiddenIntentions) {
      lines.push(`- ${hi.theme}: ${hi.question}`);
    }
  }

  if (intent.probingQuestions.length > 0) {
    lines.push("", "Suggested probing questions:");
    for (const q of intent.probingQuestions) {
      lines.push(`- ${q}`);
    }
  }

  return lines.join("\n");
}

function resolveSkillPath(agentDir: string): string {
  return resolve(join(agentDir, "..", "skills", HM_SKILL_NAME, "SKILL.md"));
}
