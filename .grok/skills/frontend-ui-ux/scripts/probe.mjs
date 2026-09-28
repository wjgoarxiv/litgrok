#!/usr/bin/env node
import { spawn, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, realpathSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { probe as browserCapability } from '../../browser-drive/scripts/capability-probe.mjs';
import { pageProbe } from './page-probe.mjs';
import { MATRIX, LIMITS, RENDERED_RULES } from './rule-data.mjs';
import { staticProbe } from './static-probe.mjs';

const scriptDir = fileURLToPath(new URL('.', import.meta.url));
const arg = (name) => { const i=process.argv.indexOf(name); return i<0?null:process.argv[i+1]; };
const decode = (out) => { let v=JSON.parse(out); if(typeof v==='string' && /^[\[{]/.test(v))v=JSON.parse(v); return v; };
function invoke(session,args,input,timeout=LIMITS.viewportMs) {
  const r=spawnSync('agent-browser',['--session',session,...args],{input,encoding:'utf8',timeout});
  if(r.error||r.status!==0)throw Error((r.stderr||r.stdout||r.error?.message||'browser command failed').trim().slice(-240));
  return r.stdout.trim();
}
function output(out,manifest,findings) {
  writeFileSync(join(out,'findings.json'),JSON.stringify({manifest,findings},null,2)+'\n');
  const rows=['| Severity | Rule | Where | Measured | Fix |','| --- | --- | --- | --- | --- |'];
  for(const f of findings)rows.push(`| ${f.severity} | ${f.rule} | ${f.viewport}: ${f.selector??'—'} | ${JSON.stringify(f.value).replaceAll('|','\\|')} | ${JSON.stringify(f.threshold).replaceAll('|','\\|')} |`);
  rows.push('',`Exit code: ${manifest.exit_code}`,`Not verified: ${manifest.not_verified.length}`);
  writeFileSync(join(out,'review.md'),rows.join('\n')+'\n');
}
async function localServer(path) {
  const child=spawn(process.execPath,[join(scriptDir,'static-server.mjs'),path],{stdio:['ignore','pipe','pipe']});
  const url=await new Promise((ok,fail)=>{let done=false;const timer=setTimeout(()=>{if(!done)fail(Error('no entry page found'));},3000);child.stdout.once('data',(chunk)=>{done=true;clearTimeout(timer);const line=String(chunk).trim();if(line.startsWith('http://127.0.0.1:'))ok(line);else fail(Error('no entry page found'));});child.once('error',fail);child.once('exit',()=>{if(!done)fail(Error('no entry page found'));});});
  return {child,url};
}
export async function main() {
  const path=arg('--url'), outArg=arg('--out');
  if(!path||!outArg){process.stderr.write('usage: probe.mjs --url <local HTML path> --out <directory> [--static <source>]\n');return 2;}
  const out=resolve(outArg);mkdirSync(out,{recursive:true});
  const entry=resolve(path);
  const sources=process.argv.flatMap((value,index)=>value==='--static'&&process.argv[index+1]?[resolve(process.argv[index+1])]:[]);
  if(!sources.length)sources.push(entry);
  let fallback={findings:[],not_verified:RENDERED_RULES.map((rule)=>({rule,reason:'static fallback: needs a rendered DOM'}))};
  try{fallback=staticProbe(sources);}catch{/* no readable source */}
  const manifest={url:null,viewports_run:[],browser_version:null,zoom_emulation:'viewport-halved',not_verified:[...fallback.not_verified],screenshots:[],exit_code:2,blocked_reason:null};
  const blocked=(reason)=>{manifest.blocked_reason=reason;output(out,manifest,fallback.findings);process.stdout.write(`BLOCKED: ${reason}\n`);return 2;};
  try{if(!statSync(entry).isFile()||!entry.toLowerCase().endsWith('.html'))return blocked('no entry page found');}catch{return blocked('no entry page found');}
  const capability=browserCapability();
  if(!capability.available||capability.state==='below-verified-floor')return blocked('browser unavailable');
  if(!capability.accepted)return blocked('browser identity unverified');
  manifest.browser_version=`agent-browser ${capability.version.major}.${capability.version.minor}.${capability.version.patch}`;
  let server;try{server=await localServer(entry);}catch{return blocked('no entry page found');}
  manifest.url=server.url;
  const socketDir=mkdtempSync(join(tmpdir(),'lg-uiux-'));
  const oldSocketDir=process.env.AGENT_BROWSER_SOCKET_DIR;
  process.env.AGENT_BROWSER_SOCKET_DIR=socketDir;
  const session=`litgrok-uiux-${process.pid}-${Date.now()}`;
  const findings=[];let reason=null;const started=Date.now();
  try {
    for(const view of MATRIX){
      if(Date.now()-started>LIMITS.totalMs){for(const rule of RENDERED_RULES)manifest.not_verified.push({rule,viewport:view.label,reason:'time budget exceeded'});continue;}
      const began=Date.now();
      invoke(session,['set','viewport',String(view.width),String(view.height)]);
      invoke(session,['set','media',view.scheme,...(view.reducedMotion?['reduced-motion']:[])]);
      invoke(session,['open',server.url]);
      invoke(session,['wait',String(LIMITS.settleMs)]);
      const state=decode(invoke(session,['eval','document.readyState']));
      if(state!=='complete'&&state!=='interactive')throw Error('page did not become ready');
      const measured=decode(invoke(session,['eval','--stdin'],pageProbe));
      if(!Array.isArray(measured.findings))throw Error('invalid page probe result');
      for(const f of measured.findings)findings.push({...f,viewport:view.label});
      if(view.zoom){const defects=measured.findings.filter((f)=>f.rule==='RS-006'||f.rule==='RS-007');if(defects.length)findings.push({rule:'RS-004',severity:'HIGH',tier:'derived',viewport:view.label,selector:'html',value:defects.length,threshold:0,note:'viewport-halved zoom emulation'});}
      for(const n of measured.not_verified||[])manifest.not_verified.push({...n,viewport:view.label});
      const shot=join(out,`${view.label}.png`);invoke(session,['screenshot',shot]);
      manifest.screenshots.push({viewport:view.label,path:basename(shot),bytes:statSync(shot).size,width:view.width,height:view.height});
      manifest.viewports_run.push(view.label);
      if(Date.now()-began>LIMITS.viewportMs)manifest.not_verified.push({rule:'PR-001',viewport:view.label,reason:'viewport time budget exceeded'});
    }
  }catch(error){reason=error.message||'browser run failed';}
  try{invoke(session,['close'],undefined,5000);}catch{if(!reason)reason='browser cleanup failed';}
  server.child.kill('SIGTERM');
  if(oldSocketDir===undefined)delete process.env.AGENT_BROWSER_SOCKET_DIR;else process.env.AGENT_BROWSER_SOCKET_DIR=oldSocketDir;
  rmSync(socketDir,{recursive:true,force:true});
  if(reason){manifest.blocked_reason=reason;manifest.exit_code=2;output(out,manifest,[...fallback.findings,...findings]);process.stdout.write(`BLOCKED: ${reason}\n`);return 2;}
  if(manifest.viewports_run.length!==MATRIX.length){manifest.blocked_reason='matrix incomplete';manifest.exit_code=findings.some((f)=>f.severity==='HIGH'&&f.tier!=='not_verified')?1:2;output(out,manifest,findings);if(manifest.exit_code===2)process.stdout.write('BLOCKED: matrix incomplete\n');else process.stdout.write(`HIGH findings remain; ${findings.length} findings; ${manifest.screenshots.length} screenshots\n`);return manifest.exit_code;}
  manifest.not_verified=manifest.not_verified.filter((n)=>n.reason!=='static fallback: needs a rendered DOM');
  manifest.exit_code=findings.some((f)=>f.severity==='HIGH'&&f.tier!=='not_verified')?1:0;
  output(out,manifest,findings);
  process.stdout.write(`${manifest.exit_code===0?'No HIGH findings':'HIGH findings remain'}; ${findings.length} findings; ${manifest.screenshots.length} screenshots\n`);
  return manifest.exit_code;
}
let directlyInvoked=false;
try{directlyInvoked=Boolean(process.argv[1])&&realpathSync(process.argv[1])===realpathSync(fileURLToPath(import.meta.url));}catch{/* imported or missing entry */}
if(directlyInvoked)process.exitCode=await main();
