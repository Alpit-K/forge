// Fetches MuscleMap's male front and back outlines (MIT, melihcolpan/MuscleMap) and writes
// them as plain SVG path data to src/data/body.json. Run: npm run body
//
// MuscleMap ships its paths as Swift source rather than .svg files, so this reads the two
// Swift files and keeps only the strings. The commit is pinned: a moved outline would
// silently reshape a muscle on screen. openGym draws from the same source, but its copy is
// AGPL — take the paths from here, never from there.
import { writeFileSync } from 'node:fs'
import { PARTS } from '../src/lib/body.js'

const SHA = 'd53ddf4d480b65979f1008b203e6b6eda0e67e54'
const SRC = `https://raw.githubusercontent.com/melihcolpan/MuscleMap/${SHA}/Sources/MuscleMap/Data`
const OUT = 'src/data/body.json'

// Overlays drawn on top of a whole muscle — upper and lower chest over the chest, and so
// on. The groups resolve to whole muscles, so shading a sub-region would claim a precision
// the data does not have.
const SUB_PARTS = new Set([
  'upperChest', 'lowerChest', 'innerQuad', 'outerQuad', 'upperAbs', 'lowerAbs',
  'frontDeltoid', 'rearDeltoid', 'upperTrapezius', 'lowerTrapezius',
])

async function view(file, viewBox) {
  const res = await fetch(`${SRC}/${file}`)
  if (!res.ok) throw new Error(`${file}: HTTP ${res.status}`)
  const swift = await res.text()
  const parts = {}
  for (const block of swift.split('BodyPartPathData(').slice(1)) {
    const slug = block.match(/slug: \.(\w+)/)[1]
    if (!SUB_PARTS.has(slug)) parts[slug] = [...block.matchAll(/"(M[^"]+)"/g)].map((m) => m[1])
  }
  return { viewBox, parts }
}

const body = {
  front: await view('MaleFrontPaths.swift', '0 95 727 1280'),
  back: await view('MaleBackPaths.swift', '718 95 727 1280'),
}

// A slug that is in neither view is a group that never lights, and nothing on screen says so.
const missing = Object.values(PARTS).flat().filter((s) => !body.front.parts[s] && !body.back.parts[s])
if (missing.length) throw new Error(`body.json has no outline for: ${missing.join(', ')}`)

writeFileSync(OUT, JSON.stringify(body))
console.log(`${OUT}: ${Object.keys(body.front.parts).length} front parts, ${Object.keys(body.back.parts).length} back parts`)
