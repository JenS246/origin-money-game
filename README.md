# ORIGIN

ORIGIN is a daily geography game about real money. A player studies both sides of a documented coin or banknote, estimates its date, places one pin on a world map, and receives a combined score for time and place.

The interface is deliberately spare: one specimen, one map, one decision. After the guess, the map connects the player's pin to the answer and a compact result sheet explains the object, target method, source, and image license.

## How it works

- One UTC-dated puzzle is shared by every player each day.
- Practice mode draws a different random specimen from the same checked-in corpus.
- Every specimen can be flipped between its matched obverse and reverse photographs.
- A compact year slider records the player's date estimate before the round is locked.
- Pins can be moved or dragged until the player selects **Lock pin**.
- Distance uses the haversine formula. A record's reviewed tolerance radius is subtracted before scoring. Geography contributes 4,000 points and date accuracy contributes 1,000, preserving a 5,000-point total.
- Each target is a documented `mint_city` or `printing_facility` linked from the source record.
- Results show the object date, production method, tolerance, ANS record, and image rights.
- Daily results, averages, and streaks are stored in browser `localStorage`. There are no accounts, cookies, analytics, or backend.
- Share text includes only the edition, score, distance, and distance band. It never reveals the answer.
- Light, edge-connected studio backgrounds are removed in the browser after an ANS photograph loads. The original image URL is still used and no processed image library is checked into the repository.

## Collection explorer

`admin.html` is a static collection explorer for inspecting the full playable corpus. MiniSearch provides fuzzy, prefix-aware full-text search across object metadata. TanStack Virtual mounts only the rows near the viewport, while the photographs inside those rows use native lazy loading.

## Data pipeline

The shipped game does not call MANTIS at runtime. `npm run data:build` performs a build-time ingestion:

1. Query the American Numismatic Society MANTIS Atom feed for records with images, dates, production places, and an eligible object type.
2. Fetch complete NUDS/XML object records in batches.
3. Require an approved record, a documented date no later than 1925, a denomination, matched obverse and reverse images, descriptions for both sides, and an explicit Public Domain Mark.
4. Reject records marked as forgeries, counterfeits, replicas, or modern copies.
5. Resolve controlled production-place identifiers through Nomisma, GeoNames, or Wikidata and reject unresolved locations.
6. Select a geographically varied corpus while avoiding duplicate issues and repeated coin mints.
7. Write `src/money.generated.js` and an auditable rejection summary in `data/quality-report.json`.

The current corpus contains 50 or more checked objects across at least 40 production locations, including coins and paper money. The browser uses committed metadata, so gameplay does not depend on live API availability. Images remain hosted by the ANS.

To refresh the corpus:

```bash
npm run data:build
```

The ingestion call requires network access. The hard admission rules are intentional: MANTIS is much larger than the shipped game, and incomplete records are expected to be rejected.

## Run locally

ORIGIN is a static ES-module application with no build step:

```bash
npm run dev
```

Then open [http://localhost:4174](http://localhost:4174).

## Test

```bash
npm test
npm run check
```

The automated tests cover distance and scoring invariants. The game has also been tested at desktop and 390-by-844 mobile viewports through the full home, guess, reveal, and next-round flow.

## Accessibility

- Semantic buttons, dialogs, headings, labels, and live regions
- 44px minimum interactive targets
- Keyboard-operable dialogs and controls
- Keyboard-operable obverse and reverse flip control
- Repositionable pin before confirmation
- Strong focus indicators and color-independent answer text
- System light/dark appearance
- `prefers-reduced-motion` support
- Contextual loading and network error states

## Design reference

The generated composition study that preceded implementation is preserved at `docs/design-references/ui-direction.png`. It established the split specimen/map layout, restrained cobalt accent, and in-place result reveal. The production interface was rebuilt as HTML, CSS, Leaflet, and sourced ANS object photography.

## Important URLs and services

- Production site: https://jens246.github.io/origin-money-game/
- Collection explorer: https://jens246.github.io/origin-money-game/admin.html
- Source repository: https://github.com/JenS246/origin-money-game
- Map interaction: [Leaflet](https://leafletjs.com/)
- Map tiles/data: [OpenStreetMap](https://www.openstreetmap.org/copyright)
- Object records and media: [American Numismatic Society MANTIS](https://numismatics.org/search/)
- Mint identifiers and coordinates: [Nomisma](https://nomisma.org/)
- Hosting: GitHub Pages
- Backend services: none

## Licensing

Application code is MIT licensed. MANTIS metadata is available under ODbL. The importer admits only object images explicitly marked as public domain in their NUDS record. Every result links to the stable ANS object record and credits the American Numismatic Society.
