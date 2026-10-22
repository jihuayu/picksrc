export const API_VERSION = '0.1' as const;
export type Precision = 'exact-range' | 'line-only' | 'file-only' | 'unknown';
export type ResolutionStatus = 'resolved' | 'partial' | 'ambiguous' | 'unavailable' | 'stale' | 'error';
export type PositionRole = 'element-declaration' | 'component-callsite' | 'component-definition' | 'ancestor' | 'file-only' | 'unknown';
export interface SourcePosition { file: string; start?: { line: number; column: number; offset?: number }; end?: { line: number; column: number; offset?: number }; role: PositionRole; precision: Precision }
export interface Evidence { kind: string; source: string; confidence: 'verified' | 'hint'; position?: SourcePosition; details?: Record<string, string | number | boolean> }
export interface ScopeBuild { projectId: string; appScopeId: string; buildId: string; scopeGeneration: number; moduleGeneration: number }
export interface TargetRef { runtimeInstanceId: string; selector?: string; tagName: string }
export interface SelectionResult { apiVersion: typeof API_VERSION; selectionId: string; requestedTarget: TargetRef; resolvedTarget: TargetRef; scope: ScopeBuild; status: ResolutionStatus; precision: Precision; evidence: Evidence[]; diagnostics: string[]; elementDeclaration?: SourcePosition; component?: ComponentRecord }
export interface ComponentRecord { framework: string; frameworkVersion?: string; componentInstanceId?: string; displayName?: string; definition?: SourcePosition; definitionSourceNodeId?: string; callsite?: SourcePosition; callsiteSourceNodeId?: string; callsiteVerified?: boolean; owners: Array<{ displayName?: string; position?: SourcePosition }>; renderedTargets: string[]; status: ResolutionStatus }
export interface SourceReference { projectId: string; appScopeId: string; buildId: string; sourceNodeId: string; file: string; contentHash: string; provenance: 'sources-content' | 'build-snapshot' | 'authorized-repository' }
export interface SourceSnippet { language: string; encoding: 'utf-8'; contentHash: string; sourceVersion: string; range: { start: number; end: number }; content: string; provenance: SourceReference['provenance'] }
export function isSourcePosition(value: unknown): value is SourcePosition {
  if (!value || typeof value !== 'object') return false;
  const p = value as Partial<SourcePosition>;
  return typeof p.file === 'string' && ['element-declaration','component-callsite','component-definition','ancestor','file-only','unknown'].includes(p.role ?? '') && ['exact-range','line-only','file-only','unknown'].includes(p.precision ?? '');
}
