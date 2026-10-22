# Knowledge governance

The knowledge catalog (`catalog/knowledge.json`) is the only source for `search_knowledge`, the docs section of `plan_toolchain`, and `soren://knowledge/*` resources. Entries are summaries that point at canonical sources. They do not replace the docs.

## Rules for an entry

- **Official first.** `canonicalSource.url` is the vendor's documentation, specification or repository, with `official: true`. Third-party sources may appear only as secondary context and are labeled.
- **Provenance.** `retrievedAt`, `lastVerifiedAt`, `reviewer`, `approved`, `license`, `sourceRevision` (release, tag or page revision where available).
- **Versions.** `packageRange` (semver ranges per npm package), `frameworkVersions`, `channel` (`stable`, `beta`, `alpha`, `canary`). Prerelease entries are surfaced only when the project declares a matching prerelease or the profile asks for them.
- **Context7.** `context7LibraryId` when one exists, so agents can fetch version-matched docs natively.
- **Freshness.** `expiryPolicy.maxAgeDays` (default 180) and `invalidateOn` (`package-major`, `upstream-release`). Expired entries are returned with `freshness.status: "stale"` and a warning; they are never silently dropped or treated as current.
- **No secrets, private URLs, or copied documentation bodies.** Summaries and key points are written in our own words.

## Hashing

`contentSha256` covers the reviewed fields: id, kind, title, summary, keyPoints, topics, canonicalSource, sourceRevision, packageRange, frameworkVersions, channel, context7LibraryId, license and warnings (`lib/knowledge/catalog.mjs`). Any edit to those fields changes the hash.

```bash
npm run knowledge:hash            # fails (exit 1) and lists ids whose stored hash drifted
node scripts/knowledge-hash.mjs --write   # recompute after a reviewed edit
npm run test:knowledge            # schema, cross-references, hashes, freshness, search
```

A hash mismatch in CI means someone changed reviewed content without re-review.

## Adding or updating an entry

1. Fetch the canonical source and confirm it returns HTTP 200. Note the release or revision.
2. Write the entry; link it to skills and recipes through `linkedSkills` and `linkedRecipes`.
3. Run `node scripts/knowledge-hash.mjs --write`, then `npm run test:knowledge`.
4. Update `lastVerifiedAt` only when the source was actually re-read.
5. Review the diff like code. The reviewer is recorded in the entry.

## Progressive retrieval

Agents should use the cheapest reliable source first:

1. Project lockfile and bundled docs (for Next.js 16: `node_modules/next/dist/docs/`).
2. `search_knowledge` for orientation and the canonical URL.
3. Context7 `query-docs` with the version-pinned library ID, one concept per call.
4. The canonical page itself.
5. Firecrawl or general web search only when the above lack coverage, and only for public pages.

## Expiry review

Entries reach `stale` after `maxAgeDays`, or when a package major or upstream release invalidates them. On review: re-fetch, update summary and ranges, re-hash, and set `lastVerifiedAt`. If the source moved or was removed, mark the entry with a warning, then replace or retire it in the same change.
