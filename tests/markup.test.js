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

test('the What\'s new sheet has a veil, a dialog with its title and Close, and a body (VER-22)', () => {
  const [layer = ''] = body.match(/<div id="whatsnew-sheet" class="sheet-layer"[\s\S]*?<\/section>\s*<\/div>/) ?? [];
  assert.match(layer, /<div id="whatsnew-veil" class="sheet-veil">/);
  assert.match(layer, /<section id="whatsnew" class="sheet" role="dialog" aria-modal="true" aria-labelledby="whatsnew-title">/);
  assert.match(layer, /<h2 id="whatsnew-title" class="sheet-title main" data-i18n="whatsNew.title"><\/h2><button id="whatsnew-close" class="button tonal" type="button" data-i18n="whatsNew.close"><\/button>/);
  assert.match(layer, /<div id="whatsnew-body" class="sheet-body whatsnew-body"><\/div>/);
});

test('Help in Settings has the What\'s new row after the introduction, hidden until there are notes (VER-23)', () => {
  assert.match(body, /<button id="show-onboarding"[^\n]*<\/button>\s*<button id="show-whatsnew" class="settings-row" type="button" hidden><span class="settings-row-label" data-i18n="settings.whatsNew"><\/span><span class="chevron" aria-hidden="true">›<\/span><\/button>/);
});

test('Backup ends with Delete all data, a danger row with no chevron (SET-2)', () => {
  assert.match(body, /<button id="import" class="settings-row" type="button">.*?<\/button>\s*<button id="reset" class="settings-row danger" type="button"><span class="settings-row-label" data-i18n="settings.reset"><\/span><\/button>\s*<\/div>/);
});

test('the ideas pane, its nav item and its module switch exist (IDEA-8, NAV-1, MOD-1)', () => {
  assert.match(body, /<section id="ideas" class="pane" hidden>[\s\S]*<ul id="idea-list" class="item-list"><\/ul>[\s\S]*<div id="ideas-empty" class="empty-state" hidden>/);
  assert.match(body, /<button class="nav-item" type="button" data-view="projects">[\s\S]*<button class="nav-item" type="button" data-view="ideas">\s*<svg class="icon" aria-hidden="true"><use href="icons.svg#bulb"\/><\/svg>\s*<span data-i18n="nav.ideas"><\/span>[\s\S]*data-view="settings"/);
  assert.match(body, /data-module="projects"><\/label>\s*<label class="switch"><span data-i18n="nav.ideas"><\/span><input class="switch-input" type="checkbox" role="switch" data-module="ideas"><\/label>/);
});

test('the name sheet has a veil, a dialog with a head, one name field of at most 80 characters and Save (IDEA-9)', () => {
  const [layer = ''] = body.match(/<div id="name-sheet" class="sheet-layer"[\s\S]*?<\/form>\s*<\/div>/) ?? [];
  assert.match(layer, /<div id="name-veil" class="sheet-veil">/);
  assert.match(layer, /<form id="name-form" class="sheet" role="dialog" aria-modal="true" aria-labelledby="name-sheet-title"/);
  assert.match(layer, /<header class="sheet-head"><h2 id="name-sheet-title" class="sheet-title main"><\/h2><button id="name-close" class="button icon" type="button"/);
  assert.match(layer, /<input id="name-input"[^>]*maxlength="80"[^>]*required/);
  assert.match(layer, /<footer class="sheet-foot">\s*<button class="button primary" type="submit" data-i18n="ideas.save">/);
});

test('the sprite has the icon of the Ideas item', () => {
  const sprite = readFileSync(new URL('../icons.svg', import.meta.url), 'utf8');
  assert.match(sprite, /<symbol id="bulb"/);
});

test('the idea detail has back, rename, delete, search and its lists (IDEA-11)', () => {
  const [detail = ''] = body.match(/<article id="idea" class="pane-detail">[\s\S]*?<\/article>/) ?? [];
  assert.match(body, /<section id="ideas" class="pane" hidden>[\s\S]*<article id="idea" class="pane-detail">/);
  assert.match(detail, /<button id="idea-back" class="button quiet pane-back" type="button" data-i18n="roadmap.back"><\/button>/);
  assert.match(detail, /<header id="idea-head" class="cluster idea-head" hidden>\s*<button id="idea-rename" class="button outline" type="button" data-i18n="ideas.rename"><\/button>\s*<button id="idea-delete" class="button outline danger" type="button">/);
  assert.match(detail, /<input id="idea-search" class="input raised filter" type="search"[^>]*data-i18n-attr="placeholder:roadmap.search,aria-label:roadmap.search" hidden>/);
  assert.match(detail, /<p id="idea-empty" class="empty-state inline"><\/p>\s*<div id="idea-stale"><\/div>\s*<ul id="idea-parts" class="item-list"><\/ul>/);
});
