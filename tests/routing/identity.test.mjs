import test from 'node:test';
import assert from 'node:assert/strict';
import {canonicalSkillIdentity,candidateIdentityKey} from '../../lib/routing/identity.mjs';
const ref={repositoryUrl:'https://github.com/Owner/Repo.git',skillPath:'nested/skills/review',resolvedCommit:'a'.repeat(40),manifestSha256:'b'.repeat(64)};
test('canonical identity binds repository, nested path, exact commit and bytes',()=>{
  assert.equal(canonicalSkillIdentity(ref).repositoryUrl,'https://github.com/owner/repo');
  for(const change of [{resolvedCommit:'feature/branch'},{skillPath:'../secret'},{skillPath:'a/../../x'},{skillPath:'%2e%2e/x'},{repositoryUrl:'https://evil.test/owner/repo'}]) assert.equal(canonicalSkillIdentity({...ref,...change}),null);
  assert.notEqual(candidateIdentityKey({identity:ref}),candidateIdentityKey({identity:{...ref,skillPath:'other/review'}}));
});
test('unresolved equal names remain separate provisional identities',()=>{
  assert.notEqual(candidateIdentityKey({provider:'skillsmp',id:'a',name:'review'}),candidateIdentityKey({provider:'skills_sh',id:'b',name:'review'}));
});
