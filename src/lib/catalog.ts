import {setAgents, type AgentsContent} from './agents';
import {setConcepts, type AgentConceptsContent} from './agentConcepts';
import {setArchitecture, type ArchitectureContent, type ArchitectureDetails} from './architecture';
import {setCompareContent, type CompareContent} from './compare';
import {setCopy, t} from './content';
import {setFinops, type ApiContent, type ApiModel, type PriceContent, type WorkloadPreset} from './finops';
import {setInfrastructure, type InfrastructureContent} from './infrastructure';
import {setLearning, type DeviceContent, type Explainers, type FineTuningContent, type Slm} from './learning';
import {setRag, type RagContent} from './rag';
import type {LicenseRule, Model} from './types';

type RawModel = Omit<Model, 'license'> & {license: {key: string; url: string | null}};

/** Open-weight models from the gallery: these have architectures, so every page uses them. */
export let models: Model[] = [];
/** Closed models reached only through a provider's API: catalog, model card and cost planning only. */
export let apiModels: Model[] = [];
/** Everything the catalog lists. */
export let catalogModels: Model[] = [];
export let catalogInfo = {generatedOn: '', source: '', licensesReviewedOn: '', licenseBasis: ''};

async function read<T>(path: string): Promise<T> {
  const response = await fetch(`${import.meta.env.BASE_URL}data/${path}`, {cache: 'no-cache'});
  if (!response.ok) throw new Error(`${path}: ${response.status}`);
  return response.json() as Promise<T>;
}

/** Everything the app shows is loaded from the ./data folder. */
export async function loadData() {
  const [catalog, licenses, copy, architecture, technical, infrastructure, explainers, fineTuning, slmData, deviceData, ragContent, compareContent, agentsContent, conceptsContent, apiContent, priceContent, workloadContent] = await Promise.all([
    read<{generatedOn: string; source: string; models: RawModel[]}>('catalog/models.json'),
    read<{reviewedOn: string; basis: string; rules: Record<string, LicenseRule>}>('catalog/license_rules.json'),
    read<Record<string, unknown>>('content/copy.json'),
    read<ArchitectureContent>('content/architectures.json'),
    read<ArchitectureDetails>('content/architecture_details.json'),
    read<InfrastructureContent>('infrastructure/cloud_instances.json'),
    read<Explainers>('content/explainers.json'),
    read<FineTuningContent>('content/finetuning.json'),
    read<{models: (Omit<Slm, 'license'> & {license: {key: string; url: string}})[]}>('catalog/slm_candidates.json'),
    read<DeviceContent>('infrastructure/devices.json'),
    read<RagContent>('content/rag.json'),
    read<CompareContent>('content/compare.json'),
    read<AgentsContent>('content/agents.json'),
    read<AgentConceptsContent>('content/agent_concepts.json'),
    read<ApiContent>('finops/api_models.json'),
    read<PriceContent>('finops/infrastructure_prices.json'),
    read<{note: string; presets: WorkloadPreset[]}>('finops/workloads.json'),
  ]);
  setCopy(copy);
  setArchitecture(architecture, technical);
  setInfrastructure(infrastructure);
  models = catalog.models.map(m => ({...m, license: {...m.license, rule: licenses.rules[m.license.key]}}));
  setLearning(explainers, fineTuning, slmData.models.map(s => ({...s, license: {...s.license, rule: licenses.rules[s.license.key]}})), deviceData);
  setRag(ragContent);
  setCompareContent(compareContent);
  setAgents(agentsContent);
  setConcepts(conceptsContent);
  setFinops(apiContent, priceContent, workloadContent);
  apiModels = apiContent.models.map(m => apiAsModel(m, apiContent));
  catalogModels = [...models, ...apiModels];
  catalogInfo = {generatedOn: catalog.generatedOn, source: catalog.source, licensesReviewedOn: licenses.reviewedOn, licenseBasis: licenses.basis};
}

/** A closed model as a catalog row. Nothing about its architecture or weights is published, so those fields stay empty. */
function apiAsModel(m: ApiModel, content: ApiContent): Model {
  const p = content.providers.find(x => x.id === m.provider)!;
  const rule: LicenseRule = {name: p.terms.title, commercial: 'allowed', summary: t('api.termsSummary', {provider: p.name}), obligations: p.policy ? [t('api.followPolicy', {policy: p.policy.title})] : [], restrictions: [t('api.noWeights')]};
  return {
    id: m.id, name: m.name, publisher: p.name, country: p.country, released: '', galleryUrl: '',
    architecture: {class: null, attention: null, layerMix: null, keyDetail: null},
    scale: t('api.scaleUnpublished'), totalParams: null, activeParams: null,
    context: m.context, contextConfig: null, contextGallery: null, kvKiBPerToken: null, weightGiB: null, weightSource: 'none',
    trainingData: null, postTraining: null, artificialAnalysisIndex: null, official: null, otherSources: [m.source, p.pricingUrl],
    license: {key: `api:${p.id}`, url: p.terms.url, rule}, flags: [],
    access: 'api', api: {provider: p.id, apiId: m.apiId, status: m.status, maxOutput: m.maxOutput, vision: m.vision},
  };
}
