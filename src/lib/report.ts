import {list, t} from './content';
import {assessModel, commercialLabel, decide, formatGiB, formatMoney, formatPct, statusLabel} from './selection';
import type {Model, Row, Selection} from './types';

export type ReportSheet = {name: string; rows: Array<Array<string | number | null>>};
export type ReportSection = {heading: string; lines: string[]};
export interface ReportSnapshot {title: string; date: string; sections: ReportSection[]; sheets: ReportSheet[]; markdown: string;}

const round = (n: number | null) => n === null ? null : +n.toFixed(2);
const line = (key: string, value: unknown) => `${t(`report.${key}`)}: ${value}`;
const orNotSet = (v: string | number | null, unit = '') => v === null || v === '' ? t('report.notSet') : `${v}${unit}`;
const yesNo = (v: boolean) => t(v ? 'report.yes' : 'report.no');
const money = (v: number | null) => v === null ? t('report.notSet') : formatMoney(v);

export function buildRecord(s: Selection, models: Model[]): ReportSnapshot {
  const date = new Date().toISOString();
  const decision = decide(s, models);
  const assessed = models.map(m => assessModel(m, s));
  const w = decision.winner;
  const outcome = decision.state === 'selected' ? t('report.outcomeSelected', {model: w!.model.name})
    : t(decision.state === 'none' ? 'report.outcomeNone' : decision.state === 'incomplete' ? 'report.outcomeIncomplete' : 'report.outcomeEmpty');
  const hosting = (h: string) => t(h === 'self' ? 'report.selfHosted' : 'report.hostedEndpoint');
  const winnerLines = w ? [
    line('publisher', w.model.publisher),
    line('checkpoint', w.model.official ? t('report.checkpointValue', {repo: w.model.official.repo, revision: w.model.official.revision}) : t('report.noOfficial')),
    line('licence', w.licenseStatus === 'confirm' ? t('report.legalNeeded', {name: w.model.license.rule.name}) : w.model.license.rule.name),
    line('licenceSummary', w.model.license.rule.summary),
    ...w.model.license.rule.obligations.map(o => line('obligation', o)),
    ...(w.model.license.rule.restrictions || []).map(o => line('restriction', o)),
    line('hosting', hosting(w.hosting)),
    line('weights', formatGiB(w.footprint.weightGiB)),
    line('precision', w.model.official?.storedPrecision || t('report.notRecorded')),
    line('memory', formatGiB(w.footprint.memoryGiB)),
    ...(w.hosting === 'self' ? [line('gpus', t('report.gpusValue', {total: w.totalGpus ?? 0, replicas: w.replicas ?? 0, perReplica: w.footprint.gpusPerReplica ?? 0}))] : []),
    line('monthly', formatMoney(w.monthlyCost)),
    line('costPerSuccess', formatMoney(w.costPerSuccess, 4)),
    line('passRate', t('report.passRateValue', {rate: formatPct(w.passRate), lower: formatPct(w.lower), upper: formatPct(w.upper)})),
    ...w.model.flags.map(f => line('dataNote', f)),
  ] : [];

  const sections: ReportSection[] = [
    {heading: t('report.sectionDecision'), lines: [
      line('useCase', s.useCase || t('report.notRecorded')), line('preparedBy', s.preparedBy || t('report.notRecorded')), line('generated', date), line('outcome', outcome), ...winnerLines,
      ...decision.tradeoffs.map(x => line('alternative', t('report.alternativeValue', {model: x.model, extra: formatMoney(x.extraMonthly)}))),
      line('notes', s.notes || t('report.none')),
    ]},
    {heading: t('report.sectionRequirements'), lines: [
      line('commercial', yesNo(s.commercialUse)), line('maas', yesNo(s.offersMaaS)), line('revenue', money(s.annualRevenueUsd)), line('users', orNotSet(s.monthlyActiveUsers)),
      line('operating', s.regions.join(', ') || t('report.noRegion')),
      line('minContext', s.minContext === null ? t('report.notSet') : t('report.tokensValue', {value: s.minContext})),
      line('gpuCapacity', t('report.gpuCapacityValue', {count: orNotSet(s.gpuCount), memory: orNotSet(s.gpuMemoryGiB)})),
      line('sessions', s.concurrentSessions), line('headroom', `${s.headroomPct}%`), line('vision', yesNo(s.needsVision)),
      line('excludedPublishers', s.excludedPublishers.join(', ') || t('report.none')), line('excludedCountries', s.excludedCountries.join(', ') || t('report.none')),
      line('catalogResult', t('report.catalogResultValue', {meets: assessed.filter(a => a.status === 'pass').length, confirm: assessed.filter(a => a.status === 'confirm').length, excluded: assessed.filter(a => a.status === 'fail').length, total: models.length})),
    ]},
    {heading: t('report.sectionCriteria'), lines: [
      line('testCases', orNotSet(s.testCases)), line('minPass', orNotSet(s.minPassRatePct, '%')), line('maxCritical', s.maxCriticalFailures), line('maxLatency', orNotSet(s.maxP95Ms, ' ms')), line('budget', money(s.monthlyBudget)),
      line('requests', orNotSet(s.requestsPerMonth)), line('peak', orNotSet(s.peakRps)), line('tokens', t('report.tokensPerRequest', {input: orNotSet(s.inputTokens), output: orNotSet(s.outputTokens)})), line('gpuCost', money(s.gpuMonthlyCost)),
    ]},
    {heading: t('report.sectionCandidates'), lines: decision.rows.length ? decision.rows.map(r =>
      `${t('report.candidateLine', {model: r.model.name, status: t(`outcome.${r.status}`), rate: formatPct(r.passRate), lower: formatPct(r.lower), memory: formatGiB(r.footprint.memoryGiB), gpus: r.totalGpus ?? '—', monthly: formatMoney(r.monthlyCost), perSuccess: formatMoney(r.costPerSuccess, 4)})}${r.reasons.length ? ` ${r.reasons.join('; ')}.` : ''}`) : [t('report.noCandidates')]},
    {heading: t('report.sectionBasis'), lines: list('report.basis')},
  ];

  const col = (keys: string[]) => keys.map(k => t(`report.col${k}`));
  const sheets: ReportSheet[] = [
    {name: t('report.sheetDecision'), rows: [[t('report.field'), t('report.value')], ...sections[0].lines.map(l => { const i = l.indexOf(': '); return [l.slice(0, i), l.slice(i + 2)]; })]},
    {name: t('report.sheetCandidates'), rows: [col(['Model', 'Publisher', 'Hosting', 'Status', 'Licence', 'PassRate', 'Lower', 'Upper', 'Memory', 'Replicas', 'Gpus', 'Monthly', 'PerSuccess', 'Reasons']),
      ...decision.rows.map(r => [r.model.name, r.model.publisher, hosting(r.hosting), t(`outcome.${r.status}`), r.model.license.rule.name, r.passRate, r.lower, r.upper, round(r.footprint.memoryGiB), r.replicas, r.totalGpus, r.monthlyCost, r.costPerSuccess, r.reasons.join('; ')])]},
    {name: t('report.sheetScreening'), rows: [col(['Model', 'Publisher', 'Origin', 'Licence', 'Commercial', 'Result', 'Weights', 'Memory', 'Repository', 'Revision', 'Detail']),
      ...assessed.map(a => [a.model.name, a.model.publisher, a.model.country, a.model.license.rule.name, commercialLabel(a.model.license.rule.commercial), statusLabel(a.status), a.model.weightGiB, round(a.footprint.memoryGiB), a.model.official?.repo ?? null, a.model.official?.revision ?? null, a.checks.filter(c => c.status !== 'pass').map(c => `${c.label}: ${c.detail}`).join('; ')])]},
  ];
  const title = t('report.title', {useCase: s.useCase || t('report.titleFallback')});
  const markdown = `# ${t('report.heading')}\n\n${sections.map(sec => `## ${sec.heading}\n\n${sec.lines.map(l => `- ${l}`).join('\n')}`).join('\n\n')}\n\n---\n${t('app.footer')}\n`;
  return {title, date, sections, sheets, markdown};
}

export function reportCsvRows(r: ReportSnapshot): Row[] {
  return r.sections.flatMap(section => section.lines.map(line => ({section: section.heading, entry: line})));
}
