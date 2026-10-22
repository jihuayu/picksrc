import { defineConfig } from 'vitest/config';
import vue from '@vitejs/plugin-vue';
import { createVueAdapter } from './src/vue.js';
const adapter=createVueAdapter({root:process.cwd(),projectId:'picksrc-demo',appScopeId:'demo-root',buildId:'demo-dev-v1',includeDevelopmentLocations:true,enableDevelopmentSourceEndpoint:true});
export default defineConfig({ plugins:[vue({template:{compilerOptions:adapter.compilerOptions}}),adapter.plugin], test:{environment:'jsdom',include:['tests/**/*.test.ts']} });
