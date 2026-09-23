# Forge

A self-hosted, offline-first weightlifting log. It runs as a progressive web app installed
to an iPhone home screen — no backend, no accounts, no App Store, no subscription.

Forge guides one lifting session at a time: it prescribes the next weight and rep target
for each exercise, explains why that number was chosen, times your rest, and records what
you actually lifted. Everything is stored on the phone.

## Design constraints

These shape every decision in the codebase and are not negotiable.

| Constraint | Consequence |
|---|---|
| **No backend** | All state lives in one `localStorage` key. No API, no sync, no login. |
| **No native build** | The deliverable is a static `dist/` served over HTTPS and installed via Safari's *Add to Home Screen*. |
| **Must work with no signal** | A service worker caches the app shell. A basement gym is the target environment, not an edge case. |
| **One-handed operation** | Minimum 44×44 pt tap targets. Logging a set never requires precision. |
| **Kilograms only** | No unit toggle. |

The block is indexed by **completed sessions, not dates** — "Session 11 of 12", never a week
number or a weekday. Miss a week and nothing changes; the block stretches rather than
breaking. This is the central design decision, and it is why the app never nags.

## Getting started

```bash
npm install
npm run dev
```

| Command | Purpose |
|---|---|
| `npm run dev` | Vite dev server with HMR |
| `npm test` | Vitest, run once |
| `npm run lint` | Oxlint |
| `npm run build` | Static build to `dist/`, including the service worker and manifest |
| `npm run icons` | Regenerate the two PNG app icons from `public/icon.svg` |
| `npm run preview` | Serve the production build locally |

Requires Node 20.19+ or 22.12+ — Vite's own constraint. Vitest additionally rules out the
odd-numbered releases, so 21 and 23 will not work.

## Deploying

`npm run build` produces a `dist/` that deploys unchanged to any static host. **HTTPS is
mandatory** — service workers, offline caching and the Screen Wake Lock API all refuse to
run over plain HTTP.

The repository is set up for **Cloudflare Workers** with static assets. `wrangler.jsonc` in the
repository root points Cloudflare at `dist/`; there is no Worker script, so it has no `main`
entry point. Connect the repository under Workers & Pages and set the build command to
`npm run build` — Cloudflare reads the output directory from `wrangler.jsonc`, not from the
dashboard.

**Do NOT enable Cloudflare Access on the project.** It puts an authentication wall in front of
every request, which breaks *Add to Home Screen*, the service worker and offline use.

No redirect or rewrite rules are needed. The app is a single page with no router, so there are
no deep URLs to handle and `not_found_handling` can stay at its default.

Netlify also works unchanged if you prefer it — build command `npm run build`, publish
directory `dist`, production branch `main`.

The exercise media is loaded from a CDN at runtime and is not MIT-licensed — read `NOTICE`
before deploying a public instance. To build without it, set `VITE_EXERCISE_MEDIA=off` in the
build environment (on Cloudflare or Netlify, as a build environment variable): the app then
never requests the media and shows a lettered placeholder in its place.

Then open the deployed URL in Safari on the phone and choose **Share → Add to Home Screen**.
Updates ship by pushing to the repository; the installed app picks them up on its next
launch, and never mid-workout.

## How it works

Four tabs — **Today**, **Plan**, **Library**, **History** — and a Settings sheet reached from
the gear in the History nav bar.

Progression is **double progression**: work up through a rep range at a fixed weight, and
when every set reaches the top of the range, add one increment and start again at the
bottom. Two consecutive sessions where more than half the sets fell short trigger a 5%
deload, rounded to a weight that can actually be loaded — 2 kg steps for dumbbell work,
2.5 kg otherwise, or a per-exercise override for machines with coarse stacks.

Every prescribed target displays its reason: *"Up 2.5 kg — you hit 3×12 last time"*,
*"Holding — you got 10, 9, 7 last session"*. A suggestion you cannot audit is one you stop
trusting.

Targets are **computed from your logged history every time they are needed**, never stored.
Correct a mistyped set in History and the next session's target is immediately right, with
no counters to drift out of sync.

### Layout

```
src/
  engine/        pure logic — progression rules, session and block mechanics
  lib/           persistence, backup, wake lock, audio, the exercise dataset and seed plan
  screens/       Today, Plan, Library, History, Settings
  components/    shared UI — lists, sheets, steppers, the rest timer
  store.js       the single Zustand store; every screen reads and writes through it
  assets/        the bundled display typeface
  data/          the generated exercise dataset (371 exercises, 255 KB)
```

## Designing your own program

Forge ships with one starter plan — **Full Body 3-Day**, twelve sessions across three
rotations (squat-led, hinge-led, press-led). It is a template, not a prescription: it can be
edited down to the last exercise, and nothing about the app depends on it.

The **Plan** screen is where a program is built and adjusted. From it you can:

- **Change the length** — 12, 18, 24, 30, 36 or 48 sessions per block.
- **Add, remove and reorder** the exercises within each rotation.
- **Swap any exercise** for one of the 371 in the Library. Custom exercises — a name and a
  body part — are created from the Library screen and can then be used like any other.
- **Set the sets, rep range and rest** for every exercise, and override the weight increment
  on machines with coarse stacks.

The rotation structure itself is fixed at the three in the template. Today suggests which one
is due and any of them can be started instead, but rotations cannot be added, removed,
renamed or reordered — only their contents change.

Because every target is derived from *your* logged history (see above), the program adapts
to you automatically: you choose the exercises, sets and rep ranges once, and Forge handles
the weights, the advances and the deloads. There is no calendar — sessions advance by
completion, never by date — so a missed week leaves no trace and nothing to catch up on.

To build your own program, edit the template on the Plan screen before your first session.
**Settings → Reset all data** returns to the template, not to a blank plan.

## Back up your training log

The training log is the one irreplaceable thing here. iOS clears script-writable storage
after periods without interaction, and *Clear Website Data* wipes everything regardless of
how the app was installed.

**Settings → Export backup** writes a JSON file; **Import backup** restores it, behind a
confirmation because it replaces everything. After eight
completed sessions without an export, a reminder appears at the top of the History screen. It
can be dismissed, but it returns the next time History opens until an export actually happens.

**Settings → Reset all data** returns the app to a fresh install behind a confirmation —
every workout, weight, swap and custom exercise gone, back to session 1 of the seed plan.
Export first if there is anything you want to keep.

## Licence and attribution

Forge itself is released under the MIT licence — see `LICENSE`.

The exercise dataset is derived from
[`hasaneyldrm/exercises-dataset`](https://github.com/hasaneyldrm/exercises-dataset) under the
MIT licence.

**The exercise media is not covered by that licence.** The images and animations are
© Gym visual and are subject to their own terms; no licence to them passes with the dataset.
Forge bundles none of that media — it is loaded at runtime from a CDN copy of the upstream
repository, and a build with `VITE_EXERCISE_MEDIA=off` does not load it at all. See `NOTICE`
before deploying anywhere public.

The display typeface is [Inter](https://github.com/rsms/inter) under the SIL Open Font
Licence. It is bundled rather than fetched, because the app has to render with no signal.
