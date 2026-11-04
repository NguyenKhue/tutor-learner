/** What an interviewer should see in an answer at each level; senior assumes mid, lead assumes senior. */
export const LEVEL_RUBRIC: Record<'mid' | 'senior' | 'lead', string[]> = {
  mid: [
    'asks a few basic questions to clarify the problem before answering',
    'gives a clear, working design or solution with sensible building blocks',
    'writes clean code that is easy to read, test and maintain',
    'names the basic costs on a phone: network, battery and storage',
    'keeps screen state and data safe when the screen rotates or the app process is killed',
    'explains a past problem they solved and what they learned from it',
    'builds screens that closely match the design, with smooth animations, and follows platform guidelines such as Material Design or Apple HIG',
  ],
  senior: [
    'finds the missing requirements without being prompted',
    'explains the trade-off and the cost of the chosen option, including the effect on user experience, battery or data',
    'handles errors, edge cases and a slow or missing network without being asked',
    'covers performance, security and reliability, not only the happy path',
    'names how to measure the result and how to see problems in production',
    'spots technical risks early and says how to reduce them',
    'owns past mistakes and incidents, and says what changed afterwards',
    'shows how they raise the quality bar for the team, for example in reviews',
    'sets up or improves automated tests and the build pipeline (CI/CD) so bugs are caught before production',
  ],
  lead: [
    'sets direction beyond one feature or one team, for example shared architecture or standards',
    'designs for growth and future change, and says what could break later',
    'links technical choices to business impact and customer outcomes',
    'designs offline-first behaviour and recovery after failure, such as saved work and sync conflicts',
    'adapts the design calmly when a new constraint is added',
    'shows how they would get other teams to agree and handle disagreement',
    'names the risks of the plan and the mitigation for each one',
    'explains how they grow other engineers and spread their knowledge',
    'manages technical debt: balances shipping fast for the business against refactoring so the code stays easy to change',
  ],
}
