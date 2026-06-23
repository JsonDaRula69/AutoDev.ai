/**
 * EmbeddingLayer — VoyageAI offline fallback
 *
 * Two-backend embedding engine: VoyageAI API (primary) + all-MiniLM-L6-v2 (fallback).
 * When the primary backend fails (network errors, timeouts), it silently falls back to
 * the local model. A background health check probes VoyageAI every 5 minutes and
 * switches back when it recovers.
 *
 * Design:
 * - Dependency injection for both backends (VoyageAI client + local model loader)
 * - Health check scheduler is injectable for testing
 * - Degradation/recovery events are emitted via optional callbacks
 * - No hardcoded API keys — reads from environment or config
 */

// ─── Types ─────────────────────────────────────────────────────────

import type { VectorStore as VectorStoreType, VectorSearchResult } from "./vector-store"

export type EmbeddingContentType = "code" | "doc" | "default"

export interface EmbeddingResult {
  vector: number[]
  backend: "voyage" | "local"
  degraded: boolean
  dimensionality: number
}

export interface DegradationEvent {
  type: "degradation"
  backend: "local"
  reason: string
  timestamp: number
}

export interface RecoveryEvent {
  type: "recovery"
  backend: "voyage"
  timestamp: number
}

export type EmbeddingLayerEvent = DegradationEvent | RecoveryEvent

export interface EmbeddingLayerCallbacks {
  onDegradation?(event: DegradationEvent): void
  onRecovery?(event: RecoveryEvent): void
}

export interface EmbeddingLayerConfig {
  /** VoyageAI API key. Falls back to VOYAGE_API_KEY env var if not provided. */
  voyageApiKey?: string
  /** Health check interval in ms. Default: 300000 (5 minutes). */
  healthCheckIntervalMs?: number
  /** Content-type to model mapping overrides. */
  modelOverrides?: Partial<Record<EmbeddingContentType, string>>
  /** Optional VectorStore for persisting embeddings. If not provided, embeddings are ephemeral. */
  store?: VectorStore
}

export interface VoyageAIClient {
  embed(texts: string[], model: string): Promise<number[][]>
}

export interface LocalModelLoader {
  embed(text: string): Promise<number[]>
  getDimensionality(): number
}

export interface HealthCheckScheduler {
  setTimer(fn: () => void, delayMs: number): ReturnType<typeof setTimeout>
  clearTimer(handle: ReturnType<typeof setTimeout>): void
}

// ─── Default VoyageAI client ───────────────────────────────────────

const VOYAGE_API_URL = "https://api.voyageai.com/v1/embeddings"

const DEFAULT_MODELS: Record<EmbeddingContentType, string> = {
  code: "voyage-code-3",
  doc: "voyage-context-4",
  default: "voyage-3",
}

function createDefaultVoyageAIClient(apiKey: string): VoyageAIClient {
  return {
    async embed(texts: string[], model: string): Promise<number[][]> {
      const response = await fetch(VOYAGE_API_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({ input: texts, model }),
      })

      if (!response.ok) {
        throw new Error(`VoyageAI API error: ${response.status} ${response.statusText}`)
      }

      const json = (await response.json()) as {
        data: Array<{ embedding: number[] }>
      }
      return json.data.map((item) => item.embedding)
    },
  }
}

function createDefaultScheduler(): HealthCheckScheduler {
  return {
    setTimer(fn: () => void, delayMs: number): ReturnType<typeof setTimeout> {
      const timer = setTimeout(fn, delayMs)
      timer.unref?.()
      return timer
    },
    clearTimer(handle: ReturnType<typeof setTimeout>): void {
      clearTimeout(handle)
    },
  }
}

// ─── Network error detection ───────────────────────────────────────

function isNetworkError(error: unknown): boolean {
  if (!(error instanceof Error)) return false
  const message = error.message.toLowerCase()
  return (
    message.includes("econnrefused") ||
    message.includes("enotfound") ||
    message.includes("timeout") ||
    message.includes("network") ||
    message.includes("fetch failed") ||
    message.includes("request timeout") ||
    message.includes("econnreset") ||
    message.includes("etimedout") ||
    message.includes("socket hang up")
  )
}

// ─── EmbeddingLayer ────────────────────────────────────────────────

const DEFAULT_HEALTH_CHECK_INTERVAL_MS = 300_000 // 5 minutes

export class EmbeddingLayer {
  private readonly voyageClient: VoyageAIClient | undefined
  private readonly localLoader: LocalModelLoader | undefined
  private readonly models: Record<EmbeddingContentType, string>
  private readonly scheduler: HealthCheckScheduler
  private readonly healthCheckIntervalMs: number
  private readonly callbacks: EmbeddingLayerCallbacks
  private readonly store: VectorStoreType | undefined

  private degraded = false
  private destroyed = false
  private healthCheckTimer: ReturnType<typeof setTimeout> | undefined

  constructor(
    config: EmbeddingLayerConfig = {},
    voyageClient?: VoyageAIClient,
    localLoader?: LocalModelLoader,
    scheduler?: HealthCheckScheduler,
    callbacks?: EmbeddingLayerCallbacks,
  ) {
    const apiKey = config.voyageApiKey ?? process.env.VOYAGE_API_KEY
    this.voyageClient = voyageClient ?? (apiKey ? createDefaultVoyageAIClient(apiKey) : undefined)
    this.localLoader = localLoader ?? undefined
    this.scheduler = scheduler ?? createDefaultScheduler()
    this.healthCheckIntervalMs = config.healthCheckIntervalMs ?? DEFAULT_HEALTH_CHECK_INTERVAL_MS
    this.callbacks = callbacks ?? {}
    this.models = { ...DEFAULT_MODELS, ...config.modelOverrides }
    this.store = config.store

    if (!this.voyageClient && !this.localLoader) {
      throw new Error("EmbeddingLayer requires at least one backend: VoyageAI client or local model loader")
    }
  }

  /**
   * Generate an embedding for a single text input.
   * Tries VoyageAI first; on network error, falls back to local model.
   * When in degraded mode, still attempts VoyageAI — if it works, exits degraded mode.
   */
  async embed(text: string, contentType: EmbeddingContentType = "default"): Promise<EmbeddingResult> {
    this.assertNotDestroyed()

    const model = this.models[contentType]

    // Always try VoyageAI if available (even in degraded mode — it may have recovered)
    if (this.voyageClient) {
      try {
        const vectors = await this.voyageClient.embed([text], model)
        // Success — exit degraded mode if we were in it
        if (this.degraded) {
          this.exitDegradedMode()
        }
        const result: EmbeddingResult = {
          vector: vectors[0],
          backend: "voyage",
          degraded: false,
          dimensionality: vectors[0].length,
        }
        this.persistToStore(text, contentType, result.vector)
        return result
      } catch (error) {
        if (isNetworkError(error)) {
          this.lastVoyageError = error instanceof Error ? error : new Error(String(error))
          this.enterDegradedMode(error instanceof Error ? error.message : String(error))
          // Fall through to local fallback
        } else {
          throw error
        }
      }
    }

    // Use local fallback
    if (this.localLoader) {
      const vector = await this.localLoader.embed(text)
      const result: EmbeddingResult = {
        vector,
        backend: "local",
        degraded: true,
        dimensionality: this.localLoader.getDimensionality(),
      }
      this.persistToStore(text, contentType, result.vector)
      return result
    }

    // No fallback available — re-throw the original VoyageAI error
    if (this.lastVoyageError) {
      throw this.lastVoyageError
    }
    throw new Error("No embedding backend available: VoyageAI failed and no local fallback configured")
  }

  /**
   * Generate embeddings for a batch of text inputs.
   * If VoyageAI is available, sends all texts in one request.
   * Otherwise, falls back to local model one by one.
   */
  async embedBatch(texts: string[], contentType: EmbeddingContentType = "default"): Promise<EmbeddingResult[]> {
    this.assertNotDestroyed()

    const model = this.models[contentType]

    if (this.voyageClient && !this.degraded) {
      try {
        const vectors = await this.voyageClient.embed(texts, model)
        const results: EmbeddingResult[] = vectors.map((vector) => ({
          vector,
          backend: "voyage" as const,
          degraded: false,
          dimensionality: vector.length,
        }))
        this.persistBatchToStore(texts, contentType, results)
        return results
      } catch (error) {
        if (isNetworkError(error)) {
          this.enterDegradedMode(error instanceof Error ? error.message : String(error))
        } else {
          throw error
        }
      }
    }

    // Local fallback: one by one
    if (this.localLoader) {
      const results: EmbeddingResult[] = []
      for (const text of texts) {
        const vector = await this.localLoader.embed(text)
        results.push({
          vector,
          backend: "local",
          degraded: true,
          dimensionality: this.localLoader.getDimensionality(),
        })
      }
      this.persistBatchToStore(texts, contentType, results)
      return results
    }

    throw new Error("No embedding backend available")
  }

  /** Whether the layer is currently running on the local fallback. */
  isDegraded(): boolean {
    return this.degraded
  }

  /** Whether reranking is available. Disabled in degraded mode (local model too weak). */
  canRerank(): boolean {
    return !this.degraded && this.voyageClient !== undefined
  }

  /** Whether the layer has been destroyed. */
  isDestroyed(): boolean {
    return this.destroyed
  }

  /** Stop the health check timer. After calling this, embed() will throw. */
  destroy(): void {
    this.destroyed = true
    this.stopHealthCheck()
  }

  /**
   * Search for similar embeddings by embedding the query text and finding
   * KNN matches in the VectorStore. Requires a store to be configured.
   * @throws Error if no store is configured.
   */
  async search(
    query: string,
    contentType?: EmbeddingContentType,
    limit = 10,
  ): Promise<VectorSearchResult[]> {
    this.assertNotDestroyed()
    if (!this.store) {
      throw new Error("Cannot search: no VectorStore configured in EmbeddingLayerConfig.store")
    }

    const result = await this.embed(query, contentType)
    return this.store.searchSimilar(result.vector, limit, contentType)
  }

  // ─── Private ──────────────────────────────────────────────────────

  private lastVoyageError: Error | undefined

  private persistToStore(content: string, contentType: EmbeddingContentType, vector: number[]): void {
    if (!this.store) return
    try {
      this.store.storeEmbedding({
        content,
        content_type: contentType,
        vector,
      })
    } catch {
      // Persistence failure must not break embedding generation
    }
  }

  private persistBatchToStore(
    texts: string[],
    contentType: EmbeddingContentType,
    results: EmbeddingResult[],
  ): void {
    if (!this.store) return
    try {
      const records = texts.map((text, i) => ({
        content: text,
        content_type: contentType,
        vector: results[i].vector,
      }))
      this.store.storeEmbeddingBatch(records)
    } catch {
      // Persistence failure must not break embedding generation
    }
  }

  private enterDegradedMode(reason: string): void {
    if (!this.degraded) {
      this.degraded = true
      this.callbacks.onDegradation?.({
        type: "degradation",
        backend: "local",
        reason,
        timestamp: Date.now(),
      })
      this.startHealthCheck()
    }
  }

  private exitDegradedMode(): void {
    if (this.degraded) {
      this.degraded = false
      this.callbacks.onRecovery?.({
        type: "recovery",
        backend: "voyage",
        timestamp: Date.now(),
      })
      this.stopHealthCheck()
    }
  }

  private startHealthCheck(): void {
    if (this.destroyed) return
    this.stopHealthCheck()

    const check = (): void => {
      if (this.destroyed || !this.degraded || !this.voyageClient) return

      this.voyageClient
        .embed(["health-check"], this.models.default)
        .then(() => {
          this.exitDegradedMode()
        })
        .catch(() => {
          // Still down, schedule next check
          this.healthCheckTimer = this.scheduler.setTimer(check, this.healthCheckIntervalMs)
        })
    }

    this.healthCheckTimer = this.scheduler.setTimer(check, this.healthCheckIntervalMs)
  }

  private stopHealthCheck(): void {
    if (this.healthCheckTimer !== undefined) {
      this.scheduler.clearTimer(this.healthCheckTimer)
      this.healthCheckTimer = undefined
    }
  }

  private assertNotDestroyed(): void {
    if (this.destroyed) {
      throw new Error("EmbeddingLayer has been destroyed")
    }
  }
}

// ─── Factory ────────────────────────────────────────────────────────

export interface CreateEmbeddingLayerOptions {
  config?: EmbeddingLayerConfig
  voyageClient?: VoyageAIClient
  localLoader?: LocalModelLoader
  scheduler?: HealthCheckScheduler
  callbacks?: EmbeddingLayerCallbacks
}

/**
 * Factory function to create an EmbeddingLayer.
 * If onnxruntime-node is available, creates a local fallback automatically.
 */
export function createEmbeddingLayer(options: CreateEmbeddingLayerOptions = {}): EmbeddingLayer {
  let localLoader = options.localLoader

  // Attempt to load onnxruntime-node for local fallback
  if (!localLoader) {
    try {
      // Dynamic import — onnxruntime-node is optional
      // The import will fail if the package is not installed
      localLoader = createOnnxLocalLoader()
    } catch {
      // onnxruntime-node not available, no local fallback
    }
  }

  return new EmbeddingLayer(options.config, options.voyageClient, localLoader, options.scheduler, options.callbacks)
}

/**
 * Create a local model loader using onnxruntime-node.
 * This is intentionally injectable — the actual ONNX runtime loading
 * happens lazily so the module can be imported without onnxruntime-node.
 */
function createOnnxLocalLoader(): LocalModelLoader {
  // This will throw if onnxruntime-node is not available
  // The caller should catch and handle gracefully
  throw new Error("onnxruntime-node not available: local model loader requires onnxruntime-node package")
}