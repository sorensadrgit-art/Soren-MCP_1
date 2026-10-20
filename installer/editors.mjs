import { parse as parseJsonc, parseTree, findNodeAtLocation, modify, applyEdits } from 'jsonc-parser';
import TOML from '@iarna/toml';
import { ADAPTERS, GUIDE_BLOCK, GUIDE_START, GUIDE_END } from './adapters.mjs';

export function parseConfig(text, format) {
  const body = text.replace(/^\uFEFF/, '');
  try {
    if (format === 'toml') return TOML.parse(body);
    const errors = [];
    const result = parseJsonc(body || '{}', errors, { allowTrailingComma: true });
    if (errors.length || !result || Array.isArray(result) || typeof result !== 'object') throw new Error();
    const unique = node => {
      if (node.type === 'object') {
        const keys = node.children.map(property => property.children[0].value);
        if (new Set(keys).size !== keys.length) throw new Error();
      }
      for (const child of node.children || []) unique(child);
    };
    unique(parseTree(body || '{}', [], { allowTrailingComma: true }));
    return result;
  } catch { throw new Error('INVALID_CONFIG'); }
}

export function getAt(value, keys) { return keys.reduce((current, key) => current?.[key], value); }
export function equal(a, b) {
  const normalized = value => value && typeof value === 'object' ? (Array.isArray(value) ? value.map(normalized) : Object.fromEntries(Object.keys(value).sort().map(key => [key, normalized(value[key])]))) : value;
  return JSON.stringify(normalized(a)) === JSON.stringify(normalized(b));
}

function tomlSection(text, keys) {
  // Quoted or dotted variants need a full concrete-syntax editor. Refuse them.
  const lines = [...text.matchAll(/^\s*\[([^\r\n]+)\][^\r\n]*(?:\r?\n|$)/gm)];
  const wanted = keys.join('.');
  for (let index = 0; index < lines.length; index++) {
    const header = lines[index][1].trim();
    if (header === wanted) return [lines[index].index, index + 1 < lines.length ? lines[index + 1].index : text.length];
    const unquoted = header.replace(/["']/g, '').replace(/\s+/g, '');
    if (unquoted === wanted || unquoted.startsWith(wanted + '.')) throw new Error('UNSUPPORTED_TOML_OWNERSHIP_SHAPE');
  }
  return null;
}

export function ownedSyntax(text, client) {
  const adapter = ADAPTERS[client];
  const body = text.replace(/^\uFEFF/, '');
  parseConfig(body, adapter.format);
  if (adapter.format === 'toml') {
    const section = tomlSection(body, adapter.key);
    return section ? body.slice(section[0], section[1]).trim() : null;
  }
  const node = findNodeAtLocation(parseTree(body || '{}', [], { allowTrailingComma: true }), adapter.key);
  return node ? body.slice(node.offset, node.offset + node.length) : null;
}

export function editConfig(text, client, entry) {
  const adapter = ADAPTERS[client];
  const parsed = parseConfig(text, adapter.format);
  const before = getAt(parsed, adapter.key);
  if (equal(before, entry)) return text;
  const bom = text.startsWith('\uFEFF') ? '\uFEFF' : '';
  const eol = text.includes('\r\n') ? '\r\n' : '\n';
  let body = text.slice(bom.length);
  if (adapter.format === 'jsonc') {
    body = body || '{}';
    body = applyEdits(body, modify(body, adapter.key, entry, { formattingOptions: { insertSpaces: true, tabSize: 2, eol } }));
  } else {
    const section = tomlSection(body, adapter.key);
    if (before !== undefined && !section) throw new Error('UNSUPPORTED_TOML_OWNERSHIP_SHAPE');
    const replacement = entry === undefined ? '' : `[${adapter.key.join('.')}]${eol}${Object.entries(entry).map(([key, value]) => `${key} = ${JSON.stringify(value)}`).join(eol)}${eol}`;
    if (section) body = body.slice(0, section[0]) + replacement + body.slice(section[1]);
    else if (entry !== undefined) body += (body && !body.endsWith('\n') ? eol : '') + replacement;
  }
  const output = bom + body;
  const after = parseConfig(output, adapter.format);
  const expected = structuredClone(parsed);
  let cursor = expected;
  for (const key of adapter.key.slice(0, -1)) cursor = cursor[key] ??= {};
  if (entry === undefined) delete cursor[adapter.key.at(-1)];
  else cursor[adapter.key.at(-1)] = entry;
  if (adapter.format === 'toml' && entry === undefined && !Object.keys(cursor).length) delete expected[adapter.key[0]];
  if (adapter.format === 'toml' && entry === undefined && after[adapter.key[0]] && !Object.keys(after[adapter.key[0]]).length) delete after[adapter.key[0]];
  if (!equal(after, expected)) throw new Error('UNEXPECTED_SEMANTIC_DELTA');
  return output;
}

export function guideSection(text) {
  const starts = [...text.matchAll(new RegExp(GUIDE_START, 'g'))];
  const ends = [...text.matchAll(new RegExp(GUIDE_END, 'g'))];
  if (starts.length !== ends.length || starts.length > 1 || (starts.length && starts[0].index > ends[0].index)) throw new Error('INVALID_MANAGED_GUIDE');
  return starts.length ? { start: starts[0].index, end: ends[0].index + GUIDE_END.length, text: text.slice(starts[0].index, ends[0].index + GUIDE_END.length) } : null;
}

export function editGuide(text, remove = false) {
  const section = guideSection(text);
  const eol = text.includes('\r\n') ? '\r\n' : '\n';
  const block = GUIDE_BLOCK.replaceAll('\n', eol);
  if (section) return text.slice(0, section.start) + (remove ? '' : block) + text.slice(section.end);
  return remove ? text : text + (text && !text.endsWith('\n') ? eol : '') + block + eol;
}
