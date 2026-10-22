import type { SourceReference, SourceSnippet } from './protocol.js';
export interface SourceContentProvider { readSource(reference: SourceReference, range: { start: number; end: number }, signal?: AbortSignal): Promise<SourceSnippet | null> }
export class SnapshotSourceProvider implements SourceContentProvider {
  #snapshots = new Map<string,{content:string;language:string;sourceVersion:string;hash:string}>();
  #key(reference: SourceReference) { return JSON.stringify([reference.projectId,reference.appScopeId,reference.buildId,reference.sourceNodeId,reference.file,reference.contentHash,reference.provenance]); }
  add(reference: SourceReference, snapshot: {content:string;language:string;sourceVersion:string;hash:string}) { this.#snapshots.set(this.#key(reference), snapshot); }
  async readSource(reference: SourceReference, range: {start:number;end:number}, signal?: AbortSignal): Promise<SourceSnippet|null> {
    if (signal?.aborted) throw signal.reason ?? new DOMException('Aborted','AbortError');
    const snapshot=this.#snapshots.get(this.#key(reference)); if (!snapshot || snapshot.hash !== reference.contentHash) return null;
    if (!Number.isSafeInteger(range.start)||!Number.isSafeInteger(range.end)||range.start<0||range.end<range.start||range.end>snapshot.content.length) throw new RangeError('Invalid or out-of-bounds source range');
    const actualHash=Array.from(new Uint8Array(await globalThis.crypto.subtle.digest('SHA-256',new TextEncoder().encode(snapshot.content))),byte=>byte.toString(16).padStart(2,'0')).join('');
    if (signal?.aborted) throw signal.reason ?? new DOMException('Aborted','AbortError');
    if (actualHash !== reference.contentHash) return null;
    return { language:snapshot.language,encoding:'utf-8',contentHash:snapshot.hash,sourceVersion:snapshot.sourceVersion,range,content:snapshot.content.slice(range.start,range.end),provenance:reference.provenance };
  }
}
export function safeProjectPath(path: string): boolean { return path.length>0 && !path.startsWith('/') && !path.includes('\\') && path.split('/').every(part => part!==''&&part!=='.'&&part!=='..'); }
