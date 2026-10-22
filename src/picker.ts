import type { ScopeBuild, SelectionResult, TargetRef } from './protocol.js';
export interface PickerOptions { root?: Document | ShadowRoot; scope: ScopeBuild; excluded?: (element: Element) => boolean }
export interface PickerSession { start(): void; stop(): void; navigate(direction: 'parent'|'child'|'next'|'previous'): Element | null; getSelected(): Element | null; confirm(): SelectionResult | null }
const ids = new WeakMap<Element, string>(); let serial = 0;
function instanceId(element: Element) { let id = ids.get(element); if (!id) { id = `el-${++serial}`; ids.set(element,id); } return id; }
export function createPicker(options: PickerOptions, onHover: (element: Element | null) => void = () => {}): PickerSession {
  const root = options.root ?? document; let current: Element | null = null, active = false; const abort = new AbortController();
  const pick = (event: Event) => { if (!active) return; const path = event.composedPath(); const hit = path.find((node): node is Element => node instanceof Element && !node.hasAttribute('data-picksrc-overlay') && !options.excluded?.(node)) ?? null; if (hit !== current) { current = hit; onHover(hit); } };
  const start = () => { if (active) return; active = true; root.addEventListener('pointermove', pick, { capture: true, signal: abort.signal }); root.addEventListener('pointerdown', pick, { capture: true, signal: abort.signal }); };
  const stop = () => { if (!active) return; active = false; abort.abort(); onHover(null); current = null; };
  const navigate = (direction: 'parent'|'child'|'next'|'previous') => { if (!current) return null; const next = direction === 'parent' ? current.parentElement : direction === 'child' ? current.firstElementChild : direction === 'next' ? current.nextElementSibling : current.previousElementSibling; if (next && !options.excluded?.(next)) { current = next; onHover(next); } return current; };
  return { start, stop, navigate, getSelected: () => current, confirm: () => { if (!current) return null; const target: TargetRef = { runtimeInstanceId: instanceId(current), tagName: current.tagName.toLowerCase() }; return { apiVersion:'0.1', selectionId: `sel-${crypto.randomUUID()}`, requestedTarget: target, resolvedTarget: target, scope: options.scope, status:'unavailable', precision:'unknown', evidence:[], diagnostics:['No source evidence provider registered; DOM selection remains available.'] }; } };
}
export function createOverlay(document: Document = globalThis.document) {
  let box: HTMLDivElement | undefined;
  const clear = () => { box?.remove(); box = undefined; };
  return { render(element: Element | null) { clear(); if (!element) return; box = document.createElement('div'); box.dataset.picksrcOverlay = ''; Object.assign(box.style,{position:'fixed',zIndex:'2147483647',pointerEvents:'none',border:'2px solid #6d5efc',background:'rgba(109,94,252,.08)',boxSizing:'border-box'}); document.documentElement.append(box); const rect = element.getBoundingClientRect(); Object.assign(box.style,{left:`${rect.left}px`,top:`${rect.top}px`,width:`${rect.width}px`,height:`${rect.height}px`}); }, clear, destroy: clear };
}
