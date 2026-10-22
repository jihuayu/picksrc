import type { Plugin } from 'vite';
export interface PicksrcViteOptions { include?: RegExp; projectId: string; buildId: string; appScopeId: string }
/** Vite integration placeholder: production instrumentation is withheld until a framework compiler adapter is explicitly selected. */
export function picksrcVite(options: PicksrcViteOptions): Plugin {
  return { name:'picksrc:vite', enforce:'pre', apply:'serve', configResolved(config) { if (!options.projectId || !options.buildId || !options.appScopeId) throw new Error('Picksrc requires explicit project, app scope, and build IDs'); if (config.command === 'build') throw new Error('Picksrc production instrumentation requires a validated framework adapter; no safe generic transform is available yet.'); }, transform(_code, id) { if (options.include && !options.include.test(id)) return null; return null; } };
}
