import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {runRouteSession,INIT,toolCall,toolValue} from '../helpers/mcp-route.mjs';
import {V3_TOOL_NAMES} from '../../lib/client-contract.mjs';

const fixture=JSON.parse(fs.readFileSync(new URL('./fixtures/legacy-contract.json',import.meta.url),'utf8'));
const LEGACY_SKILLS=['accessibility','motion-systems','mcp-integration','skill-orchestration'];

/** A new schema is compatible when every legacy property keeps its type, required set and allowed values. */
function assertSchemaSuperset(legacy,current,where){
  assert.equal(current.type,legacy.type,where+' type');
  if(legacy.enum){for(const value of legacy.enum)assert.ok(current.enum?.includes(value),where+' enum keeps '+value);}
  for(const key of ['minLength','minimum','minItems'])if(legacy[key]!==undefined)assert.ok((current[key]??0)<=legacy[key],where+' '+key);
  for(const key of ['maxLength','maximum','maxItems'])if(legacy[key]!==undefined)assert.ok((current[key]??Infinity)>=legacy[key],where+' '+key);
  if(legacy.items)assertSchemaSuperset(legacy.items,current.items,where+'[]');
  if(legacy.properties){
    assert.deepEqual([...(current.required||[])].sort(),[...(legacy.required||[])].sort(),where+' required');
    for(const [key,schema] of Object.entries(legacy.properties)){
      assert.ok(current.properties?.[key],where+'.'+key+' preserved');
      assertSchemaSuperset(schema,current.properties[key],where+'.'+key);
    }
  }
}

const sessionOff=runRouteSession([INIT,['tools/list'],['resources/list'],toolCall('list_skills'),toolCall('read_skill',{name:'motion-systems'}),
  toolCall('route_task',{task:'GSAP Three.js WebGL website',runtime:'codex',discovery:'local'}),toolCall('plan_toolchain',{task:'3D portfolio'}),toolCall('list_providers')]);
const sessionOn=runRouteSession([INIT,['tools/list'],['resources/list'],toolCall('route_task',{task:'GSAP Three.js WebGL website',runtime:'codex',discovery:'local'})],{v3:true});

test('flag off: exactly the legacy eight tools, same order, annotations and compatible schemas',()=>{
  const tools=sessionOff[1].body.result.tools;
  assert.deepEqual(tools.map(t=>t.name),fixture.tools.map(t=>t.name));
  for(const legacy of fixture.tools){
    const current=tools.find(t=>t.name===legacy.name);
    assert.deepEqual(current.annotations,legacy.annotations,legacy.name);
    assertSchemaSuperset(legacy.inputSchema,current.inputSchema,legacy.name);
  }
});

test('flag off: V3 tools are not callable and the four legacy URIs remain readable resources',()=>{
  const off=sessionOff[6].body;
  assert.ok(off.error||off.result?.isError,'plan_toolchain must be unavailable without the flag');
  const uris=sessionOff[2].body.result.resources.map(r=>r.uri);
  for(const uri of fixture.resourceUris)assert.ok(uris.includes(uri),uri);
  assert.ok(uris.every(uri=>uri.startsWith('skill://')),'no V3 resources without the flag');
});

test('legacy responses keep their shapes and the four original skills are unchanged',()=>{
  const skills=toolValue(sessionOff[3]);
  assert.ok(Array.isArray(skills));
  for(const name of LEGACY_SKILLS)assert.ok(skills.some(s=>s.name===name&&s.uri===`skill://${name}/SKILL.md`&&s.status==='curated'),name);
  assert.match(toolValue(sessionOff[4]),/^---\nname: motion-systems\n/);
  const route=toolValue(sessionOff[5]);
  assert.equal(route.primary.name,'motion-systems');
  assert.equal(route.discoveryMode,'local');
  assert.deepEqual(route.discoveredCandidates,[]);
  assert.ok(route.recommendations.length<=3);
  const providers=toolValue(sessionOff[7]);
  assert.equal(providers.providers.length,4);
});

test('flag on: legacy eight unchanged first, then exactly six advisory V3 tools',()=>{
  const tools=sessionOn[1].body.result.tools;
  assert.deepEqual(tools.slice(0,8).map(t=>t.name),fixture.tools.map(t=>t.name));
  assert.deepEqual(tools.slice(8).map(t=>t.name),V3_TOOL_NAMES);
  for(const tool of tools.slice(8)){
    assert.equal(tool.annotations.readOnlyHint,true,tool.name);
    assert.equal(tool.annotations.destructiveHint,false,tool.name);
    assert.equal(tool.annotations.openWorldHint,false,tool.name);
  }
  assert.equal(sessionOn[0].body.result.serverInfo.version,'2.5.1');
  const uris=sessionOn[2].body.result.resources.map(r=>r.uri);
  for(const uri of fixture.resourceUris)assert.ok(uris.includes(uri),uri);
  assert.ok(uris.some(uri=>uri.startsWith('soren://knowledge/')));
  assert.ok(uris.some(uri=>uri.startsWith('soren://recipe/')));
  assert.equal(toolValue(sessionOn[3]).primary.name,'motion-systems');
});
