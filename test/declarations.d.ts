/**
 * Type declarations for @cortexkit/pi-magic-context.
 *
 * This package does not ship its own .d.ts files, so we provide a minimal
 * ambient declaration so that `import("@cortexkit/pi-magic-context")`
 * resolves without a TS error under strict settings.
 */
declare module "@cortexkit/pi-magic-context" {
  const _default: Record<string, unknown>;
  export default _default;
}

/**
 * Ambient declaration for @xenova/transformers.
 *
 * The ONNX fallback path in `extensions/autodev/docs/index.ts` dynamically
 * imports this package. It is an optional runtime dependency (only loaded
 * when `VOYAGE_API_KEY` is unset and the user actually invokes embedding),
 * so it is not listed in package.json `dependencies`. This ambient module
 * stub lets `tsc --noEmit` pass without the package installed.
 */
declare module "@xenova/transformers" {
  export interface ExtractionResult {
    tolist(): number[][];
  }
  export interface FeatureExtractor {
    featureExtraction(
      texts: string[],
      options: { pooling: string; normalize: boolean },
    ): Promise<ExtractionResult>;
  }
  export function pipeline(task: string, model: string): Promise<FeatureExtractor>;
}
