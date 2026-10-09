// Reads drug, strength, lot and expiry from a medicine box's OCR lines. Every
// field comes with a confidence (the OCR line's score times how sure the match
// is) and the line it came from, so the review screen can ask the health
// worker to check weak ones. The worker always confirms before anything is
// saved; this never decides anything on its own.

export type OcrLineInput = { text: string; score: number }

export type LabelField = { value: string; confidence: number; line: number }

export type LabelReading = {
  drug: LabelField | null
  strength: LabelField | null
  lot: LabelField | null
  // YYYY-MM
  expiry: LabelField | null
}

// Generic names a barangay health station is likely to stock; the box is
// matched against these, allowing a few OCR misreads.
export const KNOWN_DRUGS = [
  'Doxycycline',
  'Amoxicillin',
  'Paracetamol',
  'Co-trimoxazole',
  'Metronidazole',
  'Cefalexin',
  'Ibuprofen',
  'Mefenamic acid',
  'Salbutamol',
  'Zinc sulfate',
  'Oral rehydration salts',
  'Losartan',
  'Amlodipine',
  'Metformin',
]

const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC']

const LOT_KEYWORD = /\b(?:LOT|BATCH|B\.?\s?NO)\b\.?\s*(?:NO\b\.?|NUMBER|#)?\s*[:.#-]?\s*/i
const LOT_VALUE = /^([A-Z0-9][A-Z0-9/-]{2,})/i
const EXPIRY_KEYWORD = /\b(?:EXP(?:IRY|IRATION)?|USE\s+BY|USE\s+BEFORE)\b\.?\s*(?:DATE)?\s*[:.]?/i
const MFG_KEYWORD = /\b(?:MFG|MFD|MANUFACTURED|MANUF|MFG\.?\s*DATE|DATE\s+OF\s+MANUFACTURE)\b/i
const STRENGTH = /(\d+(?:\.\d+)?)\s*(MG|MCG|G|ML|IU)\b(?:\s*\/\s*(\d+(?:\.\d+)?)\s*(ML))?/i

// OCR mixes up O/0, I/l/1 and S/5 in dates; fix them only inside date text.
function digitsOnly(text: string): string {
  return text.replace(/[Oo]/g, '0').replace(/[Il|]/g, '1').replace(/S/g, '5')
}

function validMonth(month: number) {
  return month >= 1 && month <= 12
}

const pad = (month: number) => String(month).padStart(2, '0')

// The first date in the text as YYYY-MM, with how unambiguous its format is.
export function parseExpiryDate(text: string): { value: string; certainty: number } | null {
  const named = new RegExp(`\\b(${MONTHS.join('|')})[A-Z]*\\.?\\s*[-/]?\\s*(20\\d{2}|\\d{2})\\b`, 'i').exec(text)
  if (named) {
    const month = MONTHS.indexOf(named[1].toUpperCase()) + 1
    const year = named[2].length === 2 ? `20${named[2]}` : named[2]
    return { value: `${year}-${pad(month)}`, certainty: 1 }
  }
  const t = digitsOnly(text)
  // DD/MM/YYYY: the day is dropped; the order could also be MM/DD, so less sure.
  const dayMonthYear = /\b(\d{1,2})\s*[/.-]\s*(\d{1,2})\s*[/.-]\s*(20\d{2})\b/.exec(t)
  if (dayMonthYear && validMonth(Number(dayMonthYear[2]))) {
    return { value: `${dayMonthYear[3]}-${pad(Number(dayMonthYear[2]))}`, certainty: 0.7 }
  }
  const yearMonth = /\b(20\d{2})\s*[/.-]\s*(\d{1,2})\b/.exec(t)
  if (yearMonth && validMonth(Number(yearMonth[2]))) {
    return { value: `${yearMonth[1]}-${pad(Number(yearMonth[2]))}`, certainty: 1 }
  }
  const monthYear = /\b(\d{1,2})\s*[/.-]\s*(20\d{2}|\d{2})\b/.exec(t)
  if (monthYear && validMonth(Number(monthYear[1]))) {
    const year = monthYear[2].length === 2 ? `20${monthYear[2]}` : monthYear[2]
    return { value: `${year}-${pad(Number(monthYear[1]))}`, certainty: monthYear[2].length === 2 ? 0.85 : 1 }
  }
  return null
}

function editDistance(a: string, b: string): number {
  const row = Array.from({ length: b.length + 1 }, (_, i) => i)
  for (let i = 1; i <= a.length; i++) {
    let previous = row[0]
    row[0] = i
    for (let j = 1; j <= b.length; j++) {
      const current = row[j]
      row[j] = Math.min(row[j] + 1, row[j - 1] + 1, previous + (a[i - 1] === b[j - 1] ? 0 : 1))
      previous = current
    }
  }
  return row[b.length]
}

const lettersOnly = (text: string) => text.toUpperCase().replace(/[^A-Z]/g, '')

function findDrug(lines: OcrLineInput[], drugs: string[]): LabelField | null {
  let best: LabelField | null = null
  lines.forEach((line, index) => {
    const words = line.text.split(/[^A-Za-z0-9-]+/).filter((word) => word.length >= 4)
    // Single words, and pairs for two-word names.
    const candidates = [...words, ...words.slice(1).map((word, i) => `${words[i]}${word}`)]
    for (const drug of drugs) {
      const target = lettersOnly(drug)
      for (const candidate of candidates) {
        const distance = editDistance(lettersOnly(candidate), target)
        const allowed = target.length >= 8 ? 2 : 1
        if (distance > allowed) continue
        const confidence = line.score * (1 - distance / target.length)
        if (!best || confidence > best.confidence) best = { value: drug, confidence, line: index }
      }
    }
  })
  return best
}

function findStrength(lines: OcrLineInput[], drugLine: number | null): LabelField | null {
  // Prefer the drug's line, then the line after it, then any line.
  const order = drugLine === null ? [] : [drugLine, drugLine + 1]
  const indexes = [...order, ...lines.map((_, i) => i).filter((i) => !order.includes(i))].filter((i) => i < lines.length)
  for (const index of indexes) {
    const match = STRENGTH.exec(lines[index].text)
    if (!match) continue
    const unit = (u: string) => (u.toUpperCase() === 'ML' ? 'mL' : u.toUpperCase() === 'IU' ? 'IU' : u.toLowerCase())
    const value = match[3] ? `${match[1]} ${unit(match[2])}/${match[3]} ${unit(match[4])}` : `${match[1]} ${unit(match[2])}`
    return { value, confidence: lines[index].score * (order.includes(index) ? 1 : 0.8), line: index }
  }
  return null
}

function findLot(lines: OcrLineInput[]): LabelField | null {
  for (let index = 0; index < lines.length; index++) {
    const keyword = LOT_KEYWORD.exec(lines[index].text)
    if (!keyword) continue
    const rest = lines[index].text.slice(keyword.index + keyword[0].length).trim()
    const sameLine = LOT_VALUE.exec(rest)
    if (sameLine && /\d/.test(sameLine[1])) {
      return { value: sameLine[1].toUpperCase(), confidence: lines[index].score, line: index }
    }
    // The value is often printed on the next line, under the keyword.
    const next = lines[index + 1]
    const nextValue = next && LOT_VALUE.exec(next.text.trim())
    if (nextValue && /\d/.test(nextValue[1])) {
      return { value: nextValue[1].toUpperCase(), confidence: next.score * 0.8, line: index + 1 }
    }
  }
  return null
}

function findExpiry(lines: OcrLineInput[]): LabelField | null {
  for (let index = 0; index < lines.length; index++) {
    const keyword = EXPIRY_KEYWORD.exec(lines[index].text)
    if (!keyword || MFG_KEYWORD.test(lines[index].text.slice(0, keyword.index))) continue
    const rest = lines[index].text.slice(keyword.index + keyword[0].length)
    const sameLine = parseExpiryDate(rest)
    if (sameLine) return { value: sameLine.value, confidence: lines[index].score * sameLine.certainty, line: index }
    const next = lines[index + 1]
    const nextDate = next && !MFG_KEYWORD.test(next.text) ? parseExpiryDate(next.text) : null
    if (nextDate) return { value: nextDate.value, confidence: next.score * nextDate.certainty * 0.8, line: index + 1 }
  }
  // No expiry keyword read: guess the latest date not marked as manufacture,
  // with low confidence so the review screen asks to check it.
  let latest: LabelField | null = null
  lines.forEach((line, index) => {
    if (MFG_KEYWORD.test(line.text)) return
    const date = parseExpiryDate(line.text)
    if (date && (!latest || date.value > latest.value)) {
      latest = { value: date.value, confidence: line.score * date.certainty * 0.5, line: index }
    }
  })
  return latest
}

export function parseLabel(lines: OcrLineInput[], drugs: string[] = KNOWN_DRUGS): LabelReading {
  const drug = findDrug(lines, drugs)
  return {
    drug,
    strength: findStrength(lines, drug?.line ?? null),
    lot: findLot(lines),
    expiry: findExpiry(lines),
  }
}

// Below this, the review screen asks the health worker to check the field.
export const CHECK_BELOW = 0.8
