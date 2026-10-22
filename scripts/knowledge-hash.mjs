import fs from 'node:fs';
import {fileURLToPath} from 'node:url';
import {computeContentSha256} from '../lib/knowledge/catalog.mjs';

/** Recomputes reviewed-content hashes. --write updates catalog/knowledge.json; default mode fails on drift. */
const file=new URL('../catalog/knowledge.json',import.meta.url);
const data=JSON.parse(fs.readFileSync(file,'utf8'));
const drift=[];
for(const item of data.items){
  const hash=computeContentSha256(item);
  if(item.contentSha256!==hash){drift.push(item.id);item.contentSha256=hash;}
}
if(process.argv.includes('--write')){
  fs.writeFileSync(fileURLToPath(file),JSON.stringify(data,null,2)+'\n');
  console.log(JSON.stringify({updated:drift}));
}else{
  console.log(JSON.stringify({items:data.items.length,drift}));
  if(drift.length)process.exitCode=1;
}
