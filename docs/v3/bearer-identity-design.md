# Bearer identity design: Supabase OAuth 2.1 + custom access token hook

Status: **designed, not enabled.** Nothing in this document is applied to production. The production MCP keeps no store and no identity configuration, so a request carrying an `Authorization` header still fails closed: 401 for a malformed header, 503 without a store, 403 for a valid token that is not authorized. Enabling this design anywhere needs the owner's explicit approval; for production it is folded into `docs/v3/production-activation.md`.

## What the gateway validates today

`lib/security/auth.mjs` accepts a bearer token only when every check passes:

1. `POST {SUPABASE_URL}/auth/v1/user` accepts the raw token. Supabase validates the signature, the session and revocation; the application never verifies signatures itself.
2. `claims.sub` equals the user id returned by that endpoint, and `claims.iss` equals `{SUPABASE_URL}/auth/v1`.
3. `aud` includes `SOREN_AUTH_AUDIENCE`; `exp` is finite and in the future; `nbf`, when present, is not in the future.
4. `claims.resource` string-equals `SOREN_AUTH_RESOURCE` (an RFC 8707-style sender-constrained binding; it is an identifier, never a fetched URL).
5. `claims.client_id` is one of the comma-separated values in `SOREN_AUTH_CLIENT_ID`.
6. The store resolves `(issuer, subject, client_id)` to an active workspace membership, and the required permission is present in the principal's grants.

Human and owner operations additionally require `client_id == SOREN_MANAGEMENT_CLIENT_ID`, a human principal with the right role, a fresh `auth_time`, and the management origin for writes.

Supabase Auth access tokens satisfy checks 1 to 3 natively (`iss`, `sub`, `aud: "authenticated"`, `exp`, `iat`, `role`, `aal`, `session_id`, and the other required claims). They do **not** carry `resource`, and they carry `client_id` only when issued through the OAuth 2.1 server. Password and session tokens therefore fail checks 4 and 5 today. That is the fail-closed gap this design closes.

## The two Supabase features used

| Feature | Availability | What it provides |
|---|---|---|
| [OAuth 2.1 authorization server](https://supabase.com/docs/guides/auth/oauth-server/getting-started) (beta) | All plans; no separate charge; users count toward MAU | OAuth 2.1 with PKCE, registered clients, access tokens that natively carry the `client_id` claim, discovery at `/.well-known/oauth-authorization-server`, JWKS, and optional dynamic client registration for MCP clients ([MCP authentication](https://supabase.com/docs/guides/auth/oauth-server/mcp-authentication)) |
| [Custom access token hook](https://supabase.com/docs/guides/auth/auth-hooks/custom-access-token-hook) | Free and Pro | Runs before every token issuance, may add or override claims (the required claims cannot be removed), and can read `client_id` on OAuth-flow tokens and the user's `app_metadata` |

Asymmetric signing keys (ES256) are the plan for the non-production store independently, and are required anyway if OpenID Connect ID tokens are ever issued.

## Hook design

```sql
-- Design artifact. Apply only to the non-production project, with owner approval.
-- <SOREN_AUTH_RESOURCE> is the exact resource identifier the gateway runtime will be configured with.
create or replace function public.custom_access_token_hook(event jsonb)
returns jsonb
language plpgsql
as $$
declare
  claims jsonb := event->'claims';
  client_id text := coalesce(claims->>'client_id', claims->'app_metadata'->>'client_id');
begin
  if client_id is null then
    return jsonb_build_object('error', jsonb_build_object('http_code', 400, 'message', 'token has no client binding'));
  end if;
  claims := jsonb_set(claims, '{client_id}', to_jsonb(client_id));
  claims := jsonb_set(claims, '{resource}', to_jsonb('<SOREN_AUTH_RESOURCE>'));
  return jsonb_build_object('claims', claims);
end $$;
grant execute on function public.custom_access_token_hook to supabase_auth_admin;
grant usage on schema public to supabase_auth_admin;
revoke execute on function public.custom_access_token_hook from authenticated, anon, public;
```

- Required claims (`iss`, `aud`, `exp`, `iat`, `sub`, `role`, `aal`, `session_id`, `email`, `phone`, `is_anonymous`) are never touched; Supabase rejects a token without them.
- `client_id` preference order: keep the OAuth-issued value, which proves a registered OAuth client; fall back to the user's `app_metadata.client_id`, an owner-assigned per-user binding, only for non-OAuth issuances such as the password grant used in non-production tests.
- The hook only binds claims. It grants nothing: authorization still comes from the store's `get_principal_context` and the principal's grants.
- Deployment: create the function in the non-production project, then select it as the Custom Access Token hook (Authentication, Hooks). The grants above are the documented security model; the function is not callable through the Data API.

## Binding decisions

- **`aud`**: keep Supabase's `authenticated`; set `SOREN_AUTH_AUDIENCE=authenticated` on the gateway runtime.
- **`resource`**: exact-match string. Production uses `https://<production-domain>/api/mcp`. The non-production preview uses a stable identifier, because each preview deployment has a different unique URL: `https://soren-mcp-v3-preview.vercel.app/api/mcp`. The string is a binding, not a fetched URL, so the removed project domain does not matter.
- **`client_id` values**: one per client application. Non-production: `agent-probe` for the seeded agent and `management` for the owner. Production: one OAuth client per client application and environment, registered in the dashboard.

## Non-production rollout (needs owner approval)

1. Enable the OAuth 2.1 server (Authentication, OAuth Server) and record the authorization path.
2. Register a confidential OAuth client for the agent; record its client id. Dynamic client registration stays off unless MCP-client login is exercised deliberately.
3. Deploy the hook with the non-production resource identifier and enable it.
4. Sign in with the seeded test agent's password grant: the returned access token now carries `client_id` and `resource`.
5. Call the protected preview MCP with `Authorization: Bearer <token>`: the gateway resolves the seeded agent principal, requires the `skills:read` grant, and meters federation budgets under the principal's identity. Revoking or expiring the grant denies the next request.

## Production (explicitly not enabled)

The same shape, with a consent UI for the authorization path, one OAuth client per environment, `resource` set to the production MCP URL, short token lifetimes and refresh rotation. It enters production only through the activation plan's approval chain.

## Security notes

- Verification is always delegated to Supabase's `/auth/v1/user`; the application only enforces claim binding afterwards. No local signature verification is introduced.
- Private signing material (the imported ES256 private JWK) stays out of project source, agent logs and deployment bundles; only the public JWK and key id are recordable.
- The public gateway never holds the service-role key; the runtime uses the `soren_gateway`-scoped key with its five RPCs only.
