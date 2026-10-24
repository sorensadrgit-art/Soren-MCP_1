import test from 'node:test';
import assert from 'node:assert/strict';
import {GET} from '../../app/api/cron/maintenance/route.ts';

test('cron maintenance route passes retrieved OIDC token when getOidcToken succeeds', async () => {
  const secret = 'a'.repeat(32);
  const previousSecret = process.env.CRON_SECRET;
  process.env.CRON_SECRET = secret;

  let passedOidcToken = null;
  let passedStore = null;

  const mockStore = {id: 'test-operations-store'};
  const mockRunner = async ({store, oidcToken}) => {
    passedStore = store;
    passedOidcToken = oidcToken;
    return {status: 'completed', completed: 2};
  };

  try {
    const request = new Request('https://router.example/api/cron/maintenance', {
      headers: {Authorization: `Bearer ${secret}`},
    });

    const response = await GET(request, {
      getOidcToken: async () => 'test-valid-oidc-token-abc',
      store: mockStore,
      runner: mockRunner,
    });

    assert.equal(response.status, 200);
    assert.equal(response.headers.get('Cache-Control'), 'no-store');
    const data = await response.json();
    assert.deepEqual(data, {status: 'completed', completed: 2});
    assert.equal(passedOidcToken, 'test-valid-oidc-token-abc');
    assert.equal(passedStore, mockStore);
  } finally {
    if (previousSecret !== undefined) process.env.CRON_SECRET = previousSecret;
    else delete process.env.CRON_SECRET;
  }
});

test('cron maintenance route degrades gracefully when getOidcToken throws an exception', async () => {
  const secret = 'a'.repeat(32);
  const previousSecret = process.env.CRON_SECRET;
  process.env.CRON_SECRET = secret;

  let passedOidcToken = null;

  const mockRunner = async ({oidcToken}) => {
    passedOidcToken = oidcToken;
    return {status: 'completed', completed: 0};
  };

  try {
    const request = new Request('https://router.example/api/cron/maintenance', {
      headers: {Authorization: `Bearer ${secret}`},
    });

    const response = await GET(request, {
      getOidcToken: async () => {
        throw new Error('Vercel OIDC token provider is unconfigured or rejected');
      },
      store: {id: 'test-store'},
      runner: mockRunner,
    });

    assert.equal(response.status, 200);
    assert.equal(response.headers.get('Cache-Control'), 'no-store');
    const data = await response.json();
    assert.deepEqual(data, {status: 'completed', completed: 0});
    assert.equal(passedOidcToken, '');
  } finally {
    if (previousSecret !== undefined) process.env.CRON_SECRET = previousSecret;
    else delete process.env.CRON_SECRET;
  }
});

test('cron maintenance route degrades gracefully when default getVercelOidcToken throws', async () => {
  const secret = 'a'.repeat(32);
  const previousSecret = process.env.CRON_SECRET;
  process.env.CRON_SECRET = secret;

  let passedOidcToken = null;

  const mockRunner = async ({oidcToken}) => {
    passedOidcToken = oidcToken;
    return {status: 'completed', completed: 1};
  };

  try {
    const request = new Request('https://router.example/api/cron/maintenance', {
      headers: {Authorization: `Bearer ${secret}`},
    });

    // When options object does not supply getOidcToken, default getVercelOidcToken is called.
    // In unconfigured test env, getVercelOidcToken throws, which route catches and sets oidcToken=''.
    const response = await GET(request, {
      store: {id: 'test-store'},
      runner: mockRunner,
    });

    assert.equal(response.status, 200);
    assert.equal(response.headers.get('Cache-Control'), 'no-store');
    const data = await response.json();
    assert.deepEqual(data, {status: 'completed', completed: 1});
    assert.equal(passedOidcToken, '');
  } finally {
    if (previousSecret !== undefined) process.env.CRON_SECRET = previousSecret;
    else delete process.env.CRON_SECRET;
  }
});

test('cron maintenance route rejects unauthorized requests when CRON_SECRET is invalid or missing', async () => {
  const secret = 'a'.repeat(32);
  const previousSecret = process.env.CRON_SECRET;
  process.env.CRON_SECRET = secret;

  try {
    const requestMissingHeader = new Request('https://router.example/api/cron/maintenance');
    const responseMissing = await GET(requestMissingHeader, {
      getOidcToken: async () => 'should-not-be-called',
      runner: async () => { throw new Error('runner should not be invoked'); },
    });
    assert.equal(responseMissing.status, 401);
    assert.deepEqual(await responseMissing.json(), {error: 'unauthorized'});

    const requestWrongHeader = new Request('https://router.example/api/cron/maintenance', {
      headers: {Authorization: 'Bearer wrong-secret'},
    });
    const responseWrong = await GET(requestWrongHeader, {
      getOidcToken: async () => 'should-not-be-called',
      runner: async () => { throw new Error('runner should not be invoked'); },
    });
    assert.equal(responseWrong.status, 401);
    assert.deepEqual(await responseWrong.json(), {error: 'unauthorized'});
  } finally {
    if (previousSecret !== undefined) process.env.CRON_SECRET = previousSecret;
    else delete process.env.CRON_SECRET;
  }
});
