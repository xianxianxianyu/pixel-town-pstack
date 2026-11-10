import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readdir, readFile } from 'node:fs/promises'
import { join, relative, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import test from 'node:test'

const root = new URL('../', import.meta.url)
const prefix = 'skills/pstack-statechart/scripts/'

test('vendored statechart runtime matches the pinned upstream SHA-256 inventory', async () => {
  const notice = await readFile(new URL('THIRD_PARTY_NOTICES.md', root), 'utf8')
  const inventory = /### Statechart runtime SHA-256 inventory[\s\S]*?```sha256\n([\s\S]*?)\n```/u.exec(notice)?.[1]
  assert.ok(inventory, 'upstream runtime inventory is required')
  const entries = inventory.split('\n').map(line => {
    const match = /^([a-f0-9]{64})  (skills\/pstack-statechart\/scripts\/[\w./-]+)$/u.exec(line)
    assert.ok(match, 'each inventory row names a runtime file and SHA-256')
    return { hash: match[1], path: match[2] }
  })
  const installed = (await readdir(new URL(prefix, root), { recursive: true, withFileTypes: true }))
    .filter(entry => entry.isFile() && entry.name !== 'doctor.mjs')
    .map(entry => relative(fileURLToPath(root), join(entry.parentPath, entry.name)).split(sep).join('/'))
  assert.deepEqual(installed.sort(), entries.map(entry => entry.path).sort(), 'no missing or unrecorded upstream runtime files')
  for (const { hash, path } of entries) {
    const bytes = await readFile(new URL(path, root))
    assert.equal(createHash('sha256').update(bytes).digest('hex'), hash, path)
  }
})
