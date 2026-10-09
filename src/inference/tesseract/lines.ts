import type { Block } from 'tesseract.js'
import type { OcrLine } from '../ocr/pipeline'

// Tesseract's page layout, flattened to the same lines PP-OCR gives: text,
// a 0..1 score (Tesseract reports 0..100) and the box.
export function linesFromBlocks(blocks: Block[] | null): OcrLine[] {
  const lines: OcrLine[] = []
  for (const block of blocks ?? []) {
    for (const paragraph of block.paragraphs) {
      for (const line of paragraph.lines) {
        const text = line.text.trim()
        if (!text) continue
        const score = Math.max(0, Math.min(1, line.confidence / 100))
        lines.push({ text, score, box: { ...line.bbox, score } })
      }
    }
  }
  return lines
}
