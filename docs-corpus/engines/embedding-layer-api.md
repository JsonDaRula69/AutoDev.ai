# EmbeddingLayer API

**Source:** `src/plugin/engines/embedding-layer.ts` (AutoDev repo)
**Full source copy:** `docs-corpus/engines/embedding-layer.ts`

## Overview

EmbeddingLayer is a two-backend embedding engine with automatic offline fallback. VoyageAI is the primary backend (cloud embeddings API); a local model (all-MiniLM-L6-v2 via onnxruntime-node) is the fallback. When VoyageAI fails with a network error, the layer silently degrades to the local model and starts a background health check that probes VoyageAI every 5 minutes. When VoyageAI recovers, the layer exits degraded mode.

Design principles:
- **Dependency injection** for both backends, the health-check scheduler, and callbacks.
- **No hardcoded API keys** — reads `VOYAGE_API_KEY` from env or config.
- **Optional VectorStore** for persisting embeddings. If not provided, embeddings are ephemeral.
- **Non-fatal persistence** — if the store write fails, embedding generation still succeeds.

## Types

```typescript
type EmbeddingContentType = "code" | "doc" | "default"

interface EmbeddingResult {
  vector: number[]
  backend: "voyage" | "local"
  degraded: boolean
  dimensionality: number
}

interface DegradationEvent {
  type: "degradation"
  backend: "local"
  reason: string
  timestamp: number
}

interface RecoveryEvent {
  type: "recovery"
  backend: "voyage"
  timestamp: number
}

type EmbeddingLayerEvent = DegradationEvent | RecoveryEvent

interface EmbeddingLayerCallbacks {
  onDegradation?(event: DegradationEvent): void
  onRecovery?(event: RecoveryEvent): void
}

interface EmbeddingLayerConfig {
  voyageApiKey?: string              // Falls back to VOYAGE_API_KEY env var
  healthCheckIntervalMs?: number      // Default: 300000 (5 minutes)
  modelOverrides?: Partial<Record<EmbeddingContentType, string>>
  store?: VectorStore                // Optional store for persisting embeddings
}

interface VoyageAIClient {
  embed(texts: string[], model: string): Promise<number[][]>
}

interface LocalModelLoader {
  embed(text: string): Promise<number[]>
  getDimensionality(): number
}

interface HealthCheckScheduler {
  setTimer(fn: () => void, delayMs: number): ReturnType<typeof setTimeout>
  clearTimer(handle: ReturnType<typeof setTimeout>): void
}
```

## Default Models

| Content Type | Default Model |
|---|---|
| `code` | `voyage-code-3` |
| `doc` | `voyage-context-4` |
| `default` | `voyage-3` |

VoyageAI endpoint: `https://api.voyageai.com/v1/embeddings`

## Class: EmbeddingLayer

### Constructor

```typescript
new EmbeddingLayer(
  config: EmbeddingLayerConfig = {},
  voyageClient?: VoyageAIClient,
  localLoader?: LocalModelLoader,
  scheduler?: HealthCheckScheduler,
  callbacks?: EmbeddingLayerCallbacks,
)
```

- Resolves API key from `config.voyageApiKey ?? process.env.VOYAGE_API_KEY`.
- If `voyageClient` not provided and API key exists, creates default HTTP client.
- If neither VoyageAI client nor local loader is available, throws `"EmbeddingLayer requires at least one backend"`.

### Public Methods

| Method | Signature | Description |
|---|---|---|
| `embed` | `(text: string, contentType?: EmbeddingContentType) => Promise<EmbeddingResult>` | Single embedding. Tries VoyageAI first; on network error falls back to local. In degraded mode, still tries VoyageAI — success exits degraded mode. |
| `embedBatch` | `(texts: string[], contentType?: EmbeddingContentType) => Promise<EmbeddingResult[]>` | Batch embeddings. VoyageAI sends all in one request; local fallback processes one-by-one. |
| `search` | `(query: string, contentType?: EmbeddingContentType, limit?: number) => Promise<VectorSearchResult[]>` | Embeds query + KNN search via configured VectorStore. Throws if no store configured. |
| `isDegraded` | `() => boolean` | Whether currently on local fallback. |
| `canRerank` | `() => boolean` | Whether reranking is available (disabled in degraded mode). |
| `isDestroyed` | `() => boolean` | Whether `destroy()` was called. |
| `destroy` | `() => void` | Stops health check timer; subsequent `embed()` throws. |

### Network Error Detection

Treated as network errors (trigger fallback): `econnrefused`, `enotfound`, `timeout`, `network`, `fetch failed`, `request timeout`, `econnreset`, `etimedout`, `socket hang up`.

## Factory

```typescript
createEmbeddingLayer(options: CreateEmbeddingLayerOptions = {}): EmbeddingLayer
```

Options: `{ config?, voyageClient?, localLoader?, scheduler?, callbacks? }`.

Attempts to auto-load `onnxruntime-node` for local fallback. If unavailable, proceeds without local fallback (VoyageAI-only).