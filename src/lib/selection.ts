import {t} from './content';
import type {Assessment, CandidateOutcome, CandidateResult, Check, CheckStatus, CommercialStatus, DecisionResult, Footprint, Model, Region, Selection} from './types';

const Z_95 = 1.96;
export const MAX_CANDIDATES = 5;
export const REGIONS: Region[] = ['EU', 'UK', 'KR'];
export const regionLabel = (region: Region) => t(`regions.${region}`);
export const commercialLabel = (status: CommercialStatus) => t(`commercial.${status}`);
export const statusLabel = (status: CheckStatus) => t(`status.${status}`);
export const commercialTone: Record<CommercialStatus, CheckStatus> = {allowed: 'pass', conditional: 'confirm', prohibited: 'fail', unverified: 'confirm'};

const worst = (list: CheckStatus[]): CheckStatus => list.includes('fail') ? 'fail' : list.includes('confirm') ? 'confirm' : 'pass';
const money = (n: number, currency = 'US$') => `${currency}${n >= 1e9 ? `${n / 1e9}B` : `${n / 1e6}M`}`;

export function licenseCheck(model: Model, s: Selection): Check | null {
  if (!s.commercialUse && !s.regions.length) return null;
  const r = model.license.rule;
  const issues: {status: CheckStatus; text: string}[] = [];
  const blocked = (r.excludedRegions || []).filter(x => s.regions.includes(x));
  if (blocked.length) issues.push({status: 'fail', text: t('engine.notLicensedIn', {regions: blocked.map(regionLabel).join(', ')})});
  if (s.commercialUse) {
    if (r.commercial === 'prohibited') issues.push({status: 'fail', text: t('engine.commercialBlocked')});
    if (r.commercial === 'unverified') issues.push({status: 'confirm', text: t('engine.termsUnverified')});
    const revenue = s.annualRevenueUsd, mau = s.monthlyActiveUsers;
    if (r.revenueLimit) {
      const {amount, currency, scope} = r.revenueLimit;
      const limit = money(amount, currency === 'USD' ? 'US$' : `${currency} `);
      if (revenue === null) issues.push({status: 'confirm', text: t('engine.enterRevenue', {limit})});
      else if (currency !== 'USD') { if (revenue >= amount * .8) issues.push({status: 'confirm', text: t('engine.checkRevenue', {limit})}); }
      else if (scope === 'organization' && revenue >= amount) issues.push({status: 'fail', text: t('engine.revenueOver', {limit})});
      else if (scope === 'product' && revenue > amount) issues.push({status: 'confirm', text: t('engine.productRevenue', {limit})});
    }
    if (r.mauLimit) {
      const limit = r.mauLimit / 1e6;
      if (mau === null) issues.push({status: 'confirm', text: t('engine.enterUsers', {limit})});
      else if (mau > r.mauLimit) issues.push({status: 'fail', text: t('engine.usersOver', {limit})});
    }
    if (s.offersMaaS) {
      if (r.maasRequiresLicense) issues.push({status: 'fail', text: t('engine.maasLicense')});
      if (r.maasRevenueLimit) {
        const limit = money(r.maasRevenueLimit);
        if (revenue === null) issues.push({status: 'confirm', text: t('engine.enterMaasRevenue', {limit})});
        else if (revenue > r.maasRevenueLimit) issues.push({status: 'fail', text: t('engine.maasRevenueOver', {limit})});
      }
      if (r.maasMauLimit) {
        const limit = r.maasMauLimit / 1e6;
        if (mau === null) issues.push({status: 'confirm', text: t('engine.enterUsers', {limit})});
        else if (mau > r.maasMauLimit) issues.push({status: 'fail', text: t('engine.maasUsersOver', {limit})});
      }
    }
  }
  return {id: 'license', label: t('engine.licence'), status: worst(issues.map(i => i.status)), detail: issues.length ? `${r.name}: ${issues.map(i => i.text).join('; ')}` : r.name};
}

/** Weights plus a full attention cache for every concurrent session, with planning headroom. */
export function footprint(model: Pick<Model, 'weightGiB' | 'kvKiBPerToken' | 'context'>, s: Pick<Selection, 'minContext' | 'concurrentSessions' | 'headroomPct' | 'gpuMemoryGiB'>): Footprint {
  const contextUsed = s.minContext ?? model.context;
  const weightGiB = model.weightGiB;
  const cacheGiB = model.kvKiBPerToken !== null && contextUsed !== null ? (model.kvKiBPerToken * contextUsed * s.concurrentSessions) / (1024 * 1024) : null;
  const memoryGiB = weightGiB !== null && cacheGiB !== null ? (weightGiB + cacheGiB) * (1 + s.headroomPct / 100) : null;
  const gpusPerReplica = memoryGiB !== null && s.gpuMemoryGiB ? Math.ceil(memoryGiB / s.gpuMemoryGiB) : null;
  return {weightGiB, cacheGiB, memoryGiB, contextUsed, gpusPerReplica};
}

export function hasRequirements(s: Selection): boolean {
  return s.commercialUse || s.regions.length > 0 || s.minContext !== null || (s.gpuMemoryGiB !== null && s.gpuCount !== null) || s.needsVision || s.excludedPublishers.length > 0 || s.excludedCountries.length > 0;
}

export function assessModel(model: Model, s: Selection): Assessment {
  const checks: Check[] = [];
  const license = licenseCheck(model, s);
  if (license) checks.push(license);
  if (s.minContext !== null) {
    const c = model.context;
    checks.push({id: 'context', label: t('engine.context'), status: c === null ? 'confirm' : c >= s.minContext ? 'pass' : 'fail', detail: c === null ? t('engine.contextMissing') : t('engine.contextDetail', {have: c.toLocaleString('en-US'), need: s.minContext.toLocaleString('en-US')})});
  }
  const fp = footprint(model, s);
  if (s.gpuMemoryGiB !== null && s.gpuCount !== null && model.access !== 'api') {
    const available = s.gpuMemoryGiB * s.gpuCount;
    checks.push({id: 'memory', label: t('engine.memory'), status: fp.memoryGiB === null ? 'confirm' : fp.memoryGiB <= available ? 'pass' : 'fail', detail: fp.memoryGiB === null ? t('engine.memoryMissing') : t('engine.memoryDetail', {need: fp.memoryGiB.toFixed(1), have: available})});
  }
  if (s.needsVision) {
    const known = model.api ? model.api.vision === true : !!model.official?.vision, readable = model.api ? model.api.vision === false : !!model.official?.configUrl;
    checks.push({id: 'vision', label: t('engine.vision'), status: known ? 'pass' : readable ? 'fail' : 'confirm', detail: t(known ? 'engine.visionYes' : readable ? 'engine.visionNo' : 'engine.visionUnknown')});
  }
  if (s.excludedPublishers.includes(model.publisher)) checks.push({id: 'publisher', label: t('engine.publisher'), status: 'fail', detail: t('engine.publisherExcluded', {publisher: model.publisher})});
  if (s.excludedCountries.length) {
    const c = model.country;
    checks.push({id: 'country', label: t('engine.country'), status: c === null ? 'confirm' : s.excludedCountries.includes(c) ? 'fail' : 'pass', detail: c ?? t('engine.countryMissing')});
  }
  return {model, status: worst(checks.map(c => c.status)), checks, footprint: fp};
}

/** Wilson score interval for a binomial proportion. */
export function wilson(successes: number, trials: number, z = Z_95): [number, number] {
  if (trials <= 0) return [0, 0];
  const p = successes / trials, z2 = z * z, denominator = 1 + z2 / trials;
  const centre = p + z2 / (2 * trials);
  const margin = z * Math.sqrt((p * (1 - p) + z2 / (4 * trials)) / trials);
  return [Math.max(0, (centre - margin) / denominator), Math.min(1, (centre + margin) / denominator)];
}

/** Smallest test set where a model passing every case clears the threshold at 95% confidence. */
export function minimumTestCases(minPassRatePct: number): number | null {
  const p = minPassRatePct / 100;
  if (p <= 0 || p >= 1) return null;
  let n = Math.max(1, Math.floor((p * Z_95 * Z_95) / (1 - p)));
  while (wilson(n, n)[0] < p) n++;
  return n;
}

export const emptyResult: CandidateResult = {hosting: 'self', passed: null, criticalFailures: null, p95Ms: null, rpsPerReplica: null, inputPrice: null, outputPrice: null, otherMonthly: null};

export function decide(s: Selection, models: Model[]): DecisionResult {
  const setupMissing: string[] = [];
  if (s.testCases === null || s.testCases < 1) setupMissing.push(t('engine.setupTests'));
  if (s.minPassRatePct === null) setupMissing.push(t('engine.setupPass'));
  if (s.requestsPerMonth === null || s.requestsPerMonth <= 0) setupMissing.push(t('engine.setupRequests'));
  const chosen = s.candidates.map(id => models.find(m => m.id === id)).filter((m): m is Model => !!m);
  const results = (id: string) => ({...emptyResult, ...s.results[id]});
  if (chosen.some(m => results(m.id).hosting === 'api')) {
    if (s.inputTokens === null) setupMissing.push(t('engine.setupInput'));
    if (s.outputTokens === null) setupMissing.push(t('engine.setupOutput'));
  }
  if (chosen.some(m => results(m.id).hosting === 'self')) {
    if (s.gpuMemoryGiB === null) setupMissing.push(t('engine.setupGpu'));
    if (s.peakRps === null || s.peakRps <= 0) setupMissing.push(t('engine.setupPeak'));
    if (s.gpuMonthlyCost === null) setupMissing.push(t('engine.setupGpuCost'));
  }

  const rows: CandidateOutcome[] = chosen.map(model => {
    const id = model.id, r = results(id), fp = footprint(model, s), missing: string[] = [], reasons: string[] = [];
    if (r.passed === null) missing.push(t('engine.missingPassed'));
    if (r.criticalFailures === null) missing.push(t('engine.missingCritical'));
    if (s.maxP95Ms !== null && r.p95Ms === null) missing.push(t('engine.missingLatency'));
    if (r.hosting === 'api') {
      if (r.inputPrice === null) missing.push(t('engine.missingInputPrice'));
      if (r.outputPrice === null) missing.push(t('engine.missingOutputPrice'));
    } else {
      if (r.rpsPerReplica === null || r.rpsPerReplica <= 0) missing.push(t('engine.missingThroughput'));
      if (fp.memoryGiB === null) missing.push(t('engine.missingMemory'));
    }
    if (r.passed !== null && s.testCases !== null && r.passed > s.testCases) missing.push(t('engine.passedExceeds'));

    let passRate: number | null = null, lower: number | null = null, upper: number | null = null;
    if (r.passed !== null && s.testCases && r.passed <= s.testCases) { passRate = r.passed / s.testCases; [lower, upper] = wilson(r.passed, s.testCases); }
    let replicas: number | null = null, totalGpus: number | null = null, monthlyCost: number | null = null;
    if (r.hosting === 'self') {
      if (s.peakRps && r.rpsPerReplica && fp.gpusPerReplica) { replicas = Math.ceil(s.peakRps / r.rpsPerReplica); totalGpus = replicas * fp.gpusPerReplica; }
      if (totalGpus !== null && s.gpuMonthlyCost !== null) monthlyCost = totalGpus * s.gpuMonthlyCost + (r.otherMonthly ?? 0);
    } else if (r.inputPrice !== null && r.outputPrice !== null && s.requestsPerMonth && s.inputTokens !== null && s.outputTokens !== null) {
      monthlyCost = (r.otherMonthly ?? 0) + (s.requestsPerMonth * (s.inputTokens * r.inputPrice + s.outputTokens * r.outputPrice)) / 1_000_000;
    }
    const costPerSuccess = monthlyCost !== null && passRate && s.requestsPerMonth ? monthlyCost / (s.requestsPerMonth * passRate) : null;
    const license = licenseCheck(model, s);
    const licenseStatus: CheckStatus = license?.status ?? 'pass';
    const base = {id, model, hosting: r.hosting, passRate, lower, upper, monthlyCost, costPerSuccess, footprint: fp, replicas, totalGpus, licenseStatus};
    if (missing.length) return {...base, status: 'incomplete' as const, reasons: [t('engine.missing', {items: missing.join(', ')})]};
    if (license?.status === 'fail') reasons.push(license.detail);
    if (lower !== null && s.minPassRatePct !== null && lower < s.minPassRatePct / 100) reasons.push(t('engine.passBelow', {lower: (lower * 100).toFixed(1), min: s.minPassRatePct}));
    if (r.criticalFailures !== null && r.criticalFailures > s.maxCriticalFailures) reasons.push(t('engine.criticalOver', {count: r.criticalFailures, limit: s.maxCriticalFailures}));
    if (s.maxP95Ms !== null && r.p95Ms !== null && r.p95Ms > s.maxP95Ms) reasons.push(t('engine.latencyOver', {value: r.p95Ms, limit: s.maxP95Ms}));
    if (s.monthlyBudget !== null && monthlyCost !== null && monthlyCost > s.monthlyBudget) reasons.push(t('engine.budgetOver'));
    if (r.hosting === 'self' && s.gpuCount !== null && totalGpus !== null && totalGpus > s.gpuCount) reasons.push(t('engine.gpusOver', {need: totalGpus, have: s.gpuCount}));
    return {...base, status: reasons.length ? 'rejected' as const : 'qualified' as const, reasons};
  });

  if (!rows.length) return {state: 'empty', setupMissing, rows, winner: null, tradeoffs: []};
  if (setupMissing.length || rows.some(r => r.status === 'incomplete')) return {state: 'incomplete', setupMissing, rows, winner: null, tradeoffs: []};
  const qualified = rows.filter(r => r.status === 'qualified').sort((a, b) => (a.costPerSuccess! - b.costPerSuccess!) || (b.passRate! - a.passRate!));
  if (!qualified.length) return {state: 'none', setupMissing, rows, winner: null, tradeoffs: []};
  const winner = qualified[0];
  const tradeoffs = qualified.slice(1).filter(r => r.lower! > winner.upper!).map(r => ({model: r.model.name, extraMonthly: r.monthlyCost! - winner.monthlyCost!, lower: r.lower!, winnerUpper: winner.upper!}));
  return {state: 'selected', setupMissing, rows, winner, tradeoffs};
}

export function safeUrl(value: string | null | undefined): string | null {
  if (!value) return null;
  try { const url = new URL(value); return url.protocol === 'https:' ? url.href : null; } catch { return null; }
}
export function formatTokens(n: number | null): string {
  if (n === null || !Number.isFinite(n)) return '—';
  if (n >= 1_000_000) return `${+(n / 1_048_576).toFixed(2)}M`;
  if (n >= 1000) return `${+(n / 1024).toFixed(1)}K`;
  return String(n);
}
export function formatParams(n: number | null): string {
  if (n === null) return '—';
  if (n >= 1e12) return `${+(n / 1e12).toFixed(2)}T`;
  if (n >= 9.995e8) return `${+(n / 1e9).toFixed(2)}B`;
  return `${+(n / 1e6).toFixed(0)}M`;
}
export const formatGiB = (n: number | null) => n === null ? '—' : `${n >= 100 ? n.toFixed(0) : n.toFixed(1)} GiB`;
export const formatMoney = (n: number | null, digits = 0) => n === null ? '—' : '$' + n.toLocaleString('en-US', {minimumFractionDigits: digits, maximumFractionDigits: digits});
export const formatPct = (n: number | null) => n === null ? '—' : `${(n * 100).toFixed(1)}%`;
