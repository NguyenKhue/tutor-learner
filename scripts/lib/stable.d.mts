export const DEFAULT_PORT: number
export const PLIST_LABEL: string

export interface StableConfig {
  dataDir: string
  port: number
  installDir: string
}

export function parseStableConfig(text: string, home: string): StableConfig

export function buildPlist(options: StableConfig & { nodePath: string; label?: string; logPath: string; pathEnv?: string }): string

export function parseBuildArgs(argv: string[]): { ref: string | undefined; out: string | undefined; install: boolean }

export function swapInto(installDir: string, built: string): void

export function stableConfigPath(env: Record<string, string | undefined>, home: string): string
export function launchdPath(home: string, envPath: string | undefined): string
