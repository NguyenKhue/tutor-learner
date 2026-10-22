import defaultTheme from 'tailwindcss/defaultTheme'
const token = (name) => `rgb(var(--${name}) / <alpha-value>)`

/** @type {import('tailwindcss').Config} */
export default {
  darkMode: ['class', '[data-theme="dark"]'],
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        background: token('background'),
        surface: token('surface'),
        foreground: token('foreground'),
        muted: token('muted'),
        border: token('border'),
        accent: { DEFAULT: token('accent'), soft: token('accent-soft'), foreground: token('accent-foreground') },
        again: token('again'),
        hard: token('hard'),
        good: token('good'),
        easy: token('easy'),
      },
      fontFamily: {
        sans: ['Inter', ...defaultTheme.fontFamily.sans],
        mono: ['"JetBrains Mono"', ...defaultTheme.fontFamily.mono],
      },
      transitionTimingFunction: { out: 'cubic-bezier(0.22, 1, 0.36, 1)' },
    },
  },
  plugins: [],
}
