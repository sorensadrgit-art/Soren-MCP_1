import test from "node:test";
import assert from "node:assert/strict";
import {SKILLS} from "../lib/catalog.mjs";
import {MCP_SERVER_NAME,MCP_VERSION,TOOL_ANNOTATIONS,ROUTER_INSTRUCTIONS,ENDPOINT,CLIENT_SNIPPETS,
  getClientSnippet,TOOL_NAMES} from "../lib/client-contract.mjs";

test("Server advertises a distinct Soren identity and stable tool identities",()=>{
  assert.equal(MCP_SERVER_NAME,"soren-universal-skill-router");
  assert.match(MCP_VERSION,/^2\.[0-9]+\.[0-9]+$/);
  assert.equal(new Set(TOOL_NAMES).size,8);
  assert.ok(TOOL_NAMES.includes("route_task"));
  assert.ok(TOOL_NAMES.includes("read_skill"));
});

test("All tools advertise a non-destructive read-only intent, with accurate open-world exposure",()=>{
  assert.deepEqual(Object.keys(TOOL_ANNOTATIONS),TOOL_NAMES);
  for (const name of TOOL_NAMES){
    const hint=TOOL_ANNOTATIONS[name];
    assert.equal(hint.readOnlyHint,true,name);
    assert.equal(hint.destructiveHint,false,name);
    assert.equal(hint.idempotentHint,true,name);
    assert.equal(typeof hint.openWorldHint,"boolean",name);
  }
  for(const tool of ["route_task","discover_skills","search_mcp_servers","inspect_candidate","search_skills"]){
    assert.equal(TOOL_ANNOTATIONS[tool].openWorldHint,true,tool);
  }
  for(const tool of ["read_skill","list_skills"]){
    assert.equal(TOOL_ANNOTATIONS[tool].openWorldHint,false,tool);
  }
});

test("Router instructions cannot overrule host agent, user, or project instructions",()=>{
  for(const fragment of ["advisory","system","developer","user","project","never","approval","read_skill","route_task"]){
    assert.match(ROUTER_INSTRUCTIONS,new RegExp(fragment,"i"));
  }
  assert.doesNotMatch(ROUTER_INSTRUCTIONS,/ignore (?:previous|system|developer) instructions/i);
});

test("Every client has a correct native configuration with a single endpoint and consistent alias",()=>{
  assert.ok(/^https:\/\/[^ ]+\/api\/mcp$/.test(ENDPOINT));
  for(const agent of ["factory","codex","antigravity","opencode"]){
    const config=getClientSnippet(agent);
    assert.ok(config.includes(ENDPOINT),agent);
    assert.match(config,/soren-skills/,agent);
    assert.equal(config.split(ENDPOINT).length-1,1,"one endpoint per config");
  }
  const factory=JSON.parse(CLIENT_SNIPPETS.factory);
  assert.equal(factory.mcpServers["soren-skills"].type,"http");
  assert.equal(factory.mcpServers["soren-skills"].disabled,false);
  const anti=JSON.parse(CLIENT_SNIPPETS.antigravity);
  assert.equal(anti.mcpServers["soren-skills"].serverUrl,ENDPOINT);
  const open=JSON.parse(CLIENT_SNIPPETS.opencode);
  assert.equal(open.mcp.servers["soren-skills"].type,"remote");
  assert.equal(open.mcp.servers["soren-skills"].disabled,false);
  assert.match(CLIENT_SNIPPETS.codex,/\[mcp_servers\.soren-skills\]/);
  assert.throws(()=>getClientSnippet("unknown"),/Unsupported/);
});

test("Approved curated skills remain unchanged",()=>{
  assert.deepEqual(SKILLS.map(s=>s.name).sort(),["accessibility","mcp-integration","motion-systems","skill-orchestration"].sort());
});