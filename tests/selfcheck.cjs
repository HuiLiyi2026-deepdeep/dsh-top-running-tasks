/**
 * Self-check for the Client half.
 *
 * Loads `client.js` through a stubbed dynamic-module protocol (no bundler, no
 * browser), then drives the registration and the derivation with the exact
 * shapes the shipped slots hand a `shell.overlay` occupant. It checks:
 *
 *   - the module registers a factory whose id is the package name;
 *   - `apply` registers ONE `shell.overlay` entry that asks for the
 *     `top-running-tasks` locale namespace and an `openSession` injection;
 *   - `deriveRows` keeps only `running === true`, drops subagent and archived
 *     Sessions, ranks by most recent activity, and returns a stable DOM order;
 *   - the rendered section carries `order` per row (CSS ranking, no node moves);
 *   - nothing renders when nothing runs.
 *
 * Run with: node tests/selfcheck.cjs
 */
'use strict'

const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')

const SOURCE = fs.readFileSync(path.join(__dirname, '..', 'client.js'), 'utf8')

// --- stubs -----------------------------------------------------------------

const FAKE_HOST = { __fakeHost: true }

function makeElement(type, props, children) {
  return { type, props: Object.assign({}, props, { children }), __el: true }
}

const React = {
  Fragment: Symbol('Fragment'),
  createElement(type, props) {
    const children = Array.prototype.slice.call(arguments, 2)
    return makeElement(type, props, children.length <= 1 ? children[0] : children)
  },
  useState: () => [FAKE_HOST, () => {}],
  useEffect: () => {},
  useMemo: (fn) => fn(),
  useRef: (value) => ({ current: value }),
}

const ReactDOM = {
  createPortal: (child, node) => ({ __portal: true, child, node }),
}

const required = []
function requireStub(id) {
  required.push(id)
  if (id === 'react') return React
  if (id === 'react-dom') return ReactDOM
  throw new Error('unexpected module ' + id)
}

const created = []
const document = {
  createElement() {
    const tag = { dataset: {}, style: {}, className: '', textContent: '' }
    tag.setAttribute = () => {}
    created.push(tag)
    return tag
  },
  querySelector: () => null,
  head: { appendChild: () => {} },
}

const captured = []
const windowStub = { __ModuleLoader__: { load: (spec) => captured.push(spec) } }
const sandbox = { window: windowStub, document, console }
sandbox.globalThis = sandbox
vm.runInNewContext(SOURCE, sandbox, { filename: 'client.js' })

assert.equal(captured.length, 1, 'client.js registers exactly one module')
assert.equal(captured[0].id, 'dsh-top-running-tasks', 'module id is the package name')

const client = captured[0].factory(requireStub)
assert.deepEqual(required, ['react', 'react-dom'], 'only react and react-dom are required')

// --- apply -----------------------------------------------------------------

const registrations = []
const opened = []
const ctx = {
  effect: (fn) => fn(),
  locale: { register: () => () => {} },
  slots: {
    inject: (key, callback) => callback(),
    register: (options, component) => {
      registrations.push({ options, component })
      return () => {}
    },
  },
  get: (name) => (name === 'uiWorkspace' ? { openSession: (id) => opened.push(id) } : undefined),
}

assert.equal(client.name, 'dsh-top-running-tasks')
assert.deepEqual(client.inject, ['slots', 'locale'])
client.apply(ctx)

assert.equal(registrations.length, 1, 'one slot entry')
assert.equal(registrations[0].options.name, 'shell.overlay')
assert.equal(registrations[0].options.id, 'top-running-tasks')
assert.equal(registrations[0].options.locale, 'top-running-tasks')
const injected = registrations[0].options.inject()
assert.equal(typeof injected.openSession, 'function', 'the entry injects openSession')

const debug = windowStub.__dshTopRunningTasks
assert.ok(debug && typeof debug.deriveRows === 'function', 'the DevTools handle exists')

// --- derivation ------------------------------------------------------------

const NOW = 1700000000000

function snapshots(sessions) {
  const ids = sessions.map((s) => s.id)
  const byId = {}
  for (const s of sessions) byId[s.id] = s
  return { phase: 'ready', ids, byId }
}

const sessions = snapshots([
  { id: 'a-old', displayTitle: 'Oldest', updatedAt: NOW - 9000, cwd: '/w/one' },
  { id: 'b-run', displayTitle: 'Middle', updatedAt: NOW - 5000, cwd: '/w/two' },
  { id: 'c-new', displayTitle: 'Newest', updatedAt: NOW - 1000, cwd: '/w/three' },
  { id: 'd-idle', displayTitle: 'Idle', updatedAt: NOW, cwd: '/w/one' },
  { id: 'e-sub', displayTitle: 'Subagent', updatedAt: NOW, cwd: '/w/one', origin: 'subagent' },
  { id: 'f-arch', displayTitle: 'Archived', updatedAt: NOW, cwd: '/w/one' },
  { id: 'g-status', displayTitle: 'Status fresh', updatedAt: NOW - 8000, cwd: '/w/four' },
])

const statusMap = new Map([
  ['a-old', { running: true }],
  ['b-run', { running: true }],
  ['c-new', { running: true }],
  ['d-idle', { running: false }],
  ['e-sub', { running: true }],
  ['f-arch', { running: true }],
  ['g-status', { running: true, updatedAt: NOW - 100 }],
])

const workspaceState = {
  items: [
    { workspaceId: 'w1', title: 'One', path: '/w/one', sessionIds: ['a-old', 'd-idle', 'e-sub', 'f-arch'] },
    { workspaceId: 'w2', title: '', path: '/w/two', sessionIds: ['b-run'] },
    { workspaceId: 'w3', title: 'Three', path: '/w/three', sessionIds: ['c-new'] },
    { workspaceId: 'w4', title: 'Four', path: '/w/four', sessionIds: ['g-status'] },
  ],
  archivedSessionIds: ['f-arch'],
}

const rows = debug.deriveRows(sessions, statusMap, workspaceState)
const ids = rows.map((r) => r.id)
const byId = Object.fromEntries(rows.map((r) => [r.id, r]))

assert.deepEqual([...ids].sort(), ['a-old', 'b-run', 'c-new', 'g-status'], 'only running, live Sessions')
assert.ok(!ids.includes('d-idle'), 'a non-running Session is excluded')
assert.ok(!ids.includes('e-sub'), 'a subagent Session is excluded')
assert.ok(!ids.includes('f-arch'), 'an archived Session is excluded')

// Rank is activity, not DOM position: g-status is freshest through its status,
// then c-new, b-run, a-old.
assert.equal(byId['g-status'].rank, 0, 'the status update wins over a stale session stamp')
assert.equal(byId['c-new'].rank, 1)
assert.equal(byId['b-run'].rank, 2)
assert.equal(byId['a-old'].rank, 3)

// The DOM order stays sorted by id so a re-rank never moves a node.
assert.deepEqual(ids, ['a-old', 'b-run', 'c-new', 'g-status'], 'stable DOM order by id')

// Labels: an explicit title, else the directory's last segment.
assert.equal(byId['a-old'].where, 'One')
assert.equal(byId['b-run'].where, 'two')
assert.equal(byId['g-status'].where, 'Four')

assert.deepEqual(debug.deriveRows({ phase: 'ready', ids: [], byId: {} }, statusMap, workspaceState), [])
assert.deepEqual(debug.deriveRows(undefined, undefined, undefined), [])
assert.deepEqual(
  debug.deriveRows(snapshots([{ id: 'x', updatedAt: NOW }]), new Map(), null),
  [],
  'a Session without a running status never appears',
)

// Tolerant shapes: an array snapshot, a collection key, a plain-object status
// map, and the running flag living on the Session record itself.
assert.deepEqual(
  debug.deriveRows(
    [
      { id: 't1', displayTitle: 'T1', updatedAt: NOW - 10 },
      { id: 't2', displayTitle: 'T2', updatedAt: NOW - 20 },
    ],
    { t2: { running: true } },
    null,
  ).map((row) => row.id),
  ['t2'],
  'an array snapshot with a plain-object status map is read, not dropped',
)
assert.deepEqual(
  debug.deriveRows(
    { phase: 'ready', sessions: [{ id: 't3', displayTitle: 'T3', running: true }] },
    undefined,
    null,
  ).map((row) => row.id),
  ['t3'],
  'the running flag on the Session record itself is honoured',
)

// --- rendering -------------------------------------------------------------

const Overlay = registrations[0].component
const props = {
  t: (key, params) => (params && params.name ? key + ':' + params.name : key),
  useSessions: (selector) => selector(sessions),
  useSessionStatus: (selector) => selector(statusMap),
  useWorkspaces: (selector) => selector(workspaceState),
  openSession: injected.openSession,
}

const tree = Overlay(props)
assert.ok(tree && tree.__portal === true, 'the section is portaled into the host element')
assert.equal(tree.node, FAKE_HOST)

const section = tree.child
assert.equal(section.type.name, 'RunningSection', 'the portal renders the section')
// The section is a function component: render it the way React would.
const filled = section.type(section.props)
const head = filled.props.children[0]
const rowsBox = filled.props.children[1]
assert.equal(head.props.children[1].props.children, '4', 'the header counts the running Sessions')

const rowEls = rowsBox.props.children
assert.equal(rowEls.length, 4)
assert.deepEqual(
  rowEls.map((el) => el.type.name),
  ['RunningRow', 'RunningRow', 'RunningRow', 'RunningRow'],
)
const buttons = rowEls.map((el) => el.type(el.props))
const orders = buttons.map((el) => el.props.style.order)
assert.deepEqual(orders, ['3', '2', '1', '0'], 'visual rank is expressed as CSS order')
buttons.forEach((el) => {
  assert.equal(el.type, 'button', 'a row is a real button')
  assert.equal(el.props.type, 'button')
})

// Clicking a row opens its Session.
buttons[2].props.onClick()
assert.deepEqual(opened, ['c-new'], 'the click opens the matching Session')

// Nothing rendered when nothing runs.
const quiet = Overlay(Object.assign({}, props, {
  useSessionStatus: (selector) => selector(new Map([['a-old', { running: false }]])),
}))
assert.equal(quiet, null, 'no running Session means no section')

// A snapshot shape this build does not fill in must not throw.
const broken = Overlay(Object.assign({}, props, {
  useSessions: () => ({ phase: 'loading' }),
}))
assert.equal(broken, null, 'an unknown snapshot degrades to no section')

// Without a bound locale namespace the labels fall back to readable literals.
const fallbackTree = Overlay(Object.assign({}, props, { t: undefined }))
const fallbackSection = fallbackTree.child.type(fallbackTree.child.props)
const fallbackHead = fallbackSection.props.children[0]
assert.equal(fallbackHead.props.children[0].props.children, 'Running', 'the heading falls back to a literal')
const fallbackRows = fallbackSection.props.children[1].props.children.map((el) => el.type(el.props))
assert.equal(fallbackRows[0].props['aria-label'], 'Open session Oldest', 'the row label falls back, interpolated')
assert.ok(
  fallbackRows[0].props.title.indexOf('Oldest · One') === 0,
  'the tooltip carries the title, the workspace and the activity stamp',
)

// The DevTools probe reports what the component saw.
assert.ok(debug.probe !== null && typeof debug.probe === 'object', 'the probe is published')
assert.equal(debug.probe.running, 4, 'the probe counts the running Sessions')
assert.equal(debug.probe.sessions, 7, 'the probe counts every Session in the snapshot')
assert.equal(debug.probe.phase, 'ready')

console.log('selfcheck: ok')
