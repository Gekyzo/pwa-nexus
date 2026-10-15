import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { MAX_TITLE, MAX_BODY, parse, sectionsOf, cleanItem, itemOf, addItem, editItem, moveItem, deleteItem, treeOf, outlineOf } from '#roadmap';

const SAMPLE = [
  '# Roadmap',
  '',
  'Intro line.',
  '',
  '## Planned',
  '',
  '- **Responsive.** Fit wide screens.',
  '- **Sections.** Group by store',
  '  and by aisle.',
  '- plain bullet',
  '',
  '### Deferred',
  '',
  'Each item names its need.',
  '',
  '- **Database.** When the list grows.',
  '',
  '## Pro',
  '',
  'Paid ideas.',
  '',
  '### Cloud',
  '',
  '## Empty',
  '',
].join('\n');

const dir = new URL('./fixtures/roadmaps/', import.meta.url);
const fixtures = readdirSync(dir).map((file) => [file, readFileSync(new URL(file, dir), 'utf8')]);

test('parse finds the H2 and H3 sections with their paths, and skips the H1 (ROAD-1, ROAD-2)', () => {
  assert.deepEqual(parse(SAMPLE).sections.map(({ path, level }) => [path, level]), [
    ['Planned', 2],
    ['Planned / Deferred', 3],
    ['Pro', 2],
    ['Pro / Cloud', 3],
    ['Empty', 2],
  ]);
});

test('parse reads bold titles, continuation lines and plain bullets (ROAD-3)', () => {
  assert.deepEqual(sectionsOf(SAMPLE)[0].items, [
    { title: 'Responsive', body: 'Fit wide screens.' },
    { title: 'Sections', body: 'Group by store and by aisle.' },
    { title: 'plain bullet', body: '' },
  ]);
});

test('intro prose is not an item, and an H4 is not a section (ROAD-3)', () => {
  assert.deepEqual(sectionsOf(SAMPLE)[1].items.map((item) => item.title), ['Database']);
  assert.deepEqual(sectionsOf(SAMPLE)[2].items, []);
  assert.deepEqual(sectionsOf('## A\n\n#### Note\n\n- x\n').map((section) => section.path), ['A']);
});

test('treeOf nests each H3 under its H2 and totals the items of the H2 (ROAD-10)', () => {
  const tree = treeOf(sectionsOf(SAMPLE));
  assert.deepEqual(
    tree.map(({ path, total, children }) => [path, total, children.map((child) => [child.path, child.total])]),
    [
      ['Planned', 4, [['Planned / Deferred', 1]]],
      ['Pro', 0, [['Pro / Cloud', 0]]],
      ['Empty', 0, []],
    ],
  );
});

test('treeOf keeps an H3 before the first H2 at the top, with no children (ROAD-10)', () => {
  const tree = treeOf(sectionsOf('### Loose\n\n- **One.**\n\n## Main\n\n### Sub\n'));
  assert.deepEqual(tree.map(({ path, total, children }) => [path, total, children.length]), [
    ['Loose', 1, 0],
    ['Main', 0, 1],
  ]);
});

test('outlineOf lists the sections in tree order with their depth, an H3 by its title (ROAD-10)', () => {
  assert.deepEqual(outlineOf(sectionsOf(SAMPLE)), [
    { path: 'Planned', title: 'Planned', depth: 0 },
    { path: 'Planned / Deferred', title: 'Deferred', depth: 1 },
    { path: 'Pro', title: 'Pro', depth: 0 },
    { path: 'Pro / Cloud', title: 'Cloud', depth: 1 },
    { path: 'Empty', title: 'Empty', depth: 0 },
  ]);
  assert.deepEqual(outlineOf(sectionsOf('### Loose\n')), [{ path: 'Loose', title: 'Loose', depth: 0 }]);
});

test('a bold title written as **Title**. reads the same', () => {
  assert.deepEqual(sectionsOf('## A\n\n- **Title**. body\n')[0].items, [{ title: 'Title', body: 'body' }]);
});

test('cleanItem trims, drops asterisks and final periods, and makes the body one line (ROAD-7)', () => {
  assert.deepEqual(cleanItem({ title: '  **Big**   idea...  ', body: ' line one\n  line two ' }), {
    item: { title: 'Big idea', body: 'line one line two' },
  });
});

test('addItem appends after the last item of the section (ROAD-5)', () => {
  const { text, error } = addItem(SAMPLE, 'Planned', { title: 'New', body: 'Idea' });
  assert.equal(error, undefined);
  assert.equal(text, SAMPLE.replace('- plain bullet\n', '- plain bullet\n- **New.** Idea\n'));
});

test('addItem to a section with no item puts it after the intro, after a blank line (ROAD-5)', () => {
  assert.equal(addItem(SAMPLE, 'Pro', { title: 'X', body: '' }).text, SAMPLE.replace('Paid ideas.\n', 'Paid ideas.\n\n- **X.**\n'));
  assert.equal(addItem(SAMPLE, 'Empty', { title: 'X', body: 'y' }).text, `${SAMPLE}\n- **X.** y\n`);
});

test('addItem keeps CRLF line ends and a missing final newline (ROAD-9)', () => {
  assert.equal(addItem('## A\r\n\r\n- **One.** x\r\n', 'A', { title: 'Two', body: '' }).text, '## A\r\n\r\n- **One.** x\r\n- **Two.**\r\n');
  assert.equal(addItem('## A', 'A', { title: 'Two', body: '' }).text, '## A\n\n- **Two.**');
});

test('a blank, long or taken title, or a long body, is an error and the text is unchanged (ROAD-7)', () => {
  assert.deepEqual(addItem(SAMPLE, 'Planned', { title: ' . ', body: '' }), { text: SAMPLE, error: { key: 'error.titleRequired' } });
  assert.deepEqual(addItem(SAMPLE, 'Planned', { title: 'a'.repeat(MAX_TITLE + 1) }), {
    text: SAMPLE,
    error: { key: 'error.titleTooLong', params: { max: MAX_TITLE } },
  });
  assert.deepEqual(addItem(SAMPLE, 'Planned', { title: 'RESPONSIVE' }), { text: SAMPLE, error: { key: 'error.titleTaken' } });
  assert.deepEqual(addItem(SAMPLE, 'Planned', { title: 'x', body: 'b'.repeat(MAX_BODY + 1) }), {
    text: SAMPLE,
    error: { key: 'error.bodyTooLong', params: { max: MAX_BODY } },
  });
});

test('a missing section or item is an error and the text is unchanged (ROAD-8)', () => {
  assert.deepEqual(addItem(SAMPLE, 'Nope', { title: 'x' }), { text: SAMPLE, error: { key: 'error.sectionMissing' } });
  assert.deepEqual(editItem(SAMPLE, { path: 'Planned', title: 'Nope' }, { title: 'x' }), { text: SAMPLE, error: { key: 'error.itemMissing' } });
  assert.deepEqual(deleteItem(SAMPLE, { path: 'Nope', title: 'Responsive' }), { text: SAMPLE, error: { key: 'error.sectionMissing' } });
  assert.deepEqual(moveItem(SAMPLE, { path: 'Planned', title: 'Responsive' }, 'Nope'), { text: SAMPLE, error: { key: 'error.sectionMissing' } });
  assert.deepEqual(moveItem(SAMPLE, { path: 'Planned', title: 'Nope' }, 'Pro'), { text: SAMPLE, error: { key: 'error.itemMissing' } });
});

test('editItem rewrites only the lines of its item, continuation lines included (ROAD-6)', () => {
  const { text } = editItem(SAMPLE, { path: 'Planned', title: 'Sections' }, { title: 'Aisles', body: 'By aisle.' });
  assert.equal(text, SAMPLE.replace('- **Sections.** Group by store\n  and by aisle.\n', '- **Aisles.** By aisle.\n'));
});

test('editItem with the same values changes nothing, even on a plain bullet', () => {
  assert.equal(editItem(SAMPLE, { path: 'Planned', title: 'plain bullet' }, { title: 'plain bullet', body: '' }).text, SAMPLE);
});

test('editItem to the title of another item of the section is an error (ROAD-7)', () => {
  assert.equal(editItem(SAMPLE, { path: 'Planned', title: 'Sections' }, { title: 'responsive' }).error.key, 'error.titleTaken');
});

test('deleteItem removes the lines of its item and leaves no double blank line (ROAD-6)', () => {
  assert.equal(
    deleteItem(SAMPLE, { path: 'Planned', title: 'Sections' }).text,
    SAMPLE.replace('- **Sections.** Group by store\n  and by aisle.\n', ''),
  );
  assert.equal(
    deleteItem(SAMPLE, { path: 'Planned / Deferred', title: 'Database' }).text,
    SAMPLE.replace('Each item names its need.\n\n- **Database.** When the list grows.\n', 'Each item names its need.\n'),
  );
});

test('moveItem takes the item to the end of the target section (ROAD-6)', () => {
  const { text } = moveItem(SAMPLE, { path: 'Planned', title: 'Responsive' }, 'Planned / Deferred');
  assert.deepEqual(sectionsOf(text)[0].items.map((item) => item.title), ['Sections', 'plain bullet']);
  assert.deepEqual(sectionsOf(text)[1].items, [
    { title: 'Database', body: 'When the list grows.' },
    { title: 'Responsive', body: 'Fit wide screens.' },
  ]);
});

test('moveItem to its own section changes nothing (ROAD-7)', () => {
  assert.deepEqual(moveItem(SAMPLE, { path: 'Planned', title: 'Responsive' }, 'Planned'), { text: SAMPLE });
});

test('moveItem into a section that has the title already is an error', () => {
  const md = '## A\n\n- **X.** a\n\n## B\n\n- **x.** b\n';
  assert.deepEqual(moveItem(md, { path: 'A', title: 'X' }, 'B'), { text: md, error: { key: 'error.titleTaken' } });
});

test('accents and emoji survive an edit', () => {
  const md = '## Ideas\n\n- **Café.** Añadir 🍰\n';
  assert.equal(editItem(md, { path: 'Ideas', title: 'Café' }, { title: 'Té', body: 'Más ñ 🍰' }).text, '## Ideas\n\n- **Té.** Más ñ 🍰\n');
});

for (const [file, md] of fixtures) {
  test(`${file}: an add then a delete in each section gives the file back (ROAD-9)`, () => {
    const sections = sectionsOf(md);
    assert.ok(sections.length > 0);
    for (const { path } of sections) {
      const added = addItem(md, path, { title: 'Probe item', body: 'x' });
      assert.equal(added.error, undefined, path);
      assert.equal(deleteItem(added.text, { path, title: 'Probe item' }).text, md, path);
    }
  });

  test(`${file}: an edit with the same values changes no byte (ROAD-9)`, () => {
    for (const { path, items } of sectionsOf(md)) {
      for (const item of items) assert.equal(editItem(md, { path, title: item.title }, item).text, md, `${path} ${item.title}`);
    }
  });
}

const NESTED = '## A\n\n- **Parent.** body\n  - child one\n  - child two\n- **Next.** x\n\n## B\n';

test('an edit that keeps the body rewrites only the first line, so sub-bullets stay (ROAD-6)', () => {
  const [parent] = sectionsOf(NESTED)[0].items;
  assert.equal(parent.body, 'body - child one - child two');
  const { text } = editItem(NESTED, { path: 'A', title: 'Parent' }, { title: 'Mother', body: parent.body });
  assert.equal(text, NESTED.replace('- **Parent.** body\n', '- **Mother.** body\n'));
});

test('an edit that keeps a long hand-written body is not refused for its length', () => {
  const md = `## A\n\n- **Long.** ${'w '.repeat(400)}\n`;
  const [item] = sectionsOf(md)[0].items;
  const { text, error } = editItem(md, { path: 'A', title: 'Long' }, { title: 'Longer', body: item.body });
  assert.equal(error, undefined);
  assert.equal(text, md.replace('- **Long.**', '- **Longer.**'));
});

test('a move takes the lines of the item as they are, sub-bullets included (ROAD-6)', () => {
  const { text } = moveItem(NESTED, { path: 'A', title: 'Parent' }, 'B');
  assert.equal(text, '## A\n\n- **Next.** x\n\n## B\n\n- **Parent.** body\n  - child one\n  - child two\n');
});

test('itemOf gives the title and the body of an item, or null', () => {
  assert.deepEqual(itemOf(NESTED, { path: 'A', title: 'Next' }), { title: 'Next', body: 'x' });
  assert.equal(itemOf(NESTED, { path: 'A', title: 'Nope' }), null);
  assert.equal(itemOf(NESTED, { path: 'Nope', title: 'Next' }), null);
});
