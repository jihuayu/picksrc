import { TraceMap, originalPositionFor, sourceContentFor, type EncodedSourceMap } from '@jridgewell/trace-mapping';
import type { SourcePosition } from './protocol.js';
/** Maps a known generated position. A map alone cannot associate a DOM element with code. */
export function createSourceMapResolver(map: EncodedSourceMap, mapUrl?: string) {
  const trace = new TraceMap(map, mapUrl);
  return {
    resolve(line: number, column: number, role: SourcePosition['role'] = 'unknown'): { position: SourcePosition; content?: string } | undefined {
      if (!Number.isSafeInteger(line) || line < 1 || !Number.isSafeInteger(column) || column < 1) return;
      const original = originalPositionFor(trace, {line, column: column - 1});
      if (original.source === null || original.line === null || original.column === null) return;
      const content = sourceContentFor(trace, original.source);
      return {position:{file:original.source,start:{line:original.line,column:original.column+1},role,precision:'line-only'}, ...(content === null ? {} : {content})};
    }
  };
}
