import type { SourceReference, SourceSnippet } from './protocol.js';
export interface SourceContentProvider { readSource(reference: SourceReference, range: { start: number; end: number }, signal?: AbortSignal): Promise<SourceSnippet | null> }
export class SnapshotSourceProvider implements SourceContentProvider {
  #snapshots = new Map<string,{content:string;language:string;sourceVersion:string;hash:string}>();
  add(reference: SourceReference, snapshot: {content:string;language:string;sourceVersion:string;hash:string}) { this.#snapshots.set(`${reference.buildId}:${reference.contentHash}`, snapshot); }
  async readSource(reference: SourceReference, range: {start:number;end:number}, signal?: AbortSignal): Promise<SourceSnippet|null> {
    if (signal?.aborted) throw signal.reason ?? new DOMException('Aborted','AbortError');
    const snapshot=this.#snapshots.get(`${reference.buildId}:${reference.contentHash}`); if (!snapshot || snapshot.hash !== reference.contentHash) return null;
    if (!Number.isSafeInteger(range.start)||!Number.isSafeInteger(range.end)||range.start<0||range.end<range.start||range.end>snapshot.content.length) throw new RangeError('Invalid or out-of-bounds source range');
    return { language:snapshot.language,encoding:'utf-8',contentHash:snapshot.hash,sourceVersion:snapshot.sourceVersion,range,content:snapshot.content.slice(range.start,range.end),provenance:reference.provenance };
  }
}
export function safeProjectPath(path: string): boolean { return path.length>0 && !path.startsWith('/') && !path.includes('\\') && path.split('/').every(part => part!==''&&part!=='.'&&part!=='..'); }
