// A lossless model of a ROADMAP.md. Its sections are the H2 and H3 headings, its items the
// bullets of a section. An operation rewrites only the lines of one item, so every other byte of
// the file stays as it is (ROAD-9).
export const MAX_TITLE = 80;
export const MAX_BODY = 500;

const HEADING = /^(#{1,3})\s+(.*?)\s*$/;
const BULLET = /^[-*]\s+(.*)$/;
const CONTINUATION = /^\s+\S/;
const BOLD = /^\*\*(.+?)\*\*\s*(.*)$/;

const blank = (line) => line !== undefined && line.trim() === '';

// The format adds the period after the bold title, so a title keeps none of its own.
const cleanTitle = (text) => text.replace(/\*/g, '').replace(/\s+/g, ' ').trim().replace(/\.+$/, '').trim();

const readItem = (text) => {
  const bold = text.match(BOLD);
  if (!bold) return { title: cleanTitle(text), body: '' };
  return { title: cleanTitle(bold[1]), body: bold[2].replace(/^\.\s*/, '').trim() };
};

const lineOf = ({ title, body }) => (body ? `- **${title}.** ${body}` : `- **${title}.**`);

// The first line of an item with a new title and every other byte as it was. A plain bullet has
// no bold title to replace: its text is the title, so it is written in the format.
const retitle = (line, title) => {
  const bold = line.match(/^([-*]\s+)\*\*.+?\*\*(.*)$/);
  return bold ? `${bold[1]}**${title}.**${bold[2].replace(/^\./, '')}` : lineOf({ title, body: '' });
};

export const parse = (md) => {
  const eol = md.includes('\r\n') ? '\r\n' : '\n';
  const lines = md.split(eol);
  const sections = [];
  let parent = null;
  let section = null;
  let item = null;
  lines.forEach((line, index) => {
    const heading = line.match(HEADING);
    if (heading) {
      item = null;
      const level = heading[1].length;
      if (level === 1) {
        section = null;
        parent = null;
        return;
      }
      const title = heading[2].replace(/\s+#+$/, '');
      if (level === 2) parent = title;
      const path = level === 3 && parent ? `${parent} / ${title}` : title;
      section = { path, title, level, start: index, end: index + 1, items: [] };
      sections.push(section);
      return;
    }
    if (!section) return;
    section.end = index + 1;
    const bullet = line.match(BULLET);
    if (bullet) {
      item = { ...readItem(bullet[1]), start: index, end: index + 1 };
      section.items.push(item);
    } else if (item && CONTINUATION.test(line)) {
      item.end = index + 1;
      item.body = [item.body, line.trim()].filter(Boolean).join(' ');
    } else item = null;
  });
  return { eol, lines, sections };
};

export const sectionsOf = (md) =>
  parse(md).sections.map(({ path, title, level, items }) => ({
    path,
    title,
    level,
    items: items.map(({ title: name, body }) => ({ title: name, body })),
  }));

const oneLine = (body) => String(body ?? '').replace(/\s*[\r\n]+\s*/g, ' ').trim();

export const cleanItem = ({ title, body } = {}) => {
  const name = cleanTitle(String(title ?? ''));
  if (!name) return { error: { key: 'error.titleRequired' } };
  if (name.length > MAX_TITLE) return { error: { key: 'error.titleTooLong', params: { max: MAX_TITLE } } };
  const text = oneLine(body);
  if (text.length > MAX_BODY) return { error: { key: 'error.bodyTooLong', params: { max: MAX_BODY } } };
  return { item: { title: name, body: text } };
};

const fail = (md, key) => ({ text: md, error: { key } });
const sameTitle = (a, b) => a.toLowerCase() === b.toLowerCase();
const sectionAt = (model, path) => model.sections.find((section) => section.path === path) ?? null;
const itemAt = (section, title) => section.items.find((item) => item.title === title) ?? null;

const splice = (model, start, count, inserted) => {
  const lines = [...model.lines];
  lines.splice(start, count, ...inserted);
  return lines.join(model.eol);
};

// The last line of a section that is not blank: its heading or its intro.
const lastText = (model, section) => {
  let at = section.end - 1;
  while (at > section.start && blank(model.lines[at])) at -= 1;
  return at;
};

// The section and the item of a ref, or the error of the one that is missing.
const locate = (model, ref) => {
  const section = sectionAt(model, ref.path);
  if (!section) return { error: 'error.sectionMissing' };
  const item = itemAt(section, ref.title);
  return item ? { section, item } : { error: 'error.itemMissing' };
};

export const itemOf = (md, ref) => {
  const { item } = locate(parse(md), ref);
  return item ? { title: item.title, body: item.body } : null;
};

// Puts `lines`, the lines of one item titled `title`, at the end of a section (ROAD-5).
const insert = (md, path, title, lines) => {
  const model = parse(md);
  const section = sectionAt(model, path);
  if (!section) return fail(md, 'error.sectionMissing');
  if (section.items.some((other) => sameTitle(other.title, title))) return fail(md, 'error.titleTaken');
  const last = section.items.at(-1);
  if (last) return { text: splice(model, last.end, 0, lines) };
  return { text: splice(model, lastText(model, section) + 1, 0, ['', ...lines]) };
};

export const addItem = (md, path, input) => {
  if (!sectionAt(parse(md), path)) return fail(md, 'error.sectionMissing');
  const { item, error } = cleanItem(input);
  if (error) return { text: md, error };
  return insert(md, path, item.title, [lineOf(item)]);
};

export const editItem = (md, ref, input) => {
  const model = parse(md);
  const { section, item: found, error: missing } = locate(model, ref);
  if (missing) return fail(md, missing);
  // A body that stays keeps its lines as they are, sub-bullets and length included: only the
  // first line, which holds the title, is written again.
  const keepsBody = oneLine(input?.body) === found.body;
  const { item, error } = cleanItem(keepsBody ? { title: input?.title, body: '' } : input);
  if (error) return { text: md, error };
  if (section.items.some((other) => other !== found && sameTitle(other.title, item.title))) return fail(md, 'error.titleTaken');
  if (keepsBody) {
    if (item.title === found.title) return { text: md };
    return { text: splice(model, found.start, 1, [retitle(model.lines[found.start], item.title)]) };
  }
  return { text: splice(model, found.start, found.end - found.start, [lineOf(item)]) };
};

export const deleteItem = (md, ref) => {
  const model = parse(md);
  const { item, error } = locate(model, ref);
  if (error) return fail(md, error);
  const lines = [...model.lines];
  lines.splice(item.start, item.end - item.start);
  // The blank line that came before the item goes too when another one, or the end, follows.
  const at = item.start;
  if (blank(lines[at - 1]) && (at === lines.length || blank(lines[at]))) lines.splice(at - 1, 1);
  return { text: lines.join(model.eol) };
};

export const moveItem = (md, ref, toPath) => {
  const model = parse(md);
  const { item, error } = locate(model, ref);
  if (error) return fail(md, error);
  if (!sectionAt(model, toPath)) return fail(md, 'error.sectionMissing');
  if (toPath === ref.path) return { text: md };
  // The lines go as they are, sub-bullets included (ROAD-6).
  const added = insert(deleteItem(md, ref).text, toPath, item.title, model.lines.slice(item.start, item.end));
  return added.error ? { text: md, error: added.error } : added;
};
