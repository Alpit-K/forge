// Inline SVG glyphs — there is no SF Symbols font on the web, so we draw simple ones.
const STROKE = {
  fill: 'none',
  stroke: 'currentColor',
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
}

// Every glyph is drawn on a 24 grid, so a constant strokeWidth renders at 2 * size / 24 —
// which ran from 1.17px on a 14px chevron to 2.17px in the 26px tab bar, a 2.1x spread in
// apparent weight across icons that sit on screen together. A row chevron and the gear
// beside it in History were the visible case. Solving for a constant rendered weight
// instead keeps the set looking like one family at every size it is used at.
const RENDERED_STROKE = 1.75

// The one exception to the constant above, for a selected tab. Weight is the half of the
// active state that survives bad light and a colour-vision deficiency — hue is the half
// that does not — so the difference has to be visible with the colour taken away.
const RENDERED_STROKE_STRONG = 2.3
const strokeFor = (size, strong) => ((strong ? RENDERED_STROKE_STRONG : RENDERED_STROKE) * 24) / size

function paths(name) {
  switch (name) {
    case 'today':
      return (
        <>
          <rect x="3" y="5" width="18" height="16" rx="3" />
          <path d="M3 10h18M8 3v4M16 3v4" />
          <circle cx="12" cy="15" r="1" fill="currentColor" stroke="none" />
        </>
      )
    case 'plan':
      return (
        <>
          <path d="M8 6h13M8 12h13M8 18h13" />
          <circle cx="4" cy="6" r="1" fill="currentColor" stroke="none" />
          <circle cx="4" cy="12" r="1" fill="currentColor" stroke="none" />
          <circle cx="4" cy="18" r="1" fill="currentColor" stroke="none" />
        </>
      )
    // The Library tab was a 2×2 grid of rounded squares — the glyph every OS uses for
    // "apps", on a tab that holds exercises. It takes the dumbbell below, which was
    // already drawn and had no caller.
    case 'history':
      return (
        <>
          <circle cx="12" cy="12" r="9" />
          <path d="M12 7v5l3 2" />
        </>
      )
    // Eight trapezoidal teeth on a 7.4 root circle, hub at 3. The rays-around-a-dot version
    // this replaces read as a brightness control, not a gear.
    case 'gear':
      return (
        <>
          <path d="M10.46 4.76L10.55 1.70L13.45 1.70L13.54 4.76A7.4 7.4 0 0 1 16.03 5.79L18.26 3.69L20.31 5.74L18.21 7.97A7.4 7.4 0 0 1 19.24 10.46L22.30 10.55L22.30 13.45L19.24 13.54A7.4 7.4 0 0 1 18.21 16.03L20.31 18.26L18.26 20.31L16.03 18.21A7.4 7.4 0 0 1 13.54 19.24L13.45 22.30L10.55 22.30L10.46 19.24A7.4 7.4 0 0 1 7.97 18.21L5.74 20.31L3.69 18.26L5.79 16.03A7.4 7.4 0 0 1 4.76 13.54L1.70 13.45L1.70 10.55L4.76 10.46A7.4 7.4 0 0 1 5.79 7.97L3.69 5.74L5.74 3.69L7.97 5.79A7.4 7.4 0 0 1 10.46 4.76Z" />
          <circle cx="12" cy="12" r="3" />
        </>
      )
    case 'chevron':
      return <path d="M9 6l6 6-6 6" />
    case 'check':
      return <path d="M4 12l6 6L20 6" />
    case 'search':
      return <path d="M10.5 17.5a7 7 0 1 0 0-14 7 7 0 0 0 0 14ZM15.5 15.5 20.5 20.5" />
    case 'plus':
      return <path d="M12 5v14M5 12h14" />
    case 'minus':
      return <path d="M5 12h14" />
    case 'library':
    case 'dumbbell':
      return <path d="M6.5 6.5v11M17.5 6.5v11M3.5 9v6M20.5 9v6M6.5 12h11" />

    case 'list':
      return <path d="M4 6h16M4 12h10M4 18h14" />

    /* The app's own mark, on Today alone. Same primitives as `public/icon.svg`, drawn on
       that file's 512 grid and scaled down here so the two cannot drift — edit both or
       neither. Fills, not strokes: at 26px an 18-unit stroke is 0.91px, which is why the
       icon's sparks do not come with it. */
    case 'anvil':
      return (
        <g transform="translate(-1.061 -0.331) scale(0.05204)" fill="currentColor" stroke="none">
          <path d="M168 118 L168 192 C122 190, 78 180, 42 162 C80 142, 122 121, 168 118 Z" />
          <rect x="150" y="118" width="322" height="72" rx="5" />
          <path d="M246 186 L354 186 C344 230, 350 266, 368 300 L232 300 C250 266, 256 230, 246 186 Z" />
          <path d="M170 296 L430 296 L430 356 L366 356 C352 336, 328 328, 300 328 C272 328, 248 336, 234 356 L170 356 Z" />
        </g>
      )

    /* Activity glyphs — one per ACTIVITY_TYPES entry, keyed by the same id. Drawn rather
       than pulled from the exercise CDN: the app must render with no signal, and a stick
       figure from a weights dataset is the wrong picture for a tennis match anyway. */
    case 'run':
      return (
        <>
          <circle cx="15.5" cy="4.5" r="2" fill="currentColor" stroke="none" />
          <path d="M16.5 8.5 L13 12.5 L15 16 L14 21" />
          <path d="M13 12.5 L8.5 14 L6 18.5" />
          <path d="M16.5 8.5 L20 11.5" />
          <path d="M15 9.5 L10.5 9" />
        </>
      )
    case 'tennis':
      return (
        <>
          <circle cx="9.5" cy="9.5" r="5.5" />
          <path d="M6 6 L13 13 M13 6 L6 13" />
          <path d="M13.5 13.5 L19 19.5" />
          <circle cx="19" cy="6" r="2" />
        </>
      )
    case 'cycle':
      return (
        <>
          <circle cx="5.5" cy="16.5" r="3.5" />
          <circle cx="18.5" cy="16.5" r="3.5" />
          <path d="M5.5 16.5 L10 8 L11.5 16.5 M10 8 L16 7.5 L18.5 16.5 M8.5 8 L11.5 8" />
        </>
      )
    case 'swim':
      return (
        <>
          <circle cx="7.5" cy="7" r="2" fill="currentColor" stroke="none" />
          <path d="M10.5 9 L15.5 6 L19.5 8" />
          <path d="M2 14.5c2-1.6 4-1.6 6 0s4 1.6 6 0 4-1.6 6 0" />
          <path d="M2 19c2-1.6 4-1.6 6 0s4 1.6 6 0 4-1.6 6 0" />
        </>
      )
    case 'walk':
      return (
        <>
          <circle cx="13" cy="4.5" r="2" fill="currentColor" stroke="none" />
          <path d="M13.5 8 L12 13.5 L14 17.5 L14.5 21.5" />
          <path d="M12 13.5 L9 17 L8 21.5" />
          <path d="M13.5 9 L16 13" />
          <path d="M13.5 9 L10 12" />
        </>
      )
    case 'other':
      return <path d="M2 12h4l2.5-6 4 12 2.5-6h7" />
    case 'rest':
      return (
        <>
          <path d="M20.5 14.5A8.5 8.5 0 1 1 9.5 3.5a6.5 6.5 0 0 0 11 11z" />
        </>
      )

    /* A long run, in the week planner. It cannot be the `run` glyph again: at 20px the
       only thing separating a cardio day from a long one would be the label under it, and
       the whole point of the planner is that the week reads without being read. Distance
       travelled rather than a second figure — a route from one point to another. */
    case 'route':
      return (
        <>
          <circle cx="5" cy="19" r="2" fill="currentColor" stroke="none" />
          <circle cx="19" cy="5" r="2" fill="currentColor" stroke="none" />
          <path d="M5 16.5V14c0-2 1.5-3.5 3.5-3.5h7c2 0 3.5-1.5 3.5-3.5V7.5" />
        </>
      )

    /* Plan's edit sheet. Move up and move down are arrows rather than chevrons on purpose:
       a chevron in this app means navigation or disclosure, and these two move a thing. */
    case 'swap':
      return (
        <>
          <path d="M4 8h13M13.5 4.5L17 8l-3.5 3.5" />
          <path d="M20 16H7M10.5 12.5L7 16l3.5 3.5" />
        </>
      )
    case 'arrow-up':
      return <path d="M12 20V4M5.5 10.5L12 4l6.5 6.5" />
    case 'arrow-down':
      return <path d="M12 4v16M5.5 13.5L12 20l6.5-6.5" />

    /* Settings row glyphs. A settings list is the one screen in the app that is all words
       and no numbers, so the icon is what makes a row findable on the second visit — you
       remember where the speaker was, not the reading order of three switches. */
    case 'timer':
      return (
        <>
          <circle cx="12" cy="13.5" r="7.5" />
          <path d="M12 9.5v4h3" />
          <path d="M9.5 2.5h5M12 2.5v3.5" />
        </>
      )
    case 'sun':
      return (
        <>
          <circle cx="12" cy="12" r="4" />
          <path d="M12 2v2.5M12 19.5V22M2 12h2.5M19.5 12H22M4.9 4.9l1.8 1.8M17.3 17.3l1.8 1.8M19.1 4.9l-1.8 1.8M6.7 17.3l-1.8 1.8" />
        </>
      )
    case 'speaker':
      return (
        <>
          <path d="M4 9.5h3.5L12 5.5v13L7.5 14.5H4z" />
          <path d="M15.5 9.5a4 4 0 0 1 0 5" />
          <path d="M18 7a7.5 7.5 0 0 1 0 10" />
        </>
      )
    case 'archive':
      return (
        <>
          <rect x="3" y="4" width="18" height="5" rx="1.5" />
          <path d="M5 9v10a1.5 1.5 0 0 0 1.5 1.5h11A1.5 1.5 0 0 0 19 19V9" />
          <path d="M10 13h4" />
        </>
      )
    case 'export':
      return (
        <>
          <path d="M12 15.5V3.5M8 7.5l4-4 4 4" />
          <path d="M4 15v4.5a1.5 1.5 0 0 0 1.5 1.5h13a1.5 1.5 0 0 0 1.5-1.5V15" />
        </>
      )
    case 'import':
      return (
        <>
          <path d="M12 3.5v12M8 11.5l4 4 4-4" />
          <path d="M4 15v4.5a1.5 1.5 0 0 0 1.5 1.5h13a1.5 1.5 0 0 0 1.5-1.5V15" />
        </>
      )
    case 'trash':
      return (
        <>
          <path d="M4 6.5h16" />
          <path d="M9 6.5V4.5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
          <path d="M6.5 6.5l1 13a1.5 1.5 0 0 0 1.5 1.4h6a1.5 1.5 0 0 0 1.5-1.4l1-13" />
          <path d="M10 10.5v6M14 10.5v6" />
        </>
      )
    default:
      return null
  }
}

export default function Icon({ name, size = 24, strong = false }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      aria-hidden="true"
      strokeWidth={strokeFor(size, strong)}
      {...STROKE}
    >
      {paths(name)}
    </svg>
  )
}
