#!/usr/bin/env node
// Usage: npm run -s stable:launchd > ~/Library/LaunchAgents/vn.khue.tutor-learner.plist
// Prints the launchd file that starts the stable server at login (see docs/stable-deploy.md).
import { PLIST_LABEL, buildPlist, launchdPath, parseStableConfig, stableConfigPath } from './lib/stable.mjs'
import { existsSync, readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

const configPath = stableConfigPath(process.env, homedir())
if (!existsSync(configPath)) {
  console.error(`No stable settings found at ${configPath}. Create it first: see docs/stable-deploy.md`)
  process.exit(1)
}
try {
  const config = parseStableConfig(readFileSync(configPath, 'utf8'), homedir())
  process.stdout.write(
    buildPlist({
      ...config,
      nodePath: process.execPath,
      label: PLIST_LABEL,
      logPath: join(homedir(), 'Library', 'Logs', 'tutor-learner.log'),
      pathEnv: launchdPath(homedir(), process.env.PATH),
    }),
  )
} catch (error) {
  console.error(`${configPath}: ${error instanceof Error ? error.message : error}`)
  process.exit(1)
}
