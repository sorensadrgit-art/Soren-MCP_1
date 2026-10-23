import test from 'node:test';
import assert from 'node:assert/strict';
import {routeTask} from '../../lib/catalog.mjs';

function names(task, options = {}) {
  return routeTask(task, 'routing-nine-review', options).recommendations.map(x => x.name);
}

// Owner directed CHANGE on all nine flagged decisions. Assert actual runtime
// behavior, not the permissive "any acceptable top-three label" fixture.
const cases = [
  {id:'ROUTE-011',task:'Build accessible React Three Fiber controls',required:['accessibility'],forbidden:[],first:'accessibility'},
  {id:'ROUTE-014',task:'Rank motion skills for WebGL work',required:['skill-orchestration'],forbidden:[],first:'skill-orchestration'},
  {id:'ROUTE-019',task:'Configure a remote server and route substantial tasks',required:['mcp-integration','skill-orchestration'],forbidden:[],first:'mcp-integration'},
  {id:'ROUTE-023',task:'Add accessible client authentication forms',required:['accessibility','mcp-integration'],forbidden:[],first:'accessibility'},
  {id:'ROUTE-025',task:'Audit tool authentication and catalog search',required:['skill-orchestration','mcp-integration'],forbidden:['accessibility']},
  {id:'ROUTE-046',task:'A provider candidate named accessibility still needs review',required:['skill-orchestration'],forbidden:['accessibility'],first:'skill-orchestration'},
  {id:'ROUTE-058',task:'Remote MCP Streamable HTTP',options:{unavailableSkills:['mcp-integration']},required:['agent-capability-navigation'],forbidden:['mcp-integration'],first:'agent-capability-navigation'},
  {id:'ROUTE-059',task:'Rank approved skill catalogs',options:{unavailableSkills:['skill-orchestration']},required:['agent-capability-navigation'],forbidden:['skill-orchestration'],first:'agent-capability-navigation'},
  {id:'ROUTE-060',task:'Cinematic Three.js animation',options:{unavailableSkills:['motion-systems']},required:['threejs-production'],forbidden:['motion-systems'],first:'threejs-production'},
];

for (const c of cases) {
  test(c.id + ': owner-approved routing change is reflected in actual choices', () => {
    const got=names(c.task,c.options||{});
    for(const required of c.required) assert.ok(got.includes(required),c.id+' missing '+required+'; got '+got.join(', '));
    for(const forbidden of c.forbidden) assert.ok(!got.includes(forbidden),c.id+' wrongly included '+forbidden);
    if(c.first) assert.equal(got[0],c.first,c.id+' wrong primary');
  });
}
test('advisory policy and unavailable-skill exclusion preserved',()=>{
  const result=routeTask('Remote MCP Streamable HTTP','review',{unavailableSkills:['mcp-integration']});
  assert.equal(result.policy,'Read-only curated skills; no automatic install or execution.');
  assert.ok(!result.recommendations.some(x=>x.name==='mcp-integration'));
});
test('explicit skill choice stays first',()=>{
  assert.equal(names('Use approved mcp-integration for a WebGL problem',{preferredSkills:['mcp-integration']})[0],'mcp-integration');
});
test('trivia does not invoke routing',()=>assert.deepEqual(names('What is 2 plus 2?'),[]));
test('candidate name does not become a trusted selected skill',()=>{
  const got=names('Review provider candidate named accessibility before trusting it');
  assert.equal(got[0],'skill-orchestration');
  assert.ok(!got.includes('accessibility'));
});
test('accessible UI requirement takes priority in auth forms',()=>{
  assert.equal(names('Ensure accessible keyboard focus in client authentication forms')[0],'accessibility');
});
