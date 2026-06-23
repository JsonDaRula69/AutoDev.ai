export { BudgetEngine, BudgetExhaustedError } from "./budget-engine"
export type { BudgetCheckResult, BudgetConfig } from "./budget-engine"

export {
  EmbeddingLayer,
  createEmbeddingLayer,
} from "./embedding-layer"

export type {
  EmbeddingContentType,
  EmbeddingResult,
  DegradationEvent,
  RecoveryEvent,
  EmbeddingLayerEvent,
  EmbeddingLayerCallbacks,
  EmbeddingLayerConfig,
  VoyageAIClient,
  LocalModelLoader,
  HealthCheckScheduler,
  CreateEmbeddingLayerOptions,
} from "./embedding-layer"

export {
  VectorStore,
  createVectorStore,
  createInMemoryVectorStore,
} from "./vector-store"

export type {
  VectorRecord,
  VectorSearchResult,
  VectorStoreConfig,
} from "./vector-store"

export {
  HarborLogEngine,
  createHarborLogEngine,
  HARBOR_LOG_SECTIONS,
} from "./harbor-log"

export type {
  HarborLogSection,
  HarborLogSectionData,
  ConflictInfo,
  HarborLogConfig,
} from "./harbor-log"

export { VerifierEngine, VerificationSeparationError, createVerifierEngine } from "./verifier"
export type { VerifierConfig, VerificationAssignment, WorkType } from "./verifier"

export {
  KnowledgeIntegrityEngine,
  createKnowledgeIntegrityEngine,
} from "./knowledge-integrity"

export type {
  KnowledgeIntegrityConfig,
  KnowledgeEntry,
  IntegrityReport,
  ContradictionInfo,
  StaleEntryInfo,
  MissingIngestionInfo,
  EmbeddingComparator,
} from "./knowledge-integrity"

export { DelightRubric, createDelightRubric } from "./delight-rubric"
export type { DelightConfig, Deliverable, HarborLogSnapshot, DelightScore, DelightBreakdown } from "./delight-rubric"

export {
  DebateTriggerEngine,
  createDebateTriggerEngine,
  CYNEFIN_TYPES,
} from "./debate-trigger"

export type {
  CynefinType,
  DebateProtocol,
  DebateTriggerKind,
  DebateTriggerCondition,
  DebateTriggerResult,
  DebateTriggerConfig,
} from "./debate-trigger"

export {
  PhaseTracker,
  AuditLog,
  LifecycleState,
  createPhaseTracker,
  createAuditLog,
} from "./observability"

export type {
  Checkpoint,
  PhaseTransition,
  PhaseTrackerConfig,
  AuditLogConfig,
} from "./observability"

export {
  StuckAgentDetector,
  createStuckAgentDetector,
  ESCALATION_TIERS,
  STUCK_SIGNALS,
} from "./stuck-agent-detector"

export type {
  StuckSignal,
  EscalationResult,
  EscalationTierName,
  StuckAgentDetectorConfig,
  TimerProvider,
  ToolCallRecord,
  FixAttemptRecord,
  StuckEvaluationResult,
} from "./stuck-agent-detector"

export {
  LifecycleOrchestrator,
  IllegalTransitionError,
  createLifecycleOrchestrator,
} from "./lifecycle-orchestrator"

export type {
  TransitionRecord,
  LifecycleOrchestratorConfig,
} from "./lifecycle-orchestrator"

export {
  HyperplanTrigger,
  createHyperplanTrigger,
} from "./hyperplan-trigger"

export type {
  HeartbeatConfig,
  HeartbeatResult,
  TimeSource,
  BackgroundAgentProvider,
  HarborLogStabilityProvider,
  ResearchProvider,
} from "./hyperplan-trigger"

export {
  ADRTriggerEngine,
  createADRTriggerEngine,
  ADR_STATUS_PROPOSED,
  ADR_STATUS_RATIFIED,
} from "./adr-trigger"

export type {
  ADRStatus,
  ADRConflictEvent,
  ADRObjection,
  ADRDraft,
  ADRIndexEntry,
  ADRTriggerConfig,
} from "./adr-trigger"

export {
  LoreguardStore,
  createLoreguardStore,
} from "./loreguard-store"

export type {
  ADRRecord,
  ADRSearchResult,
} from "./loreguard-store"

export {
  IntentPipeline,
  createIntentPipeline,
} from "./intent-pipeline"

export type {
  DispatchRule,
  PriorityWeights,
  IntentPipelineResult,
  HarborLogReadSection,
  IntentPipelineConfig,
} from "./intent-pipeline"