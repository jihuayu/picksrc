# Picksrc

Framework-neutral TypeScript SDK for selecting DOM elements, locating component metadata, and reading source snippets when the host has authorized a matching snapshot.

## Status

v0.1 is experimental. Browser picking works without a source service. `SnapshotSourceProvider` only returns content from a snapshot explicitly registered by the host and matching the build/content hash. Vue 3.5 is the first compiler adapter with a tested AST-to-original-source range and original snippet readback. React and Solid now have separate runtime inspection entries and optional original-JSX instrumentation.

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
| React | Supported | Existing Fiber association; development locations need metadata/maps; private internals are best-effort | Optional JSX adapter verifies original element ranges; production source service not included |
| Vue 3.5.x | Supported | Component instance and exact template callsite in the dev bridge; definition metadata requires a host resolver | Exact template AST range and original source snippet in dev snapshot mode; production resolver pending |
| Solid | Supported | Explicit owner binding or existing DevTools integration; no automatic production DOM-to-owner guarantee | Optional JSX adapter verifies original element ranges |

Source maps alone are not treated as DOM-to-source evidence. A result without verified node evidence remains `unavailable`/`unknown`.

## License

Apache-2.0. See [LICENSE](./LICENSE). Third-party dependencies retain their own licenses.

## React and Solid

Runtime-only inspection does not require the Picksrc compiler transform:

```ts
import { inspectReactElement } from 'picksrc/react-runtime';
import { createSolidRuntimeAdapter } from 'picksrc/solid-runtime';
const react = inspectReactElement(element, { mapLocation: hostSourceMapResolver });
const solid = createSolidRuntimeAdapter();
const instance = {}; // Allocate once per component invocation, not per reactive update
const unbind = solid.bind(element, instance); // Supply describeOwner to identify this token
const inspection = solid.inspect(element);
```

React uses an existing DOM Fiber association or an explicitly supplied renderer lookup. Private renderer fields can change. React 19 stack coordinates refer to generated code and are not promoted to original positions without an explicit mapping callback. Component names and runtime identity do not prove exact element ranges. Solid requires an explicit per-component token binding or real DevTools component-owner integration. getOwner() alone is a reactive scope and can be shared by multiple production components; it is not a component instance identifier: ordinary production DOM does not retain enough information to reconstruct owners, and source maps cannot create that missing association. Disposing a Solid bridge releases its bindings. Neither runtime entry installs a global hook, fetches scripts, nor downloads source maps.

`picksrc/sourcemap` maps a known generated line/column using a supplied map and optionally returns embedded sourcesContent. Coordinates are 1-based at the public API. Mapping yields a point, not an exact AST range; callers own map provenance, URL authorization, and source freshness.

For exact original JSX evidence, add `createJsxAdapter` from `picksrc/jsx` before the normal React/Solid compiler. Configure `framework`, `root`, `projectId`, `appScopeId`, `buildId`, and optionally an `include` RegExp to restrict files. The adapter checks original bytes, injects opaque IDs, and emits a chainable high-resolution source map. `getRecords`, `toSourceReference`, and `readSource` expose bounded, hash-checked original ranges. Capitalized lexical component declarations supply static definition evidence, not runtime ownership. Component props may not be forwarded; custom component markers alone are not proof of a DOM callsite. Member/namespaced JSX remains runtime-only. Instrumentation is optional and deliberately separate from runtime inspection.

The optional local-development endpoint is `/__picksrc/react/source` or `/__picksrc/solid/source`; same-origin POST and an opaque recorded node ID are required. It must never be exposed as a production source service. No production private-manifest publication or remote source retrieval is implemented.

Run `pnpm exec vite --host 127.0.0.1` and open `/demo/react/` or `/demo/solid/`. These use real React/Solid renderers, state updates, runtime inspection, and original-source readback only after clicking Inspect. The E2E suite runs Chromium, Firefox and WebKit. Package consumer tests verify that the default entry imports without any framework installed and optional entries remain consumable from the packed tarball.
