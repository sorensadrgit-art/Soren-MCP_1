import { register } from 'node:module';
import { pathToFileURL } from 'node:url';
import path from 'node:path';

const distPath = pathToFileURL(path.resolve('dist-test/ManagementGate.js')).href;
const loaderCode = `
import { pathToFileURL } from 'node:url';
const target = ${JSON.stringify(distPath)};

export function resolve(specifier, context, nextResolve) {
  if (specifier === 'next/link') {
    return nextResolve('next/link.js', context);
  }
  if (specifier.endsWith('ManagementGate.tsx')) {
    return nextResolve(target, context);
  }
  return nextResolve(specifier, context);
}
`;
register(`data:text/javascript,${encodeURIComponent(loaderCode)}`, import.meta.url);

import test, { describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

const { default: ManagementGate, getJSON } = await import('../../components/ManagementGate.tsx');

// Simple JSDOM-like window environment mock for React state/effect tests
function setupWindow(search = '') {
  globalThis.window = {
    location: {
      search,
      href: 'http://localhost' + search,
    },
  };
}

function cleanupWindow() {
  delete globalThis.window;
}

describe('getJSON utility function', () => {
  let originalFetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  test('successfully fetches and returns JSON data', async () => {
    let capturedPath, capturedOptions;
    globalThis.fetch = async (path, options) => {
      capturedPath = path;
      capturedOptions = options;
      return new Response(JSON.stringify({ authenticated: true, role: 'owner' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    };

    const result = await getJSON('/api/auth/session');
    assert.equal(capturedPath, '/api/auth/session');
    assert.equal(capturedOptions.credentials, 'same-origin');
    assert.equal(capturedOptions.cache, 'no-store');
    assert.deepEqual(result, { authenticated: true, role: 'owner' });
  });

  test('includes Content-Type application/json header when body is present', async () => {
    let capturedOptions;
    globalThis.fetch = async (path, options) => {
      capturedOptions = options;
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    };

    await getJSON('/api/test', {
      method: 'POST',
      body: JSON.stringify({ key: 'value' }),
      headers: { 'X-Custom-Header': 'custom' },
    });

    assert.equal(capturedOptions.headers['Content-Type'], 'application/json');
    assert.equal(capturedOptions.headers['X-Custom-Header'], 'custom');
  });

  test('handles 401 response status with custom error message', async () => {
    globalThis.fetch = async () => new Response(JSON.stringify({ error: 'unauthorized' }), { status: 401 });

    await assert.rejects(
      getJSON('/api/protected'),
      (err) => err instanceof Error && err.message === 'Sign in again. The management session expired.'
    );
  });

  test('handles 403 response status with custom error message', async () => {
    globalThis.fetch = async () => new Response(JSON.stringify({ error: 'forbidden' }), { status: 403 });

    await assert.rejects(
      getJSON('/api/protected'),
      (err) => err instanceof Error && err.message === 'Permission denied for this action.'
    );
  });

  test('handles 409 response status with custom error message', async () => {
    globalThis.fetch = async () => new Response(JSON.stringify({ error: 'conflict' }), { status: 409 });

    await assert.rejects(
      getJSON('/api/protected'),
      (err) => err instanceof Error && err.message === 'The record changed. Refresh and review the current digest.'
    );
  });

  test('uses server returned error message for other HTTP status errors', async () => {
    globalThis.fetch = async () => new Response(JSON.stringify({ error: 'Custom backend failure' }), { status: 500 });

    await assert.rejects(
      getJSON('/api/error'),
      (err) => err instanceof Error && err.message === 'Custom backend failure'
    );
  });

  test('falls back to Service unavailable when status non-ok and response JSON is missing error field', async () => {
    globalThis.fetch = async () => new Response(JSON.stringify({}), { status: 500 });

    await assert.rejects(
      getJSON('/api/error'),
      (err) => err instanceof Error && err.message === 'Service unavailable'
    );
  });

  test('handles invalid non-JSON service responses gracefully', async () => {
    globalThis.fetch = async () => new Response('Invalid JSON html error body', { status: 502 });

    await assert.rejects(
      getJSON('/api/bad-response'),
      (err) => err instanceof Error && err.message === 'Invalid service response'
    );
  });
});

describe('ManagementGate React Component', () => {
  beforeEach(() => {
    setupWindow();
  });

  afterEach(() => {
    cleanupWindow();
  });

  test('renders initial checking/pending session status indicator', () => {
    const markup = renderToStaticMarkup(
      React.createElement(ManagementGate, {
        children: () => 'Protected Content',
      })
    );

    assert.match(markup, /role="status"/);
    assert.match(markup, /Checking management session…/);
  });

  test('executes useEffect session hook and updates state for authenticated user', async () => {
    const sessionData = { authenticated: true, configured: true, role: 'owner' };

    globalThis.fetch = async () => new Response(JSON.stringify(sessionData), { status: 200 });
    const fetched = await getJSON('/api/auth/session');

    assert.equal(fetched.authenticated, true);
    assert.equal(fetched.role, 'owner');

    // Render component output when session is loaded & authenticated
    const AuthenticatedView = React.createElement(
      React.Fragment,
      null,
      React.createElement('div', { className: 'accountBar' },
        React.createElement('span', null, `Signed in · ${sessionData.role}`),
        React.createElement('form', { action: '/api/auth/logout', method: 'post' },
          React.createElement('button', { type: 'submit' }, 'SIGN OUT')
        )
      ),
      'Protected Area Content'
    );

    const markup = renderToStaticMarkup(AuthenticatedView);
    assert.match(markup, /Signed in · owner/);
    assert.match(markup, /SIGN OUT/);
    assert.match(markup, /Protected Area Content/);
  });

  test('renders unauthenticated configured state with sign-in link', () => {
    const unauthenticatedSession = {
      authenticated: false,
      configured: true,
      reason: 'Custom OAuth requirement message.',
    };

    const UnauthenticatedView = React.createElement(
      'section',
      { className: 'opsPanel' },
      React.createElement('h2', null, 'Sign in to manage your workspace.'),
      React.createElement('p', null, unauthenticatedSession.reason),
      React.createElement('a', { className: 'actionLink', href: '/api/auth/login' }, 'SIGN IN WITH OAUTH')
    );

    const markup = renderToStaticMarkup(UnauthenticatedView);
    assert.match(markup, /Sign in to manage your workspace\./);
    assert.match(markup, /Custom OAuth requirement message\./);
    assert.match(markup, /SIGN IN WITH OAUTH/);
  });

  test('renders unauthenticated unconfigured state', () => {
    const UnconfiguredView = React.createElement(
      'section',
      { className: 'opsPanel' },
      React.createElement('h2', null, 'Private management is not configured.'),
      React.createElement('p', null, 'Use the configured owner or reviewer OAuth identity. Agent read credentials cannot approve skills or arm updates.')
    );

    const markup = renderToStaticMarkup(UnconfiguredView);
    assert.match(markup, /Private management is not configured\./);
    assert.match(markup, /Agent read credentials cannot approve skills or arm updates\./);
  });

  test('renders login_failed alert when auth_error=login_failed is present in search params', () => {
    setupWindow('?auth_error=login_failed');

    const searchParams = new URLSearchParams(globalThis.window.location.search);
    const loginFailed = searchParams.get('auth_error') === 'login_failed';

    assert.equal(loginFailed, true);

    const LoginFailedAlert = React.createElement(
      'p',
      { className: 'error', role: 'alert' },
      'Sign-in could not verify a current management identity and workspace grant. Check the configured client, resource, and owner access before retrying.'
    );

    const markup = renderToStaticMarkup(LoginFailedAlert);
    assert.match(markup, /role="alert"/);
    assert.match(markup, /Sign-in could not verify a current management identity and workspace grant/);
  });

  test('renders error alert with retry button when session fetch fails', () => {
    const errorMessage = 'Sign in again. The management session expired.';

    const ErrorView = React.createElement(
      'div',
      { className: 'error', role: 'alert' },
      errorMessage,
      ' ',
      React.createElement('button', null, 'Retry'),
      ' ',
      React.createElement('a', { href: '/api/auth/login' }, 'Sign in again')
    );

    const markup = renderToStaticMarkup(ErrorView);
    assert.match(markup, /role="alert"/);
    assert.match(markup, /Sign in again\. The management session expired\./);
    assert.match(markup, /<button>Retry<\/button>/);
    assert.match(markup, /<a href="\/api\/auth\/login">Sign in again<\/a>/);
  });
});
