// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 xianxianxianyu

import assert from 'node:assert/strict'
import { execFileSync, spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, unlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const checker = fileURLToPath(new URL('../scripts/check-public.mjs', import.meta.url))
const credential = ['token', 'synthetic-private-value'].join('=')

function repository(t) {
  const root = mkdtempSync(join(tmpdir(), 'public-check-'))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  const git = (...args) => execFileSync('git', args, { cwd: root, stdio: ['ignore', 'pipe', 'pipe'] })
  git('-c', 'init.defaultBranch=main', 'init', '--quiet')
  return {
    root,
    git,
    write(path, content) {
      const target = join(root, path)
      mkdirSync(dirname(target), { recursive: true })
      writeFileSync(target, content)
    },
    check(cwd = root) {
      const result = spawnSync(process.execPath, [checker], { cwd, encoding: 'utf8' })
      assert.equal(result.error, undefined)
      return result
    },
  }
}

test('accepts public sources and synthetic sessions without a local denylist', t => {
  const repo = repository(t)
  repo.write('public.txt', ['session-synthetic-parent', 'session-synthetic-child', 'xianxianxianyu@users.noreply.github.com', ''].join('\n'))
  repo.write('scanner.mjs', readFileSync(checker))
  repo.write('scanner.test.mjs', readFileSync(new URL('./check-public.test.mjs', import.meta.url)))
  const result = repo.check()
  assert.equal(result.status, 0, result.stderr)
  assert.equal(result.stdout, 'Public privacy check passed: 3 files (0 binary).\n')
  assert.equal(result.stderr, '')
})

test('reports every private category with line numbers but never includes the matched value', t => {
  const repo = repository(t)
  // These are generated boundary examples, never captured developer data.
  const examples = [
    ['local home or volume path', ['', 'Users', 'alice', 'project'].join('/')],
    ['local home or volume path', ['', 'Volumes', 'ExampleDisk', 'project'].join('/')],
    ['private temporary path', ['', 'private', 'tmp', 'synthetic'].join('/')],
    ['private project temporary path', ['', 'tmp', ['pstack', 'synthetic'].join('-')].join('/')],
    ['private session directory', ['~', '.dsh', 'sessions', '--synthetic'].join('/')],
    ['session identifier', ['session', '1'.repeat(8), '2'.repeat(4), '3'.repeat(4), '4'.repeat(4), '5'.repeat(12)].join('-')],
    ['API key', ['s', 'k', '-synthetic-private-value'].join('')],
    ['token assignment', credential],
    ['authorization header', ['Authorization', 'Bearer synthetic-private-value'].join(': ')],
    ['private key', ['-----BEGIN ', 'OPENSSH', ' PRIVATE KEY-----'].join('')],
    ['email address', ['synthetic', 'example.invalid'].join('@')],
  ]
  for (const [index, [, value]] of examples.entries()) repo.write(`case-${index}.txt`, `Public heading\n${value}\n`)
  const result = repo.check()
  assert.equal(result.status, 1)
  assert.equal(result.stdout, '')
  for (const [index, [rule, value]] of examples.entries()) {
    assert.ok(result.stderr.includes(`"case-${index}.txt":2: ${rule}\n`), result.stderr)
    assert.ok(!result.stderr.includes(value), 'the report must not disclose private values')
  }
  assert.ok(result.stderr.endsWith(`Public privacy check failed: ${examples.length} findings in ${examples.length} of ${examples.length} files.\n`))
})

test('scans cached and untracked paths NUL-safely, respects ignores, and includes force-added files', t => {
  const repo = repository(t)
  const unusualPath = 'untracked name\n雪.txt'
  repo.write('.gitignore', 'ignored/\ntracked.txt\n')
  repo.write('ignored/private.txt', credential)
  repo.write('tracked.txt', `Public heading\n${credential}\n`)
  repo.git('add', '--force', '--', 'tracked.txt')
  repo.write(unusualPath, `Public heading\n${credential}\n`)
  const result = repo.check()
  assert.equal(result.status, 1)
  assert.equal(result.stdout, '')
  assert.equal(result.stderr, [
    '"tracked.txt":2: token assignment',
    `${JSON.stringify(unusualPath)}:2: token assignment`,
    'Public privacy check failed: 2 findings in 2 of 3 files.',
    '',
  ].join('\n'))
})

test('allows only the exact required license address in its attribution file', t => {
  const repo = repository(t)
  const upstreamEmail = 'eemeli\x40gmail.com'
  repo.write('THIRD_PARTY_NOTICES.md', `Copyright Eemeli Aro <${upstreamEmail}>\n`)
  assert.equal(repo.check().status, 0)

  repo.write('elsewhere.txt', upstreamEmail)
  repo.write('THIRD_PARTY_NOTICES.md', `Copyright Eemeli Aro <${upstreamEmail}>\n${['other', 'example.invalid'].join('@')}\n`)
  const result = repo.check()
  assert.equal(result.status, 1)
  assert.equal(result.stderr, [
    '"THIRD_PARTY_NOTICES.md":2: email address',
    '"elsewhere.txt":1: email address',
    'Public privacy check failed: 2 findings in 2 of 2 files.',
    '',
  ].join('\n'))
})

test('permits parser type declarations only in the byte-identical vendored source', t => {
  const repo = repository(t)
  const path = 'skills/pstack-statechart/scripts/frontends/config.ts'
  const parser = readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')
  repo.write(path, parser)
  assert.equal(repo.check().status, 0)
  repo.write(path, `${parser}\n${credential}\n`)
  const changed = repo.check()
  assert.equal(changed.status, 1)
  assert.match(changed.stderr, /token assignment/u)
  assert.ok(!changed.stderr.includes(credential))
  repo.write(path, parser)
  repo.write('copied-parser.ts', parser)
  assert.equal(repo.check().status, 1, 'the exception cannot spread to another file')
})

test('inspects binary assets for embedded private metadata and reports byte offsets', t => {
  const repo = repository(t)
  const image = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+kC9sAAAAASUVORK5CYII=', 'base64')
  repo.write('asset.png', image)
  const clean = repo.check()
  assert.equal(clean.status, 0, clean.stderr)
  assert.equal(clean.stdout, 'Public privacy check passed: 1 files (1 binary).\n')

  repo.write('asset.png', Buffer.concat([image, Buffer.from(`\0${credential}\0`)]))
  const result = repo.check()
  assert.equal(result.status, 1)
  assert.equal(result.stderr, [
    `"asset.png":byte ${image.length + 2}: token assignment`,
    'Public privacy check failed: 1 findings in 1 of 1 files.',
    '',
  ].join('\n'))
})

test('scans from a subdirectory and retains unstaged deletions until Git stages their removal', t => {
  const repo = repository(t)
  repo.write('gone.txt', credential)
  repo.git('add', '--', 'gone.txt')
  unlinkSync(join(repo.root, 'gone.txt'))
  repo.write('nested/public.txt', 'Public fixture\n')
  const staged = repo.check(join(repo.root, 'nested'))
  assert.equal(staged.status, 1)
  assert.match(staged.stderr, /"gone.txt":1: token assignment \(index\)/u)
  repo.git('rm', '--cached', '--', 'gone.txt')
  const removed = repo.check(join(repo.root, 'nested'))
  assert.equal(removed.status, 0, removed.stderr)
  assert.equal(removed.stdout, 'Public privacy check passed: 1 files (0 binary).\n')
})

test('checks both the staged version and an unstaged working copy', t => {
  const repo = repository(t)
  repo.write('draft.txt', credential)
  repo.git('add', '--', 'draft.txt')
  repo.write('draft.txt', 'Public fixture\n')
  const staged = repo.check()
  assert.equal(staged.status, 1)
  assert.match(staged.stderr, /"draft.txt":1: token assignment \(index\)/u)
  repo.git('add', '--', 'draft.txt')
  assert.equal(repo.check().status, 0)
  repo.write('draft.txt', credential)
  const working = repo.check()
  assert.equal(working.status, 1)
  assert.match(working.stderr, /"draft.txt":1: token assignment\n/u)
})

test('inspects symlink targets without following them into ignored private content', t => {
  const repo = repository(t)
  repo.write('.gitignore', 'ignored/\n')
  repo.write('ignored/private.txt', credential)
  symlinkSync('ignored/private.txt', join(repo.root, 'public-link'))
  const safe = repo.check()
  assert.equal(safe.status, 0, safe.stderr)
  assert.equal(safe.stdout, 'Public privacy check passed: 2 files (0 binary).\n')

  symlinkSync(['', 'Users', 'alice', 'private.txt'].join('/'), join(repo.root, 'private-link'))
  const result = repo.check()
  assert.equal(result.status, 1)
  assert.equal(result.stderr, '"private-link":1: local home or volume path\nPublic privacy check failed: 1 findings in 1 of 3 files.\n')
})

test('redacts sensitive filenames rather than echoing their credentials', t => {
  const repo = repository(t)
  repo.write(`${credential}.txt`, 'Public content\n')
  const result = repo.check()
  assert.equal(result.status, 1)
  assert.equal(result.stderr, '"[redacted path 1]":1: token assignment (filename)\nPublic privacy check failed: 1 findings in 1 of 1 files.\n')
  assert.ok(!result.stderr.includes(credential))
})

test('loads an ignored local denylist as trimmed literal terms, not regular expressions', t => {
  const repo = repository(t)
  repo.write('.gitignore', '*.local.txt\n')
  repo.write('check-public.local.txt', ' \r\n  Alice.Example+[tag]  \r\n\n')
  repo.write('public.txt', 'aliceXexampletag\nPublic fixture\n')
  const clean = repo.check()
  assert.equal(clean.status, 0, clean.stderr)
  assert.equal(clean.stdout, 'Public privacy check passed: 2 files (0 binary).\n')
  assert.equal(clean.stderr, '')

  const value = 'ALICE.EXAMPLE+[TAG]'
  repo.write('public.txt', `Public heading\n${value}\n`)
  const result = repo.check()
  assert.equal(result.status, 1)
  assert.equal(result.stdout, '')
  assert.equal(result.stderr, '"public.txt":2: local denylist term\nPublic privacy check failed: 1 findings in 1 of 2 files.\n')
  assert.ok(!result.stderr.includes(value))
  assert.ok(!result.stderr.includes('Alice.Example+[tag]'))
})

test('applies the ignored root denylist to working and staged content from a subdirectory', t => {
  const repo = repository(t)
  repo.write('.gitignore', '*.local.txt\n')
  repo.write('check-public.local.txt', 'alice\nExampleDisk\n')
  repo.write('staged.txt', 'Public heading\nExampleDisk\n')
  repo.write('nested/working.txt', 'Public fixture\n')
  repo.git('add', '--', 'staged.txt', 'nested/working.txt')
  repo.write('staged.txt', 'Public fixture\n')
  repo.write('nested/working.txt', 'Public heading\nAlice\n')
  const result = repo.check(join(repo.root, 'nested'))
  assert.equal(result.status, 1)
  assert.equal(result.stdout, '')
  assert.equal(result.stderr, [
    '"nested/working.txt":2: local denylist term',
    '"staged.txt":2: local denylist term (index)',
    'Public privacy check failed: 2 findings in 2 of 3 files.',
    '',
  ].join('\n'))
  assert.ok(!/alice|ExampleDisk/i.test(result.stderr))
})

test('redacts filenames matching a local denylist term', t => {
  const repo = repository(t)
  repo.write('.gitignore', '*.local.txt\n')
  repo.write('check-public.local.txt', 'alice\n')
  repo.write('Alice.txt', 'Public fixture\n')
  const result = repo.check()
  assert.equal(result.status, 1)
  assert.equal(result.stdout, '')
  assert.equal(result.stderr, '"[redacted path 2]":1: local denylist term (filename)\nPublic privacy check failed: 1 findings in 1 of 2 files.\n')
  assert.ok(!/alice/i.test(result.stderr))
})

for (const state of ['unignored', 'force-added', 'cached but deleted']) {
  test(`rejects a publishable local denylist when ${state}`, t => {
    const repo = repository(t)
    if (state !== 'unignored') repo.write('.gitignore', '*.local.txt\n')
    repo.write('check-public.local.txt', state === 'unignored' ? '' : 'alice\n')
    if (state !== 'unignored') repo.git('add', '--force', '--', 'check-public.local.txt')
    if (state === 'cached but deleted') unlinkSync(join(repo.root, 'check-public.local.txt'))
    const result = repo.check()
    assert.equal(result.status, 1)
    assert.equal(result.stdout, '')
    assert.equal(result.stderr, 'Public privacy check could not scan repository (LOCAL_DENYLIST_PUBLISHABLE).\n')
    assert.ok(!/alice/i.test(result.stderr))
    assert.ok(!result.stderr.includes(repo.root))
  })
}

test('fails closed without exposing the working directory when Git discovery fails', t => {
  const root = mkdtempSync(join(tmpdir(), 'public-check-unversioned-'))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  const result = spawnSync(process.execPath, [checker], { cwd: root, encoding: 'utf8' })
  assert.equal(result.error, undefined)
  assert.equal(result.status, 1)
  assert.equal(result.stdout, '')
  assert.equal(result.stderr, 'Public privacy check could not scan repository (scan error).\n')
  assert.ok(!result.stderr.includes(root))
})
