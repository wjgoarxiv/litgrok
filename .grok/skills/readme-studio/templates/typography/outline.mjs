#!/usr/bin/env node
import {lstatSync, readFileSync, realpathSync, writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {resolve, relative, join, sep, isAbsolute} from 'node:path';
import {pathToFileURL} from 'node:url';
const xml=s=>String(s).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&apos;');
const finite=(...v)=> {if(!v.every(Number.isFinite)) throw new Error('nonfinite glyph geometry');};
export function writeFresh(root, output, content) {
  if(typeof root!=='string' || !root || typeof output!=='string' || !output || isAbsolute(output) || output.includes('\\') || output.split('/').some(p=>!p||p==='.'||p==='..')) throw new Error('explicit root and safe relative output required');
  root=resolve(root);
  if(lstatSync(root).isSymbolicLink() || !lstatSync(root).isDirectory()) throw new Error('output root must be a real directory');
  if(realpathSync(root)!==root) throw new Error('output root parent symlink refused');
  const parts=output.split('/'); let parent=root;
  for(const p of parts.slice(0,-1)) {parent=join(parent,p); const st=lstatSync(parent); if(st.isSymbolicLink()||!st.isDirectory()) throw new Error('unsafe output parent');}
  const target=join(parent,parts.at(-1));
  if(relative(root,target).startsWith('..'+sep)) throw new Error('output escape');
  writeFileSync(target,content,{flag:'wx'}); return target;
}
export function shape(font,text,fill='#16252b') {
  if(typeof text!=='string'||!text.trim()||[...text].length>500 || !/^#[\da-f]{6}$/i.test(fill)) throw new Error('bounded text and six-digit hex fill required');
  if(!Number.isFinite(font.unitsPerEm)||font.unitsPerEm<=0) throw new Error('invalid font units');
  for(const char of text) if(!font.hasGlyphForCodePoint(char.codePointAt(0))) throw new Error('missing glyph');
  const run=font.layout(text);
  if(!run.glyphs?.length || run.glyphs.length!==run.positions?.length) throw new Error('invalid shaped run');
  let x=0,y=0,minX=0,maxX=0,minY=0,maxY=0; const paths=[];
  for(let i=0;i<run.glyphs.length;i++) {
    const g=run.glyphs[i],p=run.positions[i];
    finite(p.xAdvance,p.yAdvance,p.xOffset,p.yOffset);
    if(g.id===0) throw new Error('missing .notdef glyph');
    const d=g.path.toSVG(),gx=x+p.xOffset,gy=y+p.yOffset;
    if(typeof d!=='string') throw new Error('missing outline');
    if(d) {
      const b=g.bbox; finite(b.minX,b.maxX,b.minY,b.maxY);
      if(b.minX>b.maxX || b.minY>b.maxY) throw new Error('invalid outline bounds');
      minX=Math.min(minX,gx+b.minX);maxX=Math.max(maxX,gx+b.maxX);minY=Math.min(minY,gy+b.minY);maxY=Math.max(maxY,gy+b.maxY);
      paths.push(`<path d="${xml(d)}" transform="translate(${gx} ${gy})"/>`);
    }
    x+=p.xAdvance; y+=p.yAdvance; finite(x,y); minX=Math.min(minX,x);maxX=Math.max(maxX,x);
  }
  if(!paths.length) throw new Error('no visible outlines');
  const pad=font.unitsPerEm*0.08,w=maxX-minX+2*pad,h=maxY-minY+2*pad;finite(w,h);if(w<=0||h<=0) throw new Error('empty bounds');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" role="img" aria-labelledby="t"><title id="t">${xml(text)}</title><g fill="${fill}" transform="translate(${pad-minX} ${pad+maxY}) scale(1 -1)">${paths.join('')}</g></svg>\n`;
}
function bounded(path,max) {
  const full=resolve(path);
  const st=lstatSync(full); if(st.isSymbolicLink()||!st.isFile()||st.size<1||st.size>max) throw new Error('bounded regular file required');
  // Resolve once and reject user-controlled symlink aliases, including parent links.
  if(realpathSync(full)!==full) throw new Error('symlink input path refused');
  return full;
}
async function main() {
  const options={}, args=process.argv.slice(2);
  for(let i=0;i<args.length;i+=2) {const key=args[i]; if(!['--font','--text','--family','--license','--root','--output','--fill'].includes(key)||!args[i+1]||options[key]) throw new Error('invalid outline arguments'); options[key]=args[i+1];}
  for(const key of ['--font','--text','--family','--license','--root','--output']) if(!options[key]) throw new Error(`required ${key}`);
  const file=bounded(options['--font'],64*1024*1024), license=bounded(options['--license'],1024*1024);
  const {openSync}=await import('fontkit');const font=openSync(file);
  if(!font.familyName?.includes(options['--family'])) throw new Error(`font family mismatch: ${font.familyName}`);
  const svg=shape(font,options['--text'],options['--fill']);
  const output=writeFresh(options['--root'],options['--output'],svg);
  console.log(JSON.stringify({output,font_family:font.familyName,font_sha256:createHash('sha256').update(readFileSync(file)).digest('hex'),license_sha256:createHash('sha256').update(readFileSync(license)).digest('hex'),text:options['--text'],license_terms:'requires-human-review'}));
}
if(process.argv[1] && pathToFileURL(resolve(process.argv[1])).href===import.meta.url) main().catch(e=>{console.error(`outline: ${e.message}`);process.exitCode=1;});
