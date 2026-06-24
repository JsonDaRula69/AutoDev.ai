/**
 * HM Simulation — Standalone Harbor Master onboarding session.
 *
 * Boots a pi AgentSession with:
 *   - The Harbor Master agent definition (from .pi/agents/harbor-master.md)
 *   - The rewritten onboarding skill (from simulation/skill-draft.md)
 *   - glm-5.2:cloud via local Ollama proxy (http://localhost:11434/v1)
 *   - Four mock onboarding tools (progress, dispatch_hint, finalize, task)
 *   - An interactive stdio conversation loop
 *
 * No connection to the rest of AutoDev. Run it, talk to the Harbor Master,
 * give feedback. The conversation transcript is written to
 * simulation/harbor-log.txt after the session ends.
 *
 * Usage:
 *   bun run simulation/hm-simulate.ts
 *
 * Prerequisites:
 *   - Ollama running locally (http://localhost:11434)
 *   - ollama signin completed (cloud models accessible)
 *   - glm-5.2:cloud pulled (ollama pull glm-5.2:cloud)
 */
import { createAgentSession, SessionManager, AuthStorage, ModelRegistry, DefaultResourceLoader, defineTool, type AgentSession } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import * as readline from "node:readline";

// ---- Paths ----

const SCRIPT_DIR = dirname(new URL(import.meta.url).pathname);
const PROJECT_ROOT = resolve(SCRIPT_DIR, "..");
const AGENT_PATH = join(PROJECT_ROOT, ".pi", "agents", "harbor-master.md");
const SKILL_PATH = join(SCRIPT_DIR, "skill-draft.md");
const LOG_OUTPUT = join(SCRIPT_DIR, "harbor-log.txt");

// ---- Ollama provider config ----

const OLLAMA_BASE_URL = "http://localhost:11434/v1";
const OLLAMA_PROVIDER = "ollama-cloud";
const OLLAMA_MODEL_ID = "glm-5.2:cloud";

const OLLAMA_MODELS = [
  { id: "glm-5.2:cloud", name: "GLM-5.2 Cloud", reasoning: true, input: ["text"] as const, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }, contextWindow: 1_000_000, maxTokens: 16384 },
  { id: "glm-5.1:cloud", name: "GLM-5.1 Cloud", reasoning: true, input: ["text"] as const, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }, contextWindow: 202_752, maxTokens: 16384 },
  { id: "deepseek-v4-pro", name: "DeepSeek V4 Pro", reasoning: true, input: ["text"] as const, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }, contextWindow: 1_048_576, maxTokens: 16384 },
  { id: "deepseek-v4-flash", name: "DeepSeek V4 Flash", reasoning: true, input: ["text"] as const, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }, contextWindow: 1_048_576, maxTokens: 16384 },
  { id: "kimi-k2.7-code", name: "Kimi K2.7 Code", reasoning: true, input: ["text"] as const, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }, contextWindow: 262_144, maxTokens: 16384 },
];

// ---- Conversation tracking (for mock tools) ----

interface ConversationEntry {
  readonly role: "user" | "assistant";
  readonly content: string;
  readonly timestamp: string;
}

const conversationLog: ConversationEntry[] = [];

/** Keywords for each of the 6 onboarding discovery goals. */
const PHASE_KEYWORDS: ReadonlyArray<readonly [string, readonly string[]]> = [
  ["proficiency", ["deploy", "pipeline", "ci", "cd", "production", "stage", "staging", "architecture", "stack", "role", "experience", "engineer", "developer", "founder"]],
  ["identity", ["does", "system", "app", "tool", "purpose", "goal", "vision", "what is", "what does", "invariant", "stake", "risk", "critical", "money", "data", "safety"]],
  ["architecture", ["language", "database", "sql", "postgres", "mysql", "redis", "api", "endpoint", "framework", "library", "dependency", "docker", "container", "kubernetes", "microservice", "monolith", "frontend", "backend"]],
  ["constraints", ["never", "must not", "cannot", "should not", "constraint", "invariant", "rule", "policy", "review", "approval", "gate", "deploy", "merge", "secret"]],
  ["knowledge", ["documentation", "docs", "readme", "adr", "decision", "tacit", "written", "knowledge", "understand", "learn", "assumption", "known issue", "debt"]],
  ["validation", ["correct", "missing", "summary", "sign off", "confirm", "assume", "assumption", "wrap up", "anything else", "done"]],
];

/** Codebase technologies that suggest Conseil (codebase verification) dispatches. */
const CODEBASE_DISPATCH_MAP: ReadonlyArray<readonly [string, string]> = [
  ["slack", "Conseil: find Slack API usage and bot integration in the codebase"],
  ["discord", "Conseil: find Discord bot API usage and message handling in the codebase"],
  ["postgres", "Conseil: find PostgreSQL schema, migrations, and connection config"],
  ["mysql", "Conseil: find MySQL schema management and migration files"],
  ["redis", "Conseil: find Redis caching patterns and pub/sub usage"],
  ["mongodb", "Conseil: find MongoDB schema design and aggregation usage"],
  ["react", "Conseil: find React component patterns and state management"],
  ["vue", "Conseil: find Vue composition API and component architecture"],
  ["python", "Conseil: find Python type checking (mypy/pyright) and packaging config"],
  ["typescript", "Conseil: find TypeScript strict mode settings and module system config"],
  ["rust", "Conseil: find Rust ownership patterns and error handling"],
  ["docker", "Conseil: find Docker multi-stage builds and container config"],
  ["kubernetes", "Conseil: find Kubernetes deployment manifests and health probes"],
  ["aws", "Conseil: find AWS service integration (IAM, Lambda, RDS) in the codebase"],
  ["stripe", "Conseil: find Stripe payment integration and webhook handling"],
  ["openai", "Conseil: find OpenAI API usage and rate limiting patterns"],
  ["llm", "Conseil: find LLM integration patterns and prompt engineering"],
  ["api", "Conseil: find existing API endpoints and integrations in the codebase"],
  ["database", "Conseil: find schema, migrations, and ORM usage"],
  ["test", "Conseil: find test framework, coverage config, and test patterns"],
];

/** External technologies/concepts/platforms that suggest Navigator (external research) dispatches. */
const RESEARCH_DISPATCH_MAP: ReadonlyArray<readonly [string, string]> = [
  ["kalshi", "Navigator: research Kalshi — what it is, API, prediction market platform"],
  ["prediction market", "Navigator: research prediction market platforms and APIs"],
  ["news aggregator", "Navigator: research news aggregation APIs and data providers"],
  ["news api", "Navigator: research news API providers (NewsAPI, GDELT, MediaStack)"],
  ["real-time", "Navigator: research real-time data ingestion patterns (websockets, SSE, streaming)"],
  ["dashboard", "Navigator: research dashboard frameworks (Grafana, D3.js, Chart.js, Apache ECharts)"],
  ["visualization", "Navigator: research data visualization libraries and real-time charting"],
  ["geopolitical", "Navigator: research geopolitical data sources and monitoring tools"],
  ["statistical analysis", "Navigator: research statistical prediction algorithms and frameworks"],
  ["prediction", "Navigator: research prediction/forecasting algorithms (ARIMA, Bayesian, ML-based)"],
  ["machine learning", "Navigator: research ML frameworks for prediction (scikit-learn, XGBoost, PyTorch)"],
  ["nlp", "Navigator: research NLP libraries for text analysis (spaCy, HuggingFace, LangChain)"],
  ["sentiment analysis", "Navigator: research sentiment analysis approaches and tools"],
  ["webhook", "Navigator: research webhook patterns and real-time event delivery"],
  ["websocket", "Navigator: research WebSocket implementations and real-time communication"],
  ["kafka", "Navigator: research Apache Kafka for event streaming"],
  ["rabbitmq", "Navigator: research RabbitMQ for message queues"],
  ["redis streams", "Navigator: research Redis Streams for real-time data pipelines"],
  ["elasticsearch", "Navigator: research Elasticsearch for full-text search and aggregation"],
  ["influxdb", "Navigator: research InfluxDB for time-series data"],
  ["timescaledb", "Navigator: research TimescaleDB for time-series on PostgreSQL"],
  ["grafana", "Navigator: research Grafana for dashboarding and visualization"],
  ["mapbox", "Navigator: research Mapbox for geographic visualization"],
  ["leaflet", "Navigator: research Leaflet for interactive maps"],
  ["trading", "Navigator: research trading APIs and market data providers"],
  ["financial", "Navigator: research financial data APIs (Alpha Vantage, Polygon, Finnhub)"],
  ["infrastructure", "Navigator: research infrastructure monitoring tools and APIs"],
  ["monitoring", "Navigator: research monitoring platforms (Datadog, Prometheus, Grafana)"],
  ["openai", "Navigator: research OpenAI API for text analysis and summarization"],
  ["anthropic", "Navigator: research Anthropic Claude API for analysis"],
  ["embedding", "Navigator: research embedding models for semantic search"],
  ["vector", "Navigator: research vector databases (Pinecone, Weaviate, pgvector)"],
  ["calendar", "Navigator: research Google Calendar API / Calendly scheduling APIs"],
  ["gmail", "Navigator: research Gmail API documentation and integration patterns"],
  ["email", "Navigator: research email parsing and IMAP/SMTP integration patterns"],
];

/** Track which dispatches have been suggested (avoid duplicates). */
const suggestedDispatches = new Set<string>();

/** Track simulated dispatches (for the task tool). */
const simulatedDispatches: string[] = [];

// ---- Helper: keyword coverage analysis ----

/** Analyze conversation text for phase coverage. Returns covered phases. */
function analyzeCoverage(entries: readonly ConversationEntry[]): { readonly covered: readonly string[]; readonly gaps: readonly string[] } {
  const allText = entries.map((e) => e.content.toLowerCase()).join(" ");
  const covered: string[] = [];
  for (const [phase, keywords] of PHASE_KEYWORDS) {
    if (keywords.some((kw) => allText.includes(kw))) {
      covered.push(phase);
    }
  }
  const gaps = PHASE_KEYWORDS.map(([p]) => p).filter((p) => !covered.includes(p));
  return { covered, gaps };
}

function suggestDispatches(entries: readonly ConversationEntry[]): readonly string[] {
  const allText = entries.map((e) => e.content.toLowerCase()).join(" ");
  const suggestions: string[] = [];
  for (const [tech, dispatch] of CODEBASE_DISPATCH_MAP) {
    if (allText.includes(tech) && !suggestedDispatches.has(dispatch)) {
      suggestions.push(dispatch);
      suggestedDispatches.add(dispatch);
    }
  }
  for (const [tech, dispatch] of RESEARCH_DISPATCH_MAP) {
    if (allText.includes(tech) && !suggestedDispatches.has(dispatch)) {
      suggestions.push(dispatch);
      suggestedDispatches.add(dispatch);
    }
  }
  return suggestions;
}

// ---- Mock tools ----

/** Tool 1: onboarding_progress — check which of the 6 phases have coverage. */
const progressTool = defineTool({
  name: "onboarding_progress",
  label: "Onboarding Progress",
  description: "Check which of the six onboarding discovery goals (proficiency, identity, architecture, constraints, knowledge, validation) have been covered in the conversation so far. Call this to verify you've explored enough before wrapping up.",
  parameters: Type.Object({}),
  execute: async () => {
    const { covered, gaps } = analyzeCoverage(conversationLog);
    const phaseList = ["proficiency", "identity", "architecture", "constraints", "knowledge", "validation"];
    const status = phaseList.map((p) => {
      const isCovered = covered.includes(p);
      return `${isCovered ? "✓" : "✗"} ${p}`;
    }).join("\n  ");

    let guidance = "";
    if (gaps.includes("constraints")) {
      guidance += "\nThe crew needs constraints to build guardrails. If the conversation hasn't surfaced what AutoDev must never touch, the constraint map will be empty.";
    }
    if (gaps.includes("architecture")) {
      guidance += "\nThe crew needs architecture reality (verified against code) to build the architecture snapshot. Ask about specific concrete facts — language, databases, external APIs — then verify.";
    }
    if (gaps.includes("knowledge")) {
      guidance += "\nThe crew needs to know what the project already knows. Ask about existing docs, tacit knowledge, and known inaccuracies.";
    }
    if (gaps.length === 0) {
      guidance = "\nAll six discovery goals have signals in the conversation. Consider calling onboarding_finalize() to check readiness.";
    }

    return {
      content: [{ type: "text" as const, text: `Onboarding coverage:\n  ${status}${guidance}` }],
      details: { covered, gaps },
    };
  },
});

/** Tool 2: onboarding_dispatch_hint — suggest subagent dispatches based on conversation. */
const dispatchHintTool = defineTool({
  name: "onboarding_dispatch_hint",
  label: "Dispatch Hint",
  description: "Check whether there are research subagent dispatches implied by the conversation that haven't been made yet. Returns suggested Explore/Librarian dispatches for technologies and domains the user mentioned.",
  parameters: Type.Object({}),
  execute: async () => {
    const suggestions = suggestDispatches(conversationLog);
    if (suggestions.length === 0) {
      return {
        content: [{ type: "text" as const, text: "No new dispatches suggested. Either no technologies have been mentioned yet, or all suggested dispatches have already been made." }],
        details: { suggestions: [] },
      };
    }
    const lines = suggestions.map((s) => `  • ${s}`).join("\n");
    return {
      content: [{ type: "text" as const, text: `Suggested dispatches based on conversation:\n${lines}\n\nThese are suggestions — dispatch whichever are relevant via task().` }],
      details: { suggestions },
    };
  },
});

/** Tool 3: onboarding_finalize — check if the conversation has enough coverage to hand off. */
const finalizeTool = defineTool({
  name: "onboarding_finalize",
  label: "Onboarding Finalize",
  description: "Check whether the conversation has sufficient coverage across all six discovery goals to finalize the Harbor Log and hand off to the crew. Call this when you sense the conversation is winding down.",
  parameters: Type.Object({}),
  execute: async () => {
    const { covered, gaps } = analyzeCoverage(conversationLog);
    const minRequired = ["identity", "constraints"];
    const hasMinimum = minRequired.every((p) => covered.includes(p));

    if (!hasMinimum) {
      const missing = minRequired.filter((p) => !covered.includes(p));
      return {
        content: [{ type: "text" as const, text: `Not ready to finalize. Missing required goals: ${missing.join(", ")}.${missing.includes("identity") ? " Ask what the system is and what's at stake." : ""}${missing.includes("constraints") ? " Ask what AutoDev must never touch." : ""}` }],
        details: { ready: false, covered, gaps },
      };
    }

    if (gaps.length > 0) {
      return {
        content: [{ type: "text" as const, text: `Ready to finalize, but with gaps: ${gaps.join(", ")}. The crew can work with this, but the corresponding artifacts will be weak. Consider probing ${gaps[0]} before wrapping up — or finalize if the user is ready.` }],
        details: { ready: true, covered, gaps },
      };
    }

    return {
      content: [{ type: "text" as const, text: "All six discovery goals covered. Ready to finalize. Write your Harbor Log and end the conversation." }],
      details: { ready: true, covered, gaps: [] },
    };
  },
});

/** Tool 4: task — simulated subagent dispatch. */
const taskTool = defineTool({
  name: "task",
  label: "Dispatch Subagent",
  description: "Dispatch a subagent (Explore, Librarian, or other) to research or investigate in the background. In this simulation, the dispatch is recorded but not actually executed — it returns a confirmation.",
  parameters: Type.Object({
    agent: Type.String({ description: "Which agent to dispatch: 'explore', 'librarian', 'metis', 'aronnax', etc." }),
    description: Type.String({ description: "Short description of the task for the agent." }),
  }),
  execute: async (_id, params) => {
    const { agent, description } = params;
    const entry = `[${agent}] ${description}`;
    simulatedDispatches.push(entry);
    return {
      content: [{ type: "text" as const, text: `${agent} agent deployed: ${description}` }],
      details: { agent, description },
    };
  },
});

// ---- System prompt assembly ----

/** Parse the YAML frontmatter from an agent .md file, returning the body. */
function extractAgentBody(filePath: string): string {
  const raw = readFileSync(filePath, "utf-8");
  if (!raw.startsWith("---")) return raw;
  const end = raw.indexOf("\n---", 3);
  if (end === -1) return raw;
  return raw.slice(end + 4).trimStart();
}

/** Build the system prompt: agent body only. The skill is injected via skillsOverride. */
function buildSystemPrompt(): string {
  if (!existsSync(AGENT_PATH)) {
    throw new Error(`Harbor Master agent definition not found: ${AGENT_PATH}`);
  }
  const agentBody = extractAgentBody(AGENT_PATH);
  return agentBody;
}

// ---- Harbor Log writer ----

/** Write the conversation transcript to harbor-log.txt. */
function writeHarborLog(): void {
  const timestamp = new Date().toISOString().split("T")[0];
  const lines: string[] = [
    "# Harbor Log (Simulation)",
    "",
    `**Date:** ${timestamp}`,
    `**Model:** ${OLLAMA_MODEL_ID}`,
    `**Agent:** Harbor Master (simulated)`,
    "",
    "## Conversation",
    "",
  ];

  for (const entry of conversationLog) {
    lines.push(`### ${entry.role === "user" ? "Visitor" : "Harbor Master"} (${entry.timestamp})`);
    lines.push("");
    lines.push(entry.content);
    lines.push("");
  }

  if (simulatedDispatches.length > 0) {
    lines.push("## Dispatched Agents");
    lines.push("");
    for (const d of simulatedDispatches) {
      lines.push(`- ${d}`);
    }
    lines.push("");
  }

  const { covered, gaps } = analyzeCoverage(conversationLog);
  lines.push("## Coverage Analysis");
  lines.push("");
  lines.push(`Covered: ${covered.join(", ") || "none"}`);
  lines.push(`Gaps: ${gaps.join(", ") || "none"}`);
  lines.push("");

  mkdirSync(SCRIPT_DIR, { recursive: true });
  writeFileSync(LOG_OUTPUT, lines.join("\n"), "utf-8");
  console.log(`\n📝 Harbor log written to ${LOG_OUTPUT}`);
}

// ---- Main ----

async function main(): Promise<void> {
  console.log("⚓  Harbor Master Simulation");
  console.log("═══════════════════════════════════════════════════════");
  console.log("");

  // 1. Verify prerequisites
  if (!existsSync(AGENT_PATH)) {
    console.error(`✗ Harbor Master agent definition not found: ${AGENT_PATH}`);
    console.error("  Run this from the project root (autodev-pi-HM-onboarding/).");
    process.exit(1);
  }
  if (!existsSync(SKILL_PATH)) {
    console.error(`✗ Skill draft not found: ${SKILL_PATH}`);
    process.exit(1);
  }

  // 2. Check local Ollama is reachable
  try {
    const response = await fetch(`${OLLAMA_BASE_URL}/models`);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json() as { data?: Array<{ id: string }> };
    const hasGlm = (data.data ?? []).some((m) => m.id.toLowerCase().includes("glm-5.2"));
    if (!hasGlm) {
      console.warn("⚠  glm-5.2:cloud not found in local Ollama model list.");
      console.warn("  Run: ollama pull glm-5.2:cloud");
    }
    console.log(`✓ Ollama reachable at ${OLLAMA_BASE_URL}`);
  } catch {
    console.error(`✗ Cannot reach Ollama at ${OLLAMA_BASE_URL}`);
    console.error("  Start Ollama first: ollama serve");
    process.exit(1);
  }

  // 3. Setup auth + models
  const authStorage = AuthStorage.inMemory();
  authStorage.setRuntimeApiKey(OLLAMA_PROVIDER, "ollama");
  const modelRegistry = ModelRegistry.inMemory(authStorage);

  modelRegistry.registerProvider(OLLAMA_PROVIDER, {
    baseUrl: OLLAMA_BASE_URL,
    api: "openai-completions",
    apiKey: "ollama",
    authHeader: true,
    models: OLLAMA_MODELS,
  });

  const model = modelRegistry.find(OLLAMA_PROVIDER, OLLAMA_MODEL_ID);
  if (!model) {
    console.error(`✗ Model ${OLLAMA_MODEL_ID} not found after provider registration.`);
    process.exit(1);
  }
  console.log(`✓ Model: ${model.id} (${model.provider})`);

  // 4. Build system prompt and resource loader
  const systemPrompt = buildSystemPrompt();
  console.log(`✓ System prompt: ${systemPrompt.length} chars (agent body)`);

  const resourceLoader = new DefaultResourceLoader({
    cwd: PROJECT_ROOT,
    agentDir: join(process.env.HOME ?? "~", ".pi", "agent"),
    systemPromptOverride: () => systemPrompt,
    noExtensions: true,
    noContextFiles: true,
    skillsOverride: (current) => {
      return {
        skills: [
          ...current.skills,
          {
            name: "autodev-onboarding-harbor-master",
            description: "Conversational compass for Harbor Master onboarding. Guides through six discovery goals, nine failure modes, nine artifact requirements, and dispatch guidance.",
            filePath: SKILL_PATH,
            baseDir: SCRIPT_DIR,
            source: "custom" as const,
          },
        ],
        diagnostics: current.diagnostics,
      };
    },
  });
  await resourceLoader.reload();
  const loadedSkills = resourceLoader.getSkills();
  console.log(`✓ Skills loaded: ${loadedSkills.skills.map((s: { name: string }) => s.name).join(", ") || "none"}`);

  // 5. Create the session
  console.log("⏳ Creating session...");
  const { session } = await createAgentSession({
    model,
    thinkingLevel: "medium",
    tools: ["read", "bash", "grep", "glob", "onboarding_progress", "onboarding_dispatch_hint", "onboarding_finalize", "task"],
    customTools: [progressTool, dispatchHintTool, finalizeTool, taskTool],
    sessionManager: SessionManager.inMemory(),
    resourceLoader,
    modelRegistry,
    authStorage,
  });
  console.log("✓ Session created");
  console.log("");

  // 6. Subscribe to streaming events for real-time output
  let currentAssistantText = "";
  let allAssistantText = "";
  session.subscribe((event) => {
    if (event.type === "message_start") {
      currentAssistantText = "";
      process.stdout.write("\n");
    }
    if (event.type === "message_update" && "assistantMessageEvent" in event) {
      const ae = event.assistantMessageEvent;
      if (ae.type === "text_delta") {
        process.stdout.write(ae.delta);
        currentAssistantText += ae.delta;
      }
    }
    if (event.type === "message_end") {
      process.stdout.write("\n");
      if (currentAssistantText.length > 0) {
        allAssistantText += (allAssistantText ? "\n\n" : "") + currentAssistantText;
        currentAssistantText = "";
      }
    }
    if (event.type === "tool_execution_start") {
      const args = "args" in event ? (event.args as Record<string, unknown>) : undefined;
      if (event.toolName === "task" && args) {
        const agent = args.agent ?? "?";
        const desc = args.description ?? "";
        process.stdout.write(`\n  [dispatch → ${agent}: ${desc}]\n`);
      } else if ((event.toolName === "bash" || event.toolName === "read" || event.toolName === "grep" || event.toolName === "glob") && args) {
        const cmd = args.command ?? args.filePath ?? args.pattern ?? args.path ?? "";
        process.stdout.write(`\n  [${event.toolName}: ${cmd}]\n`);
      } else {
        process.stdout.write(`\n  [tool: ${event.toolName}]\n`);
      }
    }
  });

  // 7. Send the opening greeting to kick off the conversation
  const OPENING_PROMPT = "/skill:autodev-onboarding-harbor-master The visitor just arrived. Greet them. Remember: you are not a host. Don't invite them to sit, don't ask what they're building, don't be welcoming. Be bored, be warm underneath, let them tell you why they're here.";
  console.log("═══════════════════════════════════════════════════════");
  console.log("  Type to talk to the Harbor Master.");
  console.log("  /exit or Ctrl+C to end the session.");
  console.log("═══════════════════════════════════════════════════════");
  console.log("");

  // Send the opening prompt so the HM greets the user first
  conversationLog.push({ role: "user", content: OPENING_PROMPT, timestamp: new Date().toISOString() });
  process.stdout.write("(Harbor Master is approaching...)\n\n");
  try {
    await session.prompt(OPENING_PROMPT);
  } catch (e) {
    console.error(`✗ Opening prompt failed: ${e instanceof Error ? e.message : String(e)}`);
  }
  if (allAssistantText.length > 0) {
    conversationLog.push({ role: "assistant", content: allAssistantText, timestamp: new Date().toISOString() });
  }

  // 8. Interactive conversation loop
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: "> ",
  });

  await new Promise<void>((resolve) => {
    rl.on("line", async (line) => {
      const trimmed = line.trim();
      if (trimmed === "/exit" || trimmed === "/quit") {
        rl.close();
        resolve();
        return;
      }
      if (trimmed.length === 0) return;

      // Record user input
      conversationLog.push({ role: "user", content: trimmed, timestamp: new Date().toISOString() });

      // Pause readline while the session is generating
      rl.pause();

      try {
        await session.prompt(trimmed);

        if (allAssistantText.length > 0) {
          conversationLog.push({ role: "assistant", content: allAssistantText, timestamp: new Date().toISOString() });
          allAssistantText = "";
        }
      } catch (e) {
        console.error(`\n✗ Session error: ${e instanceof Error ? e.message : String(e)}`);
      } finally {
        rl.resume();
        rl.prompt();
      }
    });

    rl.on("close", () => {
      resolve();
    });

    rl.on("SIGINT", () => {
      rl.close();
      resolve();
    });

    rl.prompt();
  });

  // 8. Cleanup
  try {
    session.dispose();
  } catch {
    // ignore
  }

  // 9. Write harbor log
  writeHarborLog();

  console.log("⚓  Session ended. Fair winds.");
}

main().catch((e) => {
  console.error("Fatal error:", e);
  process.exit(1);
});