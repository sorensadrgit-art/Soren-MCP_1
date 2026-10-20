import test from 'node:test';
import assert from 'node:assert/strict';
import {canonicalSkillIdentity, safeSkillPath, prepareSkillVersion, verifyPrivateFile} from '../../lib/registry/identity.mjs';
const source = {repository: 'https://github.com/Owner/Repository.git', directory: 'skills/a', revision: 'a'.repeat(40), license: 'MIT', files: [{path: 'SKILL.md', content: 'Instructions'}, {path: 'notes/info.md', content: 'support'}]};

test('canonical repository/path identity distinguishes nested paths and rejects mutable branch URLs', () => {
  assert.deepEqual(canonicalSkillIdentity(source.repository, source.directory), {repository: 'https://github.com/owner/repository', directory: 'skills/a'});
  assert.notDeepEqual(canonicalSkillIdentity(source.repository, 'skills/a'), canonicalSkillIdentity(source.repository, 'skills/b'));
  for (const repository of ['https://github.com/owner/repository/tree/main', 'https://user:secret@github.com/a/b', 'http://github.com/a/b', 'https://127.0.0.1/a/b', 'https://github.com/owner/a/%2e%2e/repo']) {
    assert.throws(() => canonicalSkillIdentity(repository, 'skills/a'));
  }
});

test('file and repository paths reject encoded traversal, absolute paths, backslashes and alternate streams', () => {
  for (const path of ['../SKILL.md', '/SKILL.md', 'a/../../SKILL.md', 'a\\SKILL.md', 'C:/SKILL.md', '%2e%2e/SKILL.md', 'SKILL.md:secret', 'a//SKILL.md', 'a/./SKILL.md', 'a. /SKILL.md']) assert.throws(() => safeSkillPath(path), path);
});

test('changed instruction or supporting bytes change exact manifest identity', () => {
  const first = prepareSkillVersion(source);
  const changed = prepareSkillVersion({...source, files: [{path: 'SKILL.md', content: 'changed'}, source.files[1]]});
  const assetChanged = prepareSkillVersion({...source, files: [source.files[0], {path: 'notes/info.md', content: 'changed'}]});
  assert.notEqual(first.manifestSha256, changed.manifestSha256); assert.notEqual(first.manifestSha256, assetChanged.manifestSha256);
  assert.throws(() => prepareSkillVersion({...source, revision: 'main'}));
  assert.throws(() => prepareSkillVersion({...source, files: [source.files[0], source.files[0]]}));
  assert.throws(() => prepareSkillVersion({...source, files: [{path: 'SKILL.md', content: 'x'.repeat(60001)}]}));
  assert.throws(() => prepareSkillVersion({...source, files: [{path: 'SKILL.md', content: 'data', mediaType: {invalid: true}}]}));
});

test('private retrieval verifies exact immutable manifest and individual declared file integrity', () => {
  const version = prepareSkillVersion(source);
  const record = {...version, revision: source.revision};
  assert.equal(verifyPrivateFile(record, 'SKILL.md', version.manifestSha256).content, 'Instructions');
  assert.throws(() => verifyPrivateFile(record, 'other.md', version.manifestSha256), error => error.status === 404);
  assert.throws(() => verifyPrivateFile(record, 'SKILL.md', 'c'.repeat(64)), error => error.status === 403);
  assert.throws(() => verifyPrivateFile({...record, files: record.files.map(file => file.path === 'SKILL.md' ? {...file, contentBase64: 'Y29ycnVwdA=='} : file)}, 'SKILL.md', version.manifestSha256), error => error.status === 503);
  assert.throws(() => verifyPrivateFile({...record, manifest: {...record.manifest, license: 'changed'}}, 'SKILL.md', version.manifestSha256), error => error.status === 503);
});
