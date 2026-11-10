import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readdir, readFile } from 'node:fs/promises'
import test from 'node:test'

const root = new URL('../', import.meta.url)
const prefix = 'skills/pstack-poteto-mode/references/principles/'
const upstream = 'ae5650febf4320793844c12c4adaa937f417f8da'

test('vendored poteto principles match the pinned upstream SHA-256 inventory byte for byte', async () => {
  const notice = await readFile(new URL('THIRD_PARTY_NOTICES.md', root), 'utf8')
  assert.ok(notice.includes(`Vendored poteto-mode principles`) && notice.includes(upstream), 'the notice pins the upstream revision')
  const inventory = /### Poteto-mode principles SHA-256 inventory[\s\S]*?```sha256\n([\s\S]*?)\n```/u.exec(notice)?.[1]
  assert.ok(inventory, 'principles inventory is required')
  const entries = inventory.split('\n').map(line => {
    const match = /^([a-f0-9]{64})  (skills\/pstack-poteto-mode\/references\/principles\/([a-z-]+)\.md)$/u.exec(line)
    assert.ok(match, `inventory row names a principle file and SHA-256: ${line}`)
    return { hash: match[1], path: match[2], name: match[3] }
  })
  assert.equal(entries.length, 24)
  const installed = (await readdir(new URL(prefix, root))).map(file => `${prefix}${file}`)
  assert.deepEqual(installed.sort(), entries.map(entry => entry.path).sort(), 'no missing or unrecorded principle files')
  for (const { hash, path, name } of entries) {
    const bytes = await readFile(new URL(path, root))
    assert.equal(createHash('sha256').update(bytes).digest('hex'), hash, path)
    assert.match(bytes.toString('utf8'), new RegExp(`^---\\nname: principle-${name}\\n`, 'u'), `${path} keeps its upstream leaf name`)
  }
})
