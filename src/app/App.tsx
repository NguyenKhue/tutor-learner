import { BrowserRouter, Route, Routes } from 'react-router-dom'
import { TutorDataProvider } from '../hooks/useTutorData'
import { Layout } from './Layout'
import { TodayPage } from '../pages/TodayPage'
import { StudyPage } from '../pages/StudyPage'
import { TopicsPage } from '../pages/TopicsPage'
import { TopicPage } from '../pages/TopicPage'
import { PointPage } from '../pages/PointPage'
import { ProgressPage } from '../pages/ProgressPage'
import { SettingsPage } from '../pages/SettingsPage'
import { ReadingPage } from '../pages/ReadingPage'
import { ReadPage } from '../pages/ReadPage'

/** Router + data shell: the Layout is the parent route and Today is the index page. */
export function App() {
  return (
    <BrowserRouter>
      <TutorDataProvider>
        <Routes>
          <Route element={<Layout />}>
            <Route index element={<TodayPage />} />
            <Route path="reading" element={<ReadingPage />} />
            <Route path="read/:path" element={<ReadPage />} />
            <Route path="topics" element={<TopicsPage />} />
            <Route path="topics/:topic" element={<TopicPage />} />
            <Route path="point/:pointId" element={<PointPage />} />
            <Route path="study/:pointId" element={<StudyPage />} />
            <Route path="progress" element={<ProgressPage />} />
            <Route path="settings" element={<SettingsPage />} />
          </Route>
        </Routes>
      </TutorDataProvider>
    </BrowserRouter>
  )
}
