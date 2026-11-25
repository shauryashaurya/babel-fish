export type Row = Record<string, string>;
export type CommercialStatus = 'allowed' | 'conditional' | 'prohibited' | 'unverified';
export type CheckStatus = 'pass' | 'confirm' | 'fail';
export type Region = 'EU' | 'UK' | 'KR';
export type Hosting = 'self' | 'api';

export interface LicenseRule {
  name: string;
  commercial: CommercialStatus;
  summary: string;
  obligations: string[];
  restrictions?: string[];
  revenueLimit?: {amount: number; currency: string; scope: 'organization' | 'product'};
  mauLimit?: number;
  maasRequiresLicense?: boolean;
  maasRevenueLimit?: number;
  maasMauLimit?: number;
  excludedRegions?: Region[];
}

export interface OfficialCard {
  repo: string; url: string; revision: string; lastModified: string; gated: string | null; configUrl: string | null;
  pipeline: string | null; library: string | null; languages: string[]; architectures: string[] | null; modelType: string | null;
  hiddenSize: number | null; layers: number | null; heads: number | null; kvHeads: number | null; vocab: number | null;
  experts?: number | null; expertsActive?: number | null; sharedExperts?: number | null; window?: number | null;
  kvLatentRank?: number | null; convKernel?: number | null; mtpModules?: number | null;
  dtype: string | null; storedPrecision: string | null; quantized: boolean; checkpointParams: number | null; weightFormat: string | null; weightFiles: number; vision: boolean; audio: boolean;
  details?: ConfigDetails | null;
  /** Where the architecture figures come from when the Hugging Face configuration is gated. */
  configSource?: ConfigSource;
}
export interface ConfigSource {sources: {title: string; url: string}[]; note: string; retrievedOn: string;}

/** Layer-level facts read from the official config.json at the pinned revision. Null means the configuration does not state it. */
export interface ConfigDetails {
  headDim: number | null; headDimStated: boolean; globalHeadDim: number | null; globalKvHeads: number | null; sharedKv: boolean | null;
  intermediate: number | null; moeIntermediate: number | null; sharedIntermediate: number | null; activation: string | null;
  norm: 'RMSNorm' | 'LayerNorm' | null; tied: boolean | null;
  rope: {theta: number | null; type: string | null; factor: number | null; original: number | null; partial: number | null; localTheta: number | null} | null;
  qkNorm: boolean | null; attentionBias: boolean | null; logitSoftcap: number | null; attnSoftcap: number | null;
  qLoraRank: number | null; ropeHeadDim: number | null; mtp: number | null;
  layout: {full: number; window: number; windowSize: number | null; other: number; otherKind: string | null; unknown: boolean} | null;
  ffn: {dense: number; moe: number} | null;
  cache: {method: 'standard' | 'latent' | 'shared-kv'; fullKiB: number; windowKiB: number; totalKiB?: number; agrees?: boolean} | null;
}

export interface Model {
  id: string; name: string; publisher: string; country: string | null; released: string; galleryUrl: string;
  architecture: {class: string | null; attention: string | null; layerMix: string | null; keyDetail: string | null};
  scale: string; totalParams: number | null; activeParams: number | null;
  context: number | null; contextConfig: number | null; contextGallery: string | null; kvKiBPerToken: number | null;
  weightGiB: number | null; weightSource: 'official-files' | 'estimate' | 'none';
  trainingData: string | null; postTraining: string | null; artificialAnalysisIndex: number | null;
  official: OfficialCard | null; otherSources: string[];
  license: {key: string; url: string | null; rule: LicenseRule};
  flags: string[];
  /** 'api' for closed models served only through a provider's API; absent for open-weight models. */
  access?: 'open' | 'api';
  api?: {provider: string; apiId: string; status: 'ga' | 'preview'; maxOutput: number; vision: boolean | null};
}

export interface CandidateResult {
  hosting: Hosting;
  passed: number | null;
  criticalFailures: number | null;
  p95Ms: number | null;
  rpsPerReplica: number | null;
  inputPrice: number | null;
  outputPrice: number | null;
  otherMonthly: number | null;
}

export interface Selection {
  useCase: string; preparedBy: string;
  commercialUse: boolean; offersMaaS: boolean; annualRevenueUsd: number | null; monthlyActiveUsers: number | null; regions: Region[];
  minContext: number | null; needsVision: boolean; excludedPublishers: string[]; excludedCountries: string[];
  gpuMemoryGiB: number | null; gpuCount: number | null; concurrentSessions: number; headroomPct: number;
  testCases: number | null; minPassRatePct: number | null; maxCriticalFailures: number; maxP95Ms: number | null; monthlyBudget: number | null;
  requestsPerMonth: number | null; inputTokens: number | null; outputTokens: number | null; peakRps: number | null; gpuMonthlyCost: number | null;
  candidates: string[]; results: Record<string, CandidateResult>; notes: string;
}

export interface Check { id: string; label: string; status: CheckStatus; detail: string; }
export interface Footprint { weightGiB: number | null; cacheGiB: number | null; memoryGiB: number | null; contextUsed: number | null; gpusPerReplica: number | null; }
export interface Assessment { model: Model; status: CheckStatus; checks: Check[]; footprint: Footprint; }

export interface CandidateOutcome {
  id: string; model: Model; hosting: Hosting; status: 'qualified' | 'rejected' | 'incomplete'; reasons: string[];
  passRate: number | null; lower: number | null; upper: number | null; monthlyCost: number | null; costPerSuccess: number | null;
  footprint: Footprint; replicas: number | null; totalGpus: number | null; licenseStatus: CheckStatus;
}

export interface DecisionResult {
  state: 'empty' | 'incomplete' | 'none' | 'selected';
  setupMissing: string[];
  rows: CandidateOutcome[];
  winner: CandidateOutcome | null;
  tradeoffs: {model: string; extraMonthly: number; lower: number; winnerUpper: number}[];
}
