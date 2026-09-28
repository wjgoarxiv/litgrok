// Stage text QA helpers, evaluated only in the QA replay Chrome (never in the master capture).
// runs() reads every text run with its clipped rects, opacity chain and size; hide()/show() swap
// one stylesheet that makes every glyph transparent so two captures isolate the ink (brief 6g).
(() => {
  if (window.__litQa) return;
  const BLOCK = /^(block|flex|grid|list-item|table|table-cell|table-caption|flow-root|inline-block|inline-flex|inline-grid)$/;
  const norm = (s) => String(s).replace(/\s+/g, ' ').trim();
  let nextId = 1;
  const idOf = (el) => { if (!el.dataset.litQa) el.dataset.litQa = String(nextId++); return el.dataset.litQa; };

  function ownerOf(node) {
    const el = node.parentElement;
    if (!el) return null;
    const marked = el.closest('[data-lit-text]');
    if (marked) return marked;
    const svgText = el.closest('text');
    if (svgText && svgText.namespaceURI === 'http://www.w3.org/2000/svg') return svgText;
    for (let cur = el; cur && cur !== document.documentElement; cur = cur.parentElement) {
      if (cur.namespaceURI === 'http://www.w3.org/2000/svg' && cur.tagName.toLowerCase() !== 'foreignobject') continue;
      if (BLOCK.test(getComputedStyle(cur).display)) return cur;
    }
    return document.body;
  }

  function opacityChain(el) {
    let o = 1;
    for (let cur = el; cur && cur.nodeType === 1; cur = cur.parentElement) {
      const cs = getComputedStyle(cur);
      if (cs.display === 'none') return 0;
      o *= Number(cs.opacity);
      if (cur.namespaceURI === 'http://www.w3.org/2000/svg') {
        const fo = cs.fillOpacity !== undefined ? Number(cs.fillOpacity) : 1;
        if (cur.tagName.toLowerCase() === 'text' || cur.tagName.toLowerCase() === 'tspan') o *= fo;
      }
    }
    if (getComputedStyle(el).visibility === 'hidden') return 0;
    return o;
  }

  function clipBox(el) {
    let box = { x0: 0, y0: 0, x1: innerWidth, y1: innerHeight };
    for (let cur = el.parentElement; cur && cur !== document.documentElement; cur = cur.parentElement) {
      const cs = getComputedStyle(cur);
      if (cs.overflow !== 'visible' || cs.overflowX !== 'visible' || cs.overflowY !== 'visible' || cs.clipPath !== 'none') {
        const r = cur.getBoundingClientRect();
        box = { x0: Math.max(box.x0, r.left), y0: Math.max(box.y0, r.top), x1: Math.min(box.x1, r.right), y1: Math.min(box.y1, r.bottom) };
      }
    }
    return box;
  }

  function scaleOf(el) {
    if (typeof el.getScreenCTM === 'function' && el.getScreenCTM()) { const m = el.getScreenCTM(); return Math.hypot(m.a, m.b); }
    let s = 1;
    for (let cur = el; cur && cur.nodeType === 1; cur = cur.parentElement) {
      const t = getComputedStyle(cur).transform;
      if (t && t !== 'none') { const m = new DOMMatrixReadOnly(t); s *= Math.hypot(m.a, m.b); }
    }
    return s;
  }

  function pseudoText(el, which) {
    const content = getComputedStyle(el, which).content;
    if (!content || content === 'none' || content === 'normal') return '';
    const m = content.match(/^"(.*)"$/s);
    return m ? m[1] : '';
  }

  window.__litQa = {
    runs() {
      const groups = new Map();
      const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      for (let node = walker.nextNode(); node; node = walker.nextNode()) {
        if (!node.nodeValue.trim()) continue;
        const parent = node.parentElement;
        if (!parent || ['SCRIPT', 'STYLE', 'NOSCRIPT', 'TEMPLATE'].includes(parent.tagName)) continue;
        const owner = ownerOf(node);
        if (!owner) continue;
        if (!groups.has(owner)) groups.set(owner, []);
        groups.get(owner).push(node);
      }
      for (const el of document.body.querySelectorAll('*')) {
        for (const which of ['::before', '::after']) {
          const text = pseudoText(el, which);
          if (text.trim()) { if (!groups.has(el)) groups.set(el, []); groups.get(el).pseudo = (groups.get(el).pseudo || '') + text; }
        }
      }
      const out = [];
      for (const [owner, nodes] of groups) {
        const text = norm((owner.getAttribute('data-lit-text') || owner.tagName.toLowerCase() === 'text' ? owner.textContent : nodes.map((n) => n.nodeValue).join(' ')) + ' ' + (nodes.pseudo || ''));
        if (!text) continue;
        const clip = clipBox(owner);
        const rects = [];
        for (const node of nodes) {
          const range = document.createRange();
          range.selectNodeContents(node);
          for (const r of range.getClientRects()) {
            const x0 = Math.max(r.left, clip.x0), y0 = Math.max(r.top, clip.y0), x1 = Math.min(r.right, clip.x1), y1 = Math.min(r.bottom, clip.y1);
            if (x1 > x0 && y1 > y0) rects.push([x0, y0, x1, y1]);
          }
        }
        if (nodes.pseudo) {
          const r = owner.getBoundingClientRect();
          const x0 = Math.max(r.left, clip.x0), y0 = Math.max(r.top, clip.y0), x1 = Math.min(r.right, clip.x1), y1 = Math.min(r.bottom, clip.y1);
          if (x1 > x0 && y1 > y0) rects.push([x0, y0, x1, y1]);
        }
        const cs = getComputedStyle(owner);
        const clipText = cs.backgroundClip === 'text' || cs.webkitBackgroundClip === 'text';
        out.push({
          id: idOf(owner), text, decor: owner.getAttribute('data-lit-text') === 'decor', marked: owner.hasAttribute('data-lit-text'),
          rects, opacity: opacityChain(owner), fontSizePx: parseFloat(cs.fontSize) || 0, scale: scaleOf(owner), fontFamily: cs.fontFamily,
          weight: Number(cs.fontWeight) || 400, gradient: clipText,
        });
      }
      return out;
    },
    hide() {
      for (const el of document.querySelectorAll('*')) {
        const cs = getComputedStyle(el);
        if (cs.backgroundClip === 'text' || cs.webkitBackgroundClip === 'text') el.setAttribute('data-lit-qa-clip', '');
      }
      const style = document.createElement('style');
      style.id = '__lit_qa_hide';
      style.textContent = '*, *::before, *::after { color: transparent !important; -webkit-text-fill-color: transparent !important; -webkit-text-stroke-color: transparent !important; } svg text, svg tspan, svg textPath { fill: transparent !important; stroke: transparent !important; } [data-lit-qa-clip] { background-image: none !important; }';
      document.head.appendChild(style);
    },
    show() { document.getElementById('__lit_qa_hide')?.remove(); },
    // Animations present before a hide/show swap keep running on the virtual clock; any animation the
    // swap itself starts (a colour transition) is cancelled so the swap lands at once.
    snapshot() { window.__litQaKnown = new Set(document.getAnimations()); },
    cancelNew() {
      getComputedStyle(document.documentElement).opacity;
      for (const animation of document.getAnimations()) if (!window.__litQaKnown.has(animation)) animation.cancel();
      getComputedStyle(document.documentElement).opacity;
    },
  };
})();
