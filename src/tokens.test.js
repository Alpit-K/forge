import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

// The palette's contrast figures are recorded in comments beside the tokens in index.css,
// and every one of them was measured by hand. That is exactly the kind of number that goes
// quietly stale: --bg-tertiary moved once and took `.thumb-activity`'s recorded ratio with
// it, and nothing anywhere said so. This reads the real stylesheet — tokens, the card
// sheen's alpha and the thumbnail's filter — so a change to any of them either keeps the
// contrast the app promises or fails here.
const css = readFileSync(new URL('./index.css', import.meta.url), 'utf8')

const token = (name) => {
  const m = css.match(new RegExp(`\\s--${name}:\\s*([^;]+);`))
  if (!m) throw new Error(`token --${name} not found`)
  return m[1].trim()
}

// Resolves one level of var() so a rule can be read as the colour it actually paints.
const resolve = (value) => {
  const ref = value.trim().match(/^var\(--([\w-]+)\)$/)
  return ref ? token(ref[1]) : value.trim()
}

const parse = (value) => {
  const hex = value.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i)
  if (hex) {
    const h = hex[1].length === 3 ? [...hex[1]].map((c) => c + c).join('') : hex[1]
    return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16))
  }
  const rgba = value.match(/rgba?\(([^)]+)\)/)
  if (!rgba) throw new Error(`cannot parse colour: ${value}`)
  const parts = rgba[1].split(',').map((n) => Number(n.trim()))
  return parts.length === 4 ? parts : [...parts, 1]
}

// A translucent foreground is not a colour until it has a background behind it. Every
// --label-secondary figure in the app is this composite, never the raw rgba.
const over = (fg, bg) => {
  const [r, g, b, a = 1] = fg
  return [r, g, b].map((c, i) => c * a + bg[i] * (1 - a))
}

const channel = (c) => {
  const v = c / 255
  return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4
}
const luminance = ([r, g, b]) => 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b)

const ratio = (fg, bg) => {
  const a = luminance(over(fg, bg))
  const b = luminance(bg)
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)
}

const bg = parse(token('bg'))
const card = parse(token('bg-elevated'))
const tertiary = parse(token('bg-tertiary'))
const label = parse(token('label'))
const labelSecondary = parse(token('label-secondary'))
const separator = parse(token('separator'))
const accent = parse(token('accent'))
const catLift = parse(resolve(token('cat-lift')))
const catCardio = parse(token('cat-cardio'))
const accentFill = parse(token('accent-fill'))
const accentPress = parse(token('accent-press'))
const accentBright = parse(token('accent-bright'))
const onAccent = parse(token('on-accent'))
const success = parse(token('success'))
const danger = parse(token('danger'))

// The card is not one colour. --surface-sheen lifts its top edge, and that is where a row
// at the head of a list draws its text, so it is the worst case for every pair on a card.
const sheenAlpha = Number(token('surface-sheen').match(/rgba\([^)]*?,\s*([\d.]+)\)/)[1])
const cardTop = over([...label.slice(0, 3), sheenAlpha], card)

// The category tints are painted as translucent tiles, which means the alpha is part of the
// colour and a tile is not a colour until it has the card behind it. The --cat-*-dim tokens
// are the --cat-* tokens written out by hand with an alpha, because CSS cannot derive one
// from a hex — so the pair can drift, and reading the ground out of the real rule is what
// catches it. Every tinted ground in the app resolves back through here.
const tileBg = (selector) => {
  const rule = css.match(new RegExp(`${selector.replace(/[.[\]$^*+?()|\\]/g, '\\$&')} \\{[^}]*?background:\\s*([^;]+);`))
  if (!rule) throw new Error(`no background found for ${selector}`)
  return over(parse(resolve(rule[1])), card)
}
const activityTile = tileBg('.thumb-activity')
const liftTile = tileBg(".planner-day[data-cat='lift'] .planner-tile")
const cardioTile = tileBg(".planner-day[data-cat='cardio'] .planner-tile")
const liftRowIcon = tileBg(".row-icon[data-cat='lift']")
const cardioRowIcon = tileBg(".row-icon[data-cat='cardio']")

describe('text pairs meet WCAG AA', () => {
  // Every one of these is drawn somewhere: --label and --label-secondary on all three
  // surfaces, --accent wherever it is a label (.btn, .ex-open, .filter-clear,
  // .row-label.accent), --on-accent on the two filled states, and the two status colours.
  const pairs = [
    ['label on ground', label, bg],
    ['label on card', label, card],
    ['label on lit card top', label, cardTop],
    ['label on tertiary', label, tertiary],
    ['label-secondary on ground', labelSecondary, bg],
    ['label-secondary on card', labelSecondary, card],
    ['label-secondary on lit card top', labelSecondary, cardTop],
    ['label-secondary on tertiary', labelSecondary, tertiary],
    ['accent on ground', accent, bg],
    ['accent on card', accent, card],
    ['accent on lit card top', accent, cardTop],
    ['on-accent on accent-fill', onAccent, accentFill],
    ['on-accent on accent-press', onAccent, accentPress],
    ['success on card', success, card],
    ['danger on card', danger, card],
    // The cardio tint is a category, not a graphic: it names the run trend and the activity
    // rows, so it is held to the text bar even where it is currently only drawn as a glyph.
    ['cat-cardio on card', catCardio, card],
    ['cat-cardio on lit card top', catCardio, cardTop],
  ]
  for (const [name, fg, base] of pairs) {
    it(`${name} clears 4.5:1`, () => {
      expect(ratio(fg, base)).toBeGreaterThanOrEqual(4.5)
    })
  }
})

// The glyph a logged set is marked with, read from the rule that paints it.
const tickGlyph = parse(resolve(css.match(/\.tick\.done \{[^}]*?[;{]\s*color:\s*([^;]+);/)[1]))

describe('graphical objects meet 3:1', () => {
  // Not text: a 26px glyph in the activity thumbnail, the rest ring's dark gradient stop,
  // and the hollow accent ring marking a planned day on the week strip.
  const pairs = [
    ['activity glyph on its tinted tile', catCardio, activityTile],
    // The week planner's four kinds. Rest is the one without a hue, and it has to clear the
    // same bar — a calm day is still a day you have to be able to read.
    ['planner lift glyph on its tile', catLift, liftTile],
    ['planner cardio glyph on its tile', catCardio, cardioTile],
    ['planner rest glyph on tertiary', labelSecondary, tertiary],
    // The same two tints on a row's leading glyph — Plan's session headers.
    ['row-icon lift glyph on its tile', catLift, liftRowIcon],
    ['row-icon cardio glyph on its tile', catCardio, cardioRowIcon],
    // The week strip. Its hollow ring is a 1.5px stroke and its filled dot a 10px mark;
    // both are graphical objects on the week card, which keeps the elevated fill.
    ['week strip lift mark on card', catLift, card],
    ['week strip cardio mark on card', catCardio, card],
    // Settings' row glyphs, both tints, on the neutral tile they sit in.
    ['settings glyph on tertiary', accent, tertiary],
    ['settings danger glyph on tertiary', danger, tertiary],
    // Read out of the rule rather than assumed, so putting #fff back here fails.
    ['logged-set tick glyph on its fill', tickGlyph, success],
    ['ring fill on ground', accentFill, bg],
    ['planned-day ring on card', accent, card],
  ]
  for (const [name, fg, base] of pairs) {
    it(`${name} clears 3:1`, () => {
      expect(ratio(fg, base)).toBeGreaterThanOrEqual(3)
    })
  }
})

describe('surfaces read as raised', () => {
  // Under about 1.2 a surface stops reading as a separate plane at all, which is what
  // killed the first pass at these values.
  it('card sits above the ground', () => {
    expect(ratio(card, bg)).toBeGreaterThanOrEqual(1.2)
  })
  it('an input sits above the card', () => {
    expect(ratio(tertiary, card)).toBeGreaterThanOrEqual(1.2)
  })
  it('the sheen lifts the card top without reaching the next surface', () => {
    expect(luminance(cardTop)).toBeGreaterThan(luminance(card))
    expect(luminance(cardTop)).toBeLessThan(luminance(tertiary))
  })
})

describe('the exercise thumbnail stays under the text it belongs to', () => {
  // The dataset's art is line drawing on solid white, so the trim is the only thing
  // stopping a column of lit squares outshouting the exercise names beside them. This is
  // the assertion that the filter is actually doing that job: it was brightness(0.88)
  // once, which left the white ground at 90% of the title's contrast.
  const filter = css.match(/\.thumb img \{[^}]*filter:\s*([^;]+);/)[1]
  const brightness = Number(filter.match(/brightness\(([\d.]+)\)/)[1])
  const contrast = Number(filter.match(/contrast\(([\d.]+)\)/)[1])
  const white = (1 * brightness - 0.5) * contrast + 0.5
  const ground = [white * 255, white * 255, white * 255]

  it('is no more than two thirds of the title it sits beside', () => {
    expect(ratio(ground, card)).toBeLessThanOrEqual(ratio(label, card) * (2 / 3))
  })
  it('is still clearly visible as an image', () => {
    expect(ratio(ground, card)).toBeGreaterThanOrEqual(4)
  })
})

describe('the figures recorded in the stylesheet comments are true', () => {
  // A comment claiming a ratio is a claim the next person will trust without re-measuring.
  // These are the ones written down beside the tokens; if a token moves, this fails and the
  // comment gets corrected with it rather than quietly becoming a lie.
  const recorded = [
    ['card on ground', ratio(card, bg), 1.25],
    ['input on card', ratio(tertiary, card), 1.39],
    ['label on card', ratio(label, card), 13.96],
    ['label on ground', ratio(label, bg), 17.44],
    ['accent on card', ratio(accent, card), 4.73],
    ['accent on tertiary', ratio(accent, tertiary), 3.4],
    ['accent-fill on card', ratio(accentFill, card), 2.57],
    ['accent-fill on ground', ratio(accentFill, bg), 3.21],
    ['accent-bright on ground', ratio(accentBright, bg), 9.42],
    ['on-accent on accent-fill', ratio(onAccent, accentFill), 6.14],
    ['on-accent on accent-press', ratio(onAccent, accentPress), 7.52],
    ['accent on lit card top', ratio(accent, cardTop), 4.56],
    ['label on lit card top', ratio(label, cardTop), 13.47],
    ['label-secondary on lit card top', ratio(labelSecondary, cardTop), 6.08],
    // The category pair is luminance-MATCHED, not merely both legible — the claim in the
    // token comment is that a cardio glyph and a lift glyph weigh the same, and these two
    // lines either side of each other are what holds it to that.
    ['cat-cardio on card', ratio(catCardio, card), 4.75],
    ['cat-lift on card', ratio(catLift, card), 4.73],
    ['cat-cardio on tertiary', ratio(catCardio, tertiary), 3.42],
    ['cat-lift on tertiary', ratio(catLift, tertiary), 3.4],
    // A tinted tile must sit where the neutral one it replaces sits: TINTED, not raised.
    ['activity tile on card', ratio(activityTile, card), 1.4],
    ['activity glyph on its tile', ratio(catCardio, activityTile), 3.39],
    ['planner lift tile on card', ratio(liftTile, card), 1.43],
    ['planner lift glyph on its tile', ratio(catLift, liftTile), 3.32],
    ['planner cardio tile on card', ratio(cardioTile, card), 1.4],
    ['planner cardio glyph on its tile', ratio(catCardio, cardioTile), 3.39],
    ['label-secondary on tertiary', ratio(labelSecondary, tertiary), 4.97],
    ['danger on tertiary', ratio(danger, tertiary), 3.73],
  ]
  for (const [name, actual, claimed] of recorded) {
    it(`${name} is ${claimed}:1`, () => {
      expect(actual).toBeCloseTo(claimed, 1)
    })
  }

  it('the separator is a hairline and is not claimed to be readable', () => {
    expect(ratio(separator, card)).toBeLessThan(3)
  })
})
