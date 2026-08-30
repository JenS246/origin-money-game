# ORIGIN

ORIGIN is a daily geography game about real money. A player studies both sides of a documented coin or banknote, estimates its date, places one pin on a world map, and receives a combined score for time and place.

The interface is deliberately spare: one specimen, one map, one decision. After the guess, the map connects the player's pin to the answer and a compact result sheet explains the object, target method, source, and image license.

## How it works

- One UTC-dated puzzle is shared by every player each day. Its object ID comes from a checked-in generated schedule, so the answer is stable and auditable.
- Practice mode draws a different random specimen from the same checked-in corpus.
- Every specimen can be flipped between its matched obverse and reverse photographs.
- A compact year slider records the player's date estimate before the round is locked.
- Pins can be moved or dragged until the player selects **Lock pin**.
- Distance uses the haversine formula. A record's reviewed tolerance radius is subtracted before scoring. Geography contributes 4,000 points and date accuracy contributes 1,000, preserving a 5,000-point total.
- Each target is a documented mint, printing facility, or production area linked from the source record.
- Results show the object date, production method, tolerance, museum record, and image rights.
- Daily results, averages, and streaks are stored in browser `localStorage`. There are no accounts, cookies, analytics, or backend.
- Share text includes only the edition, score, distance, and distance band. It never reveals the answer.
- Light, edge-connected studio backgrounds are removed in the browser after a photograph loads. The original image URL is still used and no processed image library is checked into the repository.

## Collection explorer

`admin.html` is a static collection explorer for inspecting the full playable corpus. MiniSearch provides fuzzy, prefix-aware full-text search across object metadata. TanStack Virtual mounts only the rows near the viewport, while the photographs inside those rows use native lazy loading.

## Data pipeline

The shipped game does not call collection APIs at runtime. `npm run data:build` performs three build-time ingestions:

1. Query the American Numismatic Society MANTIS Atom feed for records with images, dates, production places, and an eligible object type.
2. Fetch complete NUDS/XML object records in batches.
3. Require an approved record, a documented date no later than 1925, a denomination, matched obverse and reverse images, descriptions for both sides, and an explicit Public Domain Mark.
4. Reject records marked as forgeries, counterfeits, replicas, or modern copies.
5. Resolve controlled production-place identifiers through Nomisma, GeoNames, or Wikidata and reject unresolved locations.
6. Deduplicate exact issues and cap repeated objects from one production place so the collection remains varied without discarding historically important mints.
7. Scan all 1.3 million current National Museum of American History Open Access metadata records and retain Smithsonian currency only when it has a date, a geocoded production area more specific than a country, paired CC0 images, and descriptions for both sides.
8. Read all 1,584 digitized coins in the Bank of Canada Museum search, then retain only pre-1926 objects with paired photographs and a named mint that resolves to an audited city coordinate. Bank-note images are excluded because the Bank's image policy treats them separately.
9. Deduplicate accepted Bank of Canada Museum issues against the combined corpus.
10. Write the merged local metadata bank to `src/money.generated.js`, the deterministic hash-shuffled daily order to `src/daily.generated.js`, and auditable filter summaries under `data/`.

The current corpus contains 1,587 checked objects: 1,324 coins and 263 banknotes. MANTIS contributes 1,452 objects. The complete Smithsonian NMAH scan found only 20 currency records meeting every hard rule; eight duplicated issues already represented by MANTIS, leaving 12 additional coins. The Bank of Canada Museum pass adds 123 more coins after rejecting records without paired sides, a usable historic date, or a specific resolvable mint and removing duplicate issues.

Both daily and practice play use this committed local corpus. Practice does not query any museum on demand because runtime queries would make quality, availability, and puzzle behavior depend on external services. Photographs remain hosted by the source institutions and load only when needed. The daily schedule is a deterministic hash shuffle of object IDs, not corpus, title, date, or import order.

To refresh the corpus:

```bash
npm run data:build
```

The ingestion requires network access. The Smithsonian refresh reads 256 public metadata shards, so it is substantially larger than the other refreshes. The hard admission rules are intentional: all three collections are much larger than the shipped game, and incomplete records are expected to be rejected.

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

The generated composition study that preceded implementation is preserved at `docs/design-references/ui-direction.png`. It established the split specimen/map layout and in-place result reveal. The production interface uses a restrained archival gray-green palette, ledger-style display typography, HTML, CSS, Leaflet, and sourced museum photography.

## Important URLs and services

- Production site: https://jens246.github.io/origin-money-game/
- Collection explorer: https://jens246.github.io/origin-money-game/admin.html
- Source repository: https://github.com/JenS246/origin-money-game
- Map interaction: [Leaflet](https://leafletjs.com/)
- Map tiles/data: [OpenStreetMap](https://www.openstreetmap.org/copyright)
- Object records and media: [American Numismatic Society MANTIS](https://numismatics.org/search/)
- Object records and media: [Smithsonian Open Access](https://www.si.edu/openaccess)
- Object records and media: [Bank of Canada Museum National Currency Collection](https://www.bankofcanadamuseum.ca/collection/search)
- Mint identifiers and coordinates: [Nomisma](https://nomisma.org/)
- Hosting: GitHub Pages
- Backend services: none

## Licensing

Application code is MIT licensed. MANTIS metadata is available under ODbL, and Smithsonian Open Access metadata and admitted media are CC0. Bank of Canada Museum coin photographs are used with attribution under the Bank's website reuse terms; bank-note images from that source are excluded. Every result links to its source record, image terms, and source institution.
