# San Fermo Staff Portal

A single-page reference site for the floor and the line, styled in the Fresh Talk
design language (the same look as the Swan House farm-dinner app). iPad- and
phone-first. Built 2026-06-02.

Lives at `Codename: Riker/staff-portal/`. Deploys to GitHub Pages at
`https://samfermo.github.io/sf-portal/`.

## What's in it

- **Fresh Talk** — Food / Wine / Cocktails. Daily menu, the full current wine
  list (43 pours, tap for producer + winemaking), cocktails, NA, beer, amaro
  flights, and the after-dinner list.
- **Schedule** — FOH and BOH, this week (auto-selects the current week) and the
  full month. Today's column is highlighted.
- **Duties** — Opening, closing, and running sidework. Tap to check off; resets
  daily (stored on the device).
- **Compliance** — Food handler (FWC) and MAST status for every active staffer,
  plus what's coming due. Links to the card binder PDF.
- **Directory** — The team with tap-to-call / tap-to-email, leads pinned on top.
- **Service** — Steps of service and house standards (service charge, wine
  service, allergens).
- **The Board** (was "86 Board") — Tonight's 86 list, specials, and **Tables
  Tonight**: the maître d' flags a table number with an occasion (Birthday /
  Anniversary / VIP / Special) and a note so servers see it live. Per-day, live
  across devices via Firebase (per-device fallback if offline).
- **Schedule → Time Off** — A shared, live time-off board. Any staffer picks
  their name (saved on the device), submits a date range + reason; it posts as
  **Pending** for everyone to see. A manager (PIN-gated) approves or denies.
  Each request has a notes thread so people can offer to cover. Stored in the
  Firestore `timeoff` collection (per-device fallback if offline).

### Identity & manager mode

- First open asks "Who are you?" — pick from the roster; saved on that device.
  Change it anytime from the chip on the home screen.
- **Manager mode** (home screen chip) unlocks Approve/Deny on time-off requests.
  It's PIN-gated. The PIN lives in `index.html` as `MANAGER_PIN` — change it to
  your own and share only with whoever should approve. Note: this is friction,
  not hard security — the site is public-by-URL, so the PIN keeps honest people
  honest rather than locking the data down.

## Files

```
staff-portal/
├── index.html          — the whole app (CSS + JS embedded)
├── data.js             — generated data bundle the app reads (window.SF)
├── build-data.py       — rebuilds data.js from the data/*.json files
├── build-schedule.py   — fetches FOH/BOH sheet tabs (gviz CSV), validates,
│                         diffs, writes data/schedule.json + .schedule-stamp
├── deploy-to-github.command
├── serve-local.command
└── data/
    ├── menu.json       — food + desserts
    ├── wines.json      — current wine list (cross-referenced w/ Wine Notes 2026)
    ├── bar.json        — cocktails, NA, beer, amaro flights, after-dinner
    ├── schedule.json   — FOH + BOH weeks (from FOH/BOH Summer 2026 sheets)
    ├── compliance.json — FWC/MAST roster + coming-due
    ├── staff.json      — directory (from Employee Contact Sheet 2026)
    └── service.json    — duties (Server Sidework 2026), steps of service, 86 board seed
```

## Updating content

Edit the relevant `data/*.json` file, then either run `serve-local.command` to
preview or `deploy-to-github.command` to push live (it rebuilds `data.js`
automatically). Examples:

- **New menu / wine list:** update `menu.json` / `wines.json`.
- **Compliance changes:** keep `compliance.json` in step with the Compliance
  Notebook artifact.

### Schedule — HARD RULE (2026-06-11 incident)

The FOH/BOH Google Sheets are the single source of truth for the schedule.
**Never edit `data/schedule.json` by hand, and never rebuild it outside
`build-schedule.py`.** Every schedule change, however small, goes into the
sheet first, then:

```
python3 build-schedule.py     # fetches all month tabs (gviz CSV; the sheets
                              # are link-shared Viewer), validates, prints a
                              # cell-level diff, writes schedule.json + stamp
bash deploy-to-github.command # refuses a schedule.json that doesn't match
                              # its .schedule-stamp
```

Read the diff the build prints: it reports every cell that changed. Anything
you didn't expect in there is a red flag — stop and check the sheet.

History: the old pipeline parsed the Drive markdown export, which scrambles
FOH week blocks (merged label cells detach headers from data), and re-paired
them heuristically. On 2026-06-11 that shipped 6/22's R/Os under the 6/15
header for ~8 hours. The gviz pipeline gets headers attached to every block
and does no pairing; anything ambiguous is a loud build failure, not a guess.

### Fresh Talk — HARD RULE: name the gap, never fill it

When a Fresh Talk card is generated, by the "Style with Remy" / dish-edit worker
(`FRESHTALK_SYSTEM` and `FRESHTALK_EDIT_SYSTEM` in `Codename:
Neelix/worker/index.js`) or by Claude during a correction session, it must
**never invent the makeup of an in-house prepped component** (puree, sauce, jus,
stock, jam, preserve, dressing, vinaigrette, emulsion, aioli, infusion, cure,
broth, house spice blend). It must also **never quietly drop it.** If the source
notes don't spell out that component's actual ingredients or method:

- **The component stays in the copy by name.** The floor needs to know it is on
  the plate. Omitting it leaves a silent gap nobody on the floor can see.
- **Its composition is never stated, implied, or generalized.** No "commonly
  carries", "normally built on", "typically includes", "usually a reduction of".
  A server repeats a hedge to a guest as fact, and the hedge does not survive the
  retelling.
- **Its ingredients note is exactly two sentences:** that the composition has not
  been specified for this prep, and the action that follows. This is the exemplar
  and the ceiling:

  > The composition of this demi glace has not been specified for this prep.
  > Confirm with the kitchen before clearing it for any allergy, allium especially.

  Name a specific allergen only where the preparation class puts one at obvious
  risk, and always keep the "any allergy" catch-all, because an unspecified
  composition can carry an allergen you did not name.
- **It goes in the `flags` array** so a manager gets a confirm chip.

How it surfaces:

- **Server copy carries the gap, loudly.** The dish's allergen chip row shows a
  provisional marker (`?` chip plus an "Allergen list provisional" line) readable
  without expanding the card, and "kitchen can modify" comes off any allergen the
  flag puts at risk. A modification we cannot describe is not one we can promise.
- **Flags are manager-only, and they are the mechanism.** The worker returns a
  `flags` array of `{component, riskAllergens, proposedStandard, label}`
  (legacy plain strings still parse). Each unresolved flag renders as an amber
  "tap to confirm" chip in manager mode. The confirm modal asks one question,
  takes the kitchen's answer, has Remy write it up in card voice for the manager
  to read and edit, requires a yes/no on every at-risk allergen, and only then
  clears the warning. `proposedStandard` is a manager-only candidate the chef
  comps against and never enters server copy.
- **Resolutions are per-component, not per-dish.** The edit overlay stores
  `resolvedComponents`; canonical flags from the overnight bake are always the
  starting point, so confirming one component today cannot mute a different flag
  raised tomorrow. A resolution is invalidated if the dish's menu line changes.

History: on 2026-06-22 a Risotto alle Zucchine card described its basil puree as
"basil blended with oil." The puree actually carried zucchini and crème fraîche
(dairy), a guess that read as fact and shipped. The first version of this rule
fixed that by omitting the unverified detail entirely and keeping all review
language out of server copy. On 2026-08-01 Sam overrode the omission half: the
floor should get the most complete version available with no silent assumptions
baked in, so the gap is now visible and actionable in server-facing copy while
its contents are still never speculated. Both halves matter. The 8/1 pass also
found the old rule had been leaking anyway, with "vinaigrettes commonly carry
shallot and mustard" style speculation live in ingredient notes on two dishes.

## Deploying (first time)

1. Create a **public** repo `sf-portal` under the `SamFermo` GitHub account.
2. Repo Settings → Pages → Source = *Deploy from branch*, Branch = `main` / root.
3. Mint a fine-grained PAT for `SamFermo/sf-portal` (Contents: Read/Write), copy
   it, then run:
   `mkdir -p ~/.starfleet && pbpaste > ~/.starfleet/sf-portal-token && chmod 600 ~/.starfleet/sf-portal-token`
4. Run `deploy-to-github.command`. Live in ~30–60s.

## Notes / parked

- The 86 board and duty checklists use the device's local storage, so each
  device keeps its own state and it resets daily. If you want a shared, live 86
  board across devices, that's a Firebase add-on like the farm app uses.
- Schedule currently carries June (+ the July 4 week for FOH). Re-run the pull to
  extend further out.
- FWC = WA Food Worker Card · MAST = alcohol server permit · CFPM = Certified
  Food Protection Manager.
