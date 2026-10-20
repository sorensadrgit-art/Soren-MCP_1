import test from 'node:test';
import assert from 'node:assert/strict';
import {verificationEndpoint} from '../../lib/contracts/endpoint.mjs';
test('verification permits explicit loopback only for insecure development transport',()=>{
  assert.equal(verificationEndpoint('http://127.0.0.1:3187/api/mcp'),'http://127.0.0.1:3187/api/mcp');
  assert.equal(verificationEndpoint('https://soren-shared-mcp-skills.vercel.app/api/mcp'),'https://soren-shared-mcp-skills.vercel.app/api/mcp');
  for(const url of ['http://example.com/api/mcp','http://127.0.0.1.evil.test/api/mcp','https://user:password@example.com/api/mcp','https://example.com/api/mcp?token=private','https://example.com/other'])assert.throws(()=>verificationEndpoint(url));
});
