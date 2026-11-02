export type Theme = 'light' | 'system' | 'dark'

export const THEMES: [Theme, string][] = [
  ['light', 'Light'],
  ['system', 'System'],
  ['dark', 'Dark'],
]
const THEME_KEY = 'tutor-theme'

/** Reads the saved theme, defaulting to System when nothing is stored. */
export function storedTheme(): Theme {
  try {
    const t = localStorage.getItem(THEME_KEY)
    if (t === 'light' || t === 'system' || t === 'dark') return t
  } catch {
    // storage unavailable (private mode) — keep the default
  }
  return 'system'
}

/** Applies a theme to the page. */
export function applyTheme(theme: Theme): void {
  const root = document.documentElement
  if (theme === 'system') root.removeAttribute('data-theme')
  else root.dataset.theme = theme
}

/** Applies a theme and remembers it for the next visit. */
export function saveTheme(theme: Theme): void {
  applyTheme(theme)
  try {
    localStorage.setItem(THEME_KEY, theme)
  } catch {
    // storage unavailable — the choice only lasts this session
  }
}
