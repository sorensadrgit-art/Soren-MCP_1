import {createHash} from 'node:crypto';
import {HttpError} from '../security/auth.mjs';

export const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
export const isDigest = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
export const isUuid = value => typeof value === 'string' && /^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(value);
export const canonicalJson = value => JSON.stringify(value, function (key, item) {
  if (item && typeof item === 'object' && !Array.isArray(item)) return Object.fromEntries(Object.keys(item).sort().map(name => [name, item[name]]));
  return item;
});

export function safeSkillPath(value) {
  if (typeof value !== 'string' || !value || value.length > 512 || /[%\\\0:\x00-\x1f]/.test(value) || value.startsWith('/') || value.endsWith('/')) throw new HttpError(400, 'invalid_skill_path');
  if (value.split('/').some(part => !part || part === '.' || part === '..' || part.endsWith('.') || part.endsWith(' '))) throw new HttpError(400, 'invalid_skill_path');
  return value;
}

export function canonicalSkillIdentity(repository, directory) {
  if (typeof repository !== 'string' || repository.length > 2048 || /[%\\\x00-\x20]/.test(repository)) throw new HttpError(400, 'invalid_repository');
  let url;
  try { url = new URL(repository); } catch { throw new HttpError(400, 'invalid_repository'); }
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash || url.port || !['github.com', 'gitlab.com', 'bitbucket.org'].includes(url.hostname.toLowerCase())) throw new HttpError(400, 'invalid_repository');
  const parts = url.pathname.replace(/\/$/, '').replace(/\.git$/, '').split('/').filter(Boolean);
  if (parts.length < 2 || (url.hostname !== 'gitlab.com' && parts.length !== 2) || parts.some(part => !/^[a-zA-Z0-9_.-]+$/.test(part) || ['.', '..', 'tree', 'blob', '-'].includes(part))) throw new HttpError(400, 'invalid_repository');
  // Repository names on supported providers are case-insensitive; skill paths remain case-sensitive.
  return {repository: `https://${url.hostname.toLowerCase()}/${parts.join('/').toLowerCase()}`, directory: safeSkillPath(directory)};
}

export function prepareSkillVersion({repository, directory, revision, license, capabilities = [], files}) {
  const identity = canonicalSkillIdentity(repository, directory);
  if (!/^[a-f0-9]{40,64}$/.test(revision || '') || typeof license !== 'string' || !license.trim() || license.length > 256 || !Array.isArray(capabilities) || capabilities.length > 128 || capabilities.some(value => typeof value !== 'string' || value.length > 128)) throw new HttpError(400, 'invalid_version');
  if (!Array.isArray(files) || files.length < 1 || files.length > 128) throw new HttpError(400, 'invalid_files');
  let total = 0; const seen = new Set();
  const prepared = files.map(file => {
    const path = safeSkillPath(file.path);
    if (seen.has(path)) throw new HttpError(400, 'duplicate_skill_path');
    seen.add(path);
    if (typeof file.content !== 'string') throw new HttpError(400, 'invalid_file_content');
    if (file.mediaType != null && (typeof file.mediaType !== 'string' || file.mediaType.length > 100 || !/^[a-z0-9.+-]+\/[a-z0-9.+-]+(?:;charset=utf-8)?$/i.test(file.mediaType))) throw new HttpError(400, 'invalid_media_type');
    const bytes = Buffer.from(file.content, 'utf8');
    if (bytes.length > 60000 || (total += bytes.length) > 2097152) throw new HttpError(413, 'skill_package_too_large');
    return {path, sha256: sha256(bytes), byteCount: bytes.length, mediaType: file.mediaType || 'text/plain', contentBase64: bytes.toString('base64')};
  }).sort((a, b) => a.path.localeCompare(b.path, 'en'));
  if (!seen.has('SKILL.md')) throw new HttpError(400, 'skill_entry_required');
  const manifest = {schemaVersion: 1, ...identity, revision, license, capabilities: [...new Set(capabilities)].sort(), files: prepared.map(({contentBase64, ...file}) => file)};
  return {manifest, manifestSha256: sha256(canonicalJson(manifest)), files: prepared};
}

export function verifyPrivateFile(record, path, expectedManifestSha256) {
  safeSkillPath(path);
  if (!isDigest(expectedManifestSha256) || !record || record.manifestSha256 !== expectedManifestSha256) throw new HttpError(403, 'version_not_available');
  if (sha256(canonicalJson(record.manifest)) !== expectedManifestSha256) throw new HttpError(503, 'manifest_integrity_failure');
  const file = record.files?.find(item => item.path === path);
  const declared = record.manifest?.files?.find(item => item.path === path);
  if (!file || !declared || file.sha256 !== declared.sha256 || file.byteCount !== declared.byteCount) throw new HttpError(404, 'file_not_in_manifest');
  const bytes = Buffer.from(file.contentBase64 || '', 'base64');
  if (bytes.length !== declared.byteCount || bytes.length > 60000 || sha256(bytes) !== declared.sha256) throw new HttpError(503, 'file_integrity_failure');
  return {content: bytes.toString('utf8'), path, sha256: declared.sha256, revision: record.revision, manifestSha256: expectedManifestSha256, mediaType: declared.mediaType};
}
