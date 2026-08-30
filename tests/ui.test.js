import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('the specimen controls use concise, purposeful copy', async () => {
  const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
  assert.match(html, />Estimate year</);
  assert.doesNotMatch(html, /Place its mint|tap to flip/i);
});

test('the flip demonstration respects reduced motion', async () => {
  const source = await readFile(new URL('../src/game.js', import.meta.url), 'utf8');
  assert.match(source, /prefers-reduced-motion: reduce/);
  assert.match(source, /setFlipSide\(true\)/);
});
