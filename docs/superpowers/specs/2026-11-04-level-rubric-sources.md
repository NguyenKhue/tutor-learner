# Level rubric: sources

These are the sources behind `LEVEL_RUBRIC` in `server/interview/rubric.ts`.
No company publishes an Android-specific ladder, so the rubric uses two kinds of sources:
a general engineering ladder (Dropbox) and a mobile system design interview guide (ByteByteGo).
Search found no other primary source, so no other claim is made.

## Mid level

- [Dropbox career framework, IC3 Software Engineer](https://dropbox.github.io/dbx-career-framework/ic3_software_engineer.html): delivers solutions on their own, works out ambiguous problems, writes clean and maintainable code, designs testable parts, reviews code well, and seeks feedback.
- [ByteByteGo, Mobile System Design Interview](https://bytebytego.com/courses/mobile-system-design-interview/introduction): a mid-level candidate asks basic clarifying questions, gives a coherent high-level design, knows network, battery and storage limits, and needs only some prompting.

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
| mid | asks for help, uses hints | ByteByteGo mid (occasional prompting), Dropbox IC3 (seeks feedback) |
| mid | past problem and lesson | Dropbox IC3 (Results, Direction: experiments and shares lessons) |
| senior | finds missing requirements unprompted | ByteByteGo senior |
| senior | trade-off and cost of the choice | ByteByteGo senior (justify decisions, effect on UX, battery, data) |
| senior | errors, edge cases, failure paths | ByteByteGo senior |
| senior | performance, security, reliability | ByteByteGo senior, Dropbox IC4 (reliable systems) |
| senior | how to measure and observe | Dropbox IC4 (monitoring, success metrics) |
| senior | spots risks early | Dropbox IC4 (identify technical risks early) |
| senior | owns mistakes and incidents | Dropbox IC4 (Results) |
| senior | raises the team quality bar | Dropbox IC4 (Talent: code and design reviews) |
| lead | direction across teams | Dropbox IC5 (multi-team strategy, shapes other roadmaps) |
| lead | design for growth and change | ByteByteGo staff+, Dropbox IC5 (flexible systems) |
| lead | business impact | ByteByteGo staff+, Dropbox IC5 (connects work to business goals) |
| lead | adapts to new constraints | ByteByteGo staff+ |
| lead | gets other teams to agree | Dropbox IC5 (handles disagreement, breaks down silos) |
| lead | risks and mitigations | ByteByteGo staff+ |
| lead | grows other engineers | Dropbox IC5 (Talent: coaches, mentors, shares knowledge) |

## Limits

- Both sources are general, not Android-only. The rubric tests how an answer is reasoned, not which Android API is named.
- ByteByteGo is a commercial guide, not a company rubric. Treat its level wording as well-known advice, not an official standard.
