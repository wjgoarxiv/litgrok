#!/usr/bin/env node
import {lstatSync, readFileSync, realpathSync} from 'node:fs';
import {isAbsolute, join, relative, resolve, sep} from 'node:path';

function regular(path, max=1024*1024) {
  const st=lstatSync(path);
  if (!st.isFile() || st.isSymbolicLink() || st.size<1 || st.size>max) throw new Error('bounded regular non-symlink file required');
  return path;
}
function source(root, value) {
  if (typeof value!=='string' || !value || isAbsolute(value) || value.includes('\\') || /[\x00-\x1f]/u.test(value) || value.split('/').some(p=>p==='..'||p==='.'||!p)) throw new Error('source must be a safe relative path');
  let path=root;
  for (const part of value.split('/')) {
    path=join(path,part);
    if (lstatSync(path).isSymbolicLink()) throw new Error('symlink source refused');
  }
  const rel=relative(root,realpathSync(path));
  if (!rel || rel.startsWith('..'+sep) || isAbsolute(rel)) throw new Error('source escapes project');
  regular(path,16*1024*1024);
}
try {
  const args=process.argv.slice(2), opts={};
  for(let i=0;i<args.length;i+=2) {
    if (!['--root','--facts'].includes(args[i]) || !args[i+1] || opts[args[i]]) throw new Error('usage: --root <project> --facts <ledger>');
    opts[args[i]]=args[i+1];
  }
  if (!opts['--root'] || !opts['--facts']) throw new Error('root and facts are required');
  const candidate=resolve(opts['--root']);
  if(lstatSync(candidate).isSymbolicLink() || !lstatSync(candidate).isDirectory()) throw new Error('project root must be a non-symlink directory');
  const root=realpathSync(candidate);
  const factsPath=resolve(opts['--facts']);
  source(root,relative(root,factsPath).split(sep).join('/'));
  const data=JSON.parse(readFileSync(regular(factsPath),'utf8'));
  if(data.schema!=='litgrok.readme-facts/v1' || !Array.isArray(data.claims) || data.claims.length<1 || data.claims.length>256 || !Array.isArray(data.badges) || data.badges.length>32) throw new Error('invalid facts shape or bounds');
  const seen=new Set();
  for(const claim of data.claims) {
    if(!claim || typeof claim.id!=='string' || !/^[a-z][a-z0-9-]{0,63}$/.test(claim.id) || seen.has(claim.id) || typeof claim.text!=='string' || !claim.text.trim() || claim.text.length>2000) throw new Error('invalid or duplicate claim');
    seen.add(claim.id);
  }
  for(const item of [...data.claims,...data.badges]) {
    if(!Array.isArray(item.sources) || !item.sources.length || item.sources.length>16) throw new Error('evidence sources required');
    item.sources.forEach(path=>source(root,path));
  }
  for(const badge of data.badges) {
    if(typeof badge.url!=='string' || badge.url.length>2048 || /\s|[\x00-\x1f\x7f]/u.test(badge.url)) throw new Error('invalid badge URL');
    const url=new URL(badge.url);
    if(!['https:','http:'].includes(url.protocol) || url.username || url.password) throw new Error('badge URL must be HTTP(S) without credentials');
  }
  console.log(JSON.stringify({valid:true,validation_scope:'structure-only',factual_accuracy:'not-checked',source_contents_compared:false,badge_truth_checked:false,claims:data.claims.length}));
} catch(error) {
  console.error(`readme facts: ${error.message}`); process.exitCode=1;
}
