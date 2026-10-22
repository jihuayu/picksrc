import type { ComponentRecord, SourcePosition } from './protocol.js';

/** Host/runtime adapters attach verified component evidence to a rendered root element. */
const records = new WeakMap<Element, ComponentRecord>();
export function registerComponent(element: Element, record: ComponentRecord): () => void {
  const previous = records.get(element);
  records.set(element, record);
  let disposed = false;
  return () => { if (disposed) return; disposed = true; if (records.get(element) === record) { if (previous) records.set(element, previous); else records.delete(element); } };
}
export function findComponent(element: Element): ComponentRecord | undefined {
  for (let node: Element | null = element; node; node = node.parentElement) { const record = records.get(node); if (record) return record; }
  return undefined;
}
export function fileOnlyPosition(file: string, role: SourcePosition['role']): SourcePosition { return { file, role, precision: 'file-only' }; }
