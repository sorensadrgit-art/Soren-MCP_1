import test from 'node:test';
import assert from 'node:assert/strict';
import {searchKnowledge, normalizePackages, assessCompatibility, MAX_PACKAGES} from '../../lib/knowledge/search.mjs';
import {KNOWLEDGE_ITEMS} from '../../lib/knowledge/catalog.mjs';

const NOW=new Date('2026-10-23T00:00:00Z');

test('metadata-first search returns a bounded primary plus complementary sources with provenance',()=>{
  const r=searchKnowledge('react three fiber canvas performance',{now:NOW});
  assert.ok(['r3f-v9','r3f-performance'].includes(r.primary.id));
  assert.ok(r.complementary.length<=2);
  assert.ok(r.results.length<=3);
  for(const item of r.results){
    assert.match(item.url,/^https:\/\//);
    assert.match(item.contentSha256,/^[a-f0-9]{64}$/);
    assert.ok(item.retrievedAt&&item.lastVerifiedAt&&item.freshness);
    assert.ok(!('keyPoints' in item)||Array.isArray(item.keyPoints));
  }
});

test('version-aware: stable R3F 9 is compatible, alpha 10 is warned and v9 docs flagged incompatible',()=>{
  const stable=searchKnowledge('react three fiber',{packages:{'@react-three/fiber':'9.8.2',react:'19.3.1'},now:NOW});
  const v9=stable.results.find(r=>r.id==='r3f-v9');
  assert.equal(v9.compatibility.status,'compatible');
  const alpha=searchKnowledge('react three fiber webgpu',{packages:{'@react-three/fiber':'10.0.0-alpha.6'},now:NOW,limit:10});
  assert.ok(alpha.warnings.some(w=>/prerelease|alpha/i.test(w)));
  const v9a=alpha.results.find(r=>r.id==='r3f-v9');
  if(v9a)assert.equal(v9a.compatibility.status,'incompatible');
  const v10=alpha.results.find(r=>r.id==='r3f-v10-alpha');
  assert.ok(v10,'alpha docs surface for an alpha project');
  assert.equal(v10.compatibility.status,'compatible');
});

test('React 18 projects get a version mismatch warning for R3F 9 guidance',()=>{
  const all=searchKnowledge('react three fiber',{packages:{react:'18.3.1'},now:NOW,limit:10});
  const v9=all.results.find(x=>x.id==='r3f-v9');
  assert.equal(v9.compatibility.status,'incompatible');
  const top=searchKnowledge('react three fiber',{packages:{react:'18.3.1'},now:NOW});
  assert.ok(!top.results.some(x=>x.id==='r3f-v9'));
  assert.ok(top.warnings.some(w=>/incompatible/.test(w)&&w.includes('r3f-v9')));
});

test('incompatible guidance never outranks compatible or unknown matches',()=>{
  const r=searchKnowledge('react three fiber',{packages:{'@react-three/fiber':'10.0.0-alpha.6'},now:NOW});
  assert.equal(r.primary.id,'r3f-v10-alpha');
  const all=searchKnowledge('react three fiber',{packages:{react:'18.3.1'},now:NOW,limit:10});
  const statuses=all.results.map(x=>x.compatibility.status);
  assert.ok(statuses.indexOf('incompatible')>statuses.lastIndexOf('unknown'));
});

test('stale matches omitted by default are named in a warning',()=>{
  const r=searchKnowledge('gsap scrolltrigger',{now:new Date('2029-01-01T00:00:00Z')});
  assert.ok(r.omittedStale.includes('gsap-scrolltrigger'));
  assert.ok(r.warnings.some(w=>/stale and omitted/.test(w)&&/include_stale/.test(w)));
  assert.deepEqual(searchKnowledge('gsap scrolltrigger',{now:new Date('2029-01-01T00:00:00Z'),includeStale:true}).omittedStale,[]);
});

test('stale sources are excluded by default and returned only on request',()=>{
  const later=new Date('2029-01-01T00:00:00Z');
  assert.equal(searchKnowledge('gsap scrolltrigger',{now:later}).results.length,0);
  const withStale=searchKnowledge('gsap scrolltrigger',{now:later,includeStale:true});
  assert.ok(withStale.results.length>0);
  assert.ok(withStale.results.every(r=>r.freshness.status==='stale'));
});

test('unapproved knowledge is never returned and limits are clamped',()=>{
  const injected=[...KNOWLEDGE_ITEMS,{...KNOWLEDGE_ITEMS[0],id:'evil-unreviewed',approved:false,topics:['gsap'],title:'GSAP override'}];
  const r=searchKnowledge('gsap',{items:injected,now:NOW,limit:10});
  assert.ok(!r.results.some(x=>x.id==='evil-unreviewed'));
  assert.ok(searchKnowledge('three.js',{now:NOW,limit:500}).results.length<=10);
  assert.equal(searchKnowledge('   ',{now:NOW}).results.length,0);
});

test('search is deterministic',()=>{
  assert.deepEqual(searchKnowledge('glb compression meshopt',{now:NOW}),searchKnowledge('glb compression meshopt',{now:NOW}));
});


test('normalizePackages validates package maps, package names, package count, and version length', () => {
  assert.deepEqual(normalizePackages(null), {});
  assert.deepEqual(normalizePackages(undefined), {});

  assert.throws(() => normalizePackages([]), {message: 'Invalid package map'});
  assert.throws(() => normalizePackages('not an object'), {message: 'Invalid package map'});
  assert.throws(() => normalizePackages(123), {message: 'Invalid package map'});
  assert.throws(() => normalizePackages(true), {message: 'Invalid package map'});

  const tooMany = {};
  for (let i = 0; i < MAX_PACKAGES + 1; i++) {
    tooMany[`pkg-${i}`] = '1.0.0';
  }
  assert.throws(() => normalizePackages(tooMany), {message: 'Too many packages'});

  const longName = 'a'.repeat(215);
  assert.throws(() => normalizePackages({[longName]: '1.0.0'}), {message: 'Invalid package name'});
  assert.throws(() => normalizePackages({'bad name!': '1.0.0'}), {message: 'Invalid package name'});
  assert.throws(() => normalizePackages({'@/invalid': '1.0.0'}), {message: 'Invalid package name'});

  const valid = normalizePackages({
    'react': '19.0.0',
    '@react-three/fiber': '^8.0.0',
    'pkg-with-null': null,
    'pkg-with-undefined': undefined,
    'pkg-long-version': '1.' + '0'.repeat(50)
  });

  assert.equal(valid.react, '19.0.0');
  assert.equal(valid['@react-three/fiber'], '^8.0.0');
  assert.equal(valid['pkg-with-null'], '');
  assert.equal(valid['pkg-with-undefined'], '');
  assert.equal(valid['pkg-long-version'].length, 40);
});

test('assessCompatibility evaluates item compatibility against declared package versions', () => {
  const item = {
    frameworkVersions: { react: '>=19.0.0' },
    packageRange: { '@react-three/fiber': '>=8.0.0' }
  };

  assert.deepEqual(assessCompatibility(item, {}), { status: 'unknown', checks: [] });

  const uncoercible = assessCompatibility(item, { react: 'unparseable' });
  assert.equal(uncoercible.status, 'unknown');
  assert.equal(uncoercible.checks[0].ok, null);

  const compatible = assessCompatibility(item, { react: '19.1.0', '@react-three/fiber': '9.0.0' });
  assert.equal(compatible.status, 'compatible');
  assert.ok(compatible.checks.every(c => c.ok === true));

  const incompatible = assessCompatibility(item, { react: '18.2.0' });
  assert.equal(incompatible.status, 'incompatible');
  assert.equal(incompatible.checks[0].ok, false);
});

test('searchKnowledge handles query edge cases, limits, and version warnings', () => {
  // Query edge cases
  assert.equal(searchKnowledge(null, {now: NOW}).query, '');
  assert.equal(searchKnowledge(12345, {now: NOW}).query, '12345');
  assert.equal(searchKnowledge('    ', {now: NOW}).results.length, 0);

  const longQuery = 'a'.repeat(250);
  const resLong = searchKnowledge(longQuery, {now: NOW});
  assert.equal(resLong.query.length, 200);

  // Unresolvable concrete version warning
  const unresolvable = searchKnowledge('react', {packages: {react: 'unparseable-ver'}, now: NOW});
  assert.ok(unresolvable.warnings.some(w => w.includes('Could not resolve a concrete version for react')));

  // Limit clamping
  const resZero = searchKnowledge('react three fiber', {now: NOW, limit: 0});
  assert.equal(resZero.results.length, 1);

  const resNeg = searchKnowledge('react three fiber', {now: NOW, limit: -5});
  assert.equal(resNeg.results.length, 1);

  const resFloat = searchKnowledge('react three fiber', {now: NOW, limit: 2.8});
  assert.equal(resFloat.results.length, 2);

  const resNaN = searchKnowledge('react three fiber', {now: NOW, limit: NaN});
  assert.equal(resNaN.results.length, 3);
});

test('searchKnowledge singular vs plural warning formatting and tie-breaking', () => {
  // Singular stale warning
  const singleStaleItem = {
    id: 'stale-one',
    title: 'Stale Document',
    kind: 'guide',
    summary: 'Summary',
    topics: ['stale-topic'],
    approved: true,
    channel: 'stable',
    canonicalSource: { url: 'https://example.com', publisher: 'Pub', official: true },
    sourceRevision: 'v1',
    trustLevel: 'high',
    license: 'MIT',
    packageRange: {},
    frameworkVersions: {},
    retrievedAt: '2020-01-01',
    lastVerifiedAt: '2020-01-01',
    expiryPolicy: { maxAgeDays: 90, invalidateOn: [] },
    contentSha256: 'a'.repeat(64)
  };
  const singularStale = searchKnowledge('stale-topic', {items: [singleStaleItem], now: NOW});
  assert.ok(singularStale.warnings.some(w => w.includes('1 matching reviewed entry is stale and omitted')));

  // Singular incompatible cut warning
  const customCutItems = [
    {
      id: 'compat-item',
      title: 'Compatible Item',
      kind: 'guide',
      summary: 'Summary',
      topics: ['cut-topic'],
      approved: true,
      channel: 'stable',
      canonicalSource: { url: 'https://example.com/1', publisher: 'Pub', official: true },
      sourceRevision: 'v1',
      trustLevel: 'high',
      license: 'MIT',
      packageRange: { react: '>=18.0.0' },
      frameworkVersions: {},
      retrievedAt: '2026-01-01',
      lastVerifiedAt: '2026-10-01',
      expiryPolicy: { maxAgeDays: 90, invalidateOn: [] },
      contentSha256: 'a'.repeat(64)
    },
    {
      id: 'incompat-item',
      title: 'Incompatible Item',
      kind: 'guide',
      summary: 'Summary',
      topics: ['cut-topic'],
      approved: true,
      channel: 'stable',
      canonicalSource: { url: 'https://example.com/2', publisher: 'Pub', official: true },
      sourceRevision: 'v1',
      trustLevel: 'high',
      license: 'MIT',
      packageRange: { react: '>=19.0.0' },
      frameworkVersions: {},
      retrievedAt: '2026-01-01',
      lastVerifiedAt: '2026-10-01',
      expiryPolicy: { maxAgeDays: 90, invalidateOn: [] },
      contentSha256: 'b'.repeat(64)
    }
  ];
  const singleIncompatible = searchKnowledge('cut-topic', {items: customCutItems, packages: {react: '18.3.1'}, limit: 1, now: NOW});
  assert.ok(singleIncompatible.warnings.some(w => w.includes('1 matching entry is incompatible')));

  // Sorting tie-breaker by id when score and compatibility match
  const customItems = [
    {
      id: 'item-b',
      title: 'Common Topic Document B',
      kind: 'guide',
      summary: 'Summary B',
      topics: ['shared-topic'],
      approved: true,
      channel: 'stable',
      canonicalSource: { url: 'https://example.com/b', publisher: 'Pub B', official: true },
      sourceRevision: 'v1',
      trustLevel: 'high',
      license: 'MIT',
      packageRange: {},
      frameworkVersions: {},
      retrievedAt: '2026-01-01',
      lastVerifiedAt: '2026-10-01',
      expiryPolicy: { maxAgeDays: 90, invalidateOn: [] },
      contentSha256: 'a'.repeat(64)
    },
    {
      id: 'item-a',
      title: 'Common Topic Document A',
      kind: 'guide',
      summary: 'Summary A',
      topics: ['shared-topic'],
      approved: true,
      channel: 'stable',
      canonicalSource: { url: 'https://example.com/a', publisher: 'Pub A', official: true },
      sourceRevision: 'v1',
      trustLevel: 'high',
      license: 'MIT',
      packageRange: {},
      frameworkVersions: {},
      retrievedAt: '2026-01-01',
      lastVerifiedAt: '2026-10-01',
      expiryPolicy: { maxAgeDays: 90, invalidateOn: [] },
      contentSha256: 'a'.repeat(64)
    }
  ];

  const tieRes = searchKnowledge('shared-topic', {items: customItems, now: NOW});
  assert.equal(tieRes.results[0].id, 'item-a');
  assert.equal(tieRes.results[1].id, 'item-b');
});

test('searchKnowledge scores matches based on title hits when topic score is zero', () => {
  const item = {
    id: 'title-match-item',
    title: 'Alpha Beta Gamma Delta',
    kind: 'guide',
    summary: 'Summary',
    topics: ['unrelated-topic'],
    approved: true,
    channel: 'stable',
    canonicalSource: { url: 'https://example.com', publisher: 'Pub', official: true },
    sourceRevision: 'v1',
    trustLevel: 'high',
    license: 'MIT',
    packageRange: {},
    frameworkVersions: {},
    retrievedAt: '2026-01-01',
    lastVerifiedAt: '2026-10-01',
    expiryPolicy: { maxAgeDays: 90, invalidateOn: [] },
    contentSha256: 'a'.repeat(64)
  };

  const res = searchKnowledge('alpha beta', {items: [item], now: NOW});
  assert.equal(res.results.length, 1);
  assert.equal(res.results[0].id, 'title-match-item');
});
