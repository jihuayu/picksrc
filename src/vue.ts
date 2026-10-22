import { createHash } from 'node:crypto';
import { readFileSync, realpathSync } from 'node:fs';
import path from 'node:path';
import { NodeTypes, type ElementNode, type NodeTransform } from '@vue/compiler-dom';
import { parse, version as compilerVersion } from '@vue/compiler-sfc';
import type { Plugin, ViteDevServer } from 'vite';
import type { SourcePosition, SourceReference, SourceSnippet } from './protocol.js';
import { safeProjectPath } from './source.js';

export interface VueNodeRecord {
  sourceNodeId: string;
  algorithm: 'sha256-128-v1';
  file: string;
  sourceContentHash: string;
  start: number;
  end: number;
  position: SourcePosition;
  tag: string;
  role: 'element-declaration' | 'component-callsite';
  compiler: { name: '@vue/compiler-sfc'; version: string };
}
export interface VueAdapterOptions { root: string; projectId: string; appScopeId: string; buildId: string; maxSnippetLength?: number; includeDevelopmentLocations?: boolean; enableDevelopmentSourceEndpoint?: boolean }
export interface VueAdapter {
  nodeTransform: NodeTransform;
  compilerOptions: { nodeTransforms: NodeTransform[] };
  plugin: Plugin;
  getRecords(): VueNodeRecord[];
  getRecord(sourceNodeId: string): VueNodeRecord | undefined;
  toSourceReference(sourceNodeId: string): SourceReference | undefined;
  readSource(reference: SourceReference, range?: { start: number; end: number }, signal?: AbortSignal): Promise<SourceSnippet | null>;
  invalidate(file: string): void;
}

const sha256 = (value: string) => createHash('sha256').update(value).digest('hex');
const relativeFile = (root: string, file: string) => {
  const relative = path.relative(path.resolve(root), path.resolve(file)).split(path.sep).join('/');
  return safeProjectPath(relative) ? relative : null;
};

/**
 * Create a Vue SFC compiler hook. Install `nodeTransform` through the official
 * @vitejs/plugin-vue `template.compilerOptions.nodeTransforms` option. The
 * plugin stores a private in-memory node directory; it emits no public map or
 * source manifest and never puts project paths in DOM attributes.
 */
export function createVueAdapter(options: VueAdapterOptions): VueAdapter {
  const root = realpathSync(path.resolve(options.root));
  if (!options.projectId || !options.appScopeId || !options.buildId) throw new Error('Picksrc Vue adapter requires projectId, appScopeId, and buildId');
  const byId = new Map<string, VueNodeRecord>();
  const perFile = new Map<string, { source: string; file: string; sourceHash: string; templateOffset: number; templateEnd: number; lineStarts: number[] }>();
  let isDevServer = false;

  const nodeTransform: NodeTransform = (rawNode, context) => {
    if (rawNode.type !== NodeTypes.ELEMENT) return;
    const node = rawNode as ElementNode;
    if (node.tagType === 2 /* slot outlet */ || node.tag === 'template') return;
    const absolute = path.resolve(context.filename.replace(/[?#].*$/, ''));
    if (!perFile.has(absolute)) {
      const realFile = realpathSync(absolute);
      const rel = relativeFile(root, realFile);
      if (!rel) throw new Error(`Vue source is outside the configured project root: ${absolute}`);
      const source = readFileSync(realFile, 'utf8');
      const descriptor = parse(source, { filename: realFile }).descriptor;
      if (!descriptor.template || descriptor.template.src) return;
      const lineStarts=[0]; for (let i=0;i<source.length;i++) if (source.charCodeAt(i)===10) lineStarts.push(i+1);
      perFile.set(absolute, { source, file: rel, sourceHash: sha256(source), templateOffset: descriptor.template.loc.start.offset, templateEnd: descriptor.template.loc.end.offset, lineStarts });
    }
    const fileInfo = perFile.get(absolute);
    if (!fileInfo) return;
    // Vue SFC compilation may retain offsets into the full file, while direct
    // compileTemplate() callers get offsets relative to the template block.
    // Verify the exact AST source slice against the original file to choose;
    // a same filename or same line is not enough evidence.
    const localStart=node.loc.start.offset, localEnd=node.loc.end.offset;
    const absoluteMatches=fileInfo.source.slice(localStart,localEnd)===node.loc.source;
    const blockStart=fileInfo.templateOffset+localStart, blockEnd=fileInfo.templateOffset+localEnd;
    const blockMatches=fileInfo.source.slice(blockStart,blockEnd)===node.loc.source;
    const start=absoluteMatches ? localStart : blockStart;
    const end=absoluteMatches ? localEnd : blockEnd;
    if ((!absoluteMatches && !blockMatches) || start < fileInfo.templateOffset || end > fileInfo.templateEnd || end <= start) throw new Error(`Vue compiler node source could not be verified against ${fileInfo.file}`);
    const role = node.tagType === 1 ? 'component-callsite' : 'element-declaration';
    const toLineColumn=(offset:number) => { let low=0, high=fileInfo.lineStarts.length; while(low+1<high){const middle=(low+high)>>>1;if(fileInfo.lineStarts[middle]!<=offset)low=middle;else high=middle;} return {line:low+1,column:offset-fileInfo.lineStarts[low]!+1,offset}; };
    const position: SourcePosition = {file:fileInfo.file,start:toLineColumn(start),end:toLineColumn(end),role,precision:'exact-range'};
    const identity = ['sha256-128-v1', options.projectId, fileInfo.file, fileInfo.sourceHash, start, end, node.tag, role].join('\0');
    const sourceNodeId = sha256(identity).slice(0, 32);
    const record: VueNodeRecord = { sourceNodeId, algorithm: 'sha256-128-v1', file: fileInfo.file, sourceContentHash: fileInfo.sourceHash, start, end, position, tag: node.tag, role, compiler: { name: '@vue/compiler-sfc', version: compilerVersion } };
    const previous = byId.get(sourceNodeId);
    if (previous && (previous.file !== record.file || previous.start !== record.start || previous.end !== record.end)) throw new Error(`Picksrc source node ID collision: ${sourceNodeId}`);
    byId.set(sourceNodeId, record);
    const addAttribute=(name:string, content:string) => {
      const existing=node.props.find(p=>p.type===NodeTypes.ATTRIBUTE&&p.name===name);
      if(existing?.type===NodeTypes.ATTRIBUTE) existing.value={type:NodeTypes.TEXT,content,loc:node.loc};
      else node.props.push({type:NodeTypes.ATTRIBUTE,name,nameLoc:node.loc,value:{type:NodeTypes.TEXT,content,loc:node.loc},loc:node.loc});
    };
    addAttribute('data-picksrc-node',sourceNodeId);
    if (isDevServer && options.includeDevelopmentLocations && role === 'component-callsite') {
      addAttribute('data-picksrc-location',JSON.stringify(position));
    }
  };

  const invalidate = (file: string) => { const absolute = path.resolve(file); perFile.delete(absolute); for (const [id, record] of byId) if (path.resolve(root, record.file) === absolute) byId.delete(id); };
  const plugin: Plugin = {
    name: 'picksrc:vue',
    enforce: 'post',
    configResolved(config) { isDevServer = config.command === 'serve'; if (options.enableDevelopmentSourceEndpoint && !isDevServer) throw new Error('The Picksrc Vue source endpoint is development-only.'); },
    configureServer(server: ViteDevServer) {
      if (!options.enableDevelopmentSourceEndpoint) return;
      server.middlewares.use(async (request, response, next) => {
        if (!request.url?.startsWith('/__picksrc/source')) return next();
        response.setHeader('Cache-Control', 'no-store');
        const origin = request.headers.origin;
        const localOrigins = new Set((server.resolvedUrls?.local ?? []).flatMap(address => { try { return [new URL(address).origin]; } catch { return []; } }));
        if (request.method !== 'POST' || request.headers['sec-fetch-site'] !== 'same-origin' || !origin || !localOrigins.has(origin)) { response.statusCode = 403; response.end(); return; }
        try {
          const url = new URL(request.url, origin);
          if (url.pathname !== '/__picksrc/source') { response.statusCode = 404; response.end(); return; }
          const id = url.searchParams.get('node');
          if (!id || !/^[a-f0-9]{32}$/.test(id)) { response.statusCode = 400; response.end(); return; }
          const reference = toSourceReference(id); if (!reference) { response.statusCode = 404; response.end(); return; }
          const node = byId.get(id)!;
          const start = url.searchParams.has('start') ? Number(url.searchParams.get('start')) : node.start;
          const end = url.searchParams.has('end') ? Number(url.searchParams.get('end')) : node.end;
          const snippet = await readSource(reference, { start, end });
          if (!snippet) { response.statusCode = 409; response.end(); return; }
          response.statusCode = 200; response.setHeader('Content-Type', 'application/json; charset=utf-8'); response.end(JSON.stringify({ file: node.file, position: node.position, snippet }));
        } catch { response.statusCode = 400; response.end(); }
      });
    },
    generateBundle(_output, bundle) {
      const emitted = Object.values(bundle).map(item => item.type === 'chunk' ? item.code : typeof item.source === 'string' ? item.source : new TextDecoder().decode(item.source)).join('\n');
      for (const [id] of byId) if (!emitted.includes(id)) byId.delete(id);
    },
    handleHotUpdate(ctx) { invalidate(ctx.file); },
  };
  const getRecords = () => [...byId.values()].sort((a, b) => a.file.localeCompare(b.file) || a.start - b.start);
  const getRecord = (id: string) => byId.get(id);
  const toSourceReference = (id: string): SourceReference | undefined => {
    const record = byId.get(id); if (!record) return;
    return { projectId: options.projectId, appScopeId: options.appScopeId, buildId: options.buildId, sourceNodeId: id, file: record.file, contentHash: record.sourceContentHash, provenance: 'build-snapshot' };
  };
  const maxSnippetLength = options.maxSnippetLength ?? 16_384;
  const readSource = async (reference: SourceReference, range = { start: byId.get(reference.sourceNodeId)?.start ?? -1, end: byId.get(reference.sourceNodeId)?.end ?? -1 }, signal?: AbortSignal): Promise<SourceSnippet | null> => {
    if (signal?.aborted) throw signal.reason ?? new DOMException('Aborted', 'AbortError');
    const record = byId.get(reference.sourceNodeId);
    if (!record || reference.projectId !== options.projectId || reference.appScopeId !== options.appScopeId || reference.buildId !== options.buildId || reference.file !== record.file || reference.contentHash !== record.sourceContentHash || reference.provenance !== 'build-snapshot') return null;
    if (!Number.isSafeInteger(range.start) || !Number.isSafeInteger(range.end) || range.start < record.start || range.end > record.end || range.end < range.start) throw new RangeError('Requested range is outside the verified Vue source node');
    if (range.end - range.start > maxSnippetLength) throw new RangeError('Requested source snippet exceeds the configured size limit');
    const realRoot = root;
    const resolved = path.resolve(root, record.file);
    if (relativeFile(root, resolved) !== record.file || realpathSync(resolved) !== resolved || realpathSync(resolved).startsWith(`${realRoot}${path.sep}`) === false) return null;
    const source = readFileSync(resolved, 'utf8');
    if (sha256(source) !== record.sourceContentHash) return null;
    if (signal?.aborted) throw signal.reason ?? new DOMException('Aborted', 'AbortError');
    const content = source.slice(range.start, range.end);
    return { language: 'vue', encoding: 'utf-8', contentHash: sha256(content), sourceVersion: `${options.buildId}:${record.sourceContentHash}`, range, content, provenance: 'build-snapshot' };
  };
  return { nodeTransform, compilerOptions: { nodeTransforms: [nodeTransform] }, plugin, getRecords, getRecord, toSourceReference, readSource, invalidate };
}

