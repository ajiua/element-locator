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

export interface FrameInfo {
  inFrame: boolean;
  path: string;
  url: string;
  sameOrigin: boolean;
}

export interface ShadowInfo {
  inside: boolean;
  closed: boolean;
  depth: number;
  hostTag: string;
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
