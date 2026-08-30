# ORIGIN

ORIGIN is a daily geography game about real money. A player studies a coin or banknote image, places one pin on a world map, and receives a score based on the great-circle distance to the documented origin point.

The interface is deliberately spare: one specimen, one map, one decision. After the guess, the map connects the player's pin to the answer and a compact result sheet explains the object, target method, source, and image license.

## How it works

- One UTC-dated puzzle is shared by every player each day.
- Practice mode draws a different random specimen from the same checked-in corpus.
- Pins can be moved or dragged until the player selects **Lock pin**.
- Distance uses the haversine formula. Score starts at 5,000 and follows a smooth exponential distance curve.
- Each target records its meaning as `mint_city`, `issuing_city`, `issuing_authority_city`, or `representative_point`.
- Results show the target method instead of pretending every historical currency has one self-evident exact origin.
- Daily results, averages, and streaks are stored in browser `localStorage`. There are no accounts, cookies, analytics, or backend.
- Share text includes only the edition, score, distance, and distance band. It never reveals the answer.

## Data pipeline

The shipped game does not scrape Wikipedia at runtime. `npm run data:build` performs a build-time ingestion:

1. Read the hand-curated candidates in `data/seeds.json` and candidates discovered through the checked-in Wikidata SPARQL query.
2. Request the English Wikipedia PageImages and extracts APIs in batches.
3. Resolve each selected file through the Wikimedia Commons ImageInfo API.
4. Reject missing, small, non-raster, diagram, logo, montage, and known aggregate images.
5. Write `src/money.generated.js` with article links, display thumbnails, author, license, license URL, Commons file page, origin coordinates, and target method.
6. Write `data/quality-report.json` so the accepted/rejected counts are auditable.

The current corpus contains 39 verified playable records selected from 104 modern and historical candidates. The browser uses committed metadata, so gameplay does not depend on live API availability. Display images remain hosted by Wikimedia Commons and retain their per-file credit and license.

To refresh the corpus:

```bash
npm run data:build
```

The ingestion call requires network access. Do not assume that every Commons file has the same license.

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
- Repositionable pin before confirmation
- Strong focus indicators and color-independent answer text
- System light/dark appearance
- `prefers-reduced-motion` support
- Contextual loading and network error states

## Design reference

The generated composition study that preceded implementation is preserved at `docs/design-references/ui-direction.png`. It established the split specimen/map layout, restrained cobalt accent, and in-place result reveal. The production interface was then rebuilt as real HTML, CSS, Leaflet, and sourced Wikimedia images.

## Important URLs and services

- Planned production site: https://jens246.github.io/origin-money-game/
- Planned source repository: https://github.com/JenS246/origin-money-game
- Map interaction: [Leaflet](https://leafletjs.com/)
- Map tiles/data: [OpenStreetMap](https://www.openstreetmap.org/copyright)
- Currency articles: [Wikipedia](https://www.wikipedia.org/)
- Currency media: [Wikimedia Commons](https://commons.wikimedia.org/)
- Hosting: GitHub Pages
- Backend services: none

## Licensing

Application code is MIT licensed. Wikipedia extracts are available under CC BY-SA. Wikimedia Commons media has per-file licensing; ORIGIN displays the author and license with a link to the source file on every result.

