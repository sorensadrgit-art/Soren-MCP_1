import test from 'node:test';
import assert from 'node:assert/strict';
import {searchKnowledge} from '../../lib/knowledge/search.mjs';
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
