export function canonicalSkillIdentity(record) {
  try {
    const url = new URL(record.repositoryUrl);
    if (url.protocol !== 'https:' || url.hostname !== 'github.com' || url.port || url.username || url.password || url.search || url.hash) return null;
    const repository = url.pathname.replace(/\.git$/, '').replace(/\/$/, '').toLowerCase();
    if (!/^\/[a-z0-9_.-]+\/[a-z0-9_.-]+$/.test(repository) || repository.split('/').some(x => x === '.' || x === '..')) return null;
    const path = record.skillPath;
    if (typeof path !== 'string' || !path || path.length > 240 || path.includes('\\') || path.includes('%') || path.startsWith('/') || path.split('/').some(x => !x || x === '.' || x === '..')) return null;
    if (!/^[a-f0-9]{40}$/.test(record.resolvedCommit || '') || !/^[a-f0-9]{64}$/.test(record.manifestSha256 || '')) return null;
    return {repositoryUrl:'https://github.com' + repository,skillPath:path,resolvedCommit:record.resolvedCommit,manifestSha256:record.manifestSha256};
  } catch { return null; }
}

export function candidateIdentityKey(candidate) {
  const identity = canonicalSkillIdentity(candidate.identity || candidate);
  return identity ? JSON.stringify(identity) : 'provisional:' + candidate.provider + ':' + candidate.id;
}
