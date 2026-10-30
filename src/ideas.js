import { sectionsOf, treeOf } from '#roadmap';

// The ideas of new apps, in IDEAS.md of one repository. An idea is an H2 section, its parts the H3
// sections under it, so the model of a ROADMAP.md reads it unchanged (IDEA-1, IDEA-2).
export const IDEAS_REPO = 'Gekyzo/pwa-nexus';
export const IDEAS_PATH = 'IDEAS.md';
// The parts of a new idea. The file is in English whatever the language of the screen.
export const PARTS = ['Features', 'Specs', 'Notes'];
export const MAX_NAME = 80;

const TOP = /^(#{1,2})\s+(.*?)\s*$/;

const blank = (line) => line.trim() === '';
const sameName = (a, b) => a.toLowerCase() === b.toLowerCase();

export const cleanName = (name) => {
  const clean = String(name ?? '').replace(/\s+/g, ' ').trim();
  if (!clean) return { error: { key: 'error.nameRequired' } };
  if (clean.length > MAX_NAME) return { error: { key: 'error.nameTooLong', params: { max: MAX_NAME } } };
  // A slash would break the path of a part, `<idea> / <part>` (ROAD-2).
  if (clean.includes('/')) return { error: { key: 'error.nameSlash' } };
  return { name: clean };
};

// The lines of the file and the range of each idea: its H2 up to the next H1 or H2.
const model = (md) => {
  const text = md ?? '';
  const eol = text.includes('\r\n') ? '\r\n' : '\n';
  const lines = text === '' ? [] : text.split(eol);
  const tops = lines.flatMap((line, index) => {
    const match = line.match(TOP);
    return match ? [{ level: match[1].length, name: match[2].replace(/\s+#+$/, ''), start: index }] : [];
  });
  const ideas = tops
    .map((top, index) => ({ ...top, end: tops[index + 1]?.start ?? lines.length }))
    .filter((top) => top.level === 2);
  return { text, eol, lines, ideas };
};

const find = ({ ideas }, name) => ideas.find((idea) => idea.name === name) ?? null;
const taken = ({ ideas }, name, except = null) => ideas.some((idea) => idea !== except && sameName(idea.name, name));
const fail = (md, key) => ({ text: md, error: { key } });

// The lines of the file with no blank line at the end, and whether the file ended with a newline.
const trimmed = ({ text, eol, lines }) => {
  const kept = [...lines];
  while (kept.length && blank(kept.at(-1))) kept.pop();
  return { kept, final: text === '' || text.endsWith(eol) };
};

// Puts `block` at the end of the file, one blank line after the last text. An empty file gets the
// H1 first.
const append = (m, block) => {
  const { kept, final } = trimmed(m);
  const head = kept.length ? kept : ['# Ideas'];
  return [...head, '', ...block, ...(final ? [''] : [])].join(m.eol);
};

export const addIdea = (md, input) => {
  const m = model(md);
  const { name, error } = cleanName(input);
  if (error) return { text: md, error };
  if (taken(m, name)) return fail(md, 'error.ideaTaken');
  return { text: append(m, [`## ${name}`, ...PARTS.flatMap((part) => ['', `### ${part}`])]) };
};

export const renameIdea = (md, from, input) => {
  const m = model(md);
  const idea = find(m, from);
  if (!idea) return fail(md, 'error.ideaMissing');
  const { name, error } = cleanName(input);
  if (error) return { text: md, error };
  if (name === idea.name) return { text: md };
  if (taken(m, name, idea)) return fail(md, 'error.ideaTaken');
  const lines = [...m.lines];
  lines[idea.start] = `## ${name}`;
  return { text: lines.join(m.eol) };
};

export const deleteIdea = (md, name) => {
  const m = model(md);
  const idea = find(m, name);
  if (!idea) return fail(md, 'error.ideaMissing');
  const lines = [...m.lines];
  lines.splice(idea.start, idea.end - idea.start);
  // The blank lines of the idea went with it. At the end of the file, the blank line before it
  // goes too, and the final newline stays as it was.
  if (idea.end < m.lines.length) return { text: lines.join(m.eol) };
  return { text: trimmed({ ...m, lines }).kept.concat(m.text.endsWith(m.eol) ? [''] : []).join(m.eol) };
};

// The lines of an idea as they are in the file, with no blank line at its end: the base of a
// rename or a delete (SYNC-6), and what Undo of a delete puts back.
export const ideaText = (md, name) => {
  const m = model(md);
  const idea = find(m, name);
  if (!idea) return null;
  const lines = m.lines.slice(idea.start, idea.end);
  while (lines.length && blank(lines.at(-1))) lines.pop();
  return lines.join(m.eol);
};

export const restoreIdea = (md, name, text) => {
  const m = model(md);
  if (taken(m, name)) return fail(md, 'error.ideaTaken');
  return { text: append(m, String(text).split(/\r?\n/)) };
};

const COUNTED = { features: 'Features', specs: 'Specs', notes: 'Notes' };

// The ideas in file order, each with its parts, its item count and the counts of the three fixed
// parts. An H3 before the first H2 is no part of an idea. A later H2 with the name of an earlier
// one is `duplicate`: an action reaches only the first (IDEA-5).
export const ideasOf = (md) =>
  treeOf(sectionsOf(md ?? ''))
    .filter((node) => node.level === 2)
    .map((node, index, all) => {
      const counts = Object.fromEntries(
        Object.entries(COUNTED).map(([key, title]) => [key, node.children.find((part) => part.title === title)?.items.length ?? 0]),
      );
      const idea = { name: node.title, parts: node.children, total: node.total, counts };
      return all.slice(0, index).some((other) => sameName(other.title, node.title)) ? { ...idea, duplicate: true } : idea;
    });
