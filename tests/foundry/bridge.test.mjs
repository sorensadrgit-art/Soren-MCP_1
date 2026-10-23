import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {parseSkillMetadata, stageFoundrySkill, approveFoundrySkill, verifyFoundryRegistry} from '../../lib/foundry/bridge.mjs';
import {selectApprovedFoundrySkills} from '../../lib/foundry/registry.mjs';

const THIS_REPO=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const CONTENT='---\nname: spline-cinematic-workflow\ndescription: "Build responsive Spline 3D scenes with cinematic GSAP animation."\n---\n# Spline workflow\n\nCreate, optimize and test accessible Spline scenes.\n';
function fixture(t,markdown=CONTENT){
  const projectRoot=fs.mkdtempSync(path.join(os.tmpdir(),'soren-foundry-test-'));
  t.after(()=>fs.rmSync(projectRoot,{recursive:true,force:true}));
  fs.mkdirSync(path.join(projectRoot,'incoming'),{recursive:true});
  const skillFile=path.join(projectRoot,'incoming','SKILL.md');
  const evidenceFile=path.join(projectRoot,'incoming','release-check.json');
  fs.writeFileSync(skillFile,markdown);
  fs.writeFileSync(evidenceFile,JSON.stringify({producer:'Skill Foundry Core V3',releaseCheck:{sha256:'a'.repeat(64)}}));
  return {projectRoot,skillFile,evidenceFile};
}
function approvedFromFixture(state){
  const registry=path.join(state.projectRoot,'catalog','foundry-approved.json');
  const records=fs.existsSync(registry)?JSON.parse(fs.readFileSync(registry,'utf8')):[];
  return selectApprovedFoundrySkills(records,[],name=>fs.readFileSync(path.join(state.projectRoot,'skills',name,'SKILL.md')));
}
function prepareRuntimeCopy(state){
  const lib=path.join(state.projectRoot,'lib');
  fs.mkdirSync(path.join(lib,'foundry'),{recursive:true});
  for(const file of ['catalog.mjs','foundry/registry.mjs','foundry/metadata.mjs']){
    const destination=path.join(lib,file);
    fs.copyFileSync(path.join(THIS_REPO,'lib',file),destination);
  }
  const registry=path.join(state.projectRoot,'catalog','foundry-approved.json');
  fs.mkdirSync(path.dirname(registry),{recursive:true});
  if(!fs.existsSync(registry))fs.writeFileSync(registry,'[]\n');
  fs.writeFileSync(path.join(state.projectRoot,'package.json'),'{"type":"module"}\n');
  return pathToFileURL(path.join(lib,'catalog.mjs')).href;
}
function approve(state,staged,extra={}){
  return approveFoundrySkill({...state,name:staged.name,skillSha256:staged.skillSha256,
    evidenceSha256:staged.evidenceSha256,reviewer:'owner',confirmManualReview:true,...extra});
}

test('parses strict SKILL.md frontmatter and derives useful routing tags',()=>{
  const data=parseSkillMetadata(CONTENT);
  assert.equal(data.name,'spline-cinematic-workflow');
  assert.match(data.description,/Spline 3D/);
  assert.ok(data.tags.includes('spline'));
  assert.ok(data.tags.includes('gsap'));
  assert.throws(()=>parseSkillMetadata('---\nname: ../evil\ndescription: X\n---\nhi'),/name/i);
  assert.throws(()=>parseSkillMetadata('name: missing-frontmatter'),/frontmatter/i);
  assert.throws(()=>parseSkillMetadata('---\nname: safe-skill\ndescription: malformed\n---\n'),/body/i);
});

test('staging is review-only; not visible to approved registry or router',t=>{
  const state=fixture(t);
  const staged=stageFoundrySkill(state);
  assert.equal(staged.status,'pending_review');
  assert.equal(staged.name,'spline-cinematic-workflow');
  assert.match(staged.skillSha256,/^[a-f0-9]{64}$/);
  assert.match(staged.evidenceSha256,/^[a-f0-9]{64}$/);
  assert.deepEqual(approvedFromFixture(state),[]);
  assert.equal(verifyFoundryRegistry(state.projectRoot).valid,true);
  assert.equal(fs.existsSync(path.join(state.projectRoot,'skills',staged.name,'SKILL.md')),false);
  assert.throws(()=>stageFoundrySkill(state),/already staged/i);
});

test('approval requires explicit reviewer confirmation and both exact digests',t=>{
  const state=fixture(t);
  const staged=stageFoundrySkill(state);
  assert.throws(()=>approveFoundrySkill({...state,name:staged.name,skillSha256:staged.skillSha256,evidenceSha256:staged.evidenceSha256,reviewer:'owner'}),/explicit|confirm/i);
  assert.throws(()=>approve(state,staged,{skillSha256:'0'.repeat(64)}),/hash|digest/i);
  assert.throws(()=>approve(state,staged,{evidenceSha256:'0'.repeat(64)}),/hash|digest/i);
  const approved=approve(state,staged);
  assert.equal(approved.status,'curated');
  assert.equal(approved.name,staged.name);
  assert.equal(verifyFoundryRegistry(state.projectRoot).valid,true);
  assert.equal(approvedFromFixture(state).length,1);
  assert.throws(()=>approve(state,staged),/already approved|already exists/i);
});

test('runtime fails closed after tampering with approved SKILL.md',t=>{
  const state=fixture(t);
  const staged=stageFoundrySkill(state);
  approve(state,staged);
  const file=path.join(state.projectRoot,'skills',staged.name,'SKILL.md');
  fs.appendFileSync(file,'\nExternal instructions injected after approval.\n');
  const report=verifyFoundryRegistry(state.projectRoot);
  assert.equal(report.valid,false);
  assert.match(report.errors.join(' '),/sha256|hash|content/i);
  assert.deepEqual(approvedFromFixture(state),[]);
});

test('cannot shadow an existing curated skill with a Foundry import',t=>{
  const state=fixture(t);
  const staged=stageFoundrySkill(state);
  assert.throws(()=>approveFoundrySkill({...state,name:staged.name,skillSha256:staged.skillSha256,evidenceSha256:staged.evidenceSha256,reviewer:'owner',confirmManualReview:true,existingNames:[staged.name]}),/existing|collision/i);
});

test('fresh-router process sees only fully reviewed, hash-matched Foundry skills',t=>{
  const state=fixture(t);
  const staged=stageFoundrySkill(state);
  const code="import {SKILLS,routeTask} from "+JSON.stringify(prepareRuntimeCopy(state))+"; console.log(JSON.stringify({count:SKILLS.length,primary:routeTask('Build Spline cinematic GSAP workflow').primary?.name}));";
  const run=()=>spawnSync(process.execPath,['--input-type=module','--eval',code],{cwd:state.projectRoot,encoding:'utf8'});
  const before=run();
  assert.equal(before.status,0,before.stderr);
  assert.notEqual(JSON.parse(before.stdout).primary,staged.name);
  approve(state,staged);
  const after=run();
  assert.equal(after.status,0,after.stderr);
  assert.equal(JSON.parse(after.stdout).primary,staged.name);
});


test('read_skill never serves tampered content after initial process loading',t=>{
  const state=fixture(t);
  const staged=stageFoundrySkill(state);
  approve(state,staged);
  const moduleUrl=prepareRuntimeCopy(state);
  const file=path.join(state.projectRoot,'skills',staged.name,'SKILL.md');
  const script="import fs from 'node:fs'; import {readSkill} from "+JSON.stringify(moduleUrl)+
    "; const good=readSkill("+JSON.stringify(staged.name)+"); fs.appendFileSync("+JSON.stringify(file)+
    ",'\\nmalicious late edit'); const bad=readSkill("+JSON.stringify(staged.name)+"); console.log(JSON.stringify({good:!!good,bad:bad===null}));";
  const result=spawnSync(process.execPath,['--input-type=module','--eval',script],{cwd:state.projectRoot,encoding:'utf8'});
  assert.equal(result.status,0,result.stderr);
  assert.deepEqual(JSON.parse(result.stdout),{good:true,bad:true});
});

test('CLI stages a candidate but refuses implicit signoff, then approves with matching hashes',t=>{
  const state=fixture(t);
  const cli=path.join(THIS_REPO,'scripts','foundry-bridge.mjs');
  const invoke=(args)=>spawnSync(process.execPath,[cli,...args,'--root',state.projectRoot],{encoding:'utf8'});
  const staged=invoke(['stage','--skill',state.skillFile,'--evidence',state.evidenceFile]);
  assert.equal(staged.status,0,staged.stderr);
  const metadata=JSON.parse(staged.stdout);
  assert.equal(metadata.status,'pending_review');
  const options=['approve','--name',metadata.name,'--skill-sha256',metadata.skillSha256,
    '--evidence-sha256',metadata.evidenceSha256,'--evidence',state.evidenceFile,'--reviewer','owner'];
  const refused=invoke(options);
  assert.notEqual(refused.status,0,'Should require explicit --confirm-reviewed');
  assert.match(refused.stderr,/explicit|confirm/i);
  const approved=invoke([...options,'--confirm-reviewed']);
  assert.equal(approved.status,0,approved.stderr);
  const verified=invoke(['verify']);
  assert.equal(verified.status,0,verified.stderr);
  assert.deepEqual(JSON.parse(verified.stdout).approvedSkills,[metadata.name]);
});

test('registry metadata is not trusted independently from reviewed SKILL.md',t=>{
  const state=fixture(t);
  const staged=stageFoundrySkill(state);
  approve(state,staged);
  const manifest=path.join(state.projectRoot,'catalog','foundry-approved.json');
  const records=JSON.parse(fs.readFileSync(manifest,'utf8'));
  records[0].tags.push('surreptitious-extra-routing-tag');
  fs.writeFileSync(manifest,JSON.stringify(records));
  const check=verifyFoundryRegistry(state.projectRoot);
  assert.equal(check.valid,false);
  assert.deepEqual(approvedFromFixture(state),[]);
});


test('accepts standard YAML folded description and YAML tag lists',()=>{
  const folded='---\nname: spline-lighting\n' +
    'description: >-\n  Create cinematic 3D scenes\n  with responsive lighting.\n' +
    'tags:\n  - spline\n  - webgl\n---\n# Lighting\nBody.\n';
  const info=parseSkillMetadata(folded);
  assert.equal(info.description,'Create cinematic 3D scenes with responsive lighting.');
  assert.ok(info.tags.includes('spline'));
  assert.ok(info.tags.includes('webgl'));
  const inline=parseSkillMetadata(folded.replace('tags:\n  - spline\n  - webgl','tags: [spline, webgl]'));
  assert.ok(inline.tags.includes('webgl'));
});

test('approval never destroys unrelated pre-existing skill directory',t=>{
  const state=fixture(t);
  const staged=stageFoundrySkill(state);
  const dir=path.join(state.projectRoot,'skills',staged.name);
  fs.mkdirSync(dir,{recursive:true});
  fs.writeFileSync(path.join(dir,'owner-notes.txt'),'Do not delete.');
  assert.throws(()=>approve(state,staged),/already approved|conflicts/i);
  assert.equal(fs.readFileSync(path.join(dir,'owner-notes.txt'),'utf8'),'Do not delete.');
});

test('modified evidence file or concurrent approval lock refuses promotion',t=>{
  const state=fixture(t);
  const staged=stageFoundrySkill(state);
  const lock=path.join(state.projectRoot,'catalog','foundry-approved.json.lock');
  fs.writeFileSync(lock,'other approval');
  assert.throws(()=>approve(state,staged),/approval is running|stale lock/i);
  fs.rmSync(lock);
  fs.appendFileSync(state.evidenceFile,' ');
  assert.throws(()=>approve(state,staged),/evidence.*hash|hash.*evidence/i);
  assert.equal(verifyFoundryRegistry(state.projectRoot).valid,true);
});
