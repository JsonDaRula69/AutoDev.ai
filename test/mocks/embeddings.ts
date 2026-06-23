/**
 * Deterministic mock embedding fixture for docs module tests.
 *
 * Returns a Float32Array of length 384 (the all-MiniLM-L6-v2 dimension)
 * where each element is derived from the input text's char codes, so the
 * same input always yields the same vector — no network, no model download.
 *
 * The derivation is deliberately simple and deterministic: element i is
 * `text.charCodeAt(i % text.length) / 128 - 1`, mapping char codes into the
 * [-1, 1] range. Identical strings produce identical vectors (cosine = 1.0);
 * strings with disjoint char sets tend toward orthogonality (cosine ~ 0.0);
 * strings with inverted char patterns approach opposite (cosine ~ -1.0).
 *
 * Usage:
 *   import { mockEmbed, mockEmbedBatch } from "../mocks/embeddings.js";
 *   const vec = mockEmbed("hello");
 *   const batch = mockEmbedBatch(["hello", "world"]);
 */
export const MOCK_EMBED_DIM = 384;

/**
 * Produce a deterministic 384-dim Float32Array for `text`. Empty strings map
 * to the zero vector (so cosine similarity with anything is 0.0).
 */
export function mockEmbed(text: string): Float32Array {
  const dim = MOCK_EMBED_DIM;
  const vec = new Float32Array(dim);
  if (text.length === 0) return vec;
  for (let i = 0; i < dim; i++) {
    vec[i] = (text.charCodeAt(i % text.length) || 0) / 128.0 - 1.0;
  }
  return vec;
}

/** Batch helper: map `mockEmbed` over an array of texts. */
export function mockEmbedBatch(texts: string[]): Float32Array[] {
  return texts.map(mockEmbed);
}

/**
 * An `EmbedFn`-compatible wrapper that ignores the `isQuery` flag and always
 * uses the deterministic mock. Pass this to `buildDocsTools({ embedFn })` or
 * to the core functions (`searchDocs`, `docsRebuild`) in tests.
 */
export function mockEmbedFn(texts: string[], _isQuery = false): Promise<Float32Array[]> {
  return Promise.resolve(mockEmbedBatch(texts));
}