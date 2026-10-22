import { getCurrentInstance, onBeforeUnmount, onMounted, version as vueVersion } from 'vue';
import type { ComponentRecord, SourcePosition } from './protocol.js';
import { registerComponent, getRuntimeInstanceId } from './components.js';
import type { VueNodeRecord } from './vue.js';

export interface VueRuntimeCallsiteLookup { getRecord?(sourceNodeId: string): VueNodeRecord | undefined }
export interface VueRuntimeOptions { resolveDefinition?: (frameworkFile: string) => SourcePosition | undefined }
const componentIds = new WeakMap<object, string>(); let componentSerial = 0;

/** Call from a Vue component's setup() to bind its public VNode callsite marker to the rendered DOM root. */
export function useVueComponentBridge(adapter: VueRuntimeCallsiteLookup, options: VueRuntimeOptions = {}): void {
  const instance = getCurrentInstance();
  if (!instance) throw new Error('useVueComponentBridge must be called from Vue setup()');
  let id = componentIds.get(instance); if (!id) { id = `vue-${++componentSerial}`; componentIds.set(instance, id); }
  let dispose: (() => void) | undefined;
  onMounted(() => {
    const el = instance.vnode.el;
    if (!el || el.nodeType !== 1) return;
    const element = el as Element;
    const marker = instance.vnode.props?.['data-picksrc-node'];
    const call = typeof marker === 'string' ? adapter.getRecord?.(marker) : undefined;
    let developmentCallsite: SourcePosition | undefined;
    const locationHint=instance.vnode.props?.['data-picksrc-location'];
    if (typeof locationHint==='string') try { const parsed=JSON.parse(locationHint) as SourcePosition; if (parsed.role==='component-callsite' && parsed.precision==='exact-range' && typeof parsed.file==='string' && parsed.start && parsed.end && Number.isSafeInteger(parsed.start.offset) && Number.isSafeInteger(parsed.end.offset) && parsed.end.offset! >= parsed.start.offset!) developmentCallsite=parsed; } catch { /* Invalid page-controlled hints are ignored. */ }
    const rawFile = (instance.type as { __file?: unknown }).__file;
    const definition = typeof rawFile === 'string' ? options.resolveDefinition?.(rawFile) : undefined;
    const displayName = typeof instance.type === 'object' && 'name' in instance.type && typeof instance.type.name === 'string' ? instance.type.name : undefined;
    const component: ComponentRecord = {
      framework: 'vue', frameworkVersion: vueVersion, componentInstanceId: id,
      ...(displayName ? { displayName } : {}),
      ...(definition ? { definition } : {}),
      ...(call?.role === 'component-callsite' ? { callsite: call.position } : developmentCallsite ? { callsite: developmentCallsite } : {}),
      ...(call?.role === 'component-callsite' ? { callsiteSourceNodeId: call.sourceNodeId } : typeof marker === 'string' && developmentCallsite ? { callsiteSourceNodeId: marker } : {}),
      ...(call?.role === 'component-callsite' ? { callsiteVerified: true } : {}),
      owners: [], renderedTargets: [getRuntimeInstanceId(element)], status: call || definition ? 'partial' : 'unavailable',
    };
    dispose = registerComponent(element, component);
  });
  onBeforeUnmount(() => dispose?.());
}
