import { BrowserRouter, Route, Routes } from 'react-router-dom'

export function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="*" element={<header className="p-4 font-semibold">Tutor</header>} />
      </Routes>
    </BrowserRouter>
  )
}
