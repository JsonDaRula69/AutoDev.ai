/**
 * Shared types for the background agent manager and model fallback system.
 *
 * These types are the contract between the manager, the fallback resolver,
 * the error classifier, and the delegation module (T9). Everything the mock
 * fixture in test/mocks/pi-session.ts needs to implement is defined here.
 */

/** Lifecycle states for a background task. Terminal states are completed/error/cancelled. */
export type TaskStatus = "pending" | "running" | "completed" | "error" | "cancelled";

/**
 * Mutable task record tracked by the manager.
 *
 * `model` and `providerKey` are mutable because the fallback system may
 * switch models mid-task. All timestamp and error fields use `| undefined`
 * (not `?`) so the manager can assign `undefined` explicitly under
 * `exactOptionalPropertyTypes`.
 */
export interface TaskState {
  readonly id: string;
  model: string;
  providerKey: string;
  readonly systemPrompt: string;
  readonly tools: readonly string[];
  readonly customTools: readonly unknown[];
  status: TaskStatus;
  readonly createdAt: number;
  startedAt: number | undefined;
  completedAt: number | undefined;
  error: string | undefined;
  result: unknown;
  readonly agentName: string | undefined;
  readonly parentTaskId: string | undefined;
  readonly staleTimeoutMs: number | undefined;
  readonly onParentWake:
    | ((taskId: string, status: TaskStatus, result: unknown) => void)
    | undefined;
  readonly thinkingLevel: string | undefined;
  /** Models already tried, used to advance through the fallback chain. */
  triedModels: string[];
  /** Set when a terminal agent event (agent_end) has been received. Circuit breaker should not abort. */
  receivedTerminalEvent: boolean | undefined;
}

/** Configuration for spawning a background task. */
export interface SpawnConfig {
  readonly model: string;
  readonly systemPrompt: string;
  readonly tools: readonly string[];
  readonly customTools?: readonly unknown[];
  readonly agentName?: string;
  readonly parentTaskId?: string;
  readonly staleTimeoutMs?: number;
  readonly onParentWake?: (taskId: string, status: TaskStatus, result: unknown) => void;
  /**
   * Optional thinking level for the pi SDK's `setThinkingLevel()`.
   * Plumbed from category-level `thinkingLevel` (e.g. "xhigh" for ultrabrain).
   * When set, passed to the session factory so the spawned session enables
   * extended thinking.
   */
  readonly thinkingLevel?: string | undefined;
}

/** Events the manager listens for on a managed session. */
export type SessionEvent =
  | { readonly type: "agent_start" }
  | { readonly type: "agent_end"; readonly messages: readonly unknown[]; readonly willRetry: boolean }
  | { readonly type: "message_end"; readonly message: unknown }
  | { readonly type: "tool_execution_end"; readonly toolCallId: string; readonly toolName: string; readonly isError: boolean }
  | { readonly type: "error"; readonly error: unknown };

/** Minimal session interface the manager depends on. */
export interface ManagedSession {
  subscribe(listener: (event: SessionEvent) => void): () => void;
  abort(): Promise<void>;
  dispose(): void;
}

/** Configuration passed to the session factory. Injectable for tests. */
export interface SessionFactoryConfig {
  readonly model: string;
  readonly systemPrompt: string;
  readonly tools: readonly string[];
  readonly customTools: readonly unknown[];
  readonly thinkingLevel?: string | undefined;
}

/** Factory that creates a managed session from config. Injectable for tests. */
export type SessionFactory = (config: SessionFactoryConfig) => Promise<ManagedSession>;

/** Per-provider concurrency limits. */
export interface ConcurrencyConfig {
  readonly [providerKey: string]: { readonly max: number };
}

/** Per-agent fallback model chains. */
export interface FallbackConfig {
  readonly [agentName: string]: { readonly fallback_models: readonly string[] };
}

/** Result of classifying an error. */
export interface ErrorClassification {
  readonly retryable: boolean;
  readonly reason: string;
}

/** Extract the provider key from a "provider/model" string. */
export function providerKeyOf(model: string): string {
  return model.split("/")[0] ?? model;
}

/** Check if a status is terminal (no further transitions). */
export function isTerminal(status: TaskStatus): boolean {
  return status === "completed" || status === "error" || status === "cancelled";
}

/** Construct a fresh TaskState in the pending state from a spawn config. */
export function createTaskState(id: string, config: SpawnConfig): TaskState {
  return {
    id,
    model: config.model,
    providerKey: providerKeyOf(config.model),
    systemPrompt: config.systemPrompt,
    tools: config.tools,
    customTools: config.customTools ?? [],
    status: "pending",
    createdAt: Date.now(),
    startedAt: undefined,
    completedAt: undefined,
    error: undefined,
    result: undefined,
    agentName: config.agentName,
    parentTaskId: config.parentTaskId,
    staleTimeoutMs: config.staleTimeoutMs,
    onParentWake: config.onParentWake,
    thinkingLevel: config.thinkingLevel,
    triedModels: [config.model],
    receivedTerminalEvent: undefined,
  };
}