// src/content/types.ts
// 定位器生成共享类型。

export type SelectorKind =
  | 'id' | 'data-testid' | 'data' | 'name' | 'aria'
  | 'placeholder' | 'title' | 'text' | 'class' | 'href'
  | 'parent' | 'position' | 'absolute';

// 仅影响 best 的选择，不改变候选集合的构成。
export interface GenerateOptions {
  /** 为 true 时排除基于文字(text)的候选，改用结构/href/位置定位。 */
  structuralOnly?: boolean;
  /** 结构化模式下"往上查找 N 个父级"的锚点深度；0 = 自动（不指定）。 */
  structuralDepth?: number;
}

export type ValidationStatus = 'unique' | 'multiple' | 'none' | 'error';

export interface ValidationResult {
  status: ValidationStatus;
  count: number;
  matchesTarget: boolean;
}

export type ShadowSelectorKind =
  | 'css'
  | 'document-relative-xpath'
  | 'document-absolute-xpath'
  | 'shadow-root-relative-xpath';

export interface ShadowCandidate {
  selector: string;
  kind: ShadowSelectorKind;
  validation?: ValidationResult;
}

export interface ShadowCandidates {
  xpath: ShadowCandidate | null;
  css: ShadowCandidate | null;
}
export interface Candidate {
  selector: string;
  kind: SelectorKind;
  score: number;
  reason: string;
  parentContext: boolean;
  tagExact: boolean;
  validation?: ValidationResult;
}

export interface Evaluator {
  evaluateXPath(xpath: string, target: Element): ValidationResult;
  evaluateCss(selector: string, target: Element): ValidationResult;
}

export interface LocatorChoice {
  best: Candidate | null;
  all: Candidate[];
}

export interface TargetInfo {
  tag: string;
  text: string;
  id: string | null;
  classes: string[];
}

// iframe 定位选择器的种类：CSS 选择器或 XPath。
export type FrameSelectorKind = 'css' | 'xpath';

// 单个 iframe 定位候选：含种类、选择器文本、评分与校验结果。
export interface FrameSelectorCandidate {
  kind: FrameSelectorKind;
  selector: string;
  score: number;
  validation: ValidationResult;
}

/**
 * 一级 iframe 路径段：preferred 为推荐候选，candidates 为按分数排序的完整候选列表。
 *
 * 运行时不变式：
 * - `candidates` 非空；
 * - `preferred` 即排序后的 `candidates[0]`（preferred ∈ candidates）。
 */
export interface FramePathSegment {
  preferred: FrameSelectorCandidate;
  candidates: FrameSelectorCandidate[];
}

// 无法生成结构化 iframe 路径时的受限原因。
export type FrameLimitation = 'cross-origin' | 'unlocatable';

export interface FrameInfo {
  inFrame: boolean;
  path: string;
  url: string;
  sameOrigin: boolean;
  /** 从最外层到最内层逐级描述目标元素所在 iframe 的结构化定位路径。 */
  locatorPath: FramePathSegment[];
  /** 存在时表示无法给出完整结构化路径的原因（如跨域）。 */
  limitation?: FrameLimitation;
}

export interface ShadowInfo {
  inside: boolean;
  closed: boolean;
  depth: number;
  hostTag: string;
  hostCandidates: ShadowCandidates;
  innerCandidates: ShadowCandidates;
  hostXPath: string | null;
  hostCss: string | null;
  innerXPath: string | null;
  innerCss: string | null;
}

export interface LocatorResult {
  target: TargetInfo;
  frame: FrameInfo;
  shadow: ShadowInfo;
  xpath: LocatorChoice;
  css: LocatorChoice;
}

// 面板里的祖先层级挑选条目（面包屑）。
export interface AncestorItem {
  tag: string;
  id: string | null;
  classes: string[];
  selected: boolean;
}

// 面板可选的祖先挑选配置：content 脚本持有真实 DOM 链，负责在 onPick / onStructuralChange 时重新生成。
export interface PanelPicker {
  ancestors: AncestorItem[];
  /** 当前是否为"结构化/不依赖文字"模式。 */
  structural: boolean;
  /** 结构化模式下"往上查找 N 个父级"的锚点深度；0 = 自动。 */
  structuralDepth: number;
  onPick: (index: number) => void;
  onStructuralChange: (structural: boolean, depth: number) => void;
}
