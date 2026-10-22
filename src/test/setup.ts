import '@testing-library/jest-dom/vitest'

// jsdom has no matchMedia; react-activity-calendar asks it for the colour scheme and reduced motion.
if (typeof window !== 'undefined' && typeof window.matchMedia !== 'function') {
  window.matchMedia = ((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia
}

// jsdom has no SVG layout; react-activity-calendar measures its labels with getBBox.
if (typeof SVGElement !== 'undefined' && !('getBBox' in SVGElement.prototype)) {
  Object.defineProperty(SVGElement.prototype, 'getBBox', { value: () => ({ x: 0, y: 0, width: 0, height: 0 }) })
}
