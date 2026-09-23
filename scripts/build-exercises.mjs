// Fetches the MIT-licensed exercise dataset and trims it to an English-only, compact
// form, then filters it to the movements this app is actually used for.
// Run: node scripts/build-exercises.mjs
//
// The upstream file is ~17 MB because it carries instructions in ten languages; we ship
// one. Of the 1,324 English records that leaves, most are variants nobody programmes —
// stretches, gymnastics skills, and forty ways to hold a curl. The filter below is
// SUBTRACTIVE in four passes and every pass is reversible: widen a rule, re-run, and the
// records come back with the same ids, because ids are upstream's and stable. The only
// unsafe direction is narrowing a rule so it drops an id that already exists in someone's
// stored history — hence the guard at the bottom.
import { writeFileSync, mkdirSync } from 'node:fs'

const SRC = 'https://raw.githubusercontent.com/hasaneyldrm/exercises-dataset/main/data/exercises.json'
const OUT = 'src/data/exercises.json'

// Pass 1 — equipment. What is in the gym. Bands, balls, ropes, rollers, kettlebells and
// the cardio machines are out; cardio is logged as an Activity and never as a lift.
const EQUIPMENT = [
  'barbell', 'ez barbell', 'olympic barbell', 'trap bar',
  'dumbbell', 'cable', 'leverage machine', 'smith machine', 'sled machine',
  'body weight', 'weighted', 'assisted',
]

// Pass 2 — movement pattern. A record earns its place by being a recognisable instance of
// one of these; anything matching none of them is not a lift you would write into a plan.
const PATTERNS = [
  /\bsquat\b|hack squat|goblet/,
  /leg press/,
  /deadlift|good morning|hip thrust|glute bridge|back extension|hyperextension/,
  /\blunge\b|step-up|step up|split squat/,
  /leg curl|hamstring curl/,
  /leg extension/,
  /calf raise|calf press/,
  /bench press|chest press|\bfly\b|flyes|pec deck|push-up|push up|\bdip\b|dips\b/,
  /shoulder press|overhead press|military press|arnold press|press behind neck/,
  /\brow\b|\brows\b|face pull|rear delt|reverse fly/,
  /pulldown|pull-down|pull-up|pull up|chin-up|chin up|pullover/,
  /curl/,
  /triceps|pushdown|push-down|skullcrusher|skull crusher|close-grip bench|kickback/,
  /lateral raise|front raise|upright row|\bshrug\b/,
  /crunch|sit-up|sit up|\bplank\b|leg raise|russian twist|woodchop|wood chop|ab wheel|knee raise|leg-hip raise|hip raise|oblique|dead bug|v-sit|flutter kick|toe touch/,
]

// Pass 3 — categories that match a pattern by accident. A front lever is not a row. The
// ball apparatus is named only in the exercise name, never in `equipment` — a fly done
// over a gym ball is filed under "cable" — so pass 1 cannot catch it and this must.
const JUNK = /stretch|yoga|pose\b|planche|maltese|front lever|back lever|skin the cat|handstand|muscle.?up|impossible|gorilla chin|stalder|iron cross|korean dips| v\. ?2\b|\((male|female)\)|stability ball|exercise ball|swiss ball|bosu|potty/

// Pass 4 — qualifiers marking a name as a VARIATION of a movement rather than the
// movement. This is the pass that turns 40 curls into 8: the dataset's redundancy is
// almost entirely grip, stance, tempo and apparatus fiddling around a handful of lifts.
const VARIANT = new RegExp([
  'one arm', 'single arm', 'one leg', 'single leg', 'alternate', 'alternating',
  'zottman', 'drag curl', 'spider', 'squatting', 'prone', 'supine', 'kneeling',
  'scapula', 'scapular', 'archer', 'clap', 'plyo', 'ring ', 'suspended', 'self assisted',
  'with towel', 'towel', 'on floor', 'floor ', 'wall', 'on knees', 'knees bent',
  'behind (the )?back', 'behind neck', 'reverse grip', 'neutral grip', 'mixed grip',
  'narrow parallel', 'inner', 'outer', 'cross body', 'crossover', 'twisting', 'twist(ed)?',
  'jump', 'depth', 'drop', 'isometric', 'negative', 'partial', 'quarter', 'half ',
  'frog', 'cocoon', 'inchworm', 'bottoms-up', 'butt-ups', 'kick out', 'flag',
  'finger', 'wrist', 'roller', 'sissy', 'curtsey', 'monster walk', 'march',
  'bench dip', 'elbow dip', 'side push', 'body-up', 'high curl', 'lying wide',
  'v-bar', 'with bar', 'salute', 'gironda', 'rocky', 'sternum', 'l-pull', 'l-sit',
  'shoulder grip', 'side-to-side', 'side lying', 'lying side', 'incline scapula',
].join('|'), 'i')

// Pass 5 — reviewed by hand against the 503 the rules left, on 2026-09-05. Rules cannot
// tell a leg press apart from the same leg press shot from behind, or a preacher curl
// from one done over a gym ball; these are the leftovers that needed a person to look.
const REVIEWED_OUT = new Set([
  '0022', '0024', '0026', '0029', '0039', '0044', '0045', '0051',
  '0052', '0059', '0063', '0081', '0088', '0090', '0101', '0108',
  '0111', '0115', '0121', '0127', '0182', '0197', '0202', '0208',
  '0225', '0248', '0284', '0377', '0379', '0386', '0403', '0450',
  '0488', '0490', '0496', '0498', '0586', '0593', '0601', '0642',
  '0660', '0661', '0664', '0672', '0741', '0742', '0749', '0763',
  '0769', '0770', '0772', '0773', '0812', '0813', '0815', '0818',
  '0833', '1253', '1277', '1278', '1284', '1294', '1295', '1309',
  '1319', '1321', '1329', '1367', '1371', '1375', '1379', '1383',
  '1385', '1394', '1421', '1430', '1433', '1434', '1435', '1436',
  '1461', '1462', '1463', '1464', '1467', '1490', '1545', '1623',
  '1625', '1626', '1637', '1651', '1652', '1653', '1655', '1658',
  '1659', '1673', '1717', '1732', '1734', '1765', '1767', '1772',
  '2187', '2318', '2334', '2368', '2400', '2401', '2402', '2404',
  '2407', '2432', '2464', '2803', '2812', '2987', '3017', '3019',
  '3145', '3194', '3234', '3547', '3635', '3644', '3655', '3662',
  '3664', '3759', '3785', '5201',
])

// The seeded plan's twelve exercises, from src/lib/seed.js. Filtering one of these out
// ships a plan that references an exercise the dataset no longer has, so getExercise()
// returns null and Today renders a blank row. Cheaper to fail the build than to find out
// on the phone.
const SEEDED = [
  '0043', '0314', '0861', '0334', '0085', '0426',
  '2330', '0201', '0025', '0739', '0027', '0031',
]

function keep(e) {
  if (!EQUIPMENT.includes(e.equipment)) return false
  if (REVIEWED_OUT.has(e.id)) return false
  const n = e.name.toLowerCase()
  if (JUNK.test(n) || VARIANT.test(n)) return false
  return PATTERNS.some((re) => re.test(n))
}

const res = await fetch(SRC)
if (!res.ok) throw new Error(`fetch failed: ${res.status}`)
const raw = await res.json()

// Four upstream records double-encode the degree sign ("sled 45в° leg press").
// Fixed here so it never reaches the UI.
const fixEncoding = s => s.replace(/в°/g, '°')

const trimmed = raw.map(e => ({
  id: e.id,
  name: fixEncoding(e.name),
  bodyPart: e.body_part,
  equipment: e.equipment,
  target: e.target,
  muscleGroup: e.muscle_group,
  secondary: e.secondary_muscles,
  steps: e.instruction_steps.en,
  image: e.image.replace(/^images\//, ''),
  gif: e.gif_url.replace(/^videos\//, '')
}))

const filtered = trimmed.filter(keep)

const ids = new Set(filtered.map(e => e.id))
const missing = SEEDED.filter(id => !ids.has(id))
if (missing.length) {
  throw new Error(`filter dropped seeded plan exercises: ${missing.join(', ')}`)
}

mkdirSync('src/data', { recursive: true })
writeFileSync(OUT, JSON.stringify(filtered))
console.log(`${filtered.length} of ${trimmed.length} exercises → ${OUT}`)
