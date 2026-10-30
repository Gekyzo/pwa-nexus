import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { IDEAS_REPO, IDEAS_PATH, PARTS, MAX_NAME, cleanName, ideasOf, ideaText, addIdea, renameIdea, deleteIdea, restoreIdea } from '#ideas';

const FIXTURE = readFileSync(new URL('./fixtures/ideas/IDEAS.md', import.meta.url), 'utf8');
const EMPTY_IDEA = '## Car log\n\n### Features\n\n### Specs\n\n### Notes\n';

test('the ideas live in IDEAS.md of pwa-nexus, with three English parts', () => {
  assert.equal(IDEAS_REPO, 'Gekyzo/pwa-nexus');
  assert.equal(IDEAS_PATH, 'IDEAS.md');
  assert.deepEqual(PARTS, ['Features', 'Specs', 'Notes']);
  assert.equal(MAX_NAME, 80);
});

test('addIdea on an empty file writes the H1 and the three parts', () => {
  assert.equal(addIdea('', 'Car log').text, `# Ideas\n\n${EMPTY_IDEA}`);
  assert.equal(addIdea(null, 'Car log').text, `# Ideas\n\n${EMPTY_IDEA}`);
});

test('addIdea appends after the last idea with one blank line', () => {
  const md = '# Ideas\n\n## One\n\n- **A.**\n';
  assert.equal(addIdea(md, 'Two').text, '# Ideas\n\n## One\n\n- **A.**\n\n## Two\n\n### Features\n\n### Specs\n\n### Notes\n');
  assert.equal(addIdea('# Ideas\n\n## One', 'Two').text, '# Ideas\n\n## One\n\n## Two\n\n### Features\n\n### Specs\n\n### Notes');
  assert.equal(addIdea('# Ideas\n\n## One\n\n\n', 'Two').text, '# Ideas\n\n## One\n\n## Two\n\n### Features\n\n### Specs\n\n### Notes\n');
});

test('addIdea keeps the line ending', () => {
  const text = addIdea('# Ideas\r\n\r\n## One\r\n', 'Two').text;
  assert.equal(text, '# Ideas\r\n\r\n## One\r\n\r\n## Two\r\n\r\n### Features\r\n\r\n### Specs\r\n\r\n### Notes\r\n');
});

test('addIdea refuses a taken name in any case', () => {
  const result = addIdea(FIXTURE, 'car LOG');
  assert.deepEqual(result.error, { key: 'error.ideaTaken' });
  assert.equal(result.text, FIXTURE);
});

test('addIdea refuses a name that cleanName refuses', () => {
  assert.deepEqual(addIdea(FIXTURE, ' ').error, { key: 'error.nameRequired' });
  assert.equal(addIdea(FIXTURE, ' ').text, FIXTURE);
});

test('cleanName trims and keeps the text', () => {
  assert.deepEqual(cleanName('  Car  log.  '), { name: 'Car log.' });
  assert.deepEqual(cleanName('#1 idea'), { name: '#1 idea' });
  assert.deepEqual(cleanName(''), { error: { key: 'error.nameRequired' } });
  assert.deepEqual(cleanName(undefined), { error: { key: 'error.nameRequired' } });
  assert.deepEqual(cleanName('x'.repeat(81)), { error: { key: 'error.nameTooLong', params: { max: 80 } } });
  assert.deepEqual(cleanName('x'.repeat(80)), { name: 'x'.repeat(80) });
  assert.deepEqual(cleanName('a/b'), { error: { key: 'error.nameSlash' } });
});

test('renameIdea rewrites the heading line only', () => {
  const { text, error } = renameIdea(FIXTURE, 'Plant watering log', 'Plants');
  assert.equal(error, undefined);
  assert.equal(text, FIXTURE.replace('## Plant watering log\n', '## Plants\n'));
});

test('renameIdea to the same name is a no-op', () => {
  assert.deepEqual(renameIdea(FIXTURE, 'Car log', 'Car log'), { text: FIXTURE });
});

test('renameIdea changing only the case is allowed', () => {
  assert.equal(renameIdea(FIXTURE, 'Car log', 'Car Log').text, FIXTURE.replace('## Car log', '## Car Log'));
});

test('renameIdea to the name of another idea is ideaTaken, and a missing idea is ideaMissing', () => {
  assert.deepEqual(renameIdea(FIXTURE, 'Car log', 'plant watering LOG'), { text: FIXTURE, error: { key: 'error.ideaTaken' } });
  assert.deepEqual(renameIdea(FIXTURE, 'Boat', 'Ship'), { text: FIXTURE, error: { key: 'error.ideaMissing' } });
  assert.deepEqual(renameIdea(FIXTURE, 'Car log', ''), { text: FIXTURE, error: { key: 'error.nameRequired' } });
});

test('deleteIdea removes the idea and its parts and leaves no double blank line', () => {
  const md = '# Ideas\n\n## A\n\n### Features\n\n- **x.**\n\n## B\n\n### Notes\n\n## C\n';
  assert.equal(deleteIdea(md, 'A').text, '# Ideas\n\n## B\n\n### Notes\n\n## C\n');
  assert.equal(deleteIdea(md, 'B').text, '# Ideas\n\n## A\n\n### Features\n\n- **x.**\n\n## C\n');
  assert.equal(deleteIdea(md, 'C').text, '# Ideas\n\n## A\n\n### Features\n\n- **x.**\n\n## B\n\n### Notes\n');
  assert.deepEqual(deleteIdea(md, 'D'), { text: md, error: { key: 'error.ideaMissing' } });
});

test('ideaText returns the lines of the idea', () => {
  assert.equal(ideaText(FIXTURE, 'Car log'), '## Car log');
  assert.ok(ideaText(FIXTURE, 'Plant watering log').startsWith('## Plant watering log\n\n### Features\n'));
  assert.ok(ideaText(FIXTURE, 'Plant watering log').endsWith('- **Greg.** Paid.'));
  assert.equal(ideaText(FIXTURE, 'Boat'), null);
  assert.equal(ideaText(null, 'Boat'), null);
});

test('restoreIdea puts back what deleteIdea removed', () => {
  const name = 'Plant watering log';
  const lines = ideaText(FIXTURE, name);
  const restored = restoreIdea(deleteIdea(FIXTURE, name).text, name, lines).text;
  assert.equal(ideaText(restored, name), lines);
  assert.deepEqual(
    ideasOf(restored).map((idea) => idea.name),
    ['Car log', name],
  );
  assert.deepEqual(restoreIdea(FIXTURE, 'car log', '## car log').error, { key: 'error.ideaTaken' });
  assert.equal(restoreIdea(null, 'Car log', '## Car log').text, '# Ideas\n\n## Car log\n');
});

test('ideasOf counts the fixed parts only', () => {
  const [plant, car] = ideasOf(FIXTURE);
  assert.equal(plant.name, 'Plant watering log');
  assert.deepEqual(plant.counts, { features: 2, specs: 1, notes: 1 });
  assert.deepEqual(
    plant.parts.map((part) => part.title),
    ['Features', 'Specs', 'Notes', 'Prior art'],
  );
  assert.equal(plant.parts[3].items[0].title, 'Greg');
  assert.equal(plant.total, 5);
  assert.deepEqual(car, { name: 'Car log', parts: [], total: 0, counts: { features: 0, specs: 0, notes: 0 } });
  assert.equal(ideasOf(FIXTURE).length, 2);
  assert.deepEqual(ideasOf(null), []);
  assert.deepEqual(ideasOf(''), []);
});

test('ideasOf marks a later H2 of the same name as duplicate', () => {
  const ideas = ideasOf('# Ideas\n\n## Car\n\n## car\n');
  assert.equal(ideas[0].duplicate, undefined);
  assert.equal(ideas[1].duplicate, true);
});

test('the fixture comes back byte for byte', () => {
  assert.equal(deleteIdea(addIdea(FIXTURE, 'Boat').text, 'Boat').text, FIXTURE);
  assert.equal(renameIdea(FIXTURE, 'Plant watering log', 'Plant watering log').text, FIXTURE);
});
