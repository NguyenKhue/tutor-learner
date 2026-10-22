#!/usr/bin/env node
// Test stand-in for the claude CLI. Driven by env:
// FAKE_CLAUDE_MODE ok | bad-json | schema-miss | hang | limit | auth | fail-then-ok
// FAKE_CLAUDE_OUTPUT JSON for structured_output; FAKE_CLAUDE_COUNTER file for fail-then-ok;
// FAKE_CLAUDE_LOG file that receives {argv, stdin} as one JSON line per run.
import fs from 'node:fs'

let stdin = ''
process.stdin.setEncoding('utf8')
process.stdin.on('data', (c) => (stdin += c))
process.stdin.on('end', () => {
  const env = process.env
  if (env.FAKE_CLAUDE_LOG) fs.appendFileSync(env.FAKE_CLAUDE_LOG, JSON.stringify({ argv: process.argv.slice(2), stdin }) + '\n')
  let mode = env.FAKE_CLAUDE_MODE ?? 'ok'
  if (mode === 'fail-then-ok') {
    const n = Number(fs.existsSync(env.FAKE_CLAUDE_COUNTER) ? fs.readFileSync(env.FAKE_CLAUDE_COUNTER, 'utf8') : '0')
    fs.writeFileSync(env.FAKE_CLAUDE_COUNTER, String(n + 1))
    mode = n === 0 ? 'bad-json' : 'ok'
  }
  const output = JSON.parse(env.FAKE_CLAUDE_OUTPUT ?? '{"ok":true}')
  switch (mode) {
    case 'ok':
      process.stdout.write(JSON.stringify({ type: 'result', subtype: 'success', is_error: false, result: JSON.stringify(output), structured_output: output }))
      return
    case 'bad-json':
      process.stdout.write('not json')
      return
    case 'schema-miss':
      process.stdout.write(JSON.stringify({ type: 'result', subtype: 'success', is_error: false, result: 'hello' }))
      return
    case 'hang':
      setInterval(() => {}, 1000)
      return
    case 'limit':
      process.stdout.write(JSON.stringify({ type: 'result', subtype: 'success', is_error: true, result: 'Claude AI usage limit reached|1761200000' }))
      process.exitCode = 1
      return
    case 'auth':
      process.stderr.write('Invalid API key · Please run /login\n')
      process.exitCode = 1
      return
  }
})
