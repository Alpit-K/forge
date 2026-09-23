// Generates the two PNG icons the manifest requires from public/icon.svg. Do not hand-draw
// PNGs. Run: npm run icons
import { readFileSync } from 'node:fs'
import sharp from 'sharp'

const svg = readFileSync('public/icon.svg')

async function render(size) {
  await sharp(svg, { density: 300 }).resize(size, size).png().toFile(`public/pwa-${size}x${size}.png`)
}

await render(180)
await render(512)
console.log('wrote pwa-180x180.png and pwa-512x512.png')
