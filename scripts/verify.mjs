#!/usr/bin/env node
/**
 * Release gate for the package itself, independent of the runtime.
 *
 * `npm test` proves the Client half behaves; this proves the *package* is
 * publishable: the manifest declares what the loader and the plugin market read,
 * the generation marker matches the version, every display resource the market
 * shows exists and is valid, and every `files` entry actually matches something
 * (a typo there ships a package that installs and then cannot load).
 *
 * Run with: npm run verify
 */
import { readFileSync, existsSync, statSync, readdirSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const failures = []
const notes = []

const check = (label, condition, detail) => {
  if (condition) {
    notes.push('  ok   ' + label + (detail === undefined ? '' : ' — ' + detail))
  } else {
    failures.push(label + (detail === undefined ? '' : ' — ' + detail))
  }
}

const manifest = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))

// --- manifest ---------------------------------------------------------------
check('name', typeof manifest.name === 'string' && manifest.name.length > 0, manifest.name)
check('version is semver', /^\d+\.\d+\.\d+(?:-[\w.]+)?$/.test(manifest.version), manifest.version)
check('licence', manifest.license === 'MIT', manifest.license)
check('description', typeof manifest.description === 'string' && manifest.description.length >= 40, (manifest.description || '').length + ' chars')
check('repository', typeof manifest.repository?.url === 'string' && !manifest.repository.url.includes('<'), manifest.repository?.url)
check('engines.dsh', typeof manifest.engines?.dsh === 'string', manifest.engines?.dsh)
check('keywords carry dsh-plugin', Array.isArray(manifest.keywords) && manifest.keywords.includes('dsh-plugin'))

// --- dsh contract -----------------------------------------------------------
check('dsh.bundle.patch declared', manifest.dsh?.bundle?.patch === './cordis.patch.yml', manifest.dsh?.bundle?.patch)
check('patch file exists', existsSync(join(root, 'cordis.patch.yml')))
check('dsh.client.platform is web', manifest.dsh?.client?.platform === 'web')
check('client entry exported', typeof manifest.exports?.['./client'] === 'string', manifest.exports?.['./client'])
check('client entry exists', existsSync(join(root, 'client.js')))

const patch = readFileSync(join(root, 'cordis.patch.yml'), 'utf8')
check('patch inserts the row', patch.includes('id: top-running-tasks') && patch.includes("name: 'dsh-top-running-tasks'"))

// --- generation marker ------------------------------------------------------
const client = readFileSync(join(root, 'client.js'), 'utf8')
const marker = client.match(/var VERSION = '([^']+)'/)
check('client VERSION matches package version', marker !== null && marker[1] === manifest.version, marker?.[1])
check('client registers the package id', client.includes("id: '" + manifest.name + "'"))
const requires = [...client.matchAll(/require\('([^']+)'\)/g)].map((match) => match[1])
check('client requires only react + react-dom', requires.length === 2 && requires.includes('react') && requires.includes('react-dom'), requires.join(', '))

// --- display resources ------------------------------------------------------
for (const locale of ['en', 'zh']) {
  const path = join(root, 'locale', locale + '.json')
  let parsed = null
  try {
    parsed = JSON.parse(readFileSync(path, 'utf8'))
  } catch (error) {
    check('locale/' + locale + '.json parses', false, error.message)
    continue
  }
  check('locale/' + locale + '.json parses', true)
  check('locale/' + locale + ' meta.title', typeof parsed.meta?.title === 'string' && parsed.meta.title.length > 2)
  check('locale/' + locale + ' meta.description', typeof parsed.meta?.description === 'string' && parsed.meta.description.length > 20)
}

const iconPath = join(root, 'icon.svg')
if (existsSync(iconPath)) {
  const icon = readFileSync(iconPath, 'utf8')
  const size = statSync(iconPath).size
  check('icon is SVG', icon.trimStart().startsWith('<svg') && icon.trimEnd().endsWith('</svg>'))
  check('icon under 256 KiB', size < 256 * 1024, size + ' bytes')
} else {
  check('icon exists', false)
}

// --- files list -------------------------------------------------------------
// Checked hermetically (no child process, no npm): every `files` pattern must
// match a real path, and the files the loader and the market need must be
// covered by the list. A `files` entry that matches nothing ships a package
// that installs and then cannot load, which is exactly what this catches.
const SKIP_DIRS = new Set(['node_modules', '.git', '.tmp', 'dist', 'coverage'])

function walk(dir, prefix = '') {
  const found = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const rel = prefix === '' ? entry.name : prefix + '/' + entry.name
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue
      found.push(...walk(join(dir, entry.name), rel))
    } else if (entry.isFile()) {
      found.push(rel)
    }
  }
  return found
}

const onDisk = walk(root)
const patternToRegExp = (pattern) =>
  new RegExp('^' + pattern.split('*').map((part) => part.replace(/[.+^${}()|[\]\\]/g, '\\$&')).join('[^/]*') + '$')
const listed = new Set()

for (const pattern of manifest.files ?? []) {
  const hits = onDisk.filter((path) => patternToRegExp(pattern).test(path))
  check('files: ' + pattern, hits.length > 0, hits.length === 0 ? 'matches nothing' : hits.length + ' file(s)')
  for (const hit of hits) listed.add(hit)
}
for (const required of ['index.js', 'client.js', 'cordis.patch.yml', 'icon.svg', 'LICENSE', 'locale/en.json', 'locale/zh.json']) {
  check('packed: ' + required, listed.has(required))
}
check('packed: package.json is always included', true)
check('packed: dev-only files stay out', !listed.has('PUBLISH.md') && !listed.has('scripts/verify.mjs') && !listed.has('.gitignore'))

// --- report -----------------------------------------------------------------
console.log(notes.join('\n'))
if (failures.length > 0) {
  console.error('\nverify: ' + failures.length + ' problem(s)')
  for (const failure of failures) console.error('  FAIL ' + failure)
  process.exit(1)
}
console.log('\nverify: ok — ' + notes.length + ' checks, pack ' + manifest.name + '@' + manifest.version)
