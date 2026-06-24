/**
 * Shared embedding utilities — VoyageAI (remote) and ONNX (local) providers.
 *
 * Extracted from `docs/index.ts` so other modules (e.g. Magic Context bridge)
 * can reuse the same embedding pipeline without importing the docs module.
 *
 * Embedding provider: VoyageAI (remote, `VOYAGE_API_KEY`) with local ONNX
 * fallback (`Xenova/all-MiniLM-L6-v2`).
 */

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

/** VoyageAI batch size (requests are batched to reduce round trips). */
export const VOYAGE_BATCH_SIZE = 20;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Injectable embedding function. Tests pass a deterministic mock. */
export type EmbedFn = (texts: string[], isQuery?: boolean) => Promise<Float32Array[]>;

// ---------------------------------------------------------------------------
// Embedding providers
// ---------------------------------------------------------------------------

/**
 * VoyageAI embedding provider. Requires `VOYAGE_API_KEY`. Uses `voyage-3`
 * (best for code/technical docs). Batches requests to stay under API limits.
 * Input type "document" is used for corpus ingestion; "query" for searches.
 */
export async function voyageEmbed(
  texts: string[],
  isQuery = false,
): Promise<Float32Array[]> {
  const apiKey = process.env.VOYAGE_API_KEY;
  if (!apiKey) throw new Error("VOYAGE_API_KEY not set");
  const out: Float32Array[] = [];
  for (let i = 0; i < texts.length; i += VOYAGE_BATCH_SIZE) {
    const batch = texts.slice(i, i + VOYAGE_BATCH_SIZE);
    const res = await fetch("https://api.voyageai.com/v1/embeddings", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "voyage-3",
        input: batch,
        input_type: isQuery ? "query" : "document",
      }),
    });
    if (!res.ok) {
      throw new Error(`VoyageAI embeddings failed: ${res.status} ${await res.text()}`);
    }
    const json = (await res.json()) as { data: Array<{ embedding: number[] }> };
    for (const item of json.data) {
      out.push(new Float32Array(item.embedding));
    }
  }
  return out;
}

/**
 * Local ONNX embedding provider using `@xenova/transformers` with the
 * `Xenova/all-MiniLM-L6-v2` model (384-dimensional). The model downloads on
 * first use (~90MB). Used as a fallback when `VOYAGE_API_KEY` is unset.
 *
 * The transformers import is dynamic so the (heavy) dependency is only loaded
 * when actually needed — tests never hit this path.
 */
export async function onnxEmbed(texts: string[]): Promise<Float32Array[]> {
  // Lazy import — keeps the module load cheap and lets tests inject a mock
  // without pulling the transformers runtime into the test process.
  const mod = (await import("@xenova/transformers")) as {
    pipeline: (task: string, model: string) => Promise<{
      featureExtraction: (
        texts: string[],
        opts: { pooling: string; normalize: boolean },
      ) => Promise<{ tolist: () => number[][] }>;
    }>;
  };
  const extractor = await mod.pipeline("feature-extraction", "Xenova/all-MiniLM-L6-v2");
  const output = await extractor.featureExtraction(texts, { pooling: "mean", normalize: true });
  return output.tolist().map((v) => new Float32Array(v));
}

/**
 * Unified embedding entrypoint: VoyageAI when the key is present, ONNX
 * otherwise. The `isQuery` flag is forwarded to VoyageAI (it is ignored by
 * the ONNX fallback, which uses a single encoder).
 */
export async function embed(texts: string[], isQuery = false): Promise<Float32Array[]> {
  if (process.env.VOYAGE_API_KEY) {
    return voyageEmbed(texts, isQuery);
  }
  return onnxEmbed(texts);
}
