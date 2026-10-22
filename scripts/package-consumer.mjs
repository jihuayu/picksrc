import { spawnSync } from 'node:child_process';
import { mkdtemp, mkdir, readdir, rm, symlink, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const temp = await mkdtemp(path.join(os.tmpdir(), 'picksrc-consumer-'));
const run = (command, args, options = {}) => {
  const result = spawnSync(command, args, { encoding: 'utf8', ...options });
  if (result.status !== 0) throw new Error(`${command} ${args.join(' ')} failed\n${result.stdout}\n${result.stderr}`);
  return result.stdout;
};
try {
  const tarDir = path.join(temp, 'tar'); const consumer = path.join(temp, 'consumer');
  await mkdir(tarDir); await mkdir(consumer);
  run('pnpm', ['pack', '--pack-destination', tarDir], { cwd: projectRoot });
  const tarball = path.join(tarDir, (await readdir(tarDir)).find(name => name.endsWith('.tgz')));
  const packageDir = path.join(consumer, 'node_modules', 'picksrc'); await mkdir(packageDir, { recursive: true });
  run('tar', ['-xzf', tarball, '--strip-components=1', '-C', packageDir]);
  // Verify the default entry can be consumed without installing any framework peer.
  run(process.execPath, ['--input-type=module', '-e', "const sdk=await import('picksrc'); if(typeof sdk.createPicker!=='function'||typeof sdk.PluginRegistry!=='function') process.exit(1)"], { cwd: consumer });
  // Verify optional framework entries resolve from the actual packed directory with their declared peers.
  const modules = path.join(consumer, 'node_modules'); const projectModules = path.join(projectRoot, 'node_modules');
  await mkdir(path.join(modules, '@vue'), { recursive: true });
  for (const name of ['compiler-dom', 'compiler-sfc']) await symlink(path.join(projectModules, '@vue', name), path.join(modules, '@vue', name), 'dir');
  await symlink(path.join(projectModules, 'vue'), path.join(modules, 'vue'), 'dir');
  await mkdir(path.join(modules, '@types'), { recursive: true });
  await symlink(path.join(projectModules, '@types/node'), path.join(modules, '@types/node'), 'dir');
  await symlink(path.join(projectModules, 'vite'), path.join(modules, 'vite'), 'dir');
  for (const name of ['@babel/parser','@babel/traverse','@babel/types','@jridgewell/trace-mapping','magic-string']) { const target=path.join(modules,name); await mkdir(path.dirname(target),{recursive:true}); await symlink(path.join(projectModules,name),target,'dir'); }
  run(process.execPath, ['--input-type=module', '-e', "for(const name of ['jsx','sourcemap','react-runtime','solid-runtime']) await import('picksrc/'+name)"], {cwd:consumer});
  run(process.execPath, ['--input-type=module', '-e', "const a=await import('picksrc/vue');const r=await import('picksrc/vue-runtime');if(typeof a.createVueAdapter!=='function'||typeof r.useVueComponentBridge!=='function')process.exit(1)"], { cwd: consumer });
  await writeFile(path.join(consumer, 'smoke.ts'), `import { createJsxAdapter } from 'picksrc/jsx';\nimport { inspectReactElement } from 'picksrc/react-runtime';\nimport { createSolidRuntimeAdapter } from 'picksrc/solid-runtime';\nimport { createSourceMapResolver } from 'picksrc/sourcemap';\nimport { createPicker, type ComponentRecord } from 'picksrc';\nimport { createVueAdapter, type VueNodeRecord } from 'picksrc/vue';\nimport { useVueComponentBridge } from 'picksrc/vue-runtime';\nimport type { Plugin } from 'vite';\nconst record: ComponentRecord = { framework: 'vue', owners: [], renderedTargets: [], status: 'partial' };\nconst adapter = createVueAdapter({ root: '.', projectId: 'p', appScopeId: 'a', buildId: 'b' });\nconst plugin: Plugin = adapter.plugin;\nconst lookup = { getRecord(_id: string): VueNodeRecord | undefined { return undefined; } };\nvoid [createPicker, useVueComponentBridge, record, plugin, lookup];\n`);
  await writeFile(path.join(consumer, 'tsconfig.json'), JSON.stringify({ compilerOptions: { target:'ES2022',module:'NodeNext',moduleResolution:'NodeNext',strict:true,skipLibCheck:true,noEmit:true,lib:['ES2022','DOM','DOM.Iterable'] }, include:['smoke.ts'] }));
  run(path.join(projectRoot, 'node_modules/.bin/tsc'), ['-p', path.join(consumer, 'tsconfig.json')], { cwd: consumer });
  console.log('packed default, Vue, React/Solid and sourcemap exports pass JavaScript import and TypeScript consumer checks');
} finally { await rm(temp, { recursive: true, force: true }); }
