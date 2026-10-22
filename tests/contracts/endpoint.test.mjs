import test from 'node:test';
import assert from 'node:assert/strict';
import {verificationEndpoint,protectionBypassHeaders} from '../../lib/contracts/endpoint.mjs';
test('verification permits explicit loopback only for insecure development transport',()=>{
  assert.equal(verificationEndpoint('http://127.0.0.1:3187/api/mcp'),'http://127.0.0.1:3187/api/mcp');
  assert.equal(verificationEndpoint('https://soren-shared-mcp-skills.vercel.app/api/mcp'),'https://soren-shared-mcp-skills.vercel.app/api/mcp');
  for(const url of ['http://example.com/api/mcp','http://127.0.0.1.evil.test/api/mcp','https://user:password@example.com/api/mcp','https://example.com/api/mcp?token=private','https://example.com/other'])assert.throws(()=>verificationEndpoint(url));
});

test('protection bypass header is sent only to HTTPS vercel.app targets and only when configured',()=>{
  const secret='s'.repeat(32);
  assert.deepEqual(protectionBypassHeaders('https://soren-mcp-v3-preview-abc-team.vercel.app/api/mcp',secret),{'x-vercel-protection-bypass':secret});
  for(const url of ['http://127.0.0.1:3187/api/mcp','https://example.com/api/mcp','https://vercel.app.evil.test/api/mcp'])assert.deepEqual(protectionBypassHeaders(url,secret),{});
  assert.deepEqual(protectionBypassHeaders('https://x.vercel.app/api/mcp',''),{});
});
