import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { CATALOGS } from '#i18n';
import { PAGES } from '#onboarding';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const body = html.slice(html.indexOf('<body'), html.indexOf('<script type="importmap">'));

const textKeys = [...body.matchAll(/data-i18n="([^"]+)"/g)].map(([, key]) => key);
const attrKeys = [...body.matchAll(/data-i18n-attr="([^"]+)"/g)].flatMap(([, pairs]) =>
  pairs.split(',').map((pair) => pair.split(':')[1]));

test('the page has translated text and translated attributes', () => {
  assert.ok(textKeys.length > 0);
  assert.ok(attrKeys.length > 0);
});

test('each key of the page is in the Spanish catalog', () => {
  for (const key of [...textKeys, ...attrKeys]) assert.ok(Object.hasOwn(CATALOGS.es, key), key);
});

test('an element with a text key is empty in the markup', () => {
  for (const [, key, text] of body.matchAll(/data-i18n="([^"]+)"[^>]*>([^<]*)</g)) assert.equal(text.trim(), '', key);
});

test('the markup has no text of its own', () => {
  const visible = body
    .replace(/<svg[\s\S]*?<\/svg>/g, '')
    .replace(/<span class="chevron"[^>]*>[^<]*<\/span>/g, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/[+\s]/g, '');
  assert.equal(visible, '');
  assert.doesNotMatch(body, /\s(aria-label|placeholder|title)="/);
});

test('the walkthrough has one drawing for each page, in the order of the pages', () => {
  const [layer = ''] = body.match(/<div id="onboarding"[\s\S]*?<input id="import-file"/) ?? [];
  const drawings = [...layer.matchAll(/<svg data-page="([^"]+)"/g)].map(([, page]) => page);
  assert.deepEqual(drawings, PAGES);
});

test('the walkthrough shows the app icon first, out of the page that changes, with no text', () => {
  const [, layer = ''] = body.match(/<div id="onboarding"[^>]*>\s*([\s\S]*?)<div id="onboarding-page"/) ?? [];
  assert.match(layer, /^<img class="onboarding-logo" src="\.\/icons\/logo\.png" alt="">\s*$/);
});

test('the walkthrough has Saltar and the next button in one bar at the bottom, Saltar first', () => {
  const [bar = ''] = body.match(/<div class="onboarding-actions">[\s\S]*?<\/div>/) ?? [];
  const buttons = [...bar.matchAll(/<button id="([^"]+)"/g)].map(([, id]) => id);
  assert.deepEqual(buttons, ['onboarding-skip', 'onboarding-next']);
  assert.doesNotMatch(body, /onboarding-top/);
});

test('the item sheet has a veil, a dialog with a head, a section picker, text fields with their maximum lengths and a foot (UI-3, UI-7)', () => {
  const [layer = ''] = body.match(/<div id="item-sheet" class="sheet-layer"[\s\S]*?<\/form>\s*<\/div>/) ?? [];
  assert.match(layer, /<div id="item-veil" class="sheet-veil">/);
  assert.match(layer, /<form id="item-form" class="sheet" role="dialog"/);
  assert.match(layer, /<select id="item-section" class="select"[^>]*required/);
  assert.match(layer, /<input id="item-title"[^>]*maxlength="80"[^>]*required/);
  assert.match(layer, /<textarea id="item-body"[^>]*maxlength="500"/);
  assert.match(layer, /<header class="sheet-head"><h2 id="item-sheet-title" class="sheet-title main"><\/h2><button id="item-close" class="button icon" type="button"/);
  assert.match(layer, /<footer class="sheet-foot">\s*<button id="item-delete" class="button outline danger"[\s\S]*<button class="button primary" type="submit"/);
});

test('the item sheet has the other projects to add a new item to, hidden until it opens (UI-3)', () => {
  const [layer = ''] = body.match(/<div id="item-sheet" class="sheet-layer"[\s\S]*?<\/form>\s*<\/div>/) ?? [];
  assert.match(layer, /<textarea id="item-body"[\s\S]*<div id="item-also" hidden>\s*<h3 class="sheet-title part" data-i18n="item.alsoTo"><\/h3>\s*<div id="item-also-list" class="cluster" role="group" data-i18n-attr="aria-label:item.alsoTo"><\/div>\s*<\/div>[\s\S]*<button id="item-delete"/);
});
