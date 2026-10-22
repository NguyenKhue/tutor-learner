#!/usr/bin/env node
// Usage: npm run stable:start
// Starts the installed stable server with the settings in ~/.config/tutor-learner/stable.json (see docs/stable-deploy.md).
import { parseStableConfig, stableConfigPath } from './lib/stable.mjs'
import { spawn } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

function fail(message) {
  console.error(message)
  process.exit(1)
}

const configPath = stableConfigPath(process.env, homedir())
if (!existsSync(configPath)) fail(`No stable settings found at ${configPath}. Create it first: see docs/stable-deploy.md`)

let config
try {
  config = parseStableConfig(readFileSync(configPath, 'utf8'), homedir())
} catch (error) {
  fail(`${configPath}: ${error instanceof Error ? error.message : error}`)
}

const server = join(config.installDir, 'server.mjs')
const site = join(config.installDir, 'site')
if (!existsSync(server) || !existsSync(site)) fail(`Nothing is installed in ${config.installDir} yet. Run: npm run stable:build`)

const child = spawn(
  process.execPath,
  [
    '--disable-warning=ExperimentalWarning',
    server,
    '--role',
    'stable',
    '--data',
    config.dataDir,
    '--port',
    String(config.port),
    '--static',
    site,
  ],
  { cwd: config.installDir, stdio: 'inherit' },
)
child.on('exit', (code) => process.exit(code ?? 1))
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => child.kill(signal))
