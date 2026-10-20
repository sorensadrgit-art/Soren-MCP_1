# Release identity

The application package remains `1.0.0`. The public MCP protocol implementation remains `2.2.0`. These identifiers have separate existing consumers. A protocol version is not a package or release version.

Every implementation build also records the immutable source commit, lockfile SHA-256, policy SHA-256, artifact SHA-256, Vercel project/environment, expected parent deployment, schema compatibility and catalog generation. A reviewed manifest binds those identities. The runtime does not infer secure ordering from a semantic version: the durable owner-managed release sequence and minimum secure sequence govern rollback eligibility.

No deployable manifest or signing key is checked in as an example. Create the first real manifest only from an owner-reviewed cloud build and authentic provenance. `release/trust.example.json` is disabled and cannot authorize a release.
