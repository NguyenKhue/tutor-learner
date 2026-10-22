import { useEffect, useState } from 'react'
import { NavLink, Outlet } from 'react-router-dom'

const NAV = [
  ['/', 'Today'],
  ['/topics', 'Topics'],
  ['/progress', 'Progress'],
  ['/settings', 'Settings'],
] as const

type Theme = 'light' | 'system' | 'dark'
const THEMES: [Theme, string][] = [
  ['light', 'Light'],
  ['system', 'System'],
  ['dark', 'Dark'],
]
const THEME_KEY = 'tutor-theme'

/** Reads the saved theme, defaulting to System when nothing is stored. */
function storedTheme(): Theme {
  try {
    const t = localStorage.getItem(THEME_KEY)
    if (t === 'light' || t === 'system' || t === 'dark') return t
  } catch {
    // storage unavailable (private mode) — keep the default
  }
  return 'system'
}

/** App shell: top bar with brand, nav and theme toggle, the page below. */
export function Layout() {
  const [theme, setTheme] = useState<Theme>(storedTheme)

  useEffect(() => {
    const root = document.documentElement
    if (theme === 'system') root.removeAttribute('data-theme')
    else root.dataset.theme = theme
  }, [theme])

  /** Picks a theme and remembers it for the next visit. */
  const pickTheme = (t: Theme) => {
    setTheme(t)
    try {
      localStorage.setItem(THEME_KEY, t)
    } catch {
      // storage unavailable — the choice only lasts this session
    }
  }

  return (
    <div className="wrap">
      <header className="top">
        <div className="brand">Tutor</div>
        <nav>
          {NAV.map(([to, label]) => (
            <NavLink key={to} to={to} end={to === '/'}>
              {label}
            </NavLink>
          ))}
        </nav>
        <div className="top-right">
          <span className="theme" role="group" aria-label="Theme">
            {THEMES.map(([t, label]) => (
              <button key={t} type="button" aria-pressed={theme === t} onClick={() => pickTheme(t)}>
                {label}
              </button>
            ))}
          </span>
        </div>
      </header>
      <main>
        <Outlet />
      </main>
    </div>
  )
}
