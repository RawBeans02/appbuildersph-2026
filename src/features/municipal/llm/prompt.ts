// The prompt for the optional local model: it may only reword the plan the
// rules already computed. Every draft is then checked (check.ts) and dropped
// for the template if it changed anything that matters.

export type ChatMessage = { role: 'system' | 'user'; content: string }

export const MAX_DRAFT_TOKENS = 250

const SYSTEM = [
  "You reword a municipal health plan for the Municipal Health Officer (MHO) of a Philippine town after a typhoon.",
  'Write it in plain, short English. A few short Tagalog phrases are fine where natural.',
  'Rules you must follow:',
  '- Use only the numbers, barangay names and actions in the plan. Copy every number exactly, including "<5".',
  '- Do not add any number, medicine amount, dose, schedule, diagnosis or new action.',
  '- Keep the doctor-team priority order exactly as given.',
  '- Keep the stock moves as suggestions for the MHO to decide.',
  '- Keep the reminder that this plan does not diagnose anyone and sets no dose.',
  '- At most 180 words. No headings, no markdown.',
].join('\n')

export function buildMessages(template: string): ChatMessage[] {
  return [
    { role: 'system', content: SYSTEM },
    { role: 'user', content: `Reword this plan for the MHO:\n\n${template}` },
  ]
}
