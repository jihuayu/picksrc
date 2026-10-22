import type { ComponentRecord, Evidence, SourcePosition } from './protocol.js';
import { getRuntimeInstanceId } from './components.js';

/** A host supplies a unique component token or a verified DevTools component owner.
 * getOwner() alone is a reactive scope and may be shared by production components. */
export interface SolidOwnerDescription { displayName?: string; definition?: SourcePosition; callsite?: SourcePosition }
export interface SolidRuntimeOptions {
  frameworkVersion?: string;
  /** Optional compile-time lookup. Static ownership is not a runtime instance. */
  lookup?: { getRecord(id: string): { position: SourcePosition; componentDefinition?: SourcePosition; framework?: string } | undefined };
  getOwnerForElement?: (element: Element) => object | undefined;
  /** The integration decides which reactive owners are components; signal owners are not components. */
  describeOwner?: (owner: object) => SolidOwnerDescription | undefined;
  getParentOwner?: (owner: object) => object | undefined;
  maxDepth?: number;
}
export interface SolidInspection { staticDefinition?: SourcePosition; elementDeclaration?: SourcePosition; component?: ComponentRecord; evidence: Evidence[]; diagnostics: string[] }
export interface SolidRuntimeAdapter { bind(element: Element, owner: object): () => void; inspect(element: Element): SolidInspection; dispose(): void }
const ids = new WeakMap<object, string>(); let serial = 0;
const identify = (owner: object) => { let id = ids.get(owner); if (!id) { id = `solid-${++serial}`; ids.set(owner, id); } return id; };
/**
 * No compiler plugin or global devtools hook is installed. Solid has no universal
 * DOM-to-owner field; provide an existing integration or bind a root from a ref.
 * Source positions must come from actual metadata, not a component's function name.
 */
export function createSolidRuntimeAdapter(options: SolidRuntimeOptions = {}): SolidRuntimeAdapter {
  interface Binding { owner: object; previous?: Binding; active: boolean }
  let bindings = new WeakMap<Element, Binding>(), disposed = false;
  return {
    bind(element, owner) {
      if (disposed) throw new Error('Solid runtime adapter has been disposed');
      const previous = bindings.get(element);
      const binding: Binding = { owner, active: true, ...(previous ? { previous } : {}) };
      bindings.set(element, binding);
      return () => {
        if (!binding.active) return;
        binding.active = false;
        if (bindings.get(element) !== binding) return;
        let restore = binding.previous;
        while (restore && !restore.active) restore = restore.previous;
        if (restore) bindings.set(element, restore); else bindings.delete(element);
      };
    },
    inspect(element) {
      const evidence: Evidence[] = [], diagnostics: string[] = [];
      if (disposed) return { evidence, diagnostics: ['Solid runtime adapter has been disposed.'] };
      let staticDefinition: SourcePosition | undefined, elementDeclaration: SourcePosition | undefined;
      try {
        const marker = element.getAttribute('data-picksrc-node');
        const record = marker ? options.lookup?.getRecord(marker) : undefined;
        if (record && (!record.framework || record.framework === 'solid')) {
          if (record.position.role === 'element-declaration') elementDeclaration = record.position;
          staticDefinition = record.componentDefinition;
          if (staticDefinition) evidence.push({ kind: 'solid-static-definition', source: 'Host compile-time metadata', confidence: 'hint', position: staticDefinition });
        }
      } catch { diagnostics.push('Solid static metadata lookup failed.'); }
      const staticResult = { ...(staticDefinition ? { staticDefinition } : {}), ...(elementDeclaration ? { elementDeclaration } : {}) };
      let owner: object | undefined, resolvedElement: Element | undefined;
      try { owner = options.getOwnerForElement?.(element); } catch { diagnostics.push('Solid owner lookup failed.'); }
      if (owner) resolvedElement = element;
      if (!owner) for (let node: Element | null = element; node; node = node.parentElement) { owner = bindings.get(node)?.owner; if (owner) { resolvedElement = node; break; } }
      if (!owner) return { ...staticResult, evidence, diagnostics: [...diagnostics, 'No Solid owner association was supplied; a source map alone cannot establish DOM ownership.'] };
      const maxDepth = Math.min(256, Math.max(1, options.maxDepth ?? 64));
      let current: object | undefined = owner; const seen = new Set<object>(); let componentOwner: object | undefined, description: SolidOwnerDescription | undefined; const owners: ComponentRecord['owners'] = [];
      for (let depth = 0; current && depth < maxDepth && !seen.has(current); depth++) {
        seen.add(current);
        let detail: SolidOwnerDescription | undefined;
        try { detail = options.describeOwner?.(current); } catch { diagnostics.push('Solid component metadata lookup failed.'); }
        if (detail) {
          if (!componentOwner) { componentOwner = current; description = detail; }
          else owners.push({ ...(detail.displayName ? { displayName: detail.displayName } : {}), ...(detail.callsite ? { position: { ...detail.callsite, role: 'component-callsite' } } : {}) });
        }
        try { current = options.getParentOwner?.(current); } catch { diagnostics.push('Solid owner traversal failed.'); break; }
      }
      if (!componentOwner || !description) return { ...staticResult, evidence, diagnostics: [...diagnostics, 'A reactive owner is known, but no component metadata provider identified it as a component.'] };
      const definition = description.definition ? { ...description.definition, role: 'component-definition' as const } : undefined;
      const callsite = description.callsite ? { ...description.callsite, role: 'component-callsite' as const } : undefined;
      if (definition) evidence.push({ kind: 'solid-definition', source: 'Host Solid metadata integration', confidence: 'hint', position: definition });
      if (callsite) evidence.push({ kind: 'solid-callsite', source: 'Host Solid metadata integration', confidence: 'hint', position: callsite });
      if (resolvedElement !== element) diagnostics.push('The component association belongs to a registered ancestor, not an exact element source declaration.');
      if (!definition && !callsite) diagnostics.push('Component identity is available; source location metadata is unavailable.');
      return { ...staticResult, component: { framework: 'solid', ...(options.frameworkVersion ? { frameworkVersion: options.frameworkVersion } : {}), componentInstanceId: identify(componentOwner), ...(description.displayName ? { displayName: description.displayName } : {}), ...(definition ? { definition } : {}), ...(callsite ? { callsite } : {}), owners, renderedTargets: [getRuntimeInstanceId(resolvedElement ?? element)], status: 'partial' }, evidence, diagnostics };
    },
    dispose() { disposed = true; bindings = new WeakMap(); },
  };
}
