# Picksrc

Framework-neutral TypeScript SDK for selecting DOM elements, locating component metadata, and reading source snippets when the host has authorized a matching snapshot.

## Status

v0.1 is experimental. Browser picking works without a source service. `SnapshotSourceProvider` only returns content from a snapshot explicitly registered by the host and matching the build/content hash. Vue 3.5 is the first compiler adapter with a tested AST-to-original-source range and original snippet readback. React and Solid compiler/runtime adapters are not supported yet.

## Basic use

```ts
import { createOverlay, createPicker } from 'picksrc';

const overlay = createOverlay();
const picker = createPicker({ scope: {
  projectId: 'demo', appScopeId: 'demo-root', buildId: 'dev',
  scopeGeneration: 0, moduleGeneration: 0,
} }, element => overlay.render(element));
picker.start();
// On the host's explicit confirm action:
const selection = picker.confirm();
// selection is still useful without source metadata; it says unavailable.
```

The picker observes pointer events locally, uses a `WeakMap` for runtime element IDs, and does not collect text, HTML, or attribute values. The overlay is a separate renderer and does not alter the selected node. `stop()` cancels event listeners. Open shadow roots work through composed event paths; closed roots are not traversed. A same-origin iframe needs its own picker attached to its `contentDocument` and an overlay created with that document; this v0.1 does not auto-discover frames or translate child-frame overlays into the parent viewport. Cross-origin frames require host cooperation.

## Vue compiler integration

The Vue adapter uses the official SFC `NodeTransform` hook and verifies each AST node's source slice against the original `.vue` file before recording an exact range. Add `@vitejs/plugin-vue` to the host build and pass the adapter's node transforms through its public compiler options:

```ts
import vue from '@vitejs/plugin-vue';
import { createVueAdapter } from 'picksrc/vue';

const picksrcVue = createVueAdapter({
  root: process.cwd(), projectId: 'web', appScopeId: 'main-app', buildId: 'build-123',
  includeDevelopmentLocations: true,
  enableDevelopmentSourceEndpoint: true,
});

export default {
  plugins: [vue({ template: { compilerOptions: picksrcVue.compilerOptions } }), picksrcVue.plugin],
};
```

The source endpoint is opt-in and development-only. The demo sends a POST only from its explicit Confirm action; hover/pointer movement does not make source requests. The endpoint accepts only POSTs with `Sec-Fetch-Site: same-origin` and an exact Origin from Vite's local resolved URLs, plus a recorded opaque node ID and a range inside that node. It reads under the configured project root, rejects symlink paths, checks the full-file content hash and build ID, caps snippet size, and disables caching. This is a local-development guard, not authentication against scripts already running on the same origin. Production DOM markers stay opaque; no private manifest export/upload or production resolver is included yet. `useVueComponentBridge` is a separate browser-safe entry (`picksrc/vue-runtime`); call it from a component's setup to expose its instance and callsite. Definition metadata is available only through a host-supplied mapping; fragment or multi-root instances without a single element root remain unavailable.

## Source snippets

Call `SnapshotSourceProvider.add()` with a host-authorized snapshot tied to an exact build and content hash. `readSource()` rejects ranges outside the snapshot and supports cancellation. It never fetches a URL or local path. Repository access and source-map transport are intentionally left behind host interfaces; do not pass arbitrary paths or URLs from page-controlled markers.

## Plugin lifecycle

`PluginRegistry` validates API versions and dependencies before setup, orders dependencies, rolls back completed setup functions in reverse order on failure, aborts on dispose, and reports cleanup failures. Registration is local; it is not a JavaScript sandbox. The plugin API is experimental.

## Support matrix

| Framework | Element picking | Component instance / owner | Exact source-node mapping |
| --- | --- | --- | --- |
| Plain DOM | Supported | Not applicable | Not provided |
| React | DOM can be picked | Not supported in this release | Not supported |
| Vue 3.5.x | Supported | Component instance and exact template callsite in the dev bridge; definition metadata requires a host resolver | Exact template AST range and original source snippet in dev snapshot mode; production resolver pending |
| Solid | DOM can be picked | Not supported in this release | Not supported |

Source maps alone are not treated as DOM-to-source evidence. A result without verified node evidence remains `unavailable`/`unknown`.

## License

See [LICENSE-STATUS.md](./LICENSE-STATUS.md). This repository had no license at implementation start, so no license is asserted by this SDK.
