import test from 'node:test';
import assert from 'node:assert/strict';
import {KNOWLEDGE_ITEMS,getKnowledgeItem,computeContentSha256,freshness} from '../../lib/knowledge/catalog.mjs';
import {validateCatalogs} from '../../lib/v3/validate.mjs';

const REQUIRED_TOPICS=['react','next.js','three.js','react three fiber','drei','webgl','webgpu','gsap','blender','gltf','context7','serena','spline'];

test('all catalogs validate against their JSON schemas',()=>{
  const report=validateCatalogs();
  assert.equal(report.valid,true,JSON.stringify(report.errors,null,2));
});

test('knowledge items are unique, official-first and hash-verified',()=>{
  assert.ok(KNOWLEDGE_ITEMS.length>=25);
  assert.equal(new Set(KNOWLEDGE_ITEMS.map(i=>i.id)).size,KNOWLEDGE_ITEMS.length);
  for(const item of KNOWLEDGE_ITEMS){
    assert.match(item.canonicalSource.url,/^https:\/\//,item.id);
    assert.equal(item.contentSha256,computeContentSha256(item),item.id+' hash drift: rerun scripts/knowledge-hash.mjs after review');
    assert.ok(item.approved===true&&item.reviewer,item.id);
    assert.ok(!/ignore (previous|system) instructions/i.test(JSON.stringify(item)),item.id);
  }
});

test('the catalog covers every requested documentation domain',()=>{
  for(const topic of REQUIRED_TOPICS)assert.ok(KNOWLEDGE_ITEMS.some(i=>i.topics.includes(topic)),topic);
});

test('alpha and prerelease sources carry explicit warnings',()=>{
  const alpha=getKnowledgeItem('r3f-v10-alpha');
  assert.equal(alpha.channel,'alpha');
  assert.ok(alpha.warnings.some(w=>/alpha/i.test(w)));
  assert.equal(getKnowledgeItem('r3f-v9').channel,'stable');
  assert.equal(getKnowledgeItem('missing-id'),null);
});

test('freshness is computed from lastVerifiedAt and the expiry policy, not wall-clock guesses',()=>{
  const item=getKnowledgeItem('r3f-v9');
  assert.equal(freshness(item,new Date('2026-10-23T00:00:00Z')).status,'fresh');
  assert.equal(freshness(item,new Date('2028-01-01T00:00:00Z')).status,'stale');
});
