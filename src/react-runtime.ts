import type { ComponentRecord, Evidence, SourcePosition } from './protocol.js';
import { getRuntimeInstanceId } from './components.js';

/** Source positions reported by a renderer are hints, never proof of an AST range. */
export interface ReactSourceLocation { file: string; line: number; column: number; origin: 'debug-source' | 'debug-stack' }
export interface ReactRuntimeOptions {
  /** Integrate an already installed DevTools renderer without installing a global hook. */
  findFiberByHostInstance?: (element: Element) => unknown;
  frameworkVersion?: string;
  lookup?: { getRecord(id: string): { position: SourcePosition; framework?: string } | undefined };
  /** Explicit host mapping; this adapter neither fetches scripts nor downloads maps. */
  mapLocation?: (location: ReactSourceLocation, role: SourcePosition['role']) => SourcePosition | undefined;
  /** An extension may resolve function locations using its own privileged integration. */
  resolveDefinition?: (componentType: unknown) => SourcePosition | undefined;
  maxDepth?: number;
}
export interface ReactInspection { component?: ComponentRecord; elementDeclaration?: SourcePosition; evidence: Evidence[]; diagnostics: string[] }
type Fiber = Record<string, unknown>;
const ids = new WeakMap<object, string>(); let serial = 0;
function object(value: unknown): Fiber | undefined { return value !== null && typeof value === 'object' ? value as Fiber : undefined; }
function read(value: unknown, key: string): unknown { try { return (value as Record<string, unknown> | null)?.[key]; } catch { return undefined; } }
function fiberId(value: Fiber): string { const alternate = object(read(value, 'alternate')); const previous = ids.get(value) ?? (alternate && ids.get(alternate)); const id = previous ?? `react-${++serial}`; ids.set(value, id); if (alternate) ids.set(alternate, id); return id; }
function componentType(fiber: Fiber): unknown { const type = read(fiber, 'type'); return typeof type === 'function' || (object(type) && (typeof read(type, 'render') === 'function' || read(type, '$$typeof') !== undefined)) ? type : undefined; }
function displayName(type: unknown): string | undefined { const name = read(type, 'displayName') ?? read(type, 'name') ?? read(read(type, 'render'), 'displayName') ?? read(read(type, 'render'), 'name'); return typeof name === 'string' && name.length > 0 ? name.slice(0, 200) : undefined; }
/** Resolve against the committed root, not the DOM's possibly stale alternate pointer.
 * Walking actual child links also handles bailout subtrees with stale return links. */
function committedTree(fiber: Fiber, limit = 20000): { current?: Fiber; parent: (node: Fiber) => Fiber | undefined; resolve: (node: Fiber) => Fiber | undefined } {
  const seen = new Set<Fiber>(); let top: Fiber | undefined = fiber;
  while (top && !seen.has(top) && seen.size < 256) {
    seen.add(top);
    if (read(top, 'tag') === 3) break;
    const next = object(read(top, 'return')); if (!next) break; top = next;
  }
  const root = top && read(top, 'tag') === 3 ? object(read(read(top, 'stateNode'), 'current')) : undefined;
  if (!root) {
    // An injected renderer may supply a minimal non-alternating tree. Never guess
    // between alternates when its committed root cannot be established.
    const current = read(fiber, 'alternate') || typeof read(fiber, 'tag') === 'number' ? undefined : fiber;
    return { ...(current ? {current} : {}), parent: node => {const parent=object(read(node,'return'));return parent&&!read(parent,'alternate')?parent:undefined;}, resolve: node => read(node, 'alternate') ? undefined : node };
  }
  const parents = new Map<Fiber, Fiber>(), canonical = new Map<Fiber, Fiber>();
  const pending: Array<{node: Fiber; parent?: Fiber}> = [{node:root}]; seen.clear();
  while (pending.length && seen.size < limit) {
    const item = pending.pop()!, node = item.node; if (seen.has(node)) continue; seen.add(node);
    canonical.set(node,node); const alternate=object(read(node,'alternate')); if(alternate) canonical.set(alternate,node);
    if(item.parent)parents.set(node,item.parent);
    const sibling=object(read(node,'sibling')),child=object(read(node,'child'));
    if(sibling)pending.push({node:sibling,...(item.parent?{parent:item.parent}:{})});
    if(child)pending.push({node:child,parent:node});
  }
  const current = pending.length ? undefined : canonical.get(fiber);
  return { ...(current ? {current} : {}), parent: node => parents.get(node), resolve: node => canonical.get(node) };
}
function source(fiber: Fiber): ReactSourceLocation | undefined {
  const debug = read(fiber, '_debugSource');
  const file = read(debug, 'fileName'), line = read(debug, 'lineNumber'), column = read(debug, 'columnNumber');
  if (typeof file === 'string' && typeof line === 'number' && Number.isSafeInteger(line) && line > 0) return { file, line, column: typeof column === 'number' && Number.isSafeInteger(column) && column > 0 ? column : 1, origin: 'debug-source' };
  const stack = read(read(fiber, '_debugStack'), 'stack');
  if (typeof stack !== 'string') return undefined;
  // React 19 development stacks may include JSX-runtime frames before the user frame.
  // Ignore known runtime files; unresolved stack locations remain generated-code hints.
  for (const entry of stack.slice(0, 32_768).split('\n').slice(1, 40)) {
    const match = entry.match(/(?:\(|@|\s)((?:https?:\/\/|file:\/\/|\/|[A-Za-z]:[\\/])[^\n]*?):(\d+):(\d+)\)?$/);
    if (!match) continue;
    const file = match[1]!, line = Number(match[2]), column = Number(match[3]);
    if (/react[-_.](?:jsx|dom)|react-jsx|node_modules\/\.vite\/deps\/react|react_stack_bottom_frame/.test(file)) continue;
    if (Number.isSafeInteger(line) && line > 0 && Number.isSafeInteger(column) && column > 0) return { file, line, column, origin: 'debug-stack' };
  }
  return undefined;
}
function locate(fiber: Fiber, role: SourcePosition['role'], options: ReactRuntimeOptions): SourcePosition | undefined {
  const marker = read(read(fiber, 'memoizedProps'), 'data-picksrc-node');
  if (typeof marker === 'string') {
    const record = options.lookup?.getRecord(marker);
    // Props may be spread onto a DOM node. Never relabel a callsite as an element.
    if (record && (!record.framework || record.framework === 'react') && record.position.role === role) return record.position;
  }
  const location = source(fiber); if (!location) return undefined;
  const mapped = options.mapLocation?.(location, role);
  if (mapped) return { ...mapped, role };
  // A stack frame names generated code. Do not put it into an original-source field.
  if (location.origin === 'debug-stack') return undefined;
  return { file: location.file, start: { line: location.line, column: location.column }, role, precision: 'line-only' };
}
/** Inspect React's existing renderer data. No Picksrc build transform is required. */
export function inspectReactElement(element: Element, options: ReactRuntimeOptions = {}): ReactInspection {
  const diagnostics: string[] = [], evidence: Evidence[] = [];
  let host: Fiber | undefined;
  try {
    host = object(options.findFiberByHostInstance?.(element));
    if (!host) { const key = Object.getOwnPropertyNames(element).find(name => name.startsWith('__reactFiber$') || name.startsWith('__reactInternalInstance$')); if (key) host = object(read(element, key)); }
  } catch { diagnostics.push('React renderer lookup failed.'); }
  if (!host) return { evidence, diagnostics: [...diagnostics, 'No existing React Fiber association was found.'] };
  const tree = committedTree(host);
  if (!tree.current) return {evidence, diagnostics:[...diagnostics, 'The committed React Fiber could not be established; stale or detached metadata was ignored.']};
  host = tree.current;
  const maxDepth = Math.min(256, Math.max(1, options.maxDepth ?? 64));
  const seen = new Set<object>(); let node: Fiber | undefined = host, componentFiber: Fiber | undefined;
  for (let depth = 0; node && depth < maxDepth && !seen.has(node); depth++) { seen.add(node); if (componentType(node)) { componentFiber = node; break; } node = tree.parent(node); }
  const safeLocate = (fiber: Fiber, role: SourcePosition['role']) => { try { return locate(fiber, role, options); } catch { diagnostics.push(`Source mapping failed for ${role}.`); return undefined; } };
  const elementDeclaration = typeof read(host, 'type') === 'string' ? safeLocate(host, 'element-declaration') : undefined;
  const hostSource = source(host);
  if (hostSource?.origin === 'debug-stack') evidence.push({ kind: 'react-generated-stack', source: 'React development Fiber', confidence: 'hint', details: { file: hostSource.file, line: hostSource.line, column: hostSource.column } });
  if (elementDeclaration) evidence.push({ kind: 'react-element-location', source: 'React development metadata', confidence: 'hint', position: elementDeclaration });
  if (!componentFiber) return { ...(elementDeclaration ? { elementDeclaration } : {}), evidence, diagnostics: [...diagnostics, 'No component owner was found within the traversal limit.'] };
  const type = componentType(componentFiber), name = displayName(type), callsite = safeLocate(componentFiber, 'component-callsite');
  let definition: SourcePosition | undefined;
  try { const resolved = options.resolveDefinition?.(type); if (resolved) definition = { ...resolved, role: 'component-definition' }; } catch { diagnostics.push('Component definition resolver failed.'); }
  const owners: ComponentRecord['owners'] = []; seen.clear(); node = object(read(componentFiber, '_debugOwner')); if(node)node=tree.resolve(node);
  for (let depth = 0; node && depth < maxDepth && !seen.has(node); depth++) { seen.add(node); const ownerName = displayName(componentType(node)); const position = safeLocate(node, 'component-callsite'); owners.push({ ...(ownerName ? { displayName: ownerName } : {}), ...(position ? { position } : {}) }); node = object(read(node, '_debugOwner')); if(node)node=tree.resolve(node); }
  if (callsite) evidence.push({ kind: 'react-component-callsite', source: 'React development metadata', confidence: 'hint', position: callsite });
  if (definition) evidence.push({ kind: 'react-component-definition', source: 'Host definition resolver', confidence: 'hint', position: definition });
  if (!elementDeclaration) diagnostics.push('Element source is unavailable; component metadata does not establish an exact element range.');
  if (!callsite && !definition) diagnostics.push('React runtime identity is available, but original source metadata is unavailable.');
  const component: ComponentRecord = { framework: 'react', ...(options.frameworkVersion ? { frameworkVersion: options.frameworkVersion } : {}), componentInstanceId: fiberId(componentFiber), ...(name ? { displayName: name } : {}), ...(callsite ? { callsite } : {}), ...(definition ? { definition } : {}), owners, renderedTargets: [getRuntimeInstanceId(element)], status: 'partial' };
  return { component, ...(elementDeclaration ? { elementDeclaration } : {}), evidence, diagnostics };
}
