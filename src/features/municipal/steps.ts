import { countRange, formatRange } from '../../qr'
import type { MunicipalPlan } from '../../rules/plan'
import { cellRange, exposedAllOf, isZero } from './counts'
import { firstPriority, priorityReason } from './merged'

// Screen 19's plan as numbered steps, each with its reason line, all from
// the rule-based plan (src/rules/plan.ts). Stock logistics only: never a dose
// or an amount per person.

export type PlanStep = { title: string; reason: string }

function sourceReason(plan: MunicipalPlan, barangay: string): string {
  const row = plan.rows.find((item) => item.barangay === barangay)
  if (!row) return ''
  const exposed = exposedAllOf(row.counts)
  const watch = countRange(row.counts.inWatchWindow)
  return (
    `${row.name} has ${cellRange(row.counts.doxyCapsulesOnHand)} capsules, ` +
    `${isZero(exposed) ? 'no one' : `${formatRange(exposed)} people`} exposed and ` +
    `${isZero(watch) ? 'no one' : formatRange(watch)} in the watch window.`
  )
}

export function planSteps(plan: MunicipalPlan): PlanStep[] {
  const steps: PlanStep[] = []
  const first = firstPriority(plan)
  steps.push(
    first
      ? { title: `Send a doctor team to ${first.row.name} first.`, reason: priorityReason(plan, first.row, 'step') }
      : { title: 'No doctor team needed yet.', reason: '' },
  )
  for (const move of plan.moves) {
    steps.push({
      title: `Move ${cellRange(move.capsulesUpTo)} capsules from ${move.fromName} to ${move.toName}.`,
      reason: sourceReason(plan, move.from),
    })
  }
  const expiring = plan.totals.doxyCapsulesExpiring6w
  if (!isZero(expiring)) {
    const where = plan.rows
      .filter((row) => !isZero(countRange(row.counts.doxyCapsulesExpiring6w)))
      .map((row) => `${row.name} ${cellRange(row.counts.doxyCapsulesExpiring6w)}`)
    steps.push({
      title: `Use the ${formatRange(expiring)} capsules that expire within 6 weeks first.`,
      reason: `${where.join(', ')}.`,
    })
  }
  return steps
}

// The steps as plain text: what an approval saves when the officer approves
// the plan as listed, with no wording.
export function planStepsText(plan: MunicipalPlan): string {
  return planSteps(plan)
    .map((step, i) => `${i + 1}. ${step.title}${step.reason ? ` ${step.reason}` : ''}`)
    .join('\n')
}

// The approval log's Plan column: "1. Doctor team to Maligaya-D first.
// 2. Move 60 capsules from Bagong Silang-D to Maligaya-D. 3. Use the 40
// expiring capsules first."
export function planShortSummary(plan: MunicipalPlan): string {
  return planSteps(plan)
    .map((step, i) => {
      const title = step.title
        .replace(/^Send a doctor team to /, 'Doctor team to ')
        .replace(/ capsules that expire within 6 weeks first\.$/, ' expiring capsules first.')
      return `${i + 1}. ${title}`
    })
    .join(' ')
}
