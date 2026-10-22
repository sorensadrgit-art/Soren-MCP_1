import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {v3ToolsEnabled} from '../../lib/v3/flags.mjs';
import {planToolchain} from '../../lib/integrations/plan.mjs';
import {searchKnowledge} from '../../lib/knowledge/search.mjs';
import {INTEGRATIONS} from '../../lib/integrations/catalog.mjs';

const SECRET=/(gh[opsu]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|sk-[A-Za-z0-9]{20,}|xox[abp]-[A-Za-z0-9-]{10,}|AKIA[0-9A-Z]{16}|-----BEGIN [A-Z ]*PRIVATE KEY|Bearer [A-Za-z0-9._-]{16,})/;
const V3_SOURCE_DIRS=['lib/v3','lib/knowledge','lib/integrations','lib/recipes'];

test('V3 tools are disabled unless SOREN_V3_TOOLS is exactly "1"',()=>{
  assert.equal(v3ToolsEnabled({}),false);
  for(const value of ['0','true','yes','',' 1'])assert.equal(v3ToolsEnabled({SOREN_V3_TOOLS:value}),false,value);
  assert.equal(v3ToolsEnabled({SOREN_V3_TOOLS:'1'}),true);
});

test('V3 catalogs and outputs contain no credentials',()=>{
  for(const file of fs.readdirSync('catalog'))assert.doesNotMatch(fs.readFileSync(path.join('catalog',file),'utf8'),SECRET,file);
  assert.doesNotMatch(JSON.stringify(planToolchain('Create an ultra-realistic interactive 3D portfolio')),SECRET);
});

test('V3 library code has no execution, dynamic evaluation or network capability',()=>{
  for(const dir of V3_SOURCE_DIRS){
    for(const file of fs.readdirSync(dir)){
      const source=fs.readFileSync(path.join(dir,file),'utf8');
      assert.doesNotMatch(source,/child_process|\bspawn\(|\bexecSync\(|\beval\(|new Function\(|\bfetch\(|import\(/,dir+'/'+file);
    }
  }
});

test('no integration is proxied, auto-connected or marked verified without evidence',()=>{
  for(const i of INTEGRATIONS){
    assert.equal(i.proxiedBySoren,false);
    assert.equal(i.automaticallyConnected,false);
  }
});

test('private task text is bounded and package inputs are validated',()=>{
  const long='x'.repeat(5000)+' C:\\Users\\private\\secret.env';
  const p=planToolchain(long);
  assert.ok(p.task.length<=500);
  assert.throws(()=>planToolchain('3d portfolio',{projectPackages:{'../../evil':'1.0.0'}}),/Invalid package name/);
  assert.throws(()=>planToolchain('3d portfolio',{projectPackages:Object.fromEntries(Array.from({length:60},(_,i)=>['p'+i,'1.0.0']))}),/Too many packages/);
  assert.ok(searchKnowledge(long).query.length<=200);
});
