import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('collection explorer uses indexed search and row virtualization', async () => {
  const source = await readFile(new URL('../src/admin.js', import.meta.url), 'utf8');
  assert.match(source, /minisearch@7\.2\.0/);
  assert.match(source, /@tanstack\/virtual-core@3\.17\.6/);
  assert.match(source, /new MiniSearch/);
  assert.match(source, /new Virtualizer/);
  assert.match(source, /loading = 'lazy'/);
});

test('collection explorer is a separately addressable static page', async () => {
  const html = await readFile(new URL('../admin.html', import.meta.url), 'utf8');
  assert.match(html, /id="collection-search"/);
  assert.match(html, /src="src\/admin\.js"/);
});
