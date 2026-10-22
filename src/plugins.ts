export type PluginKind = 'picker'|'renderer'|'marker-reader'|'runtime-adapter'|'source-resolver'|'component-resolver'|'source-content-provider'|'action';
export interface PluginDescriptor { id: string; version: string; apiVersion: string; kind: PluginKind; requires?: string[]; provides?: string[]; environment: Array<'browser'|'server'|'build'>; setup(context: PluginContext): void | (() => void | Promise<void>) | Promise<void | (() => void | Promise<void>)> }
export interface PluginContext { signal: AbortSignal; diagnose(message: string, error?: unknown): void }
export class PluginRegistry {
  #plugins = new Map<string, PluginDescriptor>(); #cleanups: Array<() => void | Promise<void>> = []; #controller?: AbortController; #active = false;
  register(plugin: PluginDescriptor): this { if (this.#active) throw new Error('Cannot register plugins after start'); if (this.#plugins.has(plugin.id)) throw new Error(`Duplicate plugin id: ${plugin.id}`); this.#plugins.set(plugin.id, plugin); return this; }
  async start(diagnose: (message: string, error?: unknown) => void = () => {}): Promise<void> {
    if (this.#active) return;
    const sorted = this.#sort(); this.#controller = new AbortController();
    try { for (const p of sorted) { const cleanup = await p.setup({ signal: this.#controller.signal, diagnose }); if (cleanup) this.#cleanups.push(cleanup); } this.#active = true; }
    catch (error) { await this.#disposePartial(diagnose); throw error; }
  }
  async dispose(): Promise<void> { this.#controller?.abort(); await this.#disposePartial(() => {}); this.#active = false; }
  #sort(): PluginDescriptor[] {
    const output: PluginDescriptor[] = [], marks = new Map<string, number>();
    const visit = (p: PluginDescriptor) => { const m = marks.get(p.id) ?? 0; if (m === 1) throw new Error(`Plugin dependency cycle at ${p.id}`); if (m === 2) return; marks.set(p.id,1); for (const id of p.requires ?? []) { const dep = this.#plugins.get(id); if (!dep) throw new Error(`Missing plugin dependency ${id} required by ${p.id}`); visit(dep); } marks.set(p.id,2); output.push(p); };
    for (const p of this.#plugins.values()) { if (p.apiVersion !== '0.1') throw new Error(`Incompatible plugin API ${p.apiVersion}: ${p.id}`); visit(p); } return output;
  }
  async #disposePartial(diagnose: (message: string, error?: unknown) => void) { for (const cleanup of this.#cleanups.splice(0).reverse()) try { await cleanup(); } catch (e) { diagnose('Plugin cleanup failed', e); } }
}
