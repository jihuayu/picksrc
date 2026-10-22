# Picksrc

Framework-neutral TypeScript SDK for selecting DOM elements, locating component metadata, and reading source snippets when the host has authorized a matching snapshot.

## Status

v0.1 is experimental. Browser picking works without a source service. `SnapshotSourceProvider` only returns content from a snapshot explicitly registered by the host and matching the build/content hash. This initial version does **not** claim React, Vue, or Solid source-node instrumentation: generic markup/compiler rewriting is intentionally disabled until each adapter passes its own minified-output and node-identity fixtures. Component runtime adapters are also not yet shipped. Do not infer a component from a filename.

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

The picker observes pointer events locally, uses a `WeakMap` for runtime element IDs, and does not collect text, HTML, or attribute values. The overlay is a separate renderer and does not alter the selected node. `stop()` cancels event listeners. Open shadow roots work through composed event paths; closed roots are not traversed. Cross-origin frames require host cooperation.

## Source snippets

Call `SnapshotSourceProvider.add()` with a host-authorized snapshot tied to an exact build and content hash. `readSource()` rejects ranges outside the snapshot and supports cancellation. It never fetches a URL or local path. Repository access and source-map transport are intentionally left behind host interfaces; do not pass arbitrary paths or URLs from page-controlled markers.

## Plugin lifecycle

`PluginRegistry` validates API versions and dependencies before setup, orders dependencies, rolls back completed setup functions in reverse order on failure, aborts on dispose, and reports cleanup failures. Registration is local; it is not a JavaScript sandbox. The plugin API is experimental.

## Support matrix

| Framework | Element picking | Component instance / owner | Exact source-node mapping |
| --- | --- | --- | --- |
| Plain DOM | Supported | Not applicable | Not provided |
| React | DOM can be picked | Not supported in this release | Not supported |
| Vue | DOM can be picked | Not supported in this release | Not supported |
| Solid | DOM can be picked | Not supported in this release | Not supported |

The Vite entry currently guards against unsupported production instrumentation. Source maps alone are not treated as DOM-to-source evidence. A result without verified node evidence remains `unavailable`/`unknown`.

## License

See [LICENSE-STATUS.md](./LICENSE-STATUS.md). This repository had no license at implementation start, so no license is asserted by this SDK.
