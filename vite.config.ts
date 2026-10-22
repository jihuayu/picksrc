import react from '@vitejs/plugin-react';
import solid from 'vite-plugin-solid';
import { createJsxAdapter } from './src/jsx.js';
import { defineConfig } from 'vitest/config';
import vue from '@vitejs/plugin-vue';
import { createVueAdapter } from './src/vue.js';
const adapter=createVueAdapter({root:process.cwd(),projectId:'picksrc-demo',appScopeId:'demo-root',buildId:'demo-dev-v1',includeDevelopmentLocations:true,enableDevelopmentSourceEndpoint:true});
export default defineConfig({ plugins:[createJsxAdapter({framework:"react",root:process.cwd(),projectId:"demo",appScopeId:"react",buildId:"dev",include:/demo\/react\//,enableDevelopmentSourceEndpoint:true}).plugin,createJsxAdapter({framework:"solid",root:process.cwd(),projectId:"demo",appScopeId:"solid",buildId:"dev",include:/demo\/solid\//,enableDevelopmentSourceEndpoint:true}).plugin,react({include:/demo\/react\/.*\.tsx$/}),solid({include:/demo\/solid\/.*\.tsx$/}),vue({template:{compilerOptions:adapter.compilerOptions}}),adapter.plugin], test:{environment:'jsdom',include:['tests/**/*.test.ts']} });
