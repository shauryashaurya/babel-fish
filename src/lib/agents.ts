/** Agents and agentic patterns. Every text lives in data/content/agents.json. */
export interface Link {title: string; url: string;}
export interface AgentPattern {
  id: string; name: string; category: string;
  mechanism: string; bestFor: string; what: string; how: string[];
  strength: string; limit: string;
  /** 1 to 3: how much the model, rather than code, decides the path. */
  autonomy: number;
  /** 1 to 3: model calls per task, relative to the other patterns. */
  modelCalls: number;
  /** 1 to 3: wall-clock time, relative to the other patterns. */
  latency: number;
  /** 1 to 3: how easy the path is to predict, test and audit. */
  predictability: number;
  sources: Link[];
  here: string; differs: string; govern: string;
}
export interface BriefSpec {commercial: boolean; minContext: number; contextTokens: number; sessions: number; budgetGiB: number; vision: boolean; headroomPct: number;}
export interface BriefPreset {id: string; name: string; text: string; brief: BriefSpec;}
export interface JsonSchema {type: string; properties?: Record<string, JsonSchema & {description?: string}>; required?: string[]; items?: JsonSchema; enum?: (string | number)[]; minimum?: number; maximum?: number; additionalProperties?: boolean;}
export interface ToolSpec {name: string; description: string; effect: 'read' | 'write' | 'external'; ms: number; schema: JsonSchema;}
export interface Route {id: string; name: string; tool: string | null; examples: string[];}
export interface Control {id: string; name: string; text: string; patterns: string[]; source: Link;}
export interface Framework {id: string; name: string; text: string; source: Link;}
export interface ChooserQuestion {id: string; label: string; options: {id: string; label: string; boost: Record<string, number>}[];}
export interface AgentsContent {
  intro: {what: string; analogy: string; workflows: string; agents: string; source: Link};
  principles: string[];
  building: {title: string; text: string}[];
  categories: Record<string, string>;
  patterns: AgentPattern[];
  labIntro: string;
  briefs: BriefPreset[];
  tools: ToolSpec[];
  routes: Route[];
  routingRequests: string[];
  toolRequests: string[];
  rubric: {id: string; text: string}[];
  untrusted: {title: string; source: string; text: string};
  injectionPatterns: string[];
  costIntro: string;
  costAssumptions: string;
  controls: Control[];
  frameworks: Framework[];
  failureModes: {title: string; text: string; source: Link}[];
  benchmarks: Link[];
  survey: Link;
  chooser: {intro: string; questions: ChooserQuestion[]};
  checklist: string[];
}

export let agents: AgentsContent = {
  intro: {what: '', analogy: '', workflows: '', agents: '', source: {title: '', url: ''}}, principles: [], building: [], categories: {}, patterns: [], labIntro: '',
  briefs: [], tools: [], routes: [], routingRequests: [], toolRequests: [], rubric: [], untrusted: {title: '', source: '', text: ''}, injectionPatterns: [],
  costIntro: '', costAssumptions: '', controls: [], frameworks: [], failureModes: [], benchmarks: [], survey: {title: '', url: ''}, chooser: {intro: '', questions: []}, checklist: [],
};
export const setAgents = (content: AgentsContent) => { agents = content; };
/** Series colour per category, in a fixed order, so a pattern keeps its colour on every chart. */
export const CATEGORY_TONE: Record<string, number> = {block: 8, workflow: 1, agent: 2, reasoning: 3, multi: 7, control: 5};

/** Adds up each chosen answer's points per pattern and returns the strongest three, with the answers that produced them. */
export function recommendPatterns(answers: Record<string, string>) {
  const score = new Map<string, {points: number; why: string[]}>();
  for (const q of agents.chooser.questions) {
    const option = q.options.find(o => o.id === answers[q.id]);
    if (!option) continue;
    for (const [id, points] of Object.entries(option.boost)) {
      const s = score.get(id) ?? {points: 0, why: []};
      s.points += points;
      if (points > 0) s.why.push(option.label);
      score.set(id, s);
    }
  }
  return [...score.entries()]
    .map(([id, s]) => ({pattern: agents.patterns.find(p => p.id === id), ...s}))
    .filter((x): x is {pattern: AgentPattern; points: number; why: string[]} => !!x.pattern && x.points > 0)
    .sort((a, b) => b.points - a.points || a.pattern.autonomy - b.pattern.autonomy)
    .slice(0, 3);
}
