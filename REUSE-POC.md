# Reuse PoC and evidence log

Date: 2026-10-22. Repository identity confirmed via authenticated GitHub repository metadata as `jihuayu/picksrc` (canonical spelling); it is public, owned by `jihuayu`, admin/push permission is reported, default branch name `main`, size 0 and empty. Contents API returned “This repository is empty”; Git refs returned “Git Repository is empty”. Thus no files, `AGENTS.md`, LICENSE, or existing code were available to inspect. There was no existing branch or commit to base a feature branch on.

## Reuse decisions

- `react-grab/primitives`: not imported. The SDK's base picker is implemented locally with `composedPath`, frame-local coordinates, and WeakMap IDs; no third-party runtime or framework is loaded. The upstream primitives comparison was not runnable because dependencies/network are unavailable in this environment. This remains an unverified alternative, not a claim of a passing comparison.
- v-comment: searched available Codex workspace documents for `selection.ts` and `dom-resolution.ts`; neither was accessible. No code was copied and migration compatibility is not claimed.
- React, Vue, Solid: no official compiler dependencies are installed and network DNS to GitHub is unavailable. No framework gets a false “supported” claim. A Vite production transform fails closed until a compiler-specific adapter exists. No source-map-only claim is made.

## Local proof implemented

The deliverable has a headless browser picker and a separately managed overlay, serializable result protocol with separate evidence/precision/status fields, plugin dependency validation and rollback, and a content-hash/build-bound local snapshot reader with range and path checks. These provide a useful primitive SDK proof but do not satisfy the requested framework component-instance/callsite/definition loop. This gap is explicit in the support matrix.

## Unresolved checks

No package installation/build/tests were completed yet. Browser three-engine coverage, bundle-consumer checks, framework fixtures, v-comment migration, dependency license/SBOM checks, dynamic CI validation, and final artifact security checks remain outstanding. GitHub refs do not exist, so the requested feature branch cannot yet be created through a normal ref operation. Shell `git ls-remote` failed because `github.com` DNS resolution is unavailable. The GitHub connection's branch/file operations require an existing commit and cannot establish a feature branch from this empty repository without first writing to default branch `main`; that would violate the independent-branch requirement. No remote write was attempted.
