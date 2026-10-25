# Changelog

All notable changes to this package are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project uses
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.0] - 2026-10-25

First public release. A pure-client DSH Web plugin: one section at the top of
the sidebar's session list that lists every Session with `running === true`,
across all workspaces, ranked by most recent activity, hidden entirely when
nothing runs.

### Added

- `shell.overlay` occupant that portals a section into a host element the plugin
  owns inside the shipped list's scroll container (no new slot, no shell
  replacement).
- Placement and ranking expressed with the flexbox `order` property: the scroll
  container is turned into a flex column and the host carries `order: -1`;
  the plugin's own rows keep a stable DOM order and carry their rank in `order`,
  so a re-ranking list never swaps the row under the pointer.
- Conservative placement fallback: a container that is not a plain block (grid,
  row flex) or where a shipped rule outranks the flex override is left untouched
  and the host is kept as its first element child instead.
- Self-healing placement through a `MutationObserver` plus a 1.5 s reconcile
  beat; every shipped-DOM probe has a structural fallback, and each failure
  path warns once instead of throwing into the slot renderer.
- Rail handling: the section detaches and removes its marker while the sidebar
  is collapsed, and re-attaches when it expands.
- Tolerant snapshot readers: `{ ids, byId }`, a record array, and a record array
  under a collection key all read; `running` is read from the status record or
  from the Session record.
- `window.__dshTopRunningTasks` debug handle: `version`, `inspect()` (anchor
  resolution + a `probe` of what the component derived) and `deriveRows()`
  (pure, callable from the console with your own data).
- Locale-aware labels (zh / en) through the Client locale service, with literal
  fallbacks when no namespace is bound.
- `tests/selfcheck.cjs`: loads the Client half through a stubbed module protocol
  and asserts registration, derivation, ranking, rendering, click-through and
  every degradation path. `npm test` runs it; `prepack` gates publishing on it.

### Fixed

- The section never appeared. Every slot outlet in the shipped renderer is
  wrapped in a `display:contents` element, which produces no boxes, so
  `getClientRects()` on that wrapper is empty even while the sidebar is wide
  open. Visibility was judged on that wrapper, so the plugin concluded "hidden"
  on every reconcile and silently detached. Visibility is now judged on the list
  area — a real box — and the constraint is documented on `isVisible()`.

## [0.1.1] - 2026-10-25

- Add a generation marker (`window.__dshTopRunningTasks.version`) and a single
  load log line, so an open tab running a stale module instance is identifiable.

## [0.1.0] - 2026-10-25

- Internal first version: section, derivation, injection, self-check.
