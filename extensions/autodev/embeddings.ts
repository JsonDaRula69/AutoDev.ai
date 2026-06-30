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

export async function onnxEmbed(texts: string[]): Promise<Float32Array[]> {
  let mod: {
    pipeline: (task: string, model: string) => Promise<
      (texts: string[], opts: { pooling: string; normalize: boolean }) => Promise<{
        data: Float32Array | number[];
        dims: number[];
      }>
    >;
  };
  try {
    mod = (await import("@xenova/transformers")) as unknown as typeof mod;
  } catch {
    throw new Error(
      "ONNX fallback unavailable: @xenova/transformers is not installed. " +
        "Set VOYAGE_API_KEY to use VoyageAI, or install @xenova/transformers: " +
        "bun install -g @xenova/transformers",
    );
  }
  const extractor = await mod.pipeline("feature-extraction", "Xenova/all-MiniLM-L6-v2");
  const output = await extractor(texts, { pooling: "mean", normalize: true });
  const data = output.data as Float32Array;
  const dims = output.dims;
  const hidden = dims[dims.length - 1] ?? 0;
  if (hidden === 0) throw new Error("ONNX pipeline returned empty dims");
  const result: Float32Array[] = [];
  for (let i = 0; i < texts.length; i++) {
    result.push(data.slice(i * hidden, (i + 1) * hidden));
  }
  return result;
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
