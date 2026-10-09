import { writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { generateMunicipalSample, renderMunicipalSampleModule } from '../../src/data/seed/municipalSource'
import { isoWeek } from '../../src/qr'
import { isEpiWeek } from '../../src/qr/schema'

// Signs the four pre-made barangay QRs for one ISO week and writes them, with
// their public keys, to src/data/seed/municipal.ts. Private keys stay in this
// process's memory and are never written.
//
//   npm run seed:municipal                    # this week on this computer's calendar
//   npm run seed:municipal -- --week 2026-W42

const OUTPUT = fileURLToPath(new URL('../../src/data/seed/municipal.ts', import.meta.url))

export async function main(args: string[]): Promise<void> {
  const flag = args.indexOf('--week')
  const epiWeek = flag === -1 ? isoWeek(new Date()) : args[flag + 1]
  if (!isEpiWeek(epiWeek)) throw new Error(`--week must be an ISO week like 2026-W41, got ${epiWeek}`)
  const sample = await generateMunicipalSample(epiWeek)
  await writeFile(OUTPUT, renderMunicipalSampleModule(sample))
  console.log(`Wrote ${sample.qrTexts.length} signed barangay QRs for ${epiWeek} to src/data/seed/municipal.ts`)
  for (const device of sample.devices) console.log(`  ${device.barangay}  key fingerprint ${device.fingerprint}`)
}
