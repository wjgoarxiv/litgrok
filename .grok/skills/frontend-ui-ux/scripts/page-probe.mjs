import { LIMITS, RULES } from './rule-data.mjs';

// Serialized into agent-browser eval. All thresholds enter as data from rule-data.mjs.
function inspect(config) {
  const { limits, rules } = config;
  const findings = [], notVerified = [], counts = new Map();
  const viewport = { width: innerWidth, height: innerHeight };
  const nodes = [...document.querySelectorAll('body *')].slice(0, limits.nodes);
  const selector = (e) => e?.id ? '#' + CSS.escape(e.id) : e?.tagName?.toLowerCase() + (e?.classList?.length ? '.' + CSS.escape(e.classList[0]) : '');
  const add = (rule, severity, e, value, threshold, tier = 'measured', note) => {
    const count = counts.get(rule) || 0;
    if (count >= limits.findingsPerRule) return;
    counts.set(rule, count + 1);
    findings.push({ rule, severity, tier, viewport, selector: selector(e) || null, value, threshold, ...(note ? { note } : {}) });
  };
  const visible = (e) => { const r = e.getBoundingClientRect(), s = getComputedStyle(e); return r.width > 0 && r.height > 0 && s.display !== 'none' && s.visibility !== 'hidden' && Number(s.opacity) > 0; };
  const text = nodes.filter((e) => visible(e) && [...e.childNodes].some((n) => n.nodeType === Node.TEXT_NODE && n.textContent.trim()));
  const primary = (e) => e.matches('button[type="submit"], input[type="submit"], .primary, [class*="primary"], [data-primary]');
  const color = (s) => { const m = s.match(/^rgba?\(([^)]+)\)$/); if (!m) return null; const p = m[1].split(/[\s,/]+/).filter(Boolean).map(Number); return p.length >= 3 && (p[3] ?? 1) === 1 ? p.slice(0, 3) : null; };
  const hsl = (c) => { if(!c)return null;const a=c.map((v)=>v/255),max=Math.max(...a),min=Math.min(...a),d=max-min,l=(max+min)/2,s=d?d/(1-Math.abs(2*l-1)):0;let h=0;if(d){const k=a.indexOf(max);h=60*((k===0?(a[1]-a[2])/d:k===1?(a[2]-a[0])/d+2:(a[0]-a[1])/d+4)+6)%360;}return {h,s,l}; };
  const bg = (e) => { for (let n = e; n; n = n.parentElement) { const style=getComputedStyle(n); if (style.backgroundImage !== 'none') return null; const c = color(style.backgroundColor); if (c) return c; } return [255,255,255]; };
  const lum = (c) => { const a = c.map((x) => { const v=x/255; return v<=0.04045?v/12.92:((v+0.055)/1.055)**2.4; }); return a[0]*0.2126+a[1]*0.7152+a[2]*0.0722; };
  const contrast = (a,b) => (Math.max(lum(a),lum(b))+0.05)/(Math.min(lum(a),lum(b))+0.05);
  const overflow = Math.max(document.documentElement.scrollWidth, document.body?.scrollWidth || 0) - innerWidth;
  if (overflow > rules['RS-006'].overflowPx) add('RS-006','HIGH',document.documentElement,overflow,rules['RS-006'].overflowPx);
  const accents = new Set(), glows=[];
  for (const e of text) {
    const s=getComputedStyle(e), r=e.getBoundingClientRect(), own=e.textContent.trim();
    const offscreen=r.right > innerWidth+rules['RS-007'].offscreenPx || r.left < -rules['RS-007'].offscreenPx;
    const clipped=e.scrollWidth-e.clientWidth > rules['RS-007'].clipPx && /hidden|clip/.test(s.overflowX) || e.scrollHeight-e.clientHeight > rules['RS-007'].clipPx && /hidden|clip/.test(s.overflowY);
    if ((clipped||offscreen) && !/sr-only|visually-hidden/.test(e.className || '') && s.textOverflow!=='ellipsis' && (!s.webkitLineClamp || s.webkitLineClamp==='none') && (!s.lineClamp || s.lineClamp==='none')) add('RS-007','HIGH',e,{scrollWidth:e.scrollWidth,clientWidth:e.clientWidth,right:Math.round(r.right)},offscreen?rules['RS-007'].offscreenPx:rules['RS-007'].clipPx);
    const fg=color(s.color), background=bg(e);
    if (fg && background && !e.matches(':disabled,[aria-disabled="true"]')) { const px=parseFloat(s.fontSize), large=px>=rules['CF-201'].largePx || px>=rules['CF-201'].boldPx && Number(s.fontWeight)>=rules['CF-201'].boldWeight, floor=large?rules['CF-201'].largeRatio:rules['CF-201'].bodyRatio, ratio=contrast(fg,background); if (ratio<floor) add('CF-201',large?'MEDIUM':'HIGH',e,+ratio.toFixed(2),floor); }
    else if (fg) notVerified.push({rule:'CF-201',reason:'image or gradient background needs visual review',selector:selector(e)});
    const lh=parseFloat(s.lineHeight), fs=parseFloat(s.fontSize), heading=/^H[1-6]$/.test(e.tagName);
    if (Number.isFinite(lh) && Number.isFinite(fs) && fs>0 && r.height>lh*1.5 && (heading || e.matches('p,blockquote,dd,li,td'))) { const ratio=lh/fs, rule=heading?'CF-102':'CF-103', floor=heading?(fs>=rules['CF-102'].displayPx?rules['CF-102'].displayMin:rules['CF-102'].min):(/[\u3000-\u9fff]/.test(own)?rules['CF-103'].cjkMin:rules['CF-103'].latinMin); if (ratio<floor) add(rule,'MEDIUM',e,+ratio.toFixed(2),floor); }
    if (e.matches('p,blockquote,dd,li,td') && !e.closest('nav,footer,marquee') && Number.isFinite(lh) && r.height>lh*1.5 && fs>0) { const ch=r.width/(fs*0.5), floor=/[\u3000-\u9fff]/.test(own)?rules['CF-101'].cjkLongLineCh:rules['CF-101'].longLineCh; if (ch>floor) add('CF-101','MEDIUM',e,+ch.toFixed(1),floor,'derived','rendered-line estimate'); }
    if ((s.backgroundClip==='text' || s.webkitBackgroundClip==='text') && /gradient\(/.test(s.backgroundImage)) add('SLOP-009','MEDIUM',e,'gradient text','solid text color');
    if (/^[\p{Emoji_Presentation}\p{Extended_Pictographic}]/u.test(own) && e.matches('button,a,[role="button"],nav *,[class*="badge"]')) add('SLOP-053','LOW',e,own.slice(0,8),'consistent icon set','derived','policy exception needs review');
    if (e.matches('label,button,a') && !e.matches('.brand,[class*="brand"],[data-brand]') && /^[A-Z][a-z]+(?: [A-Z][a-z]+){2,}$/.test(own)) add('CF-107','LOW',e,own,'sentence case');
    if(s.textTransform==='uppercase' && own.length>rules['SLOP-020'].maxUppercaseChars && [...own].filter((c)=>/[A-Za-z]/.test(c)).length>own.length/2)add('SLOP-020','LOW',e,own.length,rules['SLOP-020'].maxUppercaseChars);
  }
  for (const e of nodes) {
    if (!visible(e)) continue;
    const s=getComputedStyle(e), r=e.getBoundingClientRect();
    if (e.matches('a,button,input,select,textarea,[role="button"],[role="link"]')) {
      const size=Math.min(r.width,r.height), floor=rules['CF-701'].floorPx;
      const spaced=[...e.parentElement?.querySelectorAll('a,button,input,select,textarea,[role="button"],[role="link"]')||[]].every((other)=>other===e||(()=>{const b=other.getBoundingClientRect();return Math.max(0,Math.max(b.left-r.right,r.left-b.right))>=floor-size||Math.max(0,Math.max(b.top-r.bottom,r.top-b.bottom))>=floor-size;})());
      if (size<floor && !spaced) add('CF-701','HIGH',e,+size.toFixed(1),floor);
      else if (innerWidth<=768 && size<rules['CF-701'].touchPx) add('CF-701',primary(e)?'HIGH':'MEDIUM',e,+size.toFixed(1),rules['CF-701'].touchPx);
      if (e.matches('textarea,input:not([type]),input:is([type="text"],[type="search"],[type="email"],[type="url"],[type="tel"],[type="password"],[type="number"])') && innerWidth<=768 && parseFloat(s.fontSize)<rules['RS-008'].inputPx) add('RS-008','MEDIUM',e,parseFloat(s.fontSize),rules['RS-008'].inputPx);
      if (e.matches('a') && /^(#|javascript:)/i.test(e.getAttribute('href')||'')) add('SLOP-058',primary(e)||e.closest('nav')?'HIGH':'MEDIUM',e,e.getAttribute('href'),'working destination','derived');
      if (e.matches('button') && !e.hasAttribute('type') && e.form && [...document.querySelectorAll('button,input[type="submit"],input[type="image"]')].filter((button)=>button.form===e.form && (button.matches('input[type="submit"],input[type="image"]')||!button.hasAttribute('type')||button.type==='submit')).length>=2) add('SLOP-059','HIGH',e,'implicit submit','explicit type','derived');
    }
    if (s.willChange==='all' || s.willChange.split(',').some((x)=>x.trim() && !rules['CF-507'].allowed.includes(x.trim()) && x.trim()!=='auto')) add('CF-507','LOW',e,s.willChange,rules['CF-507'].allowed);
    if (e.matches('dialog,[role="dialog"],.modal,.overlay') && /blur\(/.test(s.backdropFilter)) add('CF-406','LOW',e,s.backdropFilter,'solid scrim');
    const shadow=s.boxShadow;const blur=shadow.match(/(-?\d+(?:\.\d+)?)px\s+(-?\d+(?:\.\d+)?)px\s+(\d+(?:\.\d+)?)px/);const shadowColor=color(shadow.match(/rgba?\([^)]+\)/)?.[0]||'');
    if(blur && Math.abs(Number(blur[1]))<=rules['CF-404'].maxOffsetPx && Math.abs(Number(blur[2]))<=rules['CF-404'].maxOffsetPx && Number(blur[3])>=rules['CF-404'].minBlurPx && hsl(shadowColor)?.s>=rules['CF-404'].minSaturation)glows.push(e);
    const p=e.parentElement; if (p && parseFloat(s.borderRadius)>0 && parseFloat(getComputedStyle(p).borderRadius)>0 && parseFloat(getComputedStyle(p).paddingLeft)<=rules['CF-401'].maxPaddingPx && Math.abs(r.width-(p.clientWidth-2*parseFloat(getComputedStyle(p).paddingLeft)))<4) { const expected=Math.max(0,parseFloat(getComputedStyle(p).borderRadius)-parseFloat(getComputedStyle(p).paddingLeft)); if (Math.abs(parseFloat(s.borderRadius)-expected)>rules['CF-401'].radiusTolerancePx) add('CF-401','LOW',e,parseFloat(s.borderRadius),expected); }
    if (r.width>=rules['CF-205'].minAreaPx && r.height>=rules['CF-205'].minAreaPx && /^(BUTTON|A|DIV|SECTION)$/.test(e.tagName) && !e.matches('[role="status"],[role="alert"],[class*="status"],[class*="success"],[class*="warning"],[class*="error"]') && !(r.height<=32&&r.width<=160) && s.backgroundColor!=='rgba(0, 0, 0, 0)') { const c=hsl(color(s.backgroundColor)); if(c && c.s>=rules['CF-205'].minSaturation)accents.add(s.backgroundColor); }
    if(s.transitionProperty.split(',').some((property)=>rules['SLOP-026'].properties.includes(property.trim())))add('SLOP-026','MEDIUM',e,s.transitionProperty,'transform/opacity');
  }
  const focusables=nodes.filter((e)=>visible(e)&&!e.matches(':disabled,[aria-disabled="true"]')&&e.matches('a[href],button,input:not([type="hidden"]),select,textarea,[tabindex]:not([tabindex="-1"])')).slice(0,5);
  for(const e of focusables){
    const name=e.getAttribute('aria-label')||e.getAttribute('aria-labelledby')?.split(/\s+/).map((id)=>document.getElementById(id)?.textContent||'').join(' ')||e.labels?.[0]?.textContent||e.getAttribute('alt')||e.getAttribute('title')||e.textContent||'';
    if(!name.trim())add('CF-603','HIGH',e,'empty accessible name','nonempty');
    const state=()=>{const s=getComputedStyle(e);return {outline:s.outline,outlineStyle:s.outlineStyle,outlineWidth:s.outlineWidth,outlineColor:s.outlineColor,boxShadow:s.boxShadow,border:s.border,backgroundColor:s.backgroundColor};};
    const rest=state();e.focus({preventScroll:true});if(!e.matches(':focus-visible')){notVerified.push({rule:'CF-202',selector:selector(e),reason:'programmatic focus not focus-visible'});e.blur();continue;}
    const focused=state();e.blur();if(['outline','boxShadow','border','backgroundColor'].every((key)=>rest[key]===focused[key]))add('CF-202','HIGH',e,'no focus style change','visible focus indicator');
    else if(focused.outlineStyle!=='auto'&&parseFloat(focused.outlineWidth)<2&&focused.boxShadow==='none')add('CF-202','MEDIUM',e,focused.outlineWidth,'2px custom indicator');
  }
  const overlapping=text.filter((e)=>!e.closest('nav,footer')).slice(0,180);
  for(let i=0;i<overlapping.length;i++)for(let j=i+1;j<overlapping.length;j++){
    const a=overlapping[i],b=overlapping[j];if(a.contains(b)||b.contains(a))continue;
    const x=a.getBoundingClientRect(),y=b.getBoundingClientRect(),area=Math.max(0,Math.min(x.right,y.right)-Math.max(x.left,y.left))*Math.max(0,Math.min(x.bottom,y.bottom)-Math.max(x.top,y.top));
    const ratio=area/Math.max(1,Math.min(x.width*x.height,y.width*y.height));
    if(ratio>=rules['RS-007'].overlapRatio)add('RS-007','MEDIUM',a,+ratio.toFixed(2),rules['RS-007'].overlapRatio);
  }
  const headings=nodes.filter((e)=>e.matches('h2')&&visible(e));
  const eyebrows=nodes.filter((e)=>visible(e)&&e.nextElementSibling?.matches('h2')&&getComputedStyle(e).textTransform==='uppercase'&&parseFloat(getComputedStyle(e).letterSpacing)>0);
  if(headings.length && eyebrows.length>Math.ceil(headings.length/3))add('SLOP-029','MEDIUM',eyebrows[0],eyebrows.length,Math.ceil(headings.length/3));
  for(const e of nodes.filter((n)=>n.matches('img'))){const src=e.getAttribute('src'),srcset=e.getAttribute('srcset'),loader=[...e.attributes].some((a)=>/^data-(?:src|srcset|lazy)/.test(a.name));if(!e.complete || ((!src&&!srcset)&&loader)){notVerified.push({rule:'SLOP-057',selector:selector(e),reason:'lazy image not fetched at capture'});continue;}if((!src&&!srcset)||src==='#'||src==='undefined'||srcset==='#'||srcset==='undefined'||(e.complete&&e.naturalWidth===0))add('SLOP-057','HIGH',e,src||srcset||'', 'loaded image');}
  for(const e of nodes.filter((n)=>n.matches('marquee')))add('SLOP-061','LOW',e,'marquee','static content');
  const hueClusters=[];for(const raw of accents){const c=hsl(color(raw));if(c&&!hueClusters.some((h)=>Math.min(Math.abs(h-c.h),360-Math.abs(h-c.h))<=rules['CF-205'].hueDegrees))hueClusters.push(c.h);}
  if (hueClusters.length>rules['CF-205'].allowedClusters) add('CF-205','MEDIUM',document.body,hueClusters.length,rules['CF-205'].allowedClusters,'derived','candidate accents; status colors need review');
  for(const e of glows)add(glows.length>=rules['SLOP-010'].recurrence?'SLOP-010':'CF-404',glows.length>=rules['SLOP-010'].recurrence?'MEDIUM':'LOW',e,getComputedStyle(e).boxShadow,glows.length>=rules['SLOP-010'].recurrence?rules['SLOP-010'].recurrence:'avoid glow','derived');
  const headingPurple=nodes.filter((e)=>visible(e)&&e.matches('h1,h2,h3,h4,h5,h6')).map((e)=>({element:e,c:color(getComputedStyle(e).color)})).find(({c})=>{const v=hsl(c);return v&&v.h>=rules['SLOP-008'].hueMin&&v.h<=rules['SLOP-008'].hueMax&&Math.max(...c)-Math.min(...c)>=rules['SLOP-008'].minChannelSpread;});
  if(headingPurple)add('SLOP-008','MEDIUM',headingPurple.element,+hsl(headingPurple.c).h.toFixed(1),[rules['SLOP-008'].hueMin,rules['SLOP-008'].hueMax],'derived','review brand exception');
  const authored=text.filter((e)=>!e.closest('script,style,noscript,template,code,pre,kbd,form,[contenteditable="true"]')).map((e)=>({element:e,copy:[...e.childNodes].filter((n)=>n.nodeType===Node.TEXT_NODE).map((n)=>n.textContent).join(' ')}));
  const bodyText=authored.filter(({element})=>!element.closest('blockquote')).map(({copy})=>copy).join(' ').slice(0,limits.text);
  if (/\blorem ipsum\b|\[placeholder\]|\bTODO\b/i.test(bodyText)) add('SLOP-060','LOW',document.body,'placeholder text','final copy','derived');
  for(const {element,copy} of authored){const quote=element.closest('blockquote[cite]');const cited=quote&&(()=>{try{return new URL(quote.cite).origin!==location.origin}catch{return false}})();const dash=[...copy.matchAll(/—|\s–\s/g)].filter((m)=>m[0]==='—'||!(/\d/.test(copy[m.index-1]||'')&&/\d/.test(copy[m.index+m[0].length]||''))).length;if(dash)add('SLOP-040',cited||/\p{Script=Han}—{2}/u.test(copy)?'LOW':'MEDIUM',element,dash,0,'derived');}
  for(const phrase of rules['SLOP-036'].phrases)if(new RegExp('\\b'+phrase.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'\\b','i').test(bodyText))add('SLOP-036','MEDIUM',document.body,phrase,'specific claim','derived');
  for(const name of rules['SLOP-037'].names)if(new RegExp('\\b'+name+'\\b','i').test(bodyText))add('SLOP-037','MEDIUM',document.body,name,'brief-specific identity','derived','judgment required');
  for(const name of rules['SLOP-038'].names)if(new RegExp('\\b'+name+'\\b','i').test(bodyText))add('SLOP-038','MEDIUM',document.body,name,'specific attributed person','derived');
  const rebuttals=[...bodyText.matchAll(/\bNot\s+[^.!?]{2,60}[.!?]\s+[A-Z][^.!?]{2,60}[.!?]/g)];if(rebuttals.length>=rules['SLOP-039'].occurrences)add('SLOP-039','LOW',document.body,rebuttals.length,rules['SLOP-039'].occurrences,'derived');
  if(matchMedia('(prefers-color-scheme: dark)').matches){const pageBg=bg(document.body)||[255,255,255];if(lum(pageBg)>=rules['RS-002'].maxDarkLuminance){if(document.querySelector('[aria-label*="theme" i],[aria-label*="dark" i],[data-theme-toggle],button[class*="theme" i]'))notVerified.push({rule:'RS-002',reason:'theme control found; toggle path requires manual review'});else add('RS-002','MEDIUM',document.body,+lum(pageBg).toFixed(3),rules['RS-002'].maxDarkLuminance);}}
  if(matchMedia('(prefers-reduced-motion: reduce)').matches){const playing=[...document.querySelectorAll('video')].filter((v)=>!v.paused&&!v.closest('[role="progressbar"],[role="status"]'));const moving=document.getAnimations().filter((a)=>a.playState==='running'&&Number(a.effect?.getTiming()?.duration)>rules['RS-003'].maxMotionMs&&!a.effect?.target?.closest?.('[role="progressbar"],[role="status"],progress')&&/transform|translate|rotate|scale/.test(getComputedStyle(a.effect?.target||document.body).animationName+' '+getComputedStyle(a.effect?.target||document.body).transitionProperty));if(playing.length||moving.length)add('RS-003','HIGH',document.body,{playing:playing.length,moving:moving.length},0);}
  if (nodes.length===limits.nodes) notVerified.push({rule:'NODE-CAP',reason:'node sampling capped'});
  if ((document.body.innerText||'').length>limits.text) notVerified.push({rule:'TEXT-CAP',reason:'text sampling capped'});
  for (const sheet of document.styleSheets) { let css; try { css=sheet.cssRules; } catch { notVerified.push({rule:'*',reason:'cross-origin stylesheet unavailable'}); continue; } const walk=(list)=>{for(const r of list){if(r.cssRules)walk(r.cssRules);if(r.type===CSSRule.KEYFRAMES_RULE){const initial=[...r.cssRules].find((step)=>step.keyText==='from'||step.keyText==='0%');const value=initial?.style?.transform?.match(/scale\(\s*([\d.]+)/)?.[1];if(value!==undefined&&Number(value)<rules['CF-503'].minScale)add('CF-503','LOW',document.documentElement,Number(value),rules['CF-503'].minScale,'derived','declared keyframe');}}};walk(css); }
  return { findings, not_verified:notVerified };
}

export const pageProbe = `(${inspect.toString()})(${JSON.stringify({limits:LIMITS,rules:RULES})})`;
