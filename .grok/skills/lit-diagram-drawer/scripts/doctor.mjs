#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { inspectRenderer } from './renderer-status.mjs';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const report=[];
function check(name,ok,detail){report.push({name,status:ok?'pass':'fail',detail});}
const renderer=inspectRenderer();
check('agent-browser >=0.38.1',renderer.renderer.available,renderer.renderer.message+'; '+renderer.setup);
check('Chrome for Testing 154',renderer.chrome.available,renderer.chrome.message+(renderer.chrome.available?'':' ; '+renderer.setup));
const font=path.join(root,'assets/fonts/PretendardVariable.woff2');
const license=path.join(root,'assets/fonts/OFL.txt');
for(const file of [font,license]) check(path.relative(root,file),fs.existsSync(file),fs.existsSync(file)?String(fs.statSync(file).size)+' bytes':'missing');
if(fs.existsSync(font)) check('font SHA-256 manifest',(()=>{try{const m=JSON.parse(fs.readFileSync(path.join(root,'assets/fonts/provenance.json'),'utf8'));return m.files?.some((f)=>f.file==='PretendardVariable.woff2'&&f.sha256===crypto.createHash('sha256').update(fs.readFileSync(font)).digest('hex'));}catch{return false;}})(),'matches bundled provenance record');
const temp=path.join(root,'.doctor-write-probe-'+process.pid);
try{fs.writeFileSync(temp,'ok');fs.unlinkSync(temp);check('canonical write access',true,'temporary probe removed');}catch(e){check('canonical write access',false,e.message);}
const failures=report.filter((x)=>x.status==='fail');
console.log(JSON.stringify({ok:failures.length===0,checks:report},null,2));
if(failures.length)process.exitCode=1;
