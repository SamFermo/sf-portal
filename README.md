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
- **86 Board** — Tonight's 86 list and specials. Editable, stored per-day on the
  device.

## Files

```
staff-portal/
├── index.html          — the whole app (CSS + JS embedded)
├── data.js             — generated data bundle the app reads (window.SF)
├── build-data.py       — rebuilds data.js from the data/*.json files
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
- **New schedule week:** re-pull the FOH/BOH sheets and update `schedule.json`.
- **Compliance changes:** keep `compliance.json` in step with the Compliance
  Notebook artifact.

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
