/**
 * Onboarding tools module — 3 real tools for the Harbor Master session.
 *
 * Tools registered via `pi.registerTool()`:
 *   - onboarding_progress:     last 8 assistant messages + coverage floor check
 *   - onboarding_dispatch_hint: topics extracted from conversation + self-assessment prompt
 *   - onboarding_finalize:     identity + constraints hard floor check
 *
 * The conversation log is injected via `setConversationLog()` by
 * `scripts/onboard.ts` before session creation (shared mutable reference).
 */
import type { AgentToolResult, ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import type { ConversationEntry } from "./harbor-log.js";
import { register as registerMailbox } from "./mailbox.js";

// ---------------------------------------------------------------------------
// PHASE_KEYWORDS — floor check heuristic only
// ---------------------------------------------------------------------------

const PHASE_KEYWORDS: ReadonlyArray<readonly [string, readonly string[]]> = [
  ["proficiency", ["deploy", "pipeline", "ci", "cd", "production", "stage", "staging", "architecture", "stack", "role", "experience", "engineer", "developer", "founder"]],
  ["identity", ["does", "system", "app", "tool", "purpose", "goal", "vision", "what is", "what does", "invariant", "stake", "risk", "critical", "money", "data", "safety"]],
  ["architecture", ["language", "database", "sql", "postgres", "mysql", "redis", "api", "endpoint", "framework", "library", "dependency", "docker", "container", "kubernetes", "microservice", "monolith", "frontend", "backend"]],
  ["constraints", ["never", "must not", "cannot", "should not", "constraint", "invariant", "rule", "policy", "review", "approval", "gate", "deploy", "merge", "secret"]],
  ["knowledge", ["documentation", "docs", "readme", "adr", "decision", "tacit", "written", "knowledge", "understand", "learn", "assumption", "known issue", "debt"]],
  ["confirmation", ["correct", "missing", "summary", "sign off", "confirm", "assume", "assumption", "wrap up", "anything else", "done"]],
];

// ---------------------------------------------------------------------------
// Module-level mutable conversation log
// ---------------------------------------------------------------------------

/** The shared mutable conversation log. Set by onboard.ts before session creation. */
let conversationLog: readonly ConversationEntry[] = [];

/**
 * Inject the conversation log from `scripts/onboard.ts` before session creation.
 * This is a setter for a shared mutable reference — the log is accumulated
 * during the session and read by the tools.
 */
export function setConversationLog(log: readonly ConversationEntry[]): void {
  conversationLog = log;
}

// ---------------------------------------------------------------------------
// Tool result shape
// ---------------------------------------------------------------------------

type ToolResult = AgentToolResult<unknown>;

function ok(data: unknown): ToolResult {
  return {
    content: [{ type: "text", text: JSON.stringify(data) }],
    details: {},
  };
}

// ---------------------------------------------------------------------------
// analyzeCoverage — floor check heuristic
// ---------------------------------------------------------------------------

export interface CoverageResult {
  readonly covered: readonly string[];
  readonly gaps: readonly string[];
}

/**
 * Analyze conversation text for phase coverage using PHASE_KEYWORDS heuristic.
 * This is a floor check only — the primary signal is the recent messages
 * returned for the model to self-assess.
 */
export function analyzeCoverage(log: readonly ConversationEntry[]): CoverageResult {
  const allText = log.map((e) => e.content.toLowerCase()).join(" ");
  const covered: string[] = [];
  for (const [phase, keywords] of PHASE_KEYWORDS) {
    if (keywords.some((kw) => allText.includes(kw))) {
      covered.push(phase);
    }
  }
  const gaps = PHASE_KEYWORDS.map(([p]) => p).filter((p) => !covered.includes(p));
  return { covered, gaps };
}

// ---------------------------------------------------------------------------
// Topic extraction — noun/technology extraction, not keyword lists
// ---------------------------------------------------------------------------

/** Stop words to filter out during topic extraction. */
const STOP_WORDS = new Set([
  "the", "a", "an", "is", "are", "was", "were", "be", "been", "being",
  "have", "has", "had", "do", "does", "did", "will", "would", "could",
  "should", "may", "might", "shall", "can", "need", "dare", "ought",
  "used", "to", "of", "in", "for", "on", "with", "at", "by", "from",
  "as", "into", "through", "during", "before", "after", "above", "below",
  "between", "out", "off", "over", "under", "again", "further", "then",
  "once", "here", "there", "when", "where", "why", "how", "all", "each",
  "every", "both", "few", "more", "most", "other", "some", "such", "no",
  "nor", "not", "only", "own", "same", "so", "than", "too", "very",
  "just", "because", "but", "and", "or", "if", "while", "although",
  "that", "this", "these", "those", "it", "its", "i", "me", "my",
  "we", "our", "you", "your", "he", "him", "his", "she", "her",
  "they", "them", "their", "what", "which", "who", "whom",
  "about", "up", "down", "also", "well", "get", "got", "like",
  "make", "made", "go", "going", "went", "come", "came", "take",
  "took", "know", "known", "see", "saw", "think", "thought",
  "want", "give", "gave", "find", "found", "tell", "told",
  "ask", "asked", "work", "worked", "seem", "felt", "try",
  "leave", "call", "keep", "let", "begin", "show", "hear",
  "play", "run", "move", "live", "believe", "hold", "bring",
  "happen", "write", "provide", "sit", "stand", "lose", "pay",
  "meet", "include", "continue", "set", "learn", "change",
  "lead", "understand", "watch", "follow", "stop", "create",
  "speak", "read", "allow", "add", "spend", "grow", "open",
  "walk", "win", "offer", "remember", "love", "consider", "appear",
  "buy", "wait", "serve", "die", "send", "expect", "build",
  "stay", "fall", "cut", "reach", "kill", "remain", "suggest",
  "raise", "pass", "sell", "require", "report", "decide", "pull",
  "let", "help", "turn", "start", "show", "hear", "play", "run",
  "move", "live", "believe", "bring", "happen", "write", "provide",
  "sit", "stand", "lose", "pay", "meet", "include", "continue",
  "set", "learn", "change", "lead", "understand", "watch", "follow",
  "stop", "create", "speak", "read", "allow", "add", "spend",
  "grow", "open", "walk", "win", "offer", "remember", "love",
  "consider", "appear", "buy", "wait", "serve", "die", "send",
  "expect", "build", "stay", "fall", "cut", "reach", "kill",
  "remain", "suggest", "raise", "pass", "sell", "require",
  "report", "decide", "pull", "help", "turn", "start",
  "ok", "okay", "yes", "no", "hi", "hello", "hey", "thanks",
  "thank", "please", "sure", "right", "great", "good", "nice",
  "let", "us", "use", "using", "used", "based", "looking",
  "going", "doing", "saying", "telling", "making", "taking",
  "getting", "giving", "letting", "keeping", "putting",
  "setting", "coming", "going", "knowing", "seeing", "thinking",
  "feeling", "working", "playing", "living", "trying",
  "calling", "starting", "stopping", "helping", "needing",
  "wanting", "asking", "telling", "showing", "finding",
  "looking", "saying", "meaning", "being", "having", "doing",
  "doesn", "don", "didn", "won", "can", "couldn", "wouldn",
  "shouldn", "isn", "aren", "wasn", "weren", "haven", "hasn",
  "hadn", "mustn", "needn", "mightn", "that", "this", "these",
  "those", "there", "here", "where", "when", "why", "how",
  "what", "which", "who", "whom", "whose",
]);

/** Words that are too generic to be useful as topics. */
const GENERIC_WORDS = new Set([
  "project", "thing", "stuff", "way", "part", "lot", "bit",
  "kind", "type", "sort", "number", "question", "answer",
  "idea", "thought", "point", "fact", "case", "example",
  "issue", "problem", "solution", "approach", "method",
  "process", "step", "phase", "stage", "area", "field",
  "topic", "subject", "matter", "detail", "info", "information",
  "code", "codebase", "repo", "repository", "file", "folder",
  "directory", "path", "name", "line", "version", "change",
  "thing", "things", "something", "anything", "everything",
  "nothing", "someone", "anyone", "everyone", "somewhere",
  "anywhere", "everywhere", "nowhere", "always", "never",
  "sometimes", "often", "usually", "typically", "generally",
  "basically", "essentially", "actually", "really", "quite",
  "pretty", "rather", "somewhat", "almost", "nearly",
  "already", "yet", "still", "already", "ever", "even",
  "just", "only", "simply", "merely", "purely", "truly",
  "definitely", "certainly", "absolutely", "totally",
  "completely", "entirely", "fully", "highly", "deeply",
  "strongly", "lightly", "easily", "quickly", "slowly",
  "carefully", "closely", "directly", "indirectly",
  "automatically", "manually", "currently", "previously",
  "originally", "eventually", "ultimately", "finally",
  "initially", "immediately", "instantly", "promptly",
  "recently", "lately", "earlier", "later", "sooner",
  "meanwhile", "meanwhile", "meanwhile",
]);

/**
 * Extract technology/noun terms from conversation text.
 * Uses simple word-boundary tokenization and stop-word filtering.
 * This is NOT keyword matching — it extracts whatever terms appear
 * in the conversation and lets the model self-assess.
 */
function extractTopics(log: readonly ConversationEntry[]): string[] {
  const text = log.map((e) => e.content).join(" ");
  // Tokenize on word boundaries, keeping hyphenated terms and multi-word
  // capitalized phrases intact
  const tokens = text.split(/[\s,.;:!?()\[\]{}"'`]+/);

  const seen = new Set<string>();
  const topics: string[] = [];

  for (const raw of tokens) {
    const token = raw.trim();
    if (token.length < 2) continue;
    if (token.length > 40) continue;

    const lower = token.toLowerCase();

    // Skip stop words and generic words
    if (STOP_WORDS.has(lower)) continue;
    if (GENERIC_WORDS.has(lower)) continue;

    // Skip pure numbers
    if (/^\d+$/.test(token)) continue;

    // Skip single letters
    if (/^[a-zA-Z]$/.test(token)) continue;

    // Deduplicate
    const key = lower;
    if (seen.has(key)) continue;
    seen.add(key);

    topics.push(token);
  }

  // Sort by length descending (longer terms tend to be more specific)
  topics.sort((a, b) => b.length - a.length);

  // Return top 30 topics
  return topics.slice(0, 30);
}

// ---------------------------------------------------------------------------
// Tool execute handlers
// ---------------------------------------------------------------------------

/**
 * onboarding_progress: returns last 8 assistant messages (truncated to 500
 * chars each) plus a coverage heuristic as a floor check.
 */
export function executeOnboardingProgress(
  _args: unknown,
): ToolResult {
  const assistantMessages = conversationLog.filter((e) => e.role === "assistant");
  const last8 = assistantMessages.slice(-8).map((e) => {
    const truncated =
      e.content.length > 500
        ? e.content.slice(0, 500)
        : e.content;
    return {
      role: e.role,
      content: truncated,
      timestamp: e.timestamp,
      truncated: e.content.length > 500,
    };
  });

  const coverage = analyzeCoverage(conversationLog);

  return ok({
    recentMessages: last8,
    coverage,
  });
}

/**
 * onboarding_dispatch_hint: returns conversation topics extracted from
 * recent messages (noun/technology extraction, not keyword lists) plus a
 * prompt for the HM to self-assess what research is implied.
 */
export function executeOnboardingDispatchHint(
  _args: unknown,
): ToolResult {
  const topics = extractTopics(conversationLog);

  return ok({
    topics,
    prompt:
      "Review the topics above. For each topic, assess whether you need to " +
      "dispatch a research agent (Explore for codebase investigation, " +
      "Conseil for knowledge retrieval) to gather more information. " +
      "Consider: Is this technology used in the codebase? Is there " +
      "documentation to retrieve? Is there an external API to research? " +
      "Dispatch only when the topic is unfamiliar or requires verification.",
  });
}

/**
 * onboarding_finalize: checks whether identity and constraints have been
 * discussed (hard floor) and returns readiness.
 */
export function executeOnboardingFinalize(
  _args: unknown,
): ToolResult {
  const coverage = analyzeCoverage(conversationLog);
  const covered = coverage.covered;

  // Hard floor: identity and constraints must be covered
  const required: string[] = ["identity", "constraints"];
  const missing = required.filter((p) => !covered.includes(p));

  return ok({
    ready: missing.length === 0,
    missing,
    coverage,
  });
}

// ---------------------------------------------------------------------------
// pi.registerTool() — extension registration
// ---------------------------------------------------------------------------

export function register(pi: ExtensionAPI): void {
  // --- onboarding_progress -------------------------------------------------
  pi.registerTool({
    name: "onboarding_progress",
    label: "Onboarding Progress",
    description:
      "Returns the last 8 assistant messages (truncated to 500 chars each) " +
      "plus a coverage heuristic as a floor check. The model self-assesses " +
      "whether coverage is sufficient from the actual conversation text.",
    parameters: Type.Object({}),
    execute: async (_toolCallId, _params) => executeOnboardingProgress(_params),
  });

  // --- onboarding_dispatch_hint --------------------------------------------
  pi.registerTool({
    name: "onboarding_dispatch_hint",
    label: "Onboarding Dispatch Hint",
    description:
      "Returns conversation topics extracted from recent messages " +
      "(noun/technology extraction, not keyword lists) plus a prompt for " +
      "the Harbor Master to self-assess what research dispatches are implied.",
    parameters: Type.Object({}),
    execute: async (_toolCallId, _params) => executeOnboardingDispatchHint(_params),
  });

  // --- onboarding_finalize -------------------------------------------------
  pi.registerTool({
    name: "onboarding_finalize",
    label: "Onboarding Finalize",
    description:
      "Checks whether identity and constraints have been discussed (hard " +
      "floor) and returns readiness. The model self-assesses from the " +
      "actual conversation text whether onboarding is complete.",
    parameters: Type.Object({}),
    execute: async (_toolCallId, _params) => executeOnboardingFinalize(_params),
  });

  // --- onboarding_check_mailbox (crew observer mailbox) --------------------
  registerMailbox(pi);
}
