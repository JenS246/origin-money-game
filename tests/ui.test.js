import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('the specimen controls use concise, purposeful copy', async () => {
  const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
  const game = await readFile(new URL('../src/game.js', import.meta.url), 'utf8');
  const styles = await readFile(new URL('../styles.css', import.meta.url), 'utf8');
  const homeMap = await readFile(new URL('../assets/home-world-map.webp', import.meta.url));
  const originCoin = await readFile(new URL('../assets/origin-coin.webp', import.meta.url));
  assert.match(html, /Flip the currency/);
  assert.match(html, /Guess its origin/);
  assert.match(html, /Pin the currency to its place of origin/);
  assert.match(html, /class="wordmark-coin"/);
  assert.match(html, />RIGINS</);
  assert.match(html, /class="home-title-flip"/);
  assert.match(html, /class="home-map"/);
  assert.match(html, /class="home-coin-rain"/);
  assert.doesNotMatch(html, />Match device</);
  assert.match(html, />Estimate year</);
  assert.doesNotMatch(html, /Place its mint|tap to flip/i);
  assert.doesNotMatch(html, /flip-label|>Obverse<|>Reverse<|points|5,000/i);
  assert.doesNotMatch(`${html}\n${game}`, /Flip the coin|View today|Play today/);
  assert.match(styles, /--coin-copper:/);
  assert.match(styles, /home-world-map\.webp/);
  assert.match(styles, /background-size: auto 108%/);
  assert.match(styles, /home-coin-rain span:nth-child\(n \+ 6\) \{ display: none; \}/);
  assert.match(styles, /origin-coin\.webp/);
  assert.match(styles, /home-coin-rain span \{ animation: home-coin-drop 1\.85s/);
  assert.doesNotMatch(`${html}\n${game}`, /Today's Currency/);
  assert.match(game, /'FREE PLAY'/);
  assert.match(styles, /\.sheet-dialog \{[\s\S]*font-family: "Newsreader"/);
  assert.match(styles, /@media \(prefers-reduced-motion: no-preference\)/);
  assert.ok(homeMap.byteLength < 100_000, 'the atmospheric map should stay lightweight');
  assert.ok(originCoin.byteLength < 50_000, 'the photographic coin mark should stay lightweight');
});

test('results use a score-free origin map and branded share card', async () => {
  const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
  const source = await readFile(new URL('../src/game.js', import.meta.url), 'utf8');
  const styles = await readFile(new URL('../styles.css', import.meta.url), 'utf8');

  assert.match(html, /id="share-dialog"/);
  assert.match(html, /id="share-card"/);
  assert.match(html, /class="result-mini-map"/);
  assert.match(html, /class="share-map"/);
  assert.match(html, /id="share-specimen"/);
  assert.match(html, /id="share-route-line"/);
  assert.doesNotMatch(`${html}\n${source}`, /score-value|share-score|combinedPoints|pointsForDistance|pointsForYear/);
  assert.match(source, /shareDialog\.showModal\(\)/);
  assert.match(source, /shareSpecimen\.src/);
  assert.match(source, /mapPoint\(lastResult\.guess\)/);
  assert.match(source, /saveShareCard/);
  assert.doesNotMatch(source, /navigator\.share/);
  assert.match(styles, /@font-face/);
  assert.match(styles, /IBM Plex Sans Condensed/);
  assert.match(styles, /Newsreader/);
});

test('image loading retries the original photo and replaces a dead round', async () => {
  const source = await readFile(new URL('../src/game.js', import.meta.url), 'utf8');
  assert.match(source, /image\.removeAttribute\('crossorigin'\)/);
  assert.match(source, /replaceUnplayableRound/);
  assert.match(source, /failedImageIds/);
});

test('the flip demonstration respects reduced motion', async () => {
  const source = await readFile(new URL('../src/game.js', import.meta.url), 'utf8');
  assert.match(source, /prefers-reduced-motion: reduce/);
  assert.match(source, /setFlipSide\(true\)/);
});
