import test from 'node:test';
import assert from 'node:assert/strict';
import { verifyProtocol } from '../../installer/protocol.mjs';
import { ENDPOINT, MCP_SERVER_NAME, TOOL_NAMES } from '../../lib/client-contract.mjs';

function protocolFixture(change = {}) {
  const requests = [];
  const fetch = async (url, init) => {
    assert.equal(new URL(url).href, ENDPOINT);
    assert.equal(init.redirect, 'error');
    const request = JSON.parse(init.body);
    requests.push(request);
    let result;
    if (request.method.startsWith('notifications/')) return new Response(null, { status: 202 });
    if (request.method === 'initialize') result = { protocolVersion: '2025-06-18', capabilities: { tools: {}, resources: {} }, serverInfo: { name: MCP_SERVER_NAME, version: '2.2.0' } };
    else if (request.method === 'tools/list') result = { tools: TOOL_NAMES.map(name => ({ name, inputSchema: { type: 'object' }, annotations: { readOnlyHint: true, destructiveHint: false } })) };
    else if (request.method === 'resources/list') result = { resources: ['motion-systems', 'frontend', 'accessibility', 'engineering'].map(name => ({ name, uri: `skill://${name}/SKILL.md` })) };
    else if (request.method === 'resources/read') result = { contents: [{ uri: request.params.uri, text: 'name: motion-systems' }] };
    else if (request.method === 'tools/call') result = { content: [{ type: 'text', text: JSON.stringify({ discoveryMode: 'local', discoveredCandidates: [] }) }] };
    else throw new Error('UNEXPECTED_METHOD');
    return Response.json({ jsonrpc: '2.0', id: request.id, result: change[request.method] || result });
  };
  return { fetch, requests };
}

test('real SDK transport proves contract and harmless local-mode call without claiming native client', async () => {
  const fixture = protocolFixture();
  const result = await verifyProtocol(fixture);
  assert.equal(result.status, 'PASS', JSON.stringify(result));
  assert.equal(result.nativeInvocation, 'NOT_RUN');
  assert.equal(result.authenticated, 'NOT_APPLICABLE');
  assert.equal(fixture.requests.find(request => request.method === 'tools/call').params.arguments.discovery, 'local');
});

test('tool contract mismatch fails without serializing returned content', async () => {
  const result = await verifyProtocol(protocolFixture({ 'tools/list': { tools: [] } }));
  assert.equal(result.status, 'FAIL');
  assert.equal(result.reason, 'TOOL_CONTRACT_MISMATCH');
});

test('invalid token rejection never becomes anonymous fallback', async () => {
  let requests = 0;
  const result = await verifyProtocol({ fetch: async () => { requests++; return new Response('private-fixture-token-never-log', { status: 401 }); } });
  assert.equal(result.status, 'FAIL');
  assert.equal(requests, 1);
  assert.ok(!JSON.stringify(result).includes('private-fixture-token'));
});
