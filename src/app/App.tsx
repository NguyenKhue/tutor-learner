import { BrowserRouter, Route, Routes } from 'react-router-dom'
import { TutorDataProvider } from '../hooks/useTutorData'
import { Layout } from './Layout'
import { TodayPage } from '../pages/TodayPage'

/** Placeholder for pages that later tasks replace. */
function Placeholder({ title }: { title: string }) {
  return (
    <section className="page-head">
      <h1>{title}</h1>
    </section>
  )
}

/** Router + data shell: the Layout is the parent route and Today is the index page. */
export function App() {
  return (
    <BrowserRouter>
      <TutorDataProvider>
        <Routes>
          <Route element={<Layout />}>
            <Route index element={<TodayPage />} />
            <Route path="topics" element={<Placeholder title="Topics" />} />
            <Route path="topics/:topic" element={<Placeholder title="Topics" />} />
            <Route path="point/:pointId" element={<Placeholder title="Point" />} />
            <Route path="study/:pointId" element={<Placeholder title="Study" />} />
            <Route path="progress" element={<Placeholder title="Progress" />} />
            <Route path="settings" element={<Placeholder title="Settings" />} />
          </Route>
        </Routes>
      </TutorDataProvider>
    </BrowserRouter>
  )
}
