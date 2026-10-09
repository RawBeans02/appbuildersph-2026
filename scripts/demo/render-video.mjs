// Render a silent, captioned 60 s rehearsal cut from actual browser-test shots.
// Requires the e2e screenshots, Playwright Chromium and FFMPEG_PATH (VP9 encoder).
import { chromium } from '@playwright/test'
import { mkdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { execFileSync } from 'node:child_process'

const shots = [
  ['An approved response. Even without signal.', 'A doctor team first. Up to 30 capsules from Riverside-D. Saved on the barangay phone.', 'offline-saved-instructions.png'],
  ['Read medicine labels on the device.', 'Real offline PP-OCRv5 inference. The worker reviews the lot and expiry before saving.', 'offline-ocr-review.png'],
  ['Report needs without exposing names.', '12 exposed. 40 capsules on hand. 30 expire soon. Only signed, de-identified counts leave by QR.', 'offline-compare.png'],
  ['The officer approves the response.', 'Fixed rules explain the priorities. The municipal health officer decides. No AI diagnosis or dose.', 'offline-approved-plan.png'],
  ['Return approved actions by signed QR.', 'Compare the municipal fingerprint before first trust. Verify, preview, then explicitly save.', 'offline-first-trust.png'],
  ['Keep working after an offline reload.', 'Instructions stay on Home. Receipt leaves stock unchanged. Report → approve → respond, offline.', 'offline-saved-instructions.png'],
]
const root = process.cwd()
const font = (await readFile(join(root, 'public', 'fonts', 'atkinson-hyperlegible-next-latin.woff2'))).toString('base64')
const frames = join(root, 'test-results', 'video-frames')
await mkdir(frames, { recursive: true })
const browser = await chromium.launch()
try {
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 })
  for (let i = 0; i < shots.length; i++) {
    const [title, copy, file] = shots[i]
    const png = (await readFile(join(root, 'docs', 'demo', file))).toString('base64')
    await page.setContent(`<!doctype html><html><head><meta charset="utf-8"><style>
      @font-face{font-family:Atkinson;src:url(data:font/woff2;base64,${font}) format('woff2');font-weight:100 900}
      *{box-sizing:border-box}body{margin:0;background:#F7F4ED;color:#221D18;font-family:Atkinson,sans-serif}
      main{height:1080px;display:grid;grid-template-columns:1fr 820px;gap:64px;padding:100px}
      article{display:flex;flex-direction:column;justify-content:center}h1{font-size:64px;line-height:1.12;letter-spacing:-1.5px;margin:0 0 44px}
      p{font-size:32px;line-height:1.45;color:#4D463F;margin:0}.brand{font-size:36px;font-weight:700;margin-bottom:64px}
      figure{margin:0;display:flex;align-items:center;justify-content:center;height:820px}img{max-width:820px;max-height:820px;object-fit:contain;border:1px solid #D9D3CA;border-radius:16px}
      footer{position:absolute;bottom:32px;left:100px;right:100px;font-size:22px;color:#696259;display:flex;justify-content:space-between}
      </style></head><body><main><article><div class="brand">AgapayMo</div><h1>${title}</h1><p>${copy}</p></article><figure><img src="data:image/png;base64,${png}" alt="Actual app screen"></figure></main>
      <footer><span>Actual offline desktop browser • Synthetic data • Physical phone trials pending</span><span>${i + 1} / 6</span></footer></body></html>`)
    await page.locator('img').evaluate((img) => img.decode())
    await page.evaluate(() => document.fonts.ready)
    await page.screenshot({ path: join(frames, `frame-${String(i).padStart(2, '0')}.jpg`), type: 'jpeg', quality: 95 })
  }
} finally { await browser.close() }
const ffmpeg = process.env.FFMPEG_PATH
if (!ffmpeg) throw new Error('Set FFMPEG_PATH to an ffmpeg executable with libvpx-vp9.')
const output = join(root, 'docs', 'demo', 'agapaymo-one-minute.webm')
const images = await Promise.all(shots.map((_, i) => readFile(join(frames, `frame-${String(i).padStart(2, '0')}.jpg`))))
execFileSync(ffmpeg, ['-y', '-hide_banner', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', '1/10', '-c:v', 'mjpeg', '-i', 'pipe:0', '-t', '60', '-r', '24', '-c:v', 'libvpx-vp9', '-deadline', 'realtime', '-cpu-used', '8', '-b:v', '0', '-crf', '30', '-pix_fmt', 'yuv420p', output], { input: Buffer.concat(images), stdio: ['pipe', 'inherit', 'inherit'] })
console.log(`Rendered 60 s silent rehearsal cut: ${output}`)
