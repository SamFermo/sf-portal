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
