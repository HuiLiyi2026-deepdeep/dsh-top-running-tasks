/**
 * dsh-top-running-tasks — client half.
 *
 * Puts one independent section at the very top of the sidebar's session list,
 * above every workspace group, and keeps in it every Session whose status says
 * `running === true` — across all workspaces, sorted by most recent activity.
 * The section exists only while something is running: with no running Session
 * it renders nothing and detaches its host element, leaving the shipped list
 * exactly as it was.
 *
 * Why DOM injection instead of a slot:
 *
 * `sidebar.workspaces` is a `single` slot whose region has no insertion hole of
 * its own, and an outside plugin cannot declare a new slot inside it. So — the
 * same technique dsh-pinned-sessions and dsh-sidebar-focus use — this plugin
 * renders through the additive `shell.overlay` seat and portals its content into
 * a host element it owns, inserted into the list's own scrolling container. The
 * shipped browser is never replaced or re-implemented.
 *
 * Why CSS `order` instead of moving nodes:
 *
 * Position and rank are expressed with the flexbox `order` property, never by
 * re-inserting rows:
 *
 *   - Placement: the scroll container is turned into a flex column (one
 *     attribute-driven rule) and the plugin's host carries `order: -1`, so the
 *     section reads first no matter where React's reconciliation puts it. That
 *     is what makes the placement survive the list re-rendering: the host is
 *     simply appended, and React inserting or removing its own rows around a
 *     node it does not own can never displace the section visually.
 *   - Ranking: the plugin's own rows keep a stable DOM order (by Session id)
 *     and carry `order: <rank>`. A live list changes rank constantly, and
 *     reordering DOM nodes would make the row under the pointer (or the focused
 *     row) swap identity mid-hover; changing one style property cannot.
 *
 * Everything the plugin depends on in the shipped DOM lives in `SELECTORS` /
 * `resolve()`, each probe with a fallback, and every failure path warns once and
 * leaves the app untouched rather than throwing into the slot renderer.
 */
(() => {
  try {
    window.__ModuleLoader__.load({
      id: 'dsh-top-running-tasks',
      factory: (require) => {
        var module = { exports: {} }
        var exports = module.exports
        Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' })

        var react = require('react')
        var reactDom = require('react-dom')
        var h = react.createElement

        var NS = 'top-running-tasks'
        var LOG = '[dsh-top-running-tasks]'
        /**
         * The generation marker, exposed as `window.__dshTopRunningTasks.version`.
         *
         * A browser tab keeps the module instance it loaded, so after an update the
         * one question that matters is "which generation is this page running?" —
         * this answers it without a debugger.
         */
        var VERSION = '1.0.0'
        var STYLE_ID = 'dsh-top-running-tasks/running.css'
        /** Marks the host element this plugin owns inside the shipped list. */
        var HOST_ATTR = 'data-dsh-top-running'
        /** Marks the shipped scroll container while the flex-order strategy is on. */
        var LIST_ATTR = 'data-dsh-top-running-list'
        /** Fallback reconcile beat for a region replaced without a mutation. */
        var RECONCILE_MS = 1500
        /** DevTools handle: `window.__dshTopRunningTasks.inspect()`. */
        var DEBUG_KEY = '__dshTopRunningTasks'

        /**
         * Every shipped-DOM fact this plugin relies on, in one place. A sidebar
         * refactor in DSH changes these (or the fallbacks in `resolve`), so a
         * rename shows up as one console warning instead of a silent
         * disappearance.
         */
        var SELECTORS = {
          region: '[data-slot="sidebar.workspaces"]',
          row: '[data-row-key]',
          listAreaToken: 'listArea',
          scrollerToken: /(^|_)list$/,
        }

        var CSS = [
          // --- the host's own placement inside the shipped scroll container ---
          '[' + LIST_ATTR + ']{display:flex !important;flex-direction:column}',
          '[' + LIST_ATTR + '] > *{flex-shrink:0}',
          '.dtrt-host{box-sizing:border-box;flex:none;order:-1;padding:2px 0 8px;margin-bottom:2px;border-bottom:1px solid var(--dsw-alias-border-l2,rgba(127,127,127,.18))}',
          // --- the section ---
          '.dtrt-head{display:flex;align-items:center;gap:6px;padding:2px 8px;color:var(--dsw-alias-label-secondary);font-size:11px;line-height:16px;letter-spacing:.02em;font-variant-numeric:tabular-nums}',
          '.dtrt-count{color:var(--dsw-alias-label-secondary);opacity:.8}',
          '.dtrt-rows{display:flex;flex-direction:column}',
          '.dtrt-row{box-sizing:border-box;display:flex;align-items:center;width:100%;height:32px;margin:0;padding:0 8px;border:0;border-radius:8px;background:transparent;color:var(--dsw-alias-label-primary);font-family:inherit;font-size:14px;line-height:20px;text-align:left;cursor:pointer;user-select:none}',
          '.dtrt-row:hover{background:var(--dsw-alias-bg-layer-2,rgba(127,127,127,.12))}',
          '.dtrt-row:focus-visible{outline:2px solid var(--dsw-alias-brand-primary,#4d6bfe);outline-offset:-2px}',
          '.dtrt-dot{width:7px;height:7px;flex:none;margin-right:8px;border-radius:50%;background:var(--dsw-alias-brand-primary,#4d6bfe);animation:dtrt-pulse 1.4s ease-in-out infinite}',
          '@keyframes dtrt-pulse{0%,100%{opacity:1}50%{opacity:.28}}',
          '.dtrt-name{flex:1 1 auto;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
          '.dtrt-where{flex:none;max-width:42%;margin-left:6px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--dsw-alias-label-secondary);font-size:11px;line-height:16px}',
          '@media (prefers-reduced-motion: reduce){.dtrt-dot{animation:none}}',
        ].join('')

        var ZH = {
          'title': '运行中',
          'region.label': '正在运行的会话',
          'open': '打开会话 {name}',
          'blank': '新会话',
        }
        var EN = {
          'title': 'Running',
          'region.label': 'Running sessions',
          'open': 'Open session {name}',
          'blank': 'New session',
        }

        /**
         * Literal labels for the window before the locale service has bound the
         * namespace (or if it never does): a readable row beats a raw key.
         */
        function fallbackTranslate(key, params) {
          var template = Object.prototype.hasOwnProperty.call(EN, key) ? EN[key] : key
          if (params === null || typeof params !== 'object') return template
          return template.replace(/\{(\w+)\}/g, function (match, name) {
            return params[name] === undefined ? match : String(params[name])
          })
        }

        function installCss() {
          if (typeof document === 'undefined') return
          if (document.querySelector('style[data-plugin-css=' + JSON.stringify(STYLE_ID) + ']') !== null) return
          var tag = document.createElement('style')
          tag.dataset.plugin = 'dsh-top-running-tasks'
          tag.dataset.pluginCss = STYLE_ID
          tag.textContent = CSS
          document.head.appendChild(tag)
        }
        installCss()

        // -------------------------------------------------------------------
        // Pure derivation: Session list + status + workspace snapshots -> rows.
        // Kept free of React and of the DOM so the selfcheck can drive it.
        // -------------------------------------------------------------------

        /** Last path segment of a Host directory spelling, as a workspace label. */
        function baseName(path) {
          if (typeof path !== 'string' || path === '') return ''
          var parts = path.replace(/[\\/]+$/, '').split(/[\\/]/)
          return parts.length === 0 ? path : parts[parts.length - 1]
        }

        /** Session id -> owning workspace label, from the workspace snapshot. */
        function workspaceLabels(state) {
          var labels = new Map()
          var items = state !== null && typeof state === 'object' && Array.isArray(state.items) ? state.items : []
          for (var i = 0; i < items.length; i++) {
            var item = items[i]
            if (item === null || typeof item !== 'object' || !Array.isArray(item.sessionIds)) continue
            var title = typeof item.title === 'string' && item.title !== '' ? item.title : baseName(item.path)
            for (var m = 0; m < item.sessionIds.length; m++) {
              if (!labels.has(item.sessionIds[m])) labels.set(item.sessionIds[m], title)
            }
          }
          return labels
        }

        /**
         * The most recent activity instant a Session reports.
         *
         * DSH exposes recency under more than one name depending on what the
         * snapshot was projected from, and a status update is the freshest
         * signal a running Session has. Reading the maximum over the candidates
         * keeps the ordering honest whichever one this build fills in, and
         * tolerates both epoch milliseconds and ISO strings.
         */
        function activityOf(session, status) {
          var candidates = [
            status.updatedAt,
            status.lastActivityAt,
            status.activityAt,
            status.startedAt,
            session.updatedAt,
            session.lastActivityAt,
            session.activityAt,
          ]
          var best = 0
          for (var i = 0; i < candidates.length; i++) {
            var value = candidates[i]
            var stamp = 0
            if (typeof value === 'number' && isFinite(value)) stamp = value
            else if (typeof value === 'string' && value !== '') {
              var parsed = Date.parse(value)
              if (isFinite(parsed)) stamp = parsed
            }
            if (stamp > best) best = stamp
          }
          return best
        }

        /**
         * Normalise the `useSessions` snapshot to `{ ids, byId }`.
         *
         * The shipped hook hands over `{ phase, ids, byId }`, and that is the
         * shape this plugin is written against. The other branches exist because
         * a silent "no section" is indistinguishable from "nothing is running",
         * so a shape this build might report instead (a plain record array, or a
         * record array under a collection key) is read rather than dropped.
         *
         * @returns the index, or null when the snapshot carries no Sessions.
         */
        function sessionIndex(list) {
          if (list === null || list === undefined) return null
          if (Array.isArray(list)) return indexOfRecords(list)
          if (typeof list !== 'object') return null
          if (Array.isArray(list.ids) && list.byId !== null && typeof list.byId === 'object') {
            return { ids: list.ids, byId: list.byId }
          }
          var collections = ['sessions', 'items', 'records', 'list']
          for (var i = 0; i < collections.length; i++) {
            if (Array.isArray(list[collections[i]])) return indexOfRecords(list[collections[i]])
          }
          return null
        }

        /** Index an array of Session records by their own `id`. */
        function indexOfRecords(records) {
          var ids = []
          var byId = {}
          for (var i = 0; i < records.length; i++) {
            var record = records[i]
            if (record === null || typeof record !== 'object' || record.id === undefined) continue
            ids.push(record.id)
            byId[record.id] = record
          }
          return { ids: ids, byId: byId }
        }

        /** One Session's status record, from a Map-like or a plain object. */
        function statusOf(statuses, id) {
          if (statuses === null || statuses === undefined || typeof statuses !== 'object') return undefined
          if (typeof statuses.get === 'function') return statuses.get(id)
          return statuses[id]
        }

        /**
         * The section's rows: every Session that is running right now, across
         * all workspaces, ranked by most recent activity.
         *
         * "Running" is read from the status record first and from the Session
         * record second, because either projection may carry the flag and a
         * false negative here hides the whole section.
         *
         * Subagent Sessions are skipped because the shipped browser keeps them
         * out of the list too (the parent Session is their visible row), and
         * archived Sessions are skipped so the section cannot resurrect a list
         * entry the user deliberately put away.
         *
         * The returned array is in **stable DOM order** (by id) and each row
         * carries `rank` for CSS `order`: a live list re-ranks constantly, and
         * keeping the node order fixed is what lets the visual order change
         * without a hovered or focused row swapping identity underneath.
         *
         * @param list - the `useSessions` snapshot: `{ phase, ids, byId }`.
         * @param statuses - the `useSessionStatus` snapshot: a Map-like with `get`.
         * @param workspaceState - the `useWorkspaces` snapshot.
         * @returns ranked row models, empty when nothing runs.
         */
        function deriveRows(list, statuses, workspaceState) {
          var index = sessionIndex(list)
          if (index === null) return []
          var archivedIds = workspaceState !== null && typeof workspaceState === 'object'
            && Array.isArray(workspaceState.archivedSessionIds)
            ? workspaceState.archivedSessionIds
            : []
          var archived = new Set(archivedIds)
          var labels = workspaceLabels(workspaceState)
          var rows = []
          for (var i = 0; i < index.ids.length; i++) {
            var id = index.ids[i]
            var session = index.byId[id]
            if (session === null || typeof session !== 'object') continue
            if (session.origin === 'subagent') continue
            if (archived.has(id)) continue
            var status = statusOf(statuses, id)
            var running = session.running === true
              || (status !== null && typeof status === 'object' && status.running === true)
            if (!running) continue
            rows.push({
              id: id,
              title: typeof session.displayTitle === 'string' && session.displayTitle !== '' ? session.displayTitle : '',
              blank: session.blank === true,
              activity: activityOf(session, status !== null && typeof status === 'object' ? status : {}),
              where: labels.get(id) || baseName(session.cwd),
            })
          }
          rows.sort(function (left, right) {
            if (left.activity !== right.activity) return right.activity - left.activity
            return left.id < right.id ? -1 : left.id > right.id ? 1 : 0
          })
          for (var rank = 0; rank < rows.length; rank++) rows[rank].rank = rank
          rows.sort(function (left, right) {
            return left.id < right.id ? -1 : left.id > right.id ? 1 : 0
          })
          return rows
        }

        // -------------------------------------------------------------------
        // Placement: own a host element inside the shipped list's scroller.
        // -------------------------------------------------------------------

        /**
         * Append to a log once, so a persistent DOM mismatch cannot flood the
         * console on every reconcile beat.
         */
        function createWarner(prefix) {
          var warned = Object.create(null)
          return function warnOnce(reason) {
            if (warned[reason] === true) return
            warned[reason] = true
            console.warn(prefix + ' section hidden: ' + reason)
          }
        }

        /** The region's browser root: its first element child. */
        function listAreaOf(root) {
          for (var i = 0; i < root.children.length; i++) {
            var child = root.children[i]
            if (typeof child.className === 'string' && child.className.indexOf(SELECTORS.listAreaToken) >= 0) return child
          }
          // The browser root may grow a wrapper of its own; fall back to the
          // first descendant carrying the list-area token.
          var nested = root.querySelector('div[class*="' + SELECTORS.listAreaToken + '"]')
          return nested === null ? null : nested
        }

        /** A class token of the shape the browser gives its own scroll container. */
        function hasScrollerToken(element) {
          var className = element.className
          if (typeof className !== 'string') return false
          var tokens = className.split(/\s+/)
          for (var i = 0; i < tokens.length; i++) {
            if (SELECTORS.scrollerToken.test(tokens[i])) return true
          }
          return false
        }

        /**
         * The scrolling rows container inside the list area: the browser's own
         * `<hash>_list` element. Falls back to the nearest scrollable ancestor
         * of the rows, so a renamed CSS module degrades to a structural probe
         * instead of a missing section.
         */
        function scrollerOf(listArea) {
          var candidates = listArea.querySelectorAll('div')
          for (var i = 0; i < candidates.length; i++) {
            if (hasScrollerToken(candidates[i])) return candidates[i]
          }
          // The shipped list is the tree surface: the class token above is the
          // fast path, `role="tree"` is the semantic one.
          var tree = listArea.querySelector('[role="tree"]')
          if (tree !== null) return tree
          var row = listArea.querySelector(SELECTORS.row)
          var node = row === null ? null : row.parentElement
          while (node !== null && node !== listArea) {
            if (typeof window !== 'undefined' && typeof window.getComputedStyle === 'function') {
              var overflow = window.getComputedStyle(node).overflowY
              if (overflow === 'auto' || overflow === 'scroll') return node
            }
            node = node.parentElement
          }
          return null
        }

        /**
         * Whether a *boxed* element is actually on screen.
         *
         * Never pass the `[data-slot]` anchor here. The shipped renderer wraps
         * every slot outlet in a `display:contents` element, which produces no
         * boxes at all, so `getClientRects()` on that wrapper is permanently
         * empty even while the sidebar is wide open — judging visibility on it
         * hides the section forever. The caller passes a real box (the list
         * area) instead, and the rail state still reads correctly because a
         * `display:none` ancestor leaves every descendant without rects.
         */
        function isVisible(element) {
          if (element === null || element === undefined || typeof element !== 'object') return false
          if (typeof element.getClientRects === 'function' && element.getClientRects().length === 0) return false
          if (typeof window !== 'undefined' && typeof window.getComputedStyle === 'function') {
            var style = window.getComputedStyle(element)
            if (style.display === 'none' || style.visibility === 'hidden') return false
          }
          return true
        }

        /** Whether the horizontal-free flex-column strategy took effect. */
        function isFlexColumn(element) {
          if (typeof window === 'undefined' || typeof window.getComputedStyle !== 'function') return false
          var style = window.getComputedStyle(element)
          return style.display.indexOf('flex') === 0 && style.flexDirection === 'column'
        }

        /** The container's computed display, or `''` when unreadable. */
        function displayOf(element) {
          if (typeof window === 'undefined' || typeof window.getComputedStyle !== 'function') return ''
          return window.getComputedStyle(element).display
        }

        /** A block-level container this plugin may safely turn into a flex column. */
        function isBlockLike(display) {
          return display === 'block' || display === 'flow-root' || display === 'contents' || display === 'inline-block'
        }

        /**
         * Own `host` inside the shipped list, self-healing against re-renders.
         *
         * Placement has two strategies:
         *
         *   1. `order` — turn a block-level scroll container into a flex column
         *      (one attribute-driven rule), append the host and give it
         *      `order: -1`. No node is moved, so React's own insertions can never
         *      push the section out of first place;
         *   2. `insert` — leave the container untouched and keep the host as its
         *      first element child (the fallback for a container that is not a
         *      plain block, or where a shipped rule outranks the override).
         *
         * The controller is deliberately free of React: `useAnchorHost` owns the
         * subscription, and the browser harness can drive it directly.
         */
        function createAnchorController(options) {
          var node = options.host
          var onAttached = typeof options.onAttached === 'function' ? options.onAttached : function () {}
          var warnOnce = createWarner(LOG)
          var attached = false
          var disposed = false
          var interval = 0
          var observer = null
          var watchedRegion = null
          var watchedRoot = null
          var markedScroller = null
          /** The container `strategy` was decided for, and that decision. */
          var strategyScroller = null
          var strategy = 'insert'
          var regionNode = null
          var rootNode = null
          var listAreaNode = null
          var scrollerNode = null

          function unmark() {
            if (markedScroller !== null && markedScroller.getAttribute(LIST_ATTR) !== null) {
              markedScroller.removeAttribute(LIST_ATTR)
            }
            markedScroller = null
          }

          function detach() {
            if (node.parentNode !== null) node.parentNode.removeChild(node)
            unmark()
            // The container is back to its own display, so the next attach has
            // to decide again rather than trust a stale decision.
            strategyScroller = null
            strategy = 'insert'
            if (attached) {
              attached = false
              onAttached(null)
            }
          }

          /**
           * Point the cached nodes at the live elements, re-reading them only
           * when a cached one left the document: resolution walks a subtree,
           * while the mode checks below are cheap and must run every beat (a
           * cached node survives a rail toggle or a search overlay).
           */
          function resolve() {
            if (regionNode !== null && regionNode.isConnected
              && rootNode !== null && rootNode.isConnected
              && listAreaNode !== null && listAreaNode.isConnected
              && scrollerNode !== null && scrollerNode.isConnected) return true
            regionNode = document.querySelector(SELECTORS.region)
            rootNode = regionNode === null ? null : regionNode.firstElementChild
            listAreaNode = rootNode === null ? null : listAreaOf(rootNode)
            scrollerNode = listAreaNode === null ? null : scrollerOf(listAreaNode)
            return regionNode !== null && rootNode !== null && listAreaNode !== null && scrollerNode !== null
          }

          function bindObservers() {
            if (typeof MutationObserver !== 'function') return
            if (watchedRegion === regionNode && watchedRoot === rootNode) return
            if (observer !== null) observer.disconnect()
            observer = new MutationObserver(function () { ensure() })
            observer.observe(regionNode, { childList: true, subtree: true })
            observer.observe(rootNode, { attributes: true, attributeFilter: ['class'] })
            watchedRegion = regionNode
            watchedRoot = rootNode
          }

          /**
           * Pick the placement strategy for one container, once.
           *
           * Only a container this plugin can convert without changing its
           * layout meaning is turned into a flex column: a block-level list.
           * Anything already flex-column takes `order` as it is, and anything
           * else (a grid, a row flex) is left completely alone in favour of the
           * direct first-child placement. Reading the native display BEFORE
           * marking is what keeps this decision honest.
           *
           * @returns `'order'` when the flex/`order` strategy applies.
           */
          function decideStrategy() {
            if (strategyScroller === scrollerNode) return strategy === 'order'
            strategyScroller = scrollerNode
            strategy = 'insert'
            var display = displayOf(scrollerNode)
            if (display.indexOf('flex') === 0) {
              strategy = isFlexColumn(scrollerNode) ? 'order' : 'insert'
            } else if (isBlockLike(display)) {
              scrollerNode.setAttribute(LIST_ATTR, '')
              markedScroller = scrollerNode
              if (isFlexColumn(scrollerNode)) {
                strategy = 'order'
              } else {
                // A shipped rule outranks the override; leave no trace of it.
                unmark()
              }
            }
            return strategy === 'order'
          }

          function ensure() {
            if (disposed) return
            if (!resolve()) {
              detach()
              if (regionNode === null) warnOnce('the sidebar workspaces region is absent')
              else if (rootNode === null) warnOnce('the workspaces region has no root element')
              else if (listAreaNode === null) warnOnce('the list area was not found')
              else warnOnce('the list scroll container was not found')
              return
            }
            // Rail / collapsed sidebar: the list area is not on screen, so it
            // needs no host — and the shipped rail stays untouched. The check
            // runs on the list area, a real box, never on the slot anchor (see
            // `isVisible`).
            if (!isVisible(listAreaNode)) {
              detach()
              return
            }
            if (markedScroller !== null && markedScroller !== scrollerNode) unmark()
            // A cheap self-check for the `order` strategy: if the marker was
            // stripped from the container (another plugin, a DOM swap), forget
            // the decision so the next beat re-reads the native display.
            if (strategy === 'order' && scrollerNode.getAttribute(LIST_ATTR) === null) strategyScroller = null
            if (decideStrategy()) {
              node.style.order = '-1'
              if (node.parentNode !== scrollerNode) scrollerNode.appendChild(node)
            } else {
              // The flex/`order` strategy does not apply here: keep first place
              // the direct way and give the shipped container back untouched.
              if (markedScroller !== null) unmark()
              strategyScroller = scrollerNode
              strategy = 'insert'
              node.style.order = ''
              if (scrollerNode.firstElementChild !== node) scrollerNode.insertBefore(node, scrollerNode.firstChild)
            }
            if (!attached) {
              attached = true
              onAttached(node)
            }
            bindObservers()
          }

          return {
            ensure: ensure,
            start: function () {
              ensure()
              if (typeof window !== 'undefined' && typeof window.setInterval === 'function') {
                interval = window.setInterval(ensure, RECONCILE_MS)
              }
            },
            dispose: function () {
              disposed = true
              if (interval !== 0) window.clearInterval(interval)
              interval = 0
              if (observer !== null) observer.disconnect()
              observer = null
              if (node.parentNode !== null) node.parentNode.removeChild(node)
              unmark()
              setDisposedDebug()
            },
          }
        }

        function setDisposedDebug() {
          if (typeof window === 'undefined') return
          if (window[DEBUG_KEY] !== null && typeof window[DEBUG_KEY] === 'object') {
            window[DEBUG_KEY].host = null
          }
        }

        /** Own the host element while `active`, and only while `active`. */
        function useAnchorHost(active) {
          var pair = react.useState(null)
          var host = pair[0]
          var setHost = pair[1]
          react.useEffect(function () {
            if (!active) return undefined
            var node = document.createElement('div')
            node.className = 'dtrt-host'
            node.setAttribute(HOST_ATTR, '')
            var controller = createAnchorController({
              host: node,
              onAttached: function (value) { setHost(value) },
            })
            if (typeof window !== 'undefined' && window[DEBUG_KEY] !== null && typeof window[DEBUG_KEY] === 'object') {
              window[DEBUG_KEY].host = node
            }
            controller.start()
            return function () {
              controller.dispose()
              setHost(null)
            }
          }, [active])
          return host
        }

        // -------------------------------------------------------------------
        // Rendering
        // -------------------------------------------------------------------

        /** One running Session: pulsing dot, title, owning workspace. */
        function RunningRow(props) {
          var row = props.row
          var t = props.t
          var title = row.title !== '' ? row.title : t('blank')
          var hint = title
          if (row.where !== '') hint += ' · ' + row.where
          if (row.activity > 0) hint += ' · ' + new Date(row.activity).toLocaleString()
          return h('button', {
            type: 'button',
            className: 'dtrt-row',
            // The rank is the only thing a live list changes; keeping it in
            // `order` leaves this node — and any hover or focus on it — alone.
            style: { order: String(row.rank) },
            title: hint,
            'aria-label': t('open', { name: title }),
            onClick: function () { props.openSession(row.id) },
          },
            h('span', { className: 'dtrt-dot', 'aria-hidden': 'true' }),
            h('span', { className: 'dtrt-name' }, title),
            row.where === '' ? null : h('span', { className: 'dtrt-where' }, row.where),
          )
        }

        /** The section body, rendered as a portal into the host element. */
        function RunningSection(props) {
          return h('div', { role: 'region', 'aria-label': props.t('region.label') },
            h('div', { className: 'dtrt-head' },
              h('span', null, props.t('title')),
              h('span', { className: 'dtrt-count' }, String(props.rows.length)),
            ),
            h('div', { className: 'dtrt-rows' },
              props.rows.map(function (row) {
                return h(RunningRow, {
                  key: row.id,
                  row: row,
                  t: props.t,
                  openSession: props.openSession,
                })
              }),
            ),
          )
        }

        /**
         * Publish what the component just derived, for `inspect()` in DevTools.
         *
         * "The section is not showing" has two very different causes — nothing is
         * running, or the snapshot shape was not what this build fills in — and
         * this is what tells them apart without a debugger.
         */
        function publishProbe(list, rows) {
          if (typeof window === 'undefined') return
          var api = window[DEBUG_KEY]
          if (api === null || typeof api !== 'object') return
          var known = list !== null && typeof list === 'object'
          api.probe = {
            phase: known ? list.phase : undefined,
            sessions: known && Array.isArray(list.ids) ? list.ids.length : 0,
            running: rows.length,
            rows: rows.map(function (row) {
              return { id: row.id, title: row.title, where: row.where, rank: row.rank }
            }),
          }
        }

        /**
         * `shell.overlay` occupant. It draws no overlay chrome of its own: the
         * section is portaled into the sidebar host element.
         *
         * Every hook runs unconditionally and every derivation is guarded, so a
         * snapshot shape this build does not fill in degrades to "no section"
         * instead of throwing into the slot renderer (which would retire the
         * entry for the rest of the session).
         */
        function RunningTasksOverlay(props) {
          var t = typeof props.t === 'function' ? props.t : fallbackTranslate
          var useSessions = typeof props.useSessions === 'function' ? props.useSessions : function () { return null }
          var useSessionStatus = typeof props.useSessionStatus === 'function' ? props.useSessionStatus : function () { return null }
          var useWorkspaces = typeof props.useWorkspaces === 'function' ? props.useWorkspaces : function () { return null }
          var openSession = typeof props.openSession === 'function' ? props.openSession : function () {}

          var list = useSessions(function (state) { return state })
          var statuses = useSessionStatus(function (state) { return state })
          var workspaceState = useWorkspaces(function (state) { return state })

          var rows = react.useMemo(function () {
            var derived = []
            try {
              derived = deriveRows(list, statuses, workspaceState)
            } catch (error) {
              console.warn(LOG, 'could not derive the running Sessions; the section stays hidden', error)
            }
            publishProbe(list, derived)
            return derived
          }, [list, statuses, workspaceState])

          var host = useAnchorHost(rows.length > 0)
          if (host === null || rows.length === 0) return null
          return reactDom.createPortal(
            h(RunningSection, { rows: rows, t: t, openSession: openSession }),
            host,
          )
        }

        /** Services the Client half needs before it can register. */
        var inject = ['slots', 'locale']

        function apply(ctx) {
          ctx.effect(function () {
            return ctx.locale.register(NS, { zh: ZH, en: EN })
          }, 'dsh-top-running-tasks: dictionaries')

          /** Open a Session through the shipped navigation service. */
          function openSession(sessionId) {
            var service = ctx.get('uiWorkspace')
            if (service === undefined || service === null || typeof service.openSession !== 'function') {
              console.warn(LOG, 'uiWorkspace.openSession is unavailable; cannot open', sessionId)
              return
            }
            service.openSession(sessionId)
          }

          ctx.slots.inject('shell.overlay', function () {
            return ctx.slots.register({
              name: 'shell.overlay',
              id: 'top-running-tasks',
              order: 25,
              locale: NS,
              inject: function () { return { openSession: openSession } },
            }, RunningTasksOverlay)
          })

          if (typeof window !== 'undefined') {
            // A read-only handle for a DevTools look at what the plugin sees.
            window[DEBUG_KEY] = {
              version: VERSION,
              host: null,
              probe: null,
              deriveRows: deriveRows,
              anchor: createAnchorController,
              inspect: function () {
                var region = document.querySelector(SELECTORS.region)
                var root = region === null ? null : region.firstElementChild
                var listArea = root === null ? null : listAreaOf(root)
                var scroller = listArea === null ? null : scrollerOf(listArea)
                return {
                  version: VERSION,
                  region: region !== null,
                  listArea: listArea !== null,
                  listAreaVisible: listArea !== null && isVisible(listArea),
                  scroller: scroller !== null,
                  flexColumn: scroller !== null && isFlexColumn(scroller),
                  host: document.querySelector('[' + HOST_ATTR + ']'),
                  probe: window[DEBUG_KEY].probe,
                }
              },
            }
            console.info(LOG, 'v' + VERSION + ' loaded')
          }
        }

        exports.name = 'dsh-top-running-tasks'
        exports.inject = inject
        exports.apply = apply
        return module.exports
      },
    })
  } catch (error) {
    console.warn('[dsh-top-running-tasks] client half failed to load:', error)
  }
})()
