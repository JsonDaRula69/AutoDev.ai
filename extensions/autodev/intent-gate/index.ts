/**
 * intent-gate — analyzes true user intent before classification.
 *
 * Two call-site hooks, both exported as pure functions so the dispatch
 * pipeline can invoke them directly:
 *
 *  1. Harbor Master onboarding: `analyzeOnboardingIntent()` surfaces hidden
 *     intentions in the user's initial project description and suggests
 *     probing questions to ask next.
 *  2. Nemo triage: `analyzeIssueIntent()` detects the true intent of a
 *     GitHub issue (bug vs feature vs refactor vs question) before Cynefin
 *     classification.
 *
 * The analysis is keyword-and-structure based — no LLM call — so it is
 * deterministic and fast. A later sub-plan can swap in a model-backed
 * analyzer behind the same return type.
 */
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

/** Classification of a GitHub issue's true intent. */
export type IssueIntent =
  | "bug"
  | "feature"
  | "refactor"
  | "question"
  | "chore"
  | "ambiguous";

/** Confidence in the classification, 0..1. */
export type Confidence = number;

/** Result of analyzing a GitHub issue for Nemo triage. */
export interface IssueIntentAnalysis {
  readonly text: string;
  readonly intent: IssueIntent;
  readonly confidence: Confidence;
  readonly signals: readonly IntentSignal[];
  readonly suggestedCynefin: "simple" | "complicated" | "complex" | "chaotic";
  readonly probingQuestions: readonly string[];
}

/** Result of analyzing onboarding text for the Harbor Master. */
export interface OnboardingIntentAnalysis {
  readonly text: string;
  readonly hiddenIntentions: readonly HiddenIntention[];
  readonly probingQuestions: readonly string[];
  readonly stake: "low" | "medium" | "high" | "critical" | "unknown";
  readonly technicalDepth: "non-technical" | "mixed" | "technical";
}

/** A single keyword/phrase signal that contributed to the classification. */
export interface IntentSignal {
  readonly kind: IssueIntent;
  readonly token: string;
  readonly weight: number;
}

/** A hidden intention surfaced from onboarding text. */
export interface HiddenIntention {
  readonly theme: string;
  readonly evidence: string;
  readonly question: string;
}

interface IntentRule {
  readonly kind: IssueIntent;
  readonly tokens: readonly string[];
  readonly weight: number;
}

const ISSUE_RULES: readonly IntentRule[] = [
  { kind: "bug", tokens: ["crash", "error", "exception", "traceback", "stack trace", "regression", "broken", "fails", "failing", "nil pointer", "panic"], weight: 2 },
  { kind: "bug", tokens: ["unexpected", "wrong", "incorrect", "off by", "race"], weight: 1 },
  { kind: "feature", tokens: ["add", "support", "allow", "enable", "implement", "new", "would be nice", "wish"], weight: 2 },
  { kind: "refactor", tokens: ["refactor", "cleanup", "clean up", "simplify", "extract", "modernize", "restructure", "move", "rename"], weight: 2 },
  { kind: "question", tokens: ["how do i", "how to", "what is", "why does", "is it possible", "can i", "docs", "documentation"], weight: 2 },
  { kind: "chore", tokens: ["bump", "upgrade", "dependency", "deps", "ci", "lint", "format", "version"], weight: 2 },
];

const CHAOTIC_TOKENS: readonly string[] = ["production", "down", "outage", "data loss", "security", "vulnerable", "exploit", "leak"];
const COMPLEX_TOKENS: readonly string[] = ["design", "architecture", "explore", "unclear", "unknown", "prototype", "spike"];

function lower(text: string): string {
  return text.toLowerCase();
}

function collectSignals(text: string): readonly IntentSignal[] {
  const lowerText = lower(text);
  const signals: IntentSignal[] = [];
  for (const rule of ISSUE_RULES) {
    for (const token of rule.tokens) {
      if (lowerText.includes(token)) {
        signals.push({ kind: rule.kind, token, weight: rule.weight });
      }
    }
  }
  return signals;
}

function tallySignals(
  signals: readonly IntentSignal[],
): { intent: IssueIntent; confidence: Confidence } {
  const scores: Record<IssueIntent, number> = {
    bug: 0,
    feature: 0,
    refactor: 0,
    question: 0,
    chore: 0,
    ambiguous: 0,
  };
  let total = 0;
  for (const s of signals) {
    scores[s.kind] += s.weight;
    total += s.weight;
  }
  if (total === 0) return { intent: "ambiguous", confidence: 0 };
  let best: IssueIntent = "ambiguous";
  let bestScore = 0;
  for (const kind of Object.keys(scores) as IssueIntent[]) {
    if (scores[kind] > bestScore) {
      best = kind;
      bestScore = scores[kind];
    }
  }
  return { intent: best, confidence: bestScore / total };
}

function suggestCynefin(
  text: string,
  intent: IssueIntent,
): "simple" | "complicated" | "complex" | "chaotic" {
  const lowerText = lower(text);
  if (CHAOTIC_TOKENS.some((t) => lowerText.includes(t))) return "chaotic";
  if (COMPLEX_TOKENS.some((t) => lowerText.includes(t))) return "complex";
  if (intent === "bug" || intent === "chore") return "simple";
  if (intent === "refactor" || intent === "feature") return "complicated";
  return "complicated";
}

function probingQuestionsForIssue(intent: IssueIntent): readonly string[] {
  switch (intent) {
    case "bug":
      return ["What is the minimal reproduction?", "When did this start happening?", "What is the expected vs actual behavior?"];
    case "feature":
      return ["What user outcome does this enable?", "Is there an existing workaround?", "What is the smallest slice that delivers value?"];
    case "refactor":
      return ["What behavior must be preserved?", "What is the current pain point?", "Is there test coverage before we refactor?"];
    case "question":
      return ["Is this answered by existing docs?", "Should this become a doc PR instead?"];
    case "chore":
      return ["Is there a breaking-change risk?", "What verifies the upgrade?"];
    case "ambiguous":
      return ["Is this a bug or a feature request?", "What outcome do you want?"];
  }
}

/**
 * Analyze a GitHub issue's text to detect its true intent before Cynefin
 * classification. Pure function.
 */
export function analyzeIssueIntent(text: string): IssueIntentAnalysis {
  const signals = collectSignals(text);
  const { intent, confidence } = tallySignals(signals);
  return {
    text,
    intent,
    confidence,
    signals,
    suggestedCynefin: suggestCynefin(text, intent),
    probingQuestions: probingQuestionsForIssue(intent),
  };
}

const STAKE_TOKENS: ReadonlyArray<{ stake: OnboardingIntentAnalysis["stake"]; tokens: readonly string[] }> = [
  { stake: "critical", tokens: ["production", "life-critical", "safety", "medical", "financial", "compliance", "regulatory"] },
  { stake: "high", tokens: ["revenue", "customers", "users", "deploy", "ship", "launch", "deadline"] },
  { stake: "medium", tokens: ["team", "internal", "tooling", "productivity"] },
  { stake: "low", tokens: ["prototype", "experiment", "toy", "learning", "demo"] },
];

const TECHNICAL_TOKENS: readonly string[] = ["api", "database", "schema", "invariant", "race condition", "transaction", "throughput", "latency", "p99", "backpressure", "idempotent"];

function detectStake(text: string): OnboardingIntentAnalysis["stake"] {
  const lowerText = lower(text);
  for (const rule of STAKE_TOKENS) {
    if (rule.tokens.some((t) => lowerText.includes(t))) return rule.stake;
  }
  return "unknown";
}

function detectTechnicalDepth(text: string): OnboardingIntentAnalysis["technicalDepth"] {
  const lowerText = lower(text);
  const hits = TECHNICAL_TOKENS.filter((t) => lowerText.includes(t)).length;
  if (hits >= 3) return "technical";
  if (hits === 0) return "non-technical";
  return "mixed";
}

function surfaceHiddenIntentions(text: string): readonly HiddenIntention[] {
  const lowerText = lower(text);
  const intentions: HiddenIntention[] = [];
  if (lowerText.includes("scale") || lowerText.includes("growth")) {
    intentions.push({ theme: "scale", evidence: "mentions scale/growth", question: "What order-of-magnitude growth do you expect in 12 months?" });
  }
  if (lowerText.includes("replace") || lowerText.includes("migrate")) {
    intentions.push({ theme: "migration", evidence: "mentions replace/migrate", question: "What is the rollback plan if the migration stalls?" });
  }
  if (lowerText.includes("cost") || lowerText.includes("budget")) {
    intentions.push({ theme: "cost-pressure", evidence: "mentions cost/budget", question: "Is there a hard cost ceiling that overrides feature work?" });
  }
  if (lowerText.includes("fast") || lowerText.includes("quick") || lowerText.includes("asap")) {
    intentions.push({ theme: "time-pressure", evidence: "mentions speed/asap", question: "What is the real deadline and what breaks if we miss it?" });
  }
  if (lowerText.includes("simple") || lowerText.includes("just")) {
    intentions.push({ theme: "hidden-complexity", evidence: "uses 'simple'/'just'", question: "What makes you confident this is simple? Where is the hard part hiding?" });
  }
  return intentions;
}

function probingQuestionsForOnboarding(stake: OnboardingIntentAnalysis["stake"]): readonly string[] {
  const base: string[] = [
    "What does success look like six months from now?",
    "Who depends on this system, and what happens to them if it breaks?",
  ];
  if (stake === "critical" || stake === "high") {
    base.push("What is the blast radius of a bad change?");
  }
  if (stake === "unknown") {
    base.push("What is at stake if this project fails?");
  }
  return base;
}

/**
 * Analyze a user's initial project description to surface hidden intentions
 * and suggest probing questions for the Harbor Master. Pure function.
 */
export function analyzeOnboardingIntent(text: string): OnboardingIntentAnalysis {
  const stake = detectStake(text);
  return {
    text,
    hiddenIntentions: surfaceHiddenIntentions(text),
    probingQuestions: probingQuestionsForOnboarding(stake),
    stake,
    technicalDepth: detectTechnicalDepth(text),
  };
}

export function register(_pi: ExtensionAPI): void {
  // intent-gate is invoked directly by the dispatch pipeline; no event
  // subscriptions or tool registrations are required at load time.
}