// CTC greedy decoding for PP-OCRv5 recognition: the class at each time step is
// the most likely one; repeats collapse and the blank (class 0) is dropped.

// Class 0 is the CTC blank, then one class per dictionary line, then a space,
// as PaddleOCR's CTCLabelDecode builds it.
export function buildCharset(dictionary: string): string[] {
  const lines = dictionary.split(/\r?\n/)
  if (lines.at(-1) === '') lines.pop()
  return ['', ...lines, ' ']
}

export function ctcGreedyDecode(
  probs: ArrayLike<number>,
  steps: number,
  classes: number,
  charset: string[],
): { text: string; score: number } {
  if (classes !== charset.length) {
    throw new Error(`The model has ${classes} classes but the dictionary gives ${charset.length}.`)
  }
  let text = ''
  let scoreSum = 0
  let kept = 0
  let previous = -1
  for (let t = 0; t < steps; t++) {
    let best = 0
    let bestProb = -Infinity
    for (let c = 0; c < classes; c++) {
      const p = probs[t * classes + c]
      if (p > bestProb) {
        bestProb = p
        best = c
      }
    }
    if (best !== 0 && best !== previous) {
      text += charset[best]
      scoreSum += bestProb
      kept++
    }
    previous = best
  }
  return { text, score: kept === 0 ? 0 : scoreSum / kept }
}
