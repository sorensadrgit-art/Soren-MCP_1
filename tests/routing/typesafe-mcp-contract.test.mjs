import test from 'node:test';
import assert from 'node:assert/strict';
import {runRouteSession,INIT,toolCall,toolValue} from '../helpers/mcp-route.mjs';

const toolNames=['soren_jev_suggest_specialist','soren_jev_triage_learning','soren_jev_verify_claim'];
const calls=[INIT,['tools/list'],
  toolCall('soren_jev_suggest_specialist',{public_summary:'Run browser tests',candidates:[{id:'qa-agent',description:'Runs Playwright quality checks'}],public_confirmed:true}),
  toolCall('soren_jev_triage_learning',{public_summary:'The build uses npm run build',sources:['repository package.json'],public_confirmed:true}),
  toolCall('soren_jev_verify_claim',{claim:'Build passed',source_excerpt:'Build passed with exit 0',quote:'Build passed',public_confirmed:true}),
];
const base={TYPESAFE_API_KEY:'',TYPESAFE_JEV_ENABLED:'false',SOREN_RATE_KEY:''};

test('MCP registry keeps TypeSafe tools absent when second explicit flag is off',()=>{
  const off=runRouteSession(calls,{v3:true,env:{...base,SOREN_TYPESAFE_TOOLS:'0'}});
  const names=off[1].body.result.tools.map(t=>t.name);
  assert.equal(names.length,14);
  for(const name of toolNames)assert.ok(!names.includes(name));
});

test('MCP exposes exactly three additive TypeSafe tools only when both flags enabled',()=>{
  const on=runRouteSession(calls,{v3:true,env:{...base,SOREN_TYPESAFE_TOOLS:'1'}});
  const names=on[1].body.result.tools.map(t=>t.name);
  assert.equal(names.length,17);
  for(const name of toolNames){
    assert.ok(names.includes(name),name);
    const metadata=on[1].body.result.tools.find(t=>t.name===name);
    assert.equal(metadata.annotations.readOnlyHint,true);
    assert.equal(metadata.annotations.openWorldHint,true);
    assert.ok(metadata.inputSchema.required.includes('public_confirmed'));
  }
  assert.equal(toolValue(on[2]).status,'disabled');
  assert.equal(toolValue(on[3]).status,'disabled');
  assert.equal(toolValue(on[4]).status,'disabled');
});

test('enabled TypeSafe with missing credentials never spends credits',()=>{
  const on=runRouteSession(calls,{v3:true,env:{...base,SOREN_TYPESAFE_TOOLS:'1',TYPESAFE_JEV_ENABLED:'true'}});
  for(const response of on.slice(2))assert.equal(toolValue(response).status,'not_configured');
});

test('without a shared rate-limit and quota store external calls fail closed',()=>{
  const on=runRouteSession(calls,{v3:true,env:{...base,SOREN_TYPESAFE_TOOLS:'1',
    TYPESAFE_JEV_ENABLED:'true',TYPESAFE_API_KEY:'fixture-not-real'}});
  for(const response of on.slice(2))assert.equal(toolValue(response).status,'unavailable_or_budget_limited');
});
