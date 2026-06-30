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
  const authStorage = sdk.AuthStorage.create(join(agentDir, "auth.json"));

  const modelRegistry = sdk.ModelRegistry.create(authStorage, join(agentDir, "models.json"));
  const model = resolveModel(modelRegistry, agentDef.model);

  // 6. Build the resource loader with system prompt override and skill override.
  const resourceLoader = buildResourceLoader(sdk, projectRoot, agentDir, agentDef.systemPrompt);
  await resourceLoader.reload();

  // 7. Build the session manager (try persistent, fall back to in-memory on failure).
  const sessionManager = buildSessionManager(sdk, agentDir, notify);

  // 8. Create the session with the full extension active.
  const { session } = await sdk.createAgentSession({
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

  // Also subscribe to all events for debugging when AUTODEV_DEBUG is set.
  if (process.env.AUTODEV_DEBUG === "true") {
    session.subscribe((event: any) => {
      if (event.type !== "message_update") {
        console.error(`[debug] event: ${event.type}`);
      }
    });
  }

  // 10. Build and send the opening prompt, then enter interactive loop.
  const openingPrompt = buildOpeningPrompt(intentAnalysis);
  try {
    conversationLog.push({ role: "user", content: openingPrompt, timestamp: new Date().toISOString() });
    if (process.env.AUTODEV_DEBUG === "true") {
      console.error(`[debug] sending opening prompt (${openingPrompt.length} chars)`);
    }
    await session.prompt(openingPrompt);
    if (process.env.AUTODEV_DEBUG === "true") {
      console.error(`[debug] prompt returned, log has ${conversationLog.length} entries`);
      console.error(`[debug] assistant entries: ${conversationLog.filter(e => e.role === "assistant").length}`);
    }

    // Print the Harbor Master's opening response.
    const lastAssistant = [...conversationLog].reverse().find((e) => e.role === "assistant");
    if (lastAssistant) {
      process.stdout.write(`\n${lastAssistant.content}\n\n`);
    } else if (process.env.AUTODEV_DEBUG === "true") {
      console.error("[debug] no assistant message found in conversation log after opening prompt");
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
          rl.question("> ", (answer) => resolve(answer));
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
            notify(`Not ready yet. Missing: ${details.missing.join(", ")}`, "warning");
            continue;
          }
        }

        conversationLog.push({ role: "user", content: trimmed, timestamp: new Date().toISOString() });
        const logLengthBefore = conversationLog.length;
        if (process.env.AUTODEV_DEBUG === "true") {
          console.error(`[debug] sending user prompt: "${trimmed}"`);
        }
        await session.prompt(trimmed);
        if (process.env.AUTODEV_DEBUG === "true") {
          console.error(`[debug] prompt returned, new entries: ${conversationLog.length - logLengthBefore}`);
        }

        // Print any new assistant messages from this prompt.
        const newEntries = conversationLog.slice(logLengthBefore);
        const newAssistant = newEntries.filter((e) => e.role === "assistant");
        for (const msg of newAssistant) {
          process.stdout.write(`\n${msg.content}\n\n`);
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
            model,
            thinkingLevel: "low",
            tools: [],
            sessionManager: criticSessionManager,
            resourceLoader,
            modelRegistry,
            authStorage,
          } as never) as { session: { prompt: (p: string) => Promise<void>; messages?: Array<{ role?: string; content?: string }>; dispose?: () => void } };
          try {
            const fullPrompt = `${systemPrompt}\n\n${userPrompt}`;
            await criticSession.prompt(fullPrompt);
            const messages = criticSession.messages ?? [];
            const lastAssistant = [...messages].reverse().find((m) => m.role === "assistant");
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
  notify: (message: string, level: "info" | "warning" | "error") => void,
): SdkSessionManager {
  try {
    const persistentPath = join(agentDir, "..", "memory", "harbor-master-session");
    mkdirSync(persistentPath, { recursive: true });
    return sdk.SessionManager.create(persistentPath);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    notify(`Warning: could not create persistent session manager (${msg}); using in-memory session.`, "warning");
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
    `/skill:${HM_SKILL_NAME}`,
    "",
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
