#!/usr/bin/env node
// Usage: npm run stable:build [-- --ref <git ref>] [-- --out <folder>] [-- --install]
// Builds the app and the stable server from a clean checkout of a git ref (so uncommitted work never ends up in the stable build)
// and puts them in the install folder. Restart the stable server afterwards to use the new code.
import { PLIST_LABEL, parseBuildArgs, parseStableConfig, stableConfigPath, swapInto } from './lib/stable.mjs'
import { execFileSync } from 'node:child_process'
import { copyFileSync, existsSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import { join } from 'node:path'

const run = (command, args, options = {}) => execFileSync(command, args, { stdio: 'inherit', ...options })
const output = (command, args, options = {}) => execFileSync(command, args, { encoding: 'utf8', ...options }).trim()

try {
  const args = parseBuildArgs(process.argv.slice(2))
  const repo = output('git', ['rev-parse', '--show-toplevel'])

  let installDir = join(homedir(), 'stable', 'tutor-learner')
  const configPath = stableConfigPath(process.env, homedir())
  if (existsSync(configPath)) installDir = parseStableConfig(readFileSync(configPath, 'utf8'), homedir()).installDir
  if (args.out) installDir = args.out

  if (!args.ref && output('git', ['status', '--porcelain', '--untracked-files=no'], { cwd: repo }) !== '') {
    throw new Error(
      'There are uncommitted changes. Commit them, or build a ref that is already committed: npm run stable:build -- --ref <branch or tag>',
    )
  }
  const ref = args.ref ?? 'HEAD'
  const commit = output('git', ['rev-parse', ref], { cwd: repo })

  const temporary = mkdtempSync(join(tmpdir(), 'tutor-stable-build-'))
  const checkout = join(temporary, 'checkout')
  const built = join(temporary, 'built')
  try {
    console.log(`Building ${ref} (${commit.slice(0, 8)}) into ${installDir}`)
    run('git', ['worktree', 'add', '--detach', checkout, commit], { cwd: repo })
    if (args.install) run('npm', ['ci'], { cwd: checkout })
    else symlinkSync(join(repo, 'node_modules'), join(checkout, 'node_modules'))

    run(join(checkout, 'node_modules', '.bin', 'vite'), ['build', '--base=/', '--outDir', join(built, 'site')], { cwd: checkout })
    run(
      join(checkout, 'node_modules', '.bin', 'esbuild'),
      [
        'server/cli.ts',
        '--bundle',
        '--platform=node',
        '--format=esm',
        '--target=node22',
        '--alias:@=./src',
        `--outfile=${join(built, 'server.mjs')}`,
        '--log-level=warning',
      ],
      { cwd: checkout },
    )
    copyFileSync(join(checkout, 'tutor.config.json'), join(built, 'tutor.config.json'))

    swapInto(installDir, built)
    writeFileSync(join(installDir, 'VERSION'), `${commit}\n${new Date().toISOString()}\n`)
    console.log(`\nInstalled ${commit.slice(0, 8)} in ${installDir}.`)
    console.log('If the stable server is running, restart it to use the new code:')
    console.log(`  launchctl kickstart -k gui/$(id -u)/${PLIST_LABEL}`)
  } finally {
    try {
      run('git', ['worktree', 'remove', '--force', checkout], { cwd: repo, stdio: 'ignore' })
    } catch {
      // The temporary checkout is removed with its folder below
    }
    rmSync(temporary, { recursive: true, force: true })
    try {
      run('git', ['worktree', 'prune'], { cwd: repo, stdio: 'ignore' })
    } catch {
      // Nothing to prune
    }
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
}
