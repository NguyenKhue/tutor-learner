/** What an interviewer should see in an answer at each level; senior assumes mid, lead assumes senior. */
export const LEVEL_RUBRIC: Record<'mid' | 'senior' | 'lead', string[]> = {
  mid: [
    'asks a few basic questions to clarify the problem before answering',
    'gives a clear, working design or solution with sensible building blocks',
    'writes clean code that is easy to read, test and maintain',
    'names the basic costs on a phone: network, battery and storage',
    'knows when to ask for help or a hint, and uses it well',
    'explains a past problem they solved and what they learned from it',
  ],
  senior: [
    'finds the missing requirements without being prompted',
    'explains the trade-off and the cost of the chosen option',
    'handles errors, edge cases and failure paths without being asked',
    'covers performance, security and reliability, not only the happy path',
    'names how to measure the result and how to see problems in production',
    'spots technical risks early and says how to reduce them',
    'owns past mistakes and incidents, and says what changed afterwards',
    'shows how they raise the quality bar for the team, for example in reviews',
  ],
  lead: [
    'sets the direction for several teams, not only one feature',
    'designs for growth and future change, and says what could break later',
    'links technical choices to business impact and customer outcomes',
    'adapts the design calmly when a new constraint is added',
    'shows how they would get other teams to agree and handle disagreement',
    'names the risks of the plan and the mitigation for each one',
    'explains how they grow other engineers and spread their knowledge',
  ],
}
