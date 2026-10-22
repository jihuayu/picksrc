# React / Solid validation

Validated locally on 2026-10-22 with Node 24.19 and pnpm 11.25:

- TypeScript library build: passed.
- 36 unit/integration tests: passed.
- Real React 19 and Solid 1 production bundles: built and executed in jsdom, with functional state updates.
- Optional JSX instrumentation: opaque markers survive minification; exact original element and component-definition offsets; original content readback; stale hash rejected.
- Without any Picksrc compiler plugin: both real framework bundles provide component association through existing React Fiber or explicit unique Solid component-token binding. Missing original element positions remain unavailable, not fabricated.
- Packed tarball JavaScript imports and TypeScript consumers: passed for core, Vue, JSX, React runtime, Solid runtime and sourcemaps. Core imports with no framework peer installed.

## Browser coverage

Playwright scenarios are provided for Chromium, Firefox and WebKit, including React/Solid rendering, state updates, no source requests on hover, and source readback on confirmation. Existing Vue/shadow-root/iframe tests are retained.

Local browser execution was blocked by the execution sandbox denying Chromium socket creation. The escalation attempt failed before launching the tests. Browser downloads also exhausted the temporary filesystem. These are not passing browser results. The repository CI installs all three engines and runs the same suite; its result must be checked after push.

## Scope and limitations

Runtime inspection never installs a global DevTools hook or fetches remote code. React private Fiber metadata is version-dependent. Solid does not expose a universal DOM-to-owner mapping: the host must supply a unique per-component token or verified component owner, and identify which owners represent components. A plain getOwner() reactive scope can be shared between production components and is insufficient as a component identity. Source maps translate a known generated location, not an arbitrary DOM node; their sourcesContent cannot establish an exact node range on its own. Optional original-JSX instrumentation provides exact static evidence. It does not prove a runtime component callsite when props are not forwarded.

Production remote source authorization, private manifest delivery, cross-origin frame access, inaccessible shadow trees, and universal framework/version coverage are not implemented. The opt-in source endpoint is for same-origin local development only.

## Upstream implementation references

- React DOM association and renderer lookup: https://github.com/facebook/react/blob/main/packages/react-dom-bindings/src/client/ReactDOMComponentTree.js
- React DevTools source resolution: https://github.com/facebook/react/blob/main/packages/react-devtools-shared/src/backend/fiber/renderer.js
- Vue DOM development metadata: https://github.com/vuejs/core/blob/main/packages/runtime-core/src/renderer.ts
- Solid DevTools setup and locator instrumentation: https://github.com/thetarnav/solid-devtools/blob/main/packages/main/README.md

Unlike a privileged DevTools integration, these adapters do not call component functions to manufacture stacks, inject/replace a global hook, or claim automatic Solid component-tree discovery. JSX creation locations are not automatically component definition locations.

Regression coverage includes committed React alternate resolution across repeated updates (element, component callsite, owner chain and unmount), shadowed String identifiers in real JSX builds, and distinct explicit Solid component tokens. Current-tree inspection is bounded to 20,000 fibers and fails closed when the committed branch cannot be established.
