import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {findExecutable,parseClientVersion,ADAPTERS} from '../../installer/adapters.mjs';
test('version detection accepts native v prefixes and never hides prerelease or build identity',()=>{
  assert.equal(parseClientVersion('opencode v2.0.32'),'2.0.32');assert.equal(parseClientVersion('codex-cli 0.157.1'),'0.157.1');
  for(const version of ['2.0.32-beta.1','2.0.32+unreviewed-build']){assert.equal(parseClientVersion('opencode v'+version),version);assert.equal(ADAPTERS.opencode.versions.includes(parseClientVersion('opencode v'+version)),false);}
  assert.equal(parseClientVersion('no version metadata'),null);
});
test('OpenCode desktop bundled CLI is detected when its directory is absent from PATH',async t=>{
  const home=await fs.mkdtemp(path.join(os.tmpdir(),'soren-detection-'));t.after(()=>fs.rm(home,{recursive:true,force:true}));
  const local=path.join(home,'AppData','Local'),file=path.join(local,'Programs','@opencodedesktop','resources','opencode-cli.exe');await fs.mkdir(path.dirname(file),{recursive:true});await fs.writeFile(file,'fixture executable identity only');
  assert.equal(findExecutable('opencode',{home,platform:'win32',env:{PATH:'',LOCALAPPDATA:local}}),file);
  assert.equal(findExecutable('other',{home,platform:'win32',env:{PATH:'',LOCALAPPDATA:local}}),null);
});
