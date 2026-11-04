# Level rubric: sources

These are the sources behind `LEVEL_RUBRIC` in `server/interview/rubric.ts`. All sources accessed 2026-11-04.
No company publishes an Android-specific ladder that I could open. The rubric uses three sources:
a general engineering ladder (Dropbox), a mobile system design interview guide (ByteByteGo),
and the official Android architecture guide (for the Android-specific content only; it does not describe levels).

## Searches run (2026-11-04)

- Web search for published mobile or Android engineering ladders (senior, staff, iOS, Android, handbook): only job boards, salary pages and career-guide blogs. None could be used as a source.
- Web search for Android interview rubrics by level: only prep guides and forum posts. Only ByteByteGo could be opened and read.
- Web search for Hello Interview and other mobile system design guides: other guides exist (a newsletter, ProAndroidDev, DesignGurus), but I only saw search snippets, not the pages, so they are not cited.
- Fetch of Hello Interview mobile page: 404. Fetch of levels.fyi: 403. Fetch of progression.fyi: redirected to an unrelated site.

## Mid level

- [Dropbox career framework, IC3 Software Engineer](https://dropbox.github.io/dbx-career-framework/ic3_software_engineer.html): delivers solutions on their own, works out ambiguous problems, writes clean and maintainable code, designs testable parts, reviews code well, and seeks feedback.
- [ByteByteGo, Mobile System Design Interview](https://bytebytego.com/courses/mobile-system-design-interview/introduction): a mid-level candidate asks basic clarifying questions, gives a coherent high-level design, knows network, battery and storage limits, and needs only some prompting.

## Android content (all levels)

- [Android Developers, Guide to app architecture](https://developer.android.com/topic/architecture): the OS can destroy components and the process at any time, so keep state out of Activities; configuration changes such as rotation must keep UI state; keep data persisted so the app works offline or with weak reception; make parts testable in isolation. This guide does not say which level should know what. It only backs the Android wording of lines marked "Android guide" below.

## Senior level

- [Dropbox career framework, IC4 Software Engineer](https://dropbox.github.io/dbx-career-framework/ic4_software_engineer.html): owns team goals, takes ownership of mistakes and incidents, finds technical risks early, designs reliable systems with monitoring, defines success metrics, sets the quality bar through code and design reviews.
- [ByteByteGo, Mobile System Design Interview](https://bytebytego.com/courses/mobile-system-design-interview/introduction): a senior candidate leads requirements gathering, raises critical issues unprompted, handles errors and edge cases, covers performance, security and scalability, and justifies decisions with their effect on UX, battery and data.

## Lead level

- [Dropbox career framework, IC5 Staff Software Engineer](https://dropbox.github.io/dbx-career-framework/ic5_staff_software_engineer.html): sets multi-year, multi-team technical strategy, shapes other teams' roadmaps, connects work to business goals, handles disagreement constructively, builds robust and flexible systems, coaches and mentors others and shares knowledge.
- [ByteByteGo, Mobile System Design Interview](https://bytebytego.com/courses/mobile-system-design-interview/introduction): a staff-plus candidate designs for scale and future change, discusses business impact, risks and mitigations, and adapts when the interviewer adds constraints.

## How rubric lines map to sources

Each level lists only what is new at that level. Senior assumes mid, and lead assumes senior.

| Level | Line (short) | Source |
|---|---|---|
| mid | asks basic questions | ByteByteGo mid |
| mid | clear working design | ByteByteGo mid |
| mid | clean, testable code | Dropbox IC3 (Craft) |
| mid | network, battery, storage costs | ByteByteGo mid |
| mid | screen state and data survive rotation and process death | Android guide (lifecycle, configuration changes, process death) |
| mid | past problem and lesson | Dropbox IC3 (Results, Direction: experiments and shares lessons) |
| senior | finds missing requirements unprompted | ByteByteGo senior |
| senior | trade-off and cost, incl. effect on UX, battery, data | ByteByteGo senior (justify decisions, effect on UX, battery, data) |
| senior | errors, edge cases, slow or missing network | ByteByteGo senior, Android guide (weak reception, offline) |
| senior | performance, security, reliability | ByteByteGo senior, Dropbox IC4 (reliable systems) |
| senior | how to measure and observe | Dropbox IC4 (monitoring, success metrics) |
| senior | spots risks early | Dropbox IC4 (identify technical risks early) |
| senior | owns mistakes and incidents | Dropbox IC4 (Results) |
| senior | raises the team quality bar | Dropbox IC4 (Talent: code and design reviews) |
| lead | direction beyond one feature or team | Dropbox IC5 (multi-team strategy, shapes other roadmaps) |
| lead | offline-first behaviour and failure recovery | ByteByteGo staff+ (offline-first, failure recovery), Android guide (persisted data, offline) |
| lead | design for growth and change | ByteByteGo staff+, Dropbox IC5 (flexible systems) |
| lead | business impact | ByteByteGo staff+, Dropbox IC5 (connects work to business goals) |
| lead | adapts to new constraints | ByteByteGo staff+ |
| lead | gets other teams to agree | Dropbox IC5 (handles disagreement, breaks down silos) |
| lead | risks and mitigations | ByteByteGo staff+ |
| lead | grows other engineers | Dropbox IC5 (Talent: coaches, mentors, shares knowledge) |

## Limits

- Lead is mapped to Dropbox IC5 (Staff) and ByteByteGo "Staff+". At a smaller company a lead may not be expected to set multi-team strategy, so the lead lines can over-ask. The line was softened to "beyond one feature or one team". Khue can drop it if it does not fit the interviews he expects.
- The Android guide is not level-specific. Putting its content at mid, senior or lead is a judgement, backed only by the level wording of the other two sources.

- Both sources are general, not Android-only. The rubric tests how an answer is reasoned, not which Android API is named.
- ByteByteGo is a commercial guide, not a company rubric. Treat its level wording as well-known advice, not an official standard.
