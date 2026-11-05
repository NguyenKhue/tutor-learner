# Tutor app redesign: one system for every page

**Goal:** apply the approved canvas "Tutor app redesign" (https://claude.ai/artifact/WjzSGbT6y8gCMV4S9BcRhU) to the whole web app, so every page follows one design system: the one thing to do now sits in a dark "room" panel with one amber Start, everything else is quiet white cards on paper.

**Design source in the repo:** `.superpowers/design/*.dc.html` (git-ignored copies of the artboards). Each file is plain HTML with inline styles: read it for layout, spacing, sizes, colours and copy. `System.dc.html` is the rule sheet.

**Execution:** each task is one opencode run (`opencode/deepseek-v4.1-flash-free`, chosen by Khue), one after another because every task touches `src/styles/app.css`. After each run the main session reviews the diff, runs `npx tsc --noEmit -p .` and `npx vitest run`, fixes or re-prompts, then starts the next task. One browser check and one commit at the end, only when Khue asks.

## Global constraints (every task)

- Stack: React 18 + TypeScript + Vite, plain CSS in `src/styles/tokens.css` and `src/styles/app.css`. No new dependencies, no CSS framework, no inline style objects for theme values: use CSS classes and tokens.
- Tokens (light): paper `#F6F6F2` with the dot grid, surface `#FFFFFF`, line `#E2E3DC`, ink `#15202B`, muted `#5E6670`, room `#17222E`, room-2 `#22303F`, room-line `#3A4B5D`, room-ink `#F4F6F8`, room-muted `#A9B4C1`, amber `#F2B33D` (text `#8A5A00`, soft `#FFF1D6`), sage `#3D6B50` (soft `#E6EFE8`, text `#2E5A40`), blue `#2D6CA3` (soft `#E3ECF5`, text `#1F4F7A`), brick `#A4432E` (soft `#F6E7E2`, text `#8C3522`), purple tag text `#5B3F8C` on `#EFEAF7`. Every token also needs a dark-mode value in both the `prefers-color-scheme: dark` block and `:root[data-theme='dark']`.
- Type: Instrument Sans for the interface (`--font-ui`), Atkinson Hyperlegible Next for questions, answers, lessons and notes (`--font-voice`), JetBrains Mono for code. Headings are sentence case, never uppercase or mono.
- Corners: buttons 12, inputs 14, cards 18, room panels 22. Touch targets at least 44px. Keyboard focus is a 3px blue ring, never amber; text boxes show focus by darkening their own border.
- Layout: work pages (Today, Reading, Topics, one topic, Progress, Interview) use the 1180px width with a main column and a 320px side column that stacks under 760px. Reading pages (lesson, a note, Settings) use a 760px column.
- Amber appears once per screen, on the Start-like button inside the room panel. Main buttons elsewhere are ink. Status tags: New = blue, Review = amber, Read = purple, Mastered = sage, Again = brick.
- Keep every visible text, link name, aria-label and role that the tests query, unless the task lists a rename. Keep behaviour, routes, data flow and API calls unchanged unless the task says otherwise.
- `Do NOT run npm, npx, vite, vitest, tsc or any build/test command. Only edit code and report what you changed.`
- Tests: none, unless the task lists one. `Do not commit.`

## Task 1: Foundation (tokens, shell, shared pieces)

Files: `src/styles/tokens.css`, `src/styles/app.css`, `src/app/Layout.tsx`, new `src/components/Steps.tsx`, `src/components/InterviewRun.tsx` (use Steps), `index.html` (fonts already loaded; check).
- Tokens above, light and dark. Rename the interview-only `--iv-*` variables to the global tokens and update every use.
- Top bar: a white full-width bar with a bottom line; inside, the 1180px row with brand, nav links and the settings icon. Active nav link: ink, weight 600, 2px amber underline. Under 560px the nav moves to a fixed bottom tab bar with an icon over each label (see `Phone.dc.html`); add bottom padding to the page so content is not hidden.
- Global `h2`: 18px Instrument Sans, weight 650, ink, no uppercase, no mono.
- Shared classes: `.room` (dark panel), `.tag` + `.tag-new/-review/-read/-mastered/-again`, `.work` / `.work-main` / `.work-aside` (two columns), `.read-col` (760px), `.btn.amber`, `.btn.outline`, `.btn.primary` = ink. Cards 18px corners.
- `Steps` component: `<Steps items={['Guess','Lesson','Answer','Result']} at={1} />` renders the pill row from the design (done = sage check, current = ink pill with amber number). InterviewRun's `Rounds` uses it.

## Task 2: Today

Files: `src/pages/TodayPage.tsx`, `src/styles/app.css` (today section). Design: `Main.dc.html`, `Phone.dc.html`.
- Main column: days-to-interview number with the streak tag, the room panel ("Next, a review/new point/note", title, topic, amber Start, "or press N"), the segment bar "N of M done today", the "Later today" list as white rows with tags (done rows dashed with a sage check), "Study one more" as an outline button.
- Side column: "Reviews coming up" (5 bars from `dueForecast`), "Mock interview" card (latest session's level result and its first still-there weak spot from `/api/interview/weak-spots`, link "Practice a new interview"; hide the card when either request fails or there are no interviews), "Mastered so far" with a sage bar.

## Task 3: Study

Files: `src/pages/StudyPage.tsx`, `src/components/GradeResult.tsx`, `src/components/EnglishFeedback.tsx`, `src/components/SampleAnswer.tsx`, `src/styles/app.css` (study, lesson, result sections). Design: `StudyLesson`, `StudyAnswer`, `StudyResult`.
- Steps pills via `Steps`. Lesson in a white card in the 760 column with the guess recap card above it. The question sits in a room panel (Atkinson 30px); the answer box below in a white card. Result: verdict card with mastery bar and "Next review in N days", "Your English" card, then a room panel "Up next" with the amber "Next point" button and "One more question".

## Task 4: Reading list

Files: `src/pages/ReadingPage.tsx`, `src/styles/app.css` (reading section). Design: `Reading.dc.html`.
- Room panel "Read next" with amber Read and Skip, then "Due for a recheck" and "Up next" lists as white rows with tags. Side column: "By topic" bars (understood sage, read again brick) built from the existing table data, and "All notes" with the topic select and browse list.

## Task 5: Read a note, then questions

Files: `src/pages/ReadPage.tsx`, `src/components/ReadingQuiz.tsx`, `src/components/Markdown.tsx` (heading ids), `src/styles/app.css`. Design: `ReadNote.dc.html`, `ReadQuiz.dc.html`.
- Steps Read / Questions / Result. Note view: topic, title, outline "Open in Obsidian" button, reading time; the note in a white card; side column with "On this page" (h2 headings, anchor links, current section marked) and "When you finish" (scroll percent bar, outline "Answer 3 questions"); a room panel "Done reading?" at the end with the amber "Answer 3 questions" (this replaces "I've read it"; update the tests that click it).
- Questions view: room header "Three questions, from memory", numbered question cards, "Back to the note" returns to the note without losing typed answers.

## Task 6: Topics, one topic, a point

Files: `src/pages/TopicsPage.tsx`, `src/pages/TopicPage.tsx`, `src/pages/PointPage.tsx`, `src/styles/app.css`. Design: `Topics.dc.html`, `Topic.dc.html`.
- Topics as a 3-column card grid with the 3-part bar and the next-step link. One topic: numbered rows with tag and mastery bar, side column with the room panel "Next in this topic" and its notes. Point page follows the same cards and room panel.

## Task 7: Progress and Settings

Files: `src/pages/ProgressPage.tsx`, `src/pages/SettingsPage.tsx`, `src/styles/app.css`. Design: `Progress.dc.html`, `Settings.dc.html`.
- Progress: room panel verdict (pace sentence, "Change daily goal", three stat tiles), then the activity calendar card and the forecast card side by side. Settings: 760 column, "Daily study" card with steppers and the English switch, Theme segmented control, "Connected" card.

## Final check (main session)

Full test run, type check, the screens in the browser at 1440px and 375px in light and dark, then report to Khue. Commit only when asked.
