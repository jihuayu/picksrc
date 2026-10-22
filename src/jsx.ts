import { createHash } from 'node:crypto';
import { readFileSync, realpathSync } from 'node:fs';
import path from 'node:path';
import { parse } from '@babel/parser';
import traverseModule, {type TraverseOptions} from '@babel/traverse';
import * as t from '@babel/types';
import MagicString from 'magic-string';
import type { Plugin } from 'vite';
import type { SourcePosition, SourceReference, SourceSnippet } from './protocol.js';
import { safeProjectPath } from './source.js';
const traverse = ((traverseModule as unknown as {default?: unknown}).default ?? traverseModule) as (node: t.Node, options: TraverseOptions) => void;
const hash = (text:string) => createHash('sha256').update(text).digest('hex');
export interface JsxNodeRecord {
  sourceNodeId:string; file:string; sourceContentHash:string; start:number; end:number;
  position:SourcePosition; tag:string; role:'element-declaration'|'component-callsite'|'component-definition';
  framework:'react'|'solid'; componentDefinition?:SourcePosition; definitionSourceNodeId?:string;
}
export interface JsxAdapterOptions {
  framework:'react'|'solid'; root:string; projectId:string; appScopeId:string; buildId:string;
  enableDevelopmentSourceEndpoint?:boolean; maxSnippetLength?:number; include?:RegExp;
}
/** Optional precise JSX instrumentation. Runtime inspection itself does not require this adapter. */
export function createJsxAdapter(options:JsxAdapterOptions) {
  const root=realpathSync(path.resolve(options.root));
  if(!options.projectId||!options.appScopeId||!options.buildId) throw new Error('Explicit project, scope and build required');
  const records=new Map<string,JsxNodeRecord>();
  const position=(source:string,file:string,start:number,end:number,role:JsxNodeRecord['role']):SourcePosition=>{
    const point=(offset:number)=>{const before=source.slice(0,offset),lines=before.split('\n');return {line:lines.length,column:lines.at(-1)!.length+1,offset};};
    return {file,start:point(start),end:point(end),role,precision:'exact-range'};
  };
  const invalidate=(file:string)=>{for(const [id,r] of records)if(path.resolve(root,r.file)===path.resolve(file))records.delete(id);};
  const instrument=(source:string,filename:string)=>{
    const absolute=path.resolve(filename),real=realpathSync(absolute),file=path.relative(root,real).split(path.sep).join('/');
    if(real!==absolute||!safeProjectPath(file))throw new Error('Source outside project root or symlink');
    if(readFileSync(real,'utf8')!==source)throw new Error('JSX transform requires original source bytes');
    invalidate(absolute);
    const contentHash=hash(source), ast=parse(source,{sourceType:'module',plugins:['jsx','typescript']}), output=new MagicString(source);
    const make=(node:t.Node,tag:string,role:JsxNodeRecord['role'])=>{
      if(node.start==null||node.end==null)throw new Error('AST range unavailable');
      const sourceNodeId=hash(['jsx-v1',options.framework,options.projectId,file,contentHash,node.start,node.end,role].join('\0')).slice(0,32);
      const record:JsxNodeRecord={sourceNodeId,file,sourceContentHash:contentHash,start:node.start,end:node.end,position:position(source,file,node.start,node.end,role),tag,role,framework:options.framework};
      const previous=records.get(sourceNodeId);if(previous&&(previous.start!==record.start||previous.file!==record.file))throw new Error('Node ID collision');
      records.set(sourceNodeId,record);return record;
    };
    traverse(ast,{JSXElement(p){
      const opening=p.node.openingElement;
      if(!t.isJSXIdentifier(opening.name))return; // member/namespace components remain runtime-only
      const tag=opening.name.name,role=/^[a-z]/.test(tag)?'element-declaration':'component-callsite';
      if(opening.attributes.some(a=>t.isJSXAttribute(a)&&t.isJSXIdentifier(a.name)&&a.name.name==='data-picksrc-node'))throw new Error('Reserved data-picksrc-node attribute collision');
      const record=make(p.node,tag,role);
      const owner=p.findParent(parent=>(parent.isFunctionDeclaration() && /^[A-Z]/.test(parent.node.id?.name ?? '')) || ((parent.isFunctionExpression() || parent.isArrowFunctionExpression()) && parent.parentPath.isVariableDeclarator() && t.isIdentifier(parent.parentPath.node.id) && /^[A-Z]/.test(parent.parentPath.node.id.name)));
      if(owner){const definition=make(owner.node,'component','component-definition');record.componentDefinition=definition.position;record.definitionSourceNodeId=definition.sourceNodeId;}
      const at=opening.end!-(opening.selfClosing?2:1);
      // Expression rather than literal avoids Solid static template sharing erasing per-node identity.
      output.appendLeft(at,` data-picksrc-node={${JSON.stringify(record.sourceNodeId)}.slice(0)}`);
    }});
    return {code:output.toString(),map:output.generateMap({hires:true,source:filename,includeContent:true})};
  };
  const getRecord=(id:string)=>records.get(id);
  const toSourceReference=(id:string):SourceReference|undefined=>{const r=records.get(id);if(!r)return;return {projectId:options.projectId,appScopeId:options.appScopeId,buildId:options.buildId,sourceNodeId:id,file:r.file,contentHash:r.sourceContentHash,provenance:'build-snapshot'};};
  const readSource=async(ref:SourceReference,range?:{start:number;end:number},signal?:AbortSignal):Promise<SourceSnippet|null>=>{
    signal?.throwIfAborted();const r=records.get(ref.sourceNodeId);if(!r||ref.projectId!==options.projectId||ref.appScopeId!==options.appScopeId||ref.buildId!==options.buildId||ref.file!==r.file||ref.contentHash!==r.sourceContentHash||ref.provenance!=='build-snapshot')return null;
    const wanted=range??{start:r.start,end:r.end};
    if(!Number.isSafeInteger(wanted.start)||!Number.isSafeInteger(wanted.end)||wanted.start<r.start||wanted.end>r.end||wanted.end<wanted.start||wanted.end-wanted.start>(options.maxSnippetLength??16384))throw new RangeError('Source range outside verified node or too large');
    const file=path.resolve(root,r.file);if(realpathSync(file)!==file||!safeProjectPath(path.relative(root,file)))return null;
    const source=readFileSync(file,'utf8');if(hash(source)!==r.sourceContentHash)return null;signal?.throwIfAborted();
    return {content:source.slice(wanted.start,wanted.end),range:wanted,language:'tsx',encoding:'utf-8',contentHash:r.sourceContentHash,sourceVersion:`${options.buildId}:${r.sourceContentHash}`,provenance:'build-snapshot'};
  };
  const plugin:Plugin={name:`picksrc:${options.framework}`,enforce:'pre',transform(code,id){if(!/\.[jt]sx$/.test(id)||id.includes('/node_modules/')||(options.include&&!options.include.test(id)))return null;return instrument(code,id);},handleHotUpdate(ctx){invalidate(ctx.file);},configureServer(server){
    if(!options.enableDevelopmentSourceEndpoint)return;
    server.middlewares.use(async(req,res,next)=>{
      if(!req.url?.startsWith(`/__picksrc/${options.framework}/`))return next();res.setHeader('Cache-Control','no-store');
      const origin=req.headers.origin,origins=new Set((server.resolvedUrls?.local??[]).map(x=>new URL(x).origin));
      if(req.method!=='POST'||req.headers['sec-fetch-site']!=='same-origin'||!origin||!origins.has(origin)){res.statusCode=403;res.end();return;}
      try{const url=new URL(req.url,origin);if(url.pathname!==`/__picksrc/${options.framework}/source`){res.statusCode=404;res.end();return;}
        const id=url.searchParams.get('node')??'',ref=toSourceReference(id),record=records.get(id);if(!ref||!record){res.statusCode=404;res.end();return;}
        const snippet=await readSource(ref);if(!snippet){res.statusCode=409;res.end();return;}
        res.setHeader('Content-Type','application/json');res.end(JSON.stringify({record,snippet}));
      }catch{res.statusCode=400;res.end();}
    });
  }};
  return {plugin,instrument,getRecord,getRecords:()=>[...records.values()],toSourceReference,readSource,invalidate};
}
