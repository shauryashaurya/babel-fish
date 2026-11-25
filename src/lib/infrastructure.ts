import type {Model} from './types';

export interface CloudInstance {name: string; gpu: string; gpus: number; gpuMemoryGiB: number; vcpus: number; ramGiB: number; arch: string; fractional?: boolean;}
export interface Cloud {id: string; name: string; sources: {title: string; url: string}[]; instances: CloudInstance[];}
export interface InfrastructureContent {
  retrievedOn: string; basis: string;
  profiles: {minimum: {sessions: number; contextTokens: number; headroomPct: number}; recommended: {sessions: number; headroomPct: number}};
  gpuFormats: Record<string, string[]>;
  formatSources: {title: string; url: string}[];
  clouds: Cloud[];
}
export interface SizingProfile {sessions: number; contextTokens: number; headroomPct: number;}
export interface InstancePick {instance: CloudInstance; count: number; memoryGiB: number; weightsGiB: number; native: boolean; expanded: boolean;}

const GIB = 1024 ** 3;
export let infrastructure: InfrastructureContent = {retrievedOn: '', basis: '', profiles: {minimum: {sessions: 1, contextTokens: 32768, headroomPct: 10}, recommended: {sessions: 4, headroomPct: 25}}, gpuFormats: {}, formatSources: [], clouds: []};
export const setInfrastructure = (content: InfrastructureContent) => { infrastructure = content; };

/** The numeric format a GPU must support to run the checkpoint at its published size. */
export function requiredFormat(model: Model): 'fp4' | 'fp8' | null {
  const precision = model.official?.storedPrecision || '';
  if (/8-bit float/.test(precision)) return 'fp8';
  if (/4-bit|mixed|quantized/i.test(precision)) return 'fp4';
  return null;
}

export function runsNatively(model: Model, instance: CloudInstance): boolean {
  const format = requiredFormat(model);
  return !format || (infrastructure.gpuFormats[instance.arch] || []).includes(format);
}

/** Weights in GPU memory. Unsupported quantized formats are decoded to bfloat16 at 2 bytes per parameter. */
export function servedWeightsGiB(model: Model, instance: CloudInstance): number {
  const published = model.weightGiB ?? 0;
  if (runsNatively(model, instance)) return published;
  const parameters = Math.max(model.official?.checkpointParams ?? 0, model.totalParams ?? 0);
  return Math.max(published, parameters * 2 / GIB);
}

export function requiredMemoryGiB(model: Model, instance: CloudInstance, profile: SizingProfile): number {
  const cache = (model.kvKiBPerToken ?? 0) * profile.contextTokens * profile.sessions / (1024 * 1024);
  return (servedWeightsGiB(model, instance) + cache) * (1 + profile.headroomPct / 100);
}

/** Smallest instance that holds the model, or the fewest large instances when no single one can. */
export function pickInstance(model: Model, cloud: Cloud, profile: SizingProfile, strict: boolean): InstancePick | null {
  const pool = cloud.instances.filter(i => !strict || (!i.fractional && runsNatively(model, i)));
  if (!pool.length) return null;
  const describe = (instance: CloudInstance, count: number): InstancePick => {
    const native = runsNatively(model, instance);
    return {instance, count, memoryGiB: requiredMemoryGiB(model, instance, profile), weightsGiB: servedWeightsGiB(model, instance), native, expanded: !native};
  };
  const single = pool
    .filter(i => requiredMemoryGiB(model, i, profile) <= i.gpuMemoryGiB && servedWeightsGiB(model, i) <= i.ramGiB)
    .sort((a, b) => a.gpuMemoryGiB - b.gpuMemoryGiB || a.vcpus - b.vcpus);
  if (single.length) return describe(single[0], 1);
  const cluster = pool.filter(i => !i.fractional).map(instance => ({
    instance,
    count: Math.max(Math.ceil(requiredMemoryGiB(model, instance, profile) / instance.gpuMemoryGiB), Math.ceil(servedWeightsGiB(model, instance) / instance.ramGiB)),
  })).sort((a, b) => a.count - b.count || a.instance.gpuMemoryGiB - b.instance.gpuMemoryGiB);
  return cluster.length ? describe(cluster[0].instance, cluster[0].count) : null;
}

/** Smallest whole-GPU instance with at least this much GPU memory and system memory for it. */
export function pickForMemory(cloud: Cloud, memoryGiB: number): CloudInstance | null {
  return cloud.instances.filter(i => !i.fractional && i.gpuMemoryGiB >= memoryGiB && i.ramGiB >= memoryGiB * .5).sort((a, b) => a.gpuMemoryGiB - b.gpuMemoryGiB || a.vcpus - b.vcpus)[0] ?? null;
}

export const minimumProfile = (model: Model): SizingProfile => {
  const p = infrastructure.profiles.minimum;
  return {sessions: p.sessions, contextTokens: Math.min(p.contextTokens, model.context ?? p.contextTokens), headroomPct: p.headroomPct};
};
