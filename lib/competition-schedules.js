import { parse } from 'acorn';
import { BOHR_PERIOD_SLUG, BOHR_PRODUCT_ID, BOHR_PRODUCT_PAGE, PKU_ID, PKU_UNIT_SLUG, SCIENTIFIC_FACILITIES_ID } from './competitions.js';
import { publicPageUrl } from './links.js';

function moduleUrl(html, pageUrl) {
  const tags = /<!--[\s\S]*?(?:-->|$)|<(script|style|title|textarea|template)(?=[\s/>])((?:[^>"']|"[^"]*"|'[^']*')*)>[\s\S]*?(?:<\/\1\s*>|$)|<\/?[a-z](?:[^>"']|"[^"]*"|'[^']*')*>/gi;
  const attributes = /\s+([^\s=/"'<>`]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'`=<>]+)))?/gy;
  let entry;
  for (const [, tag, attrs] of html.matchAll(tags)) {
    if (tag?.toLowerCase() !== 'script') continue;
    const values = new Map();
    let attributeEnd = 0;
    for (const [attribute, key, doubleQuoted, singleQuoted, bare] of attrs.matchAll(attributes)) {
      attributeEnd += attribute.length;
      const name = key.toLowerCase();
      if (name !== 'src' && name !== 'type') continue;
      if (values.has(name)) throw new Error('Ambiguous module attributes');
      values.set(name, (doubleQuoted ?? singleQuoted ?? bare ?? '').trim());
    }
    const remainder = attrs.slice(attributeEnd).trim();
    if (remainder && remainder !== '/') continue;
    const src = values.get('src');
    if (values.get('type')?.toLowerCase() !== 'module' || !src) continue;
    const url = URL.parse(src, pageUrl);
    if (!url || !/^https?:$/.test(url.protocol) || url.origin !== pageUrl.origin ||
        url.username || url.password || !/\.m?js$/i.test(url.pathname)) continue;
    if (entry) throw new Error('Multiple same-origin entry modules');
    url.hash = '';
    entry = url;
  }
  if (!entry) throw new Error('No same-origin entry module');
  return entry;
}

function identifier(node, name) {
  return node?.type === 'Identifier' && node.name === name;
}

function memberObject(node, name) {
  if (node?.type === 'MemberExpression' && !node.computed && !node.optional && identifier(node.property, name)) {
    return node.object;
  }
}

function callReceiver(node, name) {
  if (node?.type === 'CallExpression' && !node.optional && node.arguments.length === 1) {
    return memberObject(node.callee, name);
  }
}

function unfreeze(node) {
  return identifier(callReceiver(node, 'freeze'), 'Object') ? node.arguments[0] : node;
}

function firstArrowParameter(node) {
  if (node?.type === 'ArrowFunctionExpression' && !node.async && node.params[0]?.type === 'Identifier') {
    return node.params[0].name;
  }
}

function propertyName(node) {
  if (node?.type !== 'Property' || node.computed || node.method || node.kind !== 'init') return undefined;
  if (node.key.type === 'Identifier') return node.key.name;
  if (typeof node.key.value === 'string') return node.key.value;
}

function fieldsOf(node) {
  if (node?.type !== 'ObjectExpression') throw new Error('Expected a static record');
  const fields = new Map();
  for (const property of node.properties) {
    const key = propertyName(property);
    if (key === undefined || fields.has(key)) throw new Error('Ambiguous record property');
    fields.set(key, property.value);
  }
  return fields;
}

function arrayElements(node) {
  if (node?.type !== 'ArrayExpression') throw new Error('Expected a static array');
  return node.elements;
}

function bohrPeriodArray(initializer) {
  const map = unfreeze(initializer);
  const array = callReceiver(map, 'map');
  if (map === initializer || array?.type !== 'ArrayExpression') return undefined;

  const [project] = map.arguments;
  const period = firstArrowParameter(project);
  if (!period) return undefined;
  const record = unfreeze(project.body);
  if (record?.type !== 'ObjectExpression' || record.properties.length !== 2) return undefined;
  const [spread, ids] = record.properties;
  if (spread.type !== 'SpreadElement' || !identifier(spread.argument, period) ||
      propertyName(ids) !== 'challengeIds') return undefined;

  const filter = unfreeze(ids.value);
  const slotsMap = callReceiver(filter, 'filter');
  const slots = memberObject(callReceiver(slotsMap, 'map'), 'slots');
  if (!identifier(slots, period) || !identifier(filter.arguments[0], 'Boolean')) return undefined;
  const [selectId] = slotsMap.arguments;
  const slot = firstArrowParameter(selectId);
  if (slot && identifier(memberObject(selectId.body, 'challengeId'), slot)) return array;
}

function parseStaticBundle(bundle) {
  const bindings = new Map();
  for (const statement of parse(bundle, { ecmaVersion: 'latest', sourceType: 'module' }).body) {
    const declaration = statement.type === 'ExportNamedDeclaration' ? statement.declaration : statement;
    if (declaration?.type !== 'VariableDeclaration' || declaration.kind !== 'const') continue;
    for (const { id, init } of declaration.declarations) {
      if (id.type === 'Identifier') bindings.set(id.name, init);
    }
  }
  const resolve = (node) => unfreeze(node?.type === 'Identifier' ? bindings.get(node.name) : node);
  function literalValue(node) {
    const value = resolve(node);
    if (value?.type === 'Literal') return value.value;
  }
  function stringValue(node) {
    const value = literalValue(node);
    if (typeof value === 'string') return value;
  }
  function challengeId(node) {
    const id = stringValue(node);
    if (!id || id === '.' || id === '..' || /[\s/\\?#%\x00-\x1f\x7f]/u.test(id) || !id.isWellFormed()) {
      throw new Error('Invalid challenge ID');
    }
    return id;
  }
  return { initializers: [...bindings.values()], resolve, literalValue, stringValue, challengeId };
}

const zonedTimestamp = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:?\d{2})$/;

function freezePeriod(period) {
  Object.freeze(period.challengeIds);
  return Object.freeze(period);
}

function bohrProductPeriods({ initializers, resolve, literalValue, stringValue, challengeId }) {
  const arrays = initializers.map(bohrPeriodArray).filter(Boolean);
  if (arrays.length !== 1 || !arrays[0].elements.length) throw new Error('Expected one nonempty period table');

  function slotId(node) {
    const value = literalValue(node);
    if (!node || value === null || value === '') return undefined;
    return challengeId(node);
  }
  function slotIds(node) {
    const slots = resolve(node);
    if (slots?.type === 'ArrayExpression') {
      return slots.elements.map((slot) => slotId(fieldsOf(resolve(slot)).get('challengeId'))).filter(Boolean);
    }
    const source = callReceiver(slots, 'map');
    if (!source) throw new Error('Expected static slots');
    const [project] = slots.arguments;
    const id = firstArrowParameter(project);
    if (!id || !identifier(fieldsOf(unfreeze(project.body)).get('challengeId'), id)) {
      throw new Error('Unexpected slot projection');
    }
    return arrayElements(resolve(source)).map(slotId).filter(Boolean);
  }
  function groupIds(groups, bonusId) {
    const ids = arrayElements(resolve(groups)).flatMap((group) => {
      const groupFields = fieldsOf(resolve(group));
      return arrayElements(resolve(groupFields.get('challengeIds'))).map(challengeId);
    });
    if (bonusId && literalValue(bonusId) !== null) ids.push(challengeId(bonusId));
    return ids;
  }

  const slugs = new Set();
  return Object.freeze(arrays[0].elements.map((node) => {
    const fields = fieldsOf(resolve(node));
    const slug = stringValue(fields.get('slug'));
    const labelZh = stringValue(fields.get('labelZh'));
    const startAt = stringValue(fields.get('startAt'));
    const endAt = stringValue(fields.get('endAt'));
    if (!BOHR_PERIOD_SLUG.test(slug) || slugs.has(slug) || !labelZh?.trim() ||
        !zonedTimestamp.test(startAt) || !zonedTimestamp.test(endAt) || !(Date.parse(startAt) < Date.parse(endAt))) {
      throw new Error('Invalid period metadata');
    }
    slugs.add(slug);
    const layout = stringValue(fields.get('layout'));
    let challengeIds;
    if (layout === 'trackGroups') {
      const slots = resolve(fields.get('slots'));
      if (slots?.type === 'ArrayExpression') {
        challengeIds = slotIds(slots);
      } else {
        const groups = fields.get('groups');
        const bonus = fields.get('bonusId');
        if (slots?.type !== 'CallExpression' || slots.optional || slots.callee.type !== 'Identifier' ||
            slots.arguments.length !== (bonus ? 2 : 1) || resolve(slots.arguments[0]) !== resolve(groups) ||
            (bonus && literalValue(slots.arguments[1]) !== literalValue(bonus))) {
          throw new Error('Unexpected grouped slot projection');
        }
        challengeIds = groupIds(groups, bonus);
      }
    } else if (layout === 'tracks' || layout === 'challenges') {
      challengeIds = slotIds(fields.get('slots'));
    } else {
      throw new Error('Unknown period layout');
    }
    return freezePeriod({ slug, labelZh, startAt, endAt, challengeIds });
  }));
}

function recordTable({ initializers, resolve }, keys) {
  const tables = initializers.map(unfreeze).filter((initializer) => initializer?.type === 'ArrayExpression' &&
    initializer.elements.some((element) => {
      const row = resolve(element);
      if (row?.type !== 'ObjectExpression') return false;
      const names = new Set(row.properties.map(propertyName));
      return keys.every((key) => names.has(key));
    }));
  if (tables.length !== 1) throw new Error('Expected one static record table');
  return tables[0].elements;
}

function scientificFacilitiesPeriods(bundle) {
  const { resolve, literalValue, stringValue, challengeId } = bundle;
  const periodRows = recordTable(bundle, ['key', 'name', 'openAt', 'endAt']);
  const questionRows = recordTable(bundle, ['code', 'period', 'direction', 'challengeId']);

  function optionalDate(node) {
    const date = literalValue(node);
    if (date === null) return undefined;
    if (typeof date !== 'string' || !(/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(date) || zonedTimestamp.test(date)) || !Number.isFinite(Date.parse(date))) {
      throw new Error('Invalid Scientific Facilities period date');
    }
    return date;
  }

  const periods = new Map();
  for (const row of periodRows) {
    const fields = fieldsOf(resolve(row));
    const key = stringValue(fields.get('key'));
    const slug = key?.slice(1);
    const labelZh = stringValue(fieldsOf(resolve(fields.get('name'))).get('zh'));
    if (!key?.startsWith('p') || !BOHR_PERIOD_SLUG.test(slug) || periods.has(key) || !labelZh?.trim()) {
      throw new Error('Invalid Scientific Facilities period metadata');
    }
    const startAt = optionalDate(fields.get('openAt'));
    const endAt = optionalDate(fields.get('endAt'));
    if (startAt && endAt && !(Date.parse(startAt) < Date.parse(endAt))) throw new Error('Invalid Scientific Facilities period range');
    periods.set(key, { slug, labelZh, ...(startAt && { startAt }), ...(endAt && { endAt }), challengeIds: [] });
  }

  for (const row of questionRows) {
    const fields = fieldsOf(resolve(row));
    const period = periods.get(stringValue(fields.get('period')));
    if (!period || !stringValue(fields.get('code'))?.trim() || stringValue(fields.get('direction')) === undefined) {
      throw new Error('Invalid Scientific Facilities question metadata');
    }
    const id = fields.get('challengeId');
    if (literalValue(id) !== null) period.challengeIds.push(challengeId(id));
  }

  return Object.freeze([...periods.values()].map(freezePeriod));
}

function pkuPeriods(bundle) {
  const { resolve, stringValue, challengeId } = bundle;
  const trackRows = recordTable(bundle, ['key', 'name', 'desc']);
  const unitRows = recordTable(bundle, ['id', 'track', 'name', 'startAt', 'endAt', 'challenges']);
  const nameZh = (node) => stringValue(fieldsOf(resolve(node)).get('zh'));
  const tracks = new Map();

  for (const row of trackRows) {
    const fields = fieldsOf(resolve(row));
    const key = stringValue(fields.get('key'));
    const labelZh = nameZh(fields.get('name'));
    if (!key?.trim() || tracks.has(key) || !labelZh?.trim()) throw new Error('Invalid PKU track metadata');
    tracks.set(key, labelZh);
  }

  const slugs = new Set();
  return Object.freeze(unitRows.map((row) => {
    const fields = fieldsOf(resolve(row));
    const slug = stringValue(fields.get('id'));
    const trackZh = tracks.get(stringValue(fields.get('track')));
    const roundZh = nameZh(fields.get('name'));
    const startAt = stringValue(fields.get('startAt'));
    const endAt = stringValue(fields.get('endAt'));
    if (!slug || !PKU_UNIT_SLUG.test(slug) || slugs.has(slug) || !trackZh || !roundZh?.trim() ||
        !zonedTimestamp.test(startAt) || !zonedTimestamp.test(endAt) || !(Date.parse(startAt) < Date.parse(endAt))) {
      throw new Error('Invalid PKU unit metadata');
    }
    slugs.add(slug);
    const challengeIds = arrayElements(resolve(fields.get('challenges')))
      .map((challenge) => challengeId(fieldsOf(resolve(challenge)).get('id')));
    return freezePeriod({ slug, labelZh: `${trackZh} · ${roundZh}`, startAt, endAt, challengeIds });
  }));
}

export function createCompetitionSchedulesReader({ baseUrl, readText, timeoutMs = 5000 }) {
  const pageUrl = new URL(publicPageUrl(baseUrl, BOHR_PRODUCT_PAGE));
  const contests = [
    { id: BOHR_PRODUCT_ID, decode: bohrProductPeriods },
    { id: SCIENTIFIC_FACILITIES_ID, decode: scientificFacilitiesPeriods },
    { id: PKU_ID, decode: pkuPeriods },
  ];
  let entryUrl;
  let pending;

  function current() {
    return Object.fromEntries(contests.map(({ id, snapshot }) => {
      const periods = snapshot?.periods;
      return [id, snapshot && snapshot.url === entryUrl ? { periods } : { periods, stale: true }];
    }));
  }

  async function check() {
    try {
      const signal = AbortSignal.timeout(Math.min(Math.ceil(timeoutMs), 5000));
      const entry = moduleUrl(await readText(pageUrl, { signal }), pageUrl);
      signal.throwIfAborted();
      const changed = contests.filter(({ snapshot }) => snapshot?.url !== entry.href);
      if (changed.length) {
        const bundle = await readText(entry, { signal });
        signal.throwIfAborted();
        const source = parseStaticBundle(bundle);
        for (const contest of changed) {
          let periods;
          try {
            periods = contest.decode(source);
          } catch {
            continue;
          }
          contest.snapshot = { url: entry.href, periods };
        }
      }
      entryUrl = entry.href;
    } catch {
      entryUrl = undefined;
    }
    return current();
  }

  return {
    async read({ revalidate = true } = {}) {
      if (!revalidate && contests.some(({ snapshot }) => snapshot)) return current();
      pending ??= check().finally(() => { pending = undefined; });
      return pending;
    },
  };
}
