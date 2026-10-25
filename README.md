# dsh-top-running-tasks

**English** · [简体中文](README.zh-CN.md)

Keeps every Session that is running *right now* at the top of the DSH Web
sidebar — above the workspace list, across all workspaces, ranked by most recent
activity. Nothing is running? The section is not there at all.

A pure-client plugin: the Host half is an empty `apply()`, all of it lives in
`client.js`.

```
Sidebar
├─ brand / New Session / global panels
├─ Workspaces            ← region header (search / view options / add workspace)
├─ ┌ Running 2 ────────  ← this plugin, at the top of the list's own scroller
│  │ ● Session title…   proj
│  │ ● Session title…   other
├─ └────────────────────
├─ Workspace group A
└─ Workspace group B
```

## What it is, and is not

- **Is** a read-only view derived from Session state. Clicking a row opens that
  Session through the shipped navigation service (`uiWorkspace.openSession`).
- **Is not** a new slot. `sidebar.workspaces` is a `single` slot with no
  insertion hole inside it, and an outside plugin cannot declare one — so this
  plugin renders through the additive `shell.overlay` seat and portals its
  content into a host element it owns, appended to the list's own scroll
  container. The shipped browser is never replaced or re-implemented.
- No settings, no persisted state: the section is a pure function of Session
  state. Disabling the plugin removes its host, stylesheet and observers and
  leaves the scroll container exactly as it found it.

## Install

```sh
# from npm (once published)
dsh plugin add dsh-top-running-tasks

# from a local directory
dsh plugin add ./dsh-top-running-tasks

# from a release tarball
dsh plugin add https://github.com/HuiLiyi2026-deepdeep/dsh-top-running-tasks/releases/latest/download/dsh-top-running-tasks-1.0.0.tgz
```

In the desktop app it can also be installed from the Plugins page. The package
declares `dsh.bundle`, so the profile mounts its `cordis.patch.yml` row and the
Client registry serves `./client.js` to the browser.

A fresh install only takes effect after the page reloads (`application: applied`
means the composition changed, not that the browser loaded the new module). The
section appears when a Session is actually running — including the one that is
generating the reply you are reading.

## How it works

1. **Data** — the standard hooks every root-scoped slot entry receives:
   `useSessions` (`{ phase, ids, byId }`), `useSessionStatus` (a Map of
   `{ running, pendingInteraction, completionUnread }`) and `useWorkspaces`
   (ownership + `archivedSessionIds`). Rows keep Sessions with
   `running === true`; subagent and archived Sessions are skipped.
2. **Ranking** — the activity instant is the maximum over
   `status.updatedAt / lastActivityAt / activityAt / startedAt` and
   `session.updatedAt / lastActivityAt / activityAt`, reading epoch milliseconds
   or ISO strings, newest first.
3. **CSS `order`, never node moves**
   - *Placement*: one attribute-driven rule turns the scroll container into a
     flex column and the plugin's host carries `order: -1`; the host is merely
     appended. React's reconciliation can therefore never push the section out of
     first place — the one part of "must be at the very top" that React would
     otherwise break.
   - *Ranking*: the plugin's rows keep a **stable DOM order (by Session id)** and
     express the rank as `style.order`. A live list re-ranks constantly; moving
     nodes would make the row under the pointer (or the focused row) swap
     identity mid-hover, while changing one style property cannot.
   - *Fallback*: a container that is not a plain block (grid, row flex), or where
     a shipped rule outranks the flex override, is left completely untouched and
     the host is kept as its first element child instead. The strategy is decided
     by reading the native `display` **before** marking anything.
4. **Self-healing** — a `MutationObserver` (region `childList`/`subtree` plus the
   root's `class`) and a 1.5 s reconcile beat. Cached nodes are re-resolved only
   when they disconnect; the mode checks run on every beat, so a rail toggle or a
   replaced list is followed.
5. **Edges** — while the sidebar is a rail the section detaches and drops its
   marker, then re-attaches on expand; an unrecognised snapshot degrades to "no
   section" and never throws into the slot renderer (a throw would retire the
   entry for the rest of the Session).
6. **Styling** — theme tokens only (`--dsw-alias-label-primary/secondary`,
   `--dsw-alias-brand-primary`, `--dsw-alias-bg-layer-2`,
   `--dsw-alias-border-l2`), each with a literal fallback, and the pulse honours
   `prefers-reduced-motion`.

### A trap worth knowing: `[data-slot]` is `display: contents`

The shipped renderer wraps **every** slot outlet in
`<div data-slot="…" style="display:contents">` (`ANCHOR_STYLE` in
`@deepseek-ai/dsh-client-ui-renderer`). A `display: contents` element produces no
boxes, so `getClientRects()` on it is **always empty** — even while the sidebar is
wide open. Judging visibility on that wrapper makes a plugin conclude "hidden" on
every reconcile, silently. Visibility is judged on the list area (a real box)
instead; the rail state still reads correctly because a `display: none` ancestor
leaves every descendant without rects. This is documented on `isVisible()` —
**never pass the `[data-slot]` anchor to it**.

## Test

```sh
npm test
```

Loads `client.js` through a stubbed dynamic-module protocol and asserts: the
module id, that `apply` registers exactly one `shell.overlay` entry (id, order,
locale, `openSession` injection), derivation (only `running`, subagent and
archived excluded, status timestamps preferred over Session timestamps), the
stable DOM order, the rendered `order` values and click-through, and every
degradation path (empty state, unknown snapshot shape, unbound locale). `prepack`
runs it, so a broken build cannot be published.

The DOM injection was verified separately in a real browser against a skeleton
built from the shipped structures — a `display: contents` `[data-slot]` anchor,
the `root / listArea / treeBody / list` flex and overflow declarations, and
`role="tree"` on the scroller: the section attaches with the anchor reporting
zero rects, `order: -1` puts it exactly between the region header and the first
row, rows inserted before or after it do not displace it, a `display: none`
ancestor detaches it, and disposal restores `display: block`.

## Diagnostics

In the browser console:

```js
window.__dshTopRunningTasks.version   // the generation this tab is running
window.__dshTopRunningTasks.inspect()
// { version, region, listArea, listAreaVisible, scroller, flexColumn, host, probe }
//   probe = { phase, sessions, running, rows: [{ id, title, where, rank }] }
window.__dshTopRunningTasks.deriveRows(list, statuses, workspaceState)  // pure
```

`probe` separates the two very different reasons a section can be missing:
`probe.running === 0` means nothing is running; `probe.sessions > 0` with
`probe.running` stuck at 0 means the snapshot shape is not what this build
provides. A missing anchor logs one `[dsh-top-running-tasks] section hidden: …`
line naming the probe that failed.

## Limitations

1. Depends on shipped sidebar DOM facts: `[data-slot="sidebar.workspaces"]`, a
   list area whose class contains `listArea`, a scroller whose class token ends
   in `_list` (or `role="tree"`), and `data-row-key` on rows. A sidebar refactor
   in DSH needs `SELECTORS` and `resolve()` updated; every probe has a structural
   fallback and fails with a warning rather than an error.
2. The mount point is the top of the **list's scroll container** (below the
   region header and search, above every workspace group), so the section scrolls
   with the list rather than floating above the header.
3. Rank is expressed with CSS `order`; keyboard tab order follows the stable DOM
   order (Session id) rather than the visual rank. Row counts are single digits
   in practice.
4. Requires DSH `>=0.2.1-rc.3 <0.3.0` (verified on `0.2.1-rc.3`).

## License

MIT
