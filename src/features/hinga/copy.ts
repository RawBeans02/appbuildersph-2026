import type { HingaOutcome } from '../../data/db/types'
import type { CountRefusal } from './countSession'

// Hinga's words, in one place until the design's copy deck lands.

export const SCREENING_NOTE = 'Screening aid only. Not a diagnosis.'

export const READINESS = [
  'The child is calm: not crying, feeding or moving much',
  'The head, shoulders and chest are in view, in light clothing',
  'Good light, with no bright window behind the child',
  'The phone is steady (rest it on something if you can)',
] as const

// The four refusals the health worker sees: crying, motion, chest not
// visible, readings disagree (plus a count that was stopped).
export function refusalText(refusal: CountRefusal): { title: string; detail: string } {
  switch (refusal) {
    case 'crying':
      return { title: 'Crying detected', detail: 'Wait until the child is calm, then try again.' }
    case 'motion':
      return { title: 'Too much movement', detail: 'Hold the phone still, or rest it on something, and wait until the child is still.' }
    case 'no-torso':
      return { title: 'Chest not visible', detail: 'Keep the head, shoulders and chest in view for the whole minute.' }
    case 'no-rhythm':
    case 'disagree':
      return { title: 'Readings disagree', detail: "Couldn't get a steady count. Try again with the child calm and the phone still." }
    case 'too-few-frames':
      return { title: 'The camera paused', detail: 'Keep this screen open and on for the whole minute.' }
    case 'interrupted':
      return { title: 'The count stopped', detail: 'Keep this screen open and on for the whole minute.' }
  }
}

export function outcomeText(outcome: HingaOutcome): { title: string; tagalog: string | null } {
  switch (outcome) {
    case 'urgent':
      return { title: 'Danger or severe sign: refer to the midwife or RHU now, urgently', tagalog: 'I-refer ngayon' }
    case 'fast':
      return { title: 'Fast breathing for age: refer to the midwife or RHU now', tagalog: 'I-refer ngayon' }
    case 'not-fast':
      return { title: 'Not fast breathing for age', tagalog: null }
    case 'refused':
      return { title: 'Not counted', tagalog: null }
  }
}
