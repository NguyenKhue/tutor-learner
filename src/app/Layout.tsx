import { useEffect } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { applyTheme, storedTheme } from '../lib/theme'

/** The five destinations. Each carries the stroke icon the phone tab bar shows above its label. */
const NAV = [
  [
    '/',
    'Today',
    <svg key="today" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </svg>,
  ],
  [
    '/reading',
    'Reading',
    <svg key="reading" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2z" />
      <path d="M4 21V5" />
    </svg>,
  ],
  [
    '/topics',
    'Topics',
    <svg key="topics" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3" y="3" width="7" height="7" rx="2" />
      <rect x="14" y="3" width="7" height="7" rx="2" />
      <rect x="3" y="14" width="7" height="7" rx="2" />
      <rect x="14" y="14" width="7" height="7" rx="2" />
    </svg>,
  ],
  [
    '/progress',
    'Progress',
    <svg key="progress" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M4 20V10M10 20V4M16 20v-7M22 20H2" />
    </svg>,
  ],
  [
    '/interview',
    'Interview',
    <svg key="interview" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 3a3 3 0 0 1 3 3v5a3 3 0 0 1-6 0V6a3 3 0 0 1 3-3z" />
      <path d="M5 11a7 7 0 0 0 14 0M12 18v3" />
    </svg>,
  ],
] as const

/** App shell: the white top bar (a bottom tab bar on phones), then the page. */
export function Layout() {
  useEffect(() => applyTheme(storedTheme()), [])
  // The mock interview lays out side by side (stage and answer, setup and summary): it gets a wider page.
  const path = useLocation().pathname
  const room = path.startsWith('/interview')
  // Pages without their own tab light up the tab they belong to: a note under Reading, a point under Topics, a study session under Today.
  const owner = path.startsWith('/read/') ? '/reading' : path.startsWith('/point/') ? '/topics' : path.startsWith('/study/') ? '/' : null

  return (
    <>
      <header className="topbar">
        <div className="topbar-inner">
          <div className="brand">Tutor</div>
          <nav className="main-nav" aria-label="Main">
            {NAV.map(([to, label, icon]) => (
              <NavLink key={to} to={to} end={to === '/'} className={({ isActive }) => (isActive || owner === to ? 'active' : undefined)} aria-current={owner === to ? 'page' : undefined}>
                <span className="tab-icon">{icon}</span>
                <span className="tab-label">{label}</span>
              </NavLink>
            ))}
          </nav>
          <NavLink to="/settings" className="nav-settings" aria-label="Settings">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.9.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.9 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.9l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.9.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.9-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.9V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z" />
            </svg>
          </NavLink>
        </div>
      </header>
      <div className={room ? 'wrap room' : 'wrap'}>
        <main>
          <Outlet />
        </main>
      </div>
    </>
  )
}
