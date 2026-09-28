// LitStage: the stage path's motion kit, served at /lit/stage-kit.js. Motion primitives only:
// easing, springs, keyframes, sequencing, seeded randomness, text splitting, path draw-on and
// morphing, clip reveals and colour mixing, plus the two calls the renderer listens for
// (LitStage.define and LitStage.text). It ships no scene, object, layout or copy, reads no clock
// and fetches nothing: time always comes in as an argument.
(function (root) {
  'use strict';

  var clamp01 = function (p) { return p <= 0 ? 0 : p >= 1 ? 1 : p; };
  var lerp = function (a, b, p) { return a + (b - a) * p; };
  var isNum = function (v) { return typeof v === 'number' && isFinite(v); };

  // ---- renderer calls --------------------------------------------------------------------------

  function define(spec) {
    if (!spec || typeof spec !== 'object') throw new TypeError('LitStage.define: pass { width, height, fps, duration, render }');
    var host = root.__litHost;
    if (host && typeof host.define === 'function') host.define(spec);
    root.litStage = spec;
    return spec;
  }

  // An element: mark it as a text run (copy, or decor with { decor: true }). Anything else: a
  // canvas or WebGL text registration { content, x, y, w, h } for the current frame.
  function text(target, opts) {
    if (target && target.nodeType === 1) {
      target.setAttribute('data-lit-text', opts && opts.decor ? 'decor' : 'copy');
      return target;
    }
    if (!target || typeof target.content !== 'string' || !target.content.trim()) throw new TypeError('LitStage.text: content must be a non-empty string');
    ['x', 'y', 'w', 'h'].forEach(function (k) { if (!isNum(target[k])) throw new TypeError('LitStage.text: ' + k + ' must be a finite number'); });
    var entry = { content: target.content, x: target.x, y: target.y, w: target.w, h: target.h, decor: Boolean(target.decor || (opts && opts.decor)) };
    var host = root.__litHost;
    if (host && typeof host.text === 'function') host.text(entry);
    else (root.__litStageTexts = root.__litStageTexts || []).push(entry);
    return entry;
  }

  // ---- easing ----------------------------------------------------------------------------------

  var C1 = 1.70158, C2 = C1 * 1.525, C3 = C1 + 1;
  var raw = {
    linear: function (p) { return p; },
    inQuad: function (p) { return p * p; },
    outQuad: function (p) { return 1 - (1 - p) * (1 - p); },
    inOutQuad: function (p) { return p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2; },
    inCubic: function (p) { return p * p * p; },
    outCubic: function (p) { return 1 - Math.pow(1 - p, 3); },
    inOutCubic: function (p) { return p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2; },
    inQuart: function (p) { return p * p * p * p; },
    outQuart: function (p) { return 1 - Math.pow(1 - p, 4); },
    inOutQuart: function (p) { return p < 0.5 ? 8 * p * p * p * p : 1 - Math.pow(-2 * p + 2, 4) / 2; },
    inExpo: function (p) { return Math.pow(2, 10 * p - 10); },
    outExpo: function (p) { return 1 - Math.pow(2, -10 * p); },
    inOutExpo: function (p) { return p < 0.5 ? Math.pow(2, 20 * p - 10) / 2 : (2 - Math.pow(2, -20 * p + 10)) / 2; },
    inBack: function (p) { return C3 * p * p * p - C1 * p * p; },
    outBack: function (p) { return 1 + C3 * Math.pow(p - 1, 3) + C1 * Math.pow(p - 1, 2); },
    inOutBack: function (p) { return p < 0.5 ? (Math.pow(2 * p, 2) * ((C2 + 1) * 2 * p - C2)) / 2 : (Math.pow(2 * p - 2, 2) * ((C2 + 1) * (p * 2 - 2) + C2) + 2) / 2; },
    inSine: function (p) { return 1 - Math.cos((p * Math.PI) / 2); },
    outSine: function (p) { return Math.sin((p * Math.PI) / 2); },
    inOutSine: function (p) { return -(Math.cos(Math.PI * p) - 1) / 2; },
  };
  var ease = {};
  Object.keys(raw).forEach(function (name) {
    ease[name] = function (p) { return p <= 0 ? 0 : p >= 1 ? 1 : raw[name](p); };
  });

  // CSS cubic-bezier(x1, y1, x2, y2): solve x(s) = p (Newton, then bisection), return y(s).
  function bezier(x1, y1, x2, y2) {
    var cx = 3 * x1, bx = 3 * (x2 - x1) - cx, ax = 1 - cx - bx;
    var cy = 3 * y1, by = 3 * (y2 - y1) - cy, ay = 1 - cy - by;
    var X = function (s) { return ((ax * s + bx) * s + cx) * s; };
    var Y = function (s) { return ((ay * s + by) * s + cy) * s; };
    var dX = function (s) { return (3 * ax * s + 2 * bx) * s + cx; };
    return function (p) {
      if (p <= 0) return 0;
      if (p >= 1) return 1;
      var s = p, i;
      for (i = 0; i < 8; i += 1) {
        var err = X(s) - p;
        if (Math.abs(err) < 1e-7) return Y(s);
        var d = dX(s);
        if (Math.abs(d) < 1e-6) break;
        s -= err / d;
      }
      var lo = 0, hi = 1;
      s = p;
      for (i = 0; i < 60; i += 1) {
        var x = X(s);
        if (Math.abs(x - p) < 1e-7) break;
        if (x < p) lo = s; else hi = s;
        s = (lo + hi) / 2;
      }
      return Y(s);
    };
  }

  // Analytic damped harmonic oscillator: m x'' + c x' + k (x - to) = 0, x(0) = from, x'(0) = velocity.
  function spring(opts) {
    var o = opts || {};
    var from = isNum(o.from) ? o.from : 0, to = isNum(o.to) ? o.to : 1;
    var k = isNum(o.stiffness) ? o.stiffness : 170, c = isNum(o.damping) ? o.damping : 26;
    var m = isNum(o.mass) ? o.mass : 1, v0 = isNum(o.velocity) ? o.velocity : 0;
    var d = from - to, w0 = Math.sqrt(k / m), zeta = c / (2 * Math.sqrt(k * m));
    return function (t) {
      if (!(t > 0)) return from;
      if (Math.abs(zeta - 1) < 1e-9) return to + Math.exp(-w0 * t) * (d + (v0 + w0 * d) * t);
      if (zeta < 1) {
        var wd = w0 * Math.sqrt(1 - zeta * zeta);
        return to + Math.exp(-zeta * w0 * t) * (d * Math.cos(wd * t) + ((v0 + zeta * w0 * d) / wd) * Math.sin(wd * t));
      }
      var root = Math.sqrt(zeta * zeta - 1);
      var r1 = -w0 * (zeta - root), r2 = -w0 * (zeta + root);
      var A = (v0 - r2 * d) / (r1 - r2), B = d - A;
      return to + A * Math.exp(r1 * t) + B * Math.exp(r2 * t);
    };
  }

  // ---- keyframes and time --------------------------------------------------------------------

  var easeOf = function (e) { return typeof e === 'function' ? e : (e && ease[e]) || ease.linear; };
  var mixValue = function (a, b, p) {
    if (Array.isArray(a)) return a.map(function (v, i) { return lerp(v, b[i], p); });
    return lerp(a, b, p);
  };

  // keys: [[time, value, ease?], ...] sorted by time; the ease on a key shapes the segment into it.
  function kf(t, keys) {
    if (!keys || !keys.length) throw new TypeError('LitStage.kf: pass [[time, value, ease?], ...]');
    if (t <= keys[0][0]) return keys[0][1];
    var last = keys[keys.length - 1];
    if (t >= last[0]) return last[1];
    for (var i = 0; i + 1 < keys.length; i += 1) {
      var a = keys[i], b = keys[i + 1];
      if (t >= a[0] && t < b[0]) {
        var span = b[0] - a[0];
        return mixValue(a[1], b[1], span > 0 ? easeOf(b[2])((t - a[0]) / span) : 1);
      }
    }
    return last[1];
  }

  function stagger(i, opts) {
    var o = opts || {};
    var each = isNum(o.each) ? o.each : 0.05;
    var count = isNum(o.count) ? o.count : i + 1;
    var from = o.from === undefined ? 0 : o.from;
    var origin = from === 'start' ? 0 : from === 'end' ? count - 1 : from === 'center' ? (count - 1) / 2 : Number(from);
    return Math.abs(i - origin) * each;
  }

  // Named spans laid end to end: seq([['in', 0.8], ['hold', 2]]) -> { in: {start, end, dur}, ..., total }.
  function seq(list) {
    var out = {}, t = 0;
    (list || []).forEach(function (item) {
      var name = Array.isArray(item) ? item[0] : item.name;
      var dur = Array.isArray(item) ? item[1] : item.dur;
      out[name] = { start: t, end: t + dur, dur: dur };
      t += dur;
    });
    out.total = t;
    return out;
  }

  function at(t, span) {
    var s = Array.isArray(span) ? span[0] : span.start, e = Array.isArray(span) ? span[1] : span.end;
    if (!(e > s)) return t >= e ? 1 : 0;
    return clamp01((t - s) / (e - s));
  }

  // Seeded generator (mulberry32): the same seed always gives the same sequence.
  function rand(seed) {
    var a = (Number(seed) || 0) >>> 0;
    var next = function () {
      a = (a + 0x6d2b79f5) >>> 0;
      var x = a;
      x = Math.imul(x ^ (x >>> 15), x | 1);
      x ^= x + Math.imul(x ^ (x >>> 7), x | 61);
      return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
    };
    next.range = function (lo, hi) { return lo + (hi - lo) * next(); };
    next.int = function (lo, hi) { return lo + Math.floor(next() * (hi - lo + 1)); };
    return next;
  }

  // ---- text ------------------------------------------------------------------------------------

  // Tokens that keep whitespace, so an element can be rebuilt exactly.
  function tokens(value, by) {
    var str = String(value);
    if (by === 'eojeol') return str.split(/(\s+)/).filter(function (s) { return s !== ''; });
    var Seg = root.Intl && root.Intl.Segmenter ? root.Intl.Segmenter : (typeof Intl !== 'undefined' ? Intl.Segmenter : null);
    if (!Seg) return Array.from(str);
    var seg = new Seg(undefined, { granularity: by === 'word' ? 'word' : 'grapheme' });
    return Array.from(seg.segment(str), function (s) { return s.segment; });
  }

  // splitText(string, { by }) -> segments; splitText(element, { by }) -> one span per segment.
  function splitText(target, opts) {
    var by = (opts && opts.by) || 'grapheme';
    if (by !== 'grapheme' && by !== 'word' && by !== 'eojeol') throw new TypeError('LitStage.splitText: by is grapheme, word or eojeol');
    if (!target || target.nodeType !== 1) {
      return tokens(target, by).filter(function (s) { return by !== 'eojeol' || !/^\s+$/.test(s); });
    }
    var doc = target.ownerDocument || root.document;
    var parts = tokens(target.textContent || '', by);
    target.textContent = '';
    var spans = [];
    parts.forEach(function (part) {
      if (/^\s+$/.test(part)) { target.appendChild(doc.createTextNode(part)); return; }
      var span = doc.createElement('span');
      span.textContent = part;
      span.style.display = 'inline-block';
      target.appendChild(span);
      spans.push(span);
    });
    if (!target.hasAttribute('data-lit-text')) target.setAttribute('data-lit-text', 'copy');
    return spans;
  }

  // ---- paths, clips, colour ----------------------------------------------------------------

  function drawPath(el, p) {
    var length = el.getTotalLength();
    var offset = length * (1 - clamp01(p));
    el.style.strokeDasharray = String(length);
    el.style.strokeDashoffset = String(offset);
    if (el.setAttribute) { el.setAttribute('stroke-dasharray', String(length)); el.setAttribute('stroke-dashoffset', String(offset)); }
    return el;
  }

  var fmt = function (n) { var r = Math.round(n * 1000) / 1000; return String(r === 0 ? 0 : r); };

  function clip(el, p, opts) {
    var from = (opts && opts.from) || 'left';
    var q = (1 - clamp01(p)) * 100, h = q / 2;
    var inset = {
      left: [0, q, 0, 0], right: [0, 0, 0, q], top: [0, 0, q, 0], bottom: [q, 0, 0, 0], center: [h, h, h, h],
    }[from];
    if (!inset) throw new TypeError('LitStage.clip: from is left, right, top, bottom or center');
    el.style.clipPath = 'inset(' + inset.map(function (v) { return fmt(v) + '%'; }).join(' ') + ')';
    return el;
  }

  function circle(el, p, opts) {
    var x = (opts && opts.x) || '50%', y = (opts && opts.y) || '50%';
    var rect = el.getBoundingClientRect ? el.getBoundingClientRect() : null;
    var r;
    if (rect && rect.width > 0 && rect.height > 0) {
      var at = function (v, size) { var s = String(v); return /%$/.test(s) ? (parseFloat(s) / 100) * size : parseFloat(s); };
      var px = at(x, rect.width), py = at(y, rect.height);
      var far = Math.max(Math.hypot(px, py), Math.hypot(rect.width - px, py), Math.hypot(px, rect.height - py), Math.hypot(rect.width - px, rect.height - py));
      r = fmt(far * clamp01(p)) + 'px';
    } else r = fmt(150 * clamp01(p)) + '%';
    el.style.clipPath = 'circle(' + r + ' at ' + x + ' ' + y + ')';
    return el;
  }

  function rgb(hex) {
    var h = String(hex).replace('#', '');
    if (h.length === 3) h = h.split('').map(function (c) { return c + c; }).join('');
    if (!/^[0-9a-f]{6}$/i.test(h)) throw new TypeError('LitStage.mix: colours are #rgb or #rrggbb');
    return [0, 2, 4].map(function (i) { return parseInt(h.slice(i, i + 2), 16); });
  }
  function hex(channels) {
    return '#' + channels.map(function (v) { var s = Math.max(0, Math.min(255, Math.round(v))).toString(16); return s.length < 2 ? '0' + s : s; }).join('');
  }
  function mix(a, b, p) {
    var A = rgb(a), B = rgb(b), q = clamp01(p);
    return hex([0, 1, 2].map(function (i) { return lerp(A[i], B[i], q); }));
  }

  // ---- morph -----------------------------------------------------------------------------------
  // Single-subpath morph: both paths become cubic segments, are cut into the same number of
  // pieces (allotted to each source segment by its arc length, split exactly), closed paths are
  // rotated to line up, and every control point is interpolated.

  var MULTI = 'LitStage.morph: multi-subpath paths are not supported; split them into separate paths';
  var lineCubic = function (a, b) { return [a, [lerp(a[0], b[0], 1 / 3), lerp(a[1], b[1], 1 / 3)], [lerp(a[0], b[0], 2 / 3), lerp(a[1], b[1], 2 / 3)], b]; };

  function arcCubics(p0, rx, ry, phi, large, sweep, p1) {
    if (rx === 0 || ry === 0 || (p0[0] === p1[0] && p0[1] === p1[1])) return [lineCubic(p0, p1)];
    var rad = (phi * Math.PI) / 180, sin = Math.sin(rad), cos = Math.cos(rad);
    var dx = (p0[0] - p1[0]) / 2, dy = (p0[1] - p1[1]) / 2;
    var x1 = cos * dx + sin * dy, y1 = -sin * dx + cos * dy;
    rx = Math.abs(rx); ry = Math.abs(ry);
    var lam = (x1 * x1) / (rx * rx) + (y1 * y1) / (ry * ry);
    if (lam > 1) { rx *= Math.sqrt(lam); ry *= Math.sqrt(lam); }
    var num = rx * rx * ry * ry - rx * rx * y1 * y1 - ry * ry * x1 * x1;
    var den = rx * rx * y1 * y1 + ry * ry * x1 * x1;
    var coef = (large === sweep ? -1 : 1) * Math.sqrt(Math.max(0, num / den));
    var cxp = (coef * rx * y1) / ry, cyp = (-coef * ry * x1) / rx;
    var cx = cos * cxp - sin * cyp + (p0[0] + p1[0]) / 2, cy = sin * cxp + cos * cyp + (p0[1] + p1[1]) / 2;
    var angle = function (ux, uy, vx, vy) { return Math.atan2(ux * vy - uy * vx, ux * vx + uy * vy); };
    var t1 = angle(1, 0, (x1 - cxp) / rx, (y1 - cyp) / ry);
    var dt = angle((x1 - cxp) / rx, (y1 - cyp) / ry, (-x1 - cxp) / rx, (-y1 - cyp) / ry);
    if (!sweep && dt > 0) dt -= 2 * Math.PI;
    if (sweep && dt < 0) dt += 2 * Math.PI;
    var n = Math.max(1, Math.ceil(Math.abs(dt) / (Math.PI / 2) - 1e-9)), delta = dt / n, k = (4 / 3) * Math.tan(delta / 4);
    var map = function (ux, uy) { return [cos * rx * ux - sin * ry * uy + cx, sin * rx * ux + cos * ry * uy + cy]; };
    var out = [], start = p0;
    for (var i = 0; i < n; i += 1) {
      var a1 = t1 + i * delta, a2 = a1 + delta;
      var c1 = map(Math.cos(a1) - k * Math.sin(a1), Math.sin(a1) + k * Math.cos(a1));
      var c2 = map(Math.cos(a2) + k * Math.sin(a2), Math.sin(a2) - k * Math.cos(a2));
      var end = i === n - 1 ? p1 : map(Math.cos(a2), Math.sin(a2));
      out.push([start, c1, c2, end]);
      start = end;
    }
    return out;
  }

  // Path data -> { segs: [[p0, c1, c2, p3], ...], closed }.
  function parsePath(d) {
    var toks = String(d).match(/[MmLlHhVvCcSsQqTtAaZz]|[-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?/g) || [];
    var i = 0, cmd = null, cur = [0, 0], start = [0, 0], segs = [], closed = false, moves = 0;
    var lastC = null, lastQ = null;
    var num = function () { var v = Number(toks[i]); i += 1; if (!isFinite(v)) throw new TypeError('LitStage.morph: malformed path data'); return v; };
    var isCmd = function (t) { return /^[A-Za-z]$/.test(t); };
    while (i < toks.length) {
      if (isCmd(toks[i])) { cmd = toks[i]; i += 1; } else if (!cmd) throw new TypeError('LitStage.morph: path data must start with M');
      var rel = cmd === cmd.toLowerCase(), C = cmd.toUpperCase();
      var pt = function () { var x = num(), y = num(); return rel ? [cur[0] + x, cur[1] + y] : [x, y]; };
      if (C === 'Z') {
        if (Math.hypot(cur[0] - start[0], cur[1] - start[1]) > 1e-9) segs.push(lineCubic(cur, start));
        cur = start; closed = true; lastC = lastQ = null;
        continue;
      }
      if (closed && C !== 'M') throw new Error(MULTI);
      if (C === 'M') {
        moves += 1;
        if (moves > 1 || segs.length) throw new Error(MULTI);
        cur = start = pt();
        cmd = rel ? 'l' : 'L';
        lastC = lastQ = null;
        continue;
      }
      var seg = null;
      if (C === 'L') seg = lineCubic(cur, pt());
      else if (C === 'H') { var hx = num(); seg = lineCubic(cur, [rel ? cur[0] + hx : hx, cur[1]]); }
      else if (C === 'V') { var vy = num(); seg = lineCubic(cur, [cur[0], rel ? cur[1] + vy : vy]); }
      else if (C === 'C') { var c1 = pt(), c2 = pt(), e = pt(); seg = [cur, c1, c2, e]; }
      else if (C === 'S') { var r1 = lastC ? [2 * cur[0] - lastC[0], 2 * cur[1] - lastC[1]] : cur; var s2 = pt(), se = pt(); seg = [cur, r1, s2, se]; }
      else if (C === 'Q' || C === 'T') {
        var q = C === 'Q' ? pt() : lastQ ? [2 * cur[0] - lastQ[0], 2 * cur[1] - lastQ[1]] : cur;
        var qe = pt();
        seg = [cur, [cur[0] + (2 / 3) * (q[0] - cur[0]), cur[1] + (2 / 3) * (q[1] - cur[1])], [qe[0] + (2 / 3) * (q[0] - qe[0]), qe[1] + (2 / 3) * (q[1] - qe[1])], qe];
        lastQ = q;
      } else if (C === 'A') {
        var rx = num(), ry = num(), rot = num(), large = num() !== 0, sweep = num() !== 0, ae = pt();
        arcCubics(cur, rx, ry, rot, large, sweep, ae).forEach(function (s) { segs.push(s); });
        cur = ae; lastC = lastQ = null;
        continue;
      } else throw new TypeError('LitStage.morph: unsupported command ' + cmd);
      segs.push(seg);
      lastC = C === 'C' || C === 'S' ? seg[2] : null;
      if (C !== 'Q' && C !== 'T') lastQ = null;
      cur = seg[3];
    }
    if (!segs.length) throw new TypeError('LitStage.morph: path has no drawable segment');
    return { segs: segs, closed: closed };
  }

  var bez = function (s, t) {
    var u = 1 - t;
    return [0, 1].map(function (k) { return u * u * u * s[0][k] + 3 * u * u * t * s[1][k] + 3 * u * t * t * s[2][k] + t * t * t * s[3][k]; });
  };
  function splitAt(s, t) {
    var L = function (a, b) { return [lerp(a[0], b[0], t), lerp(a[1], b[1], t)]; };
    var a = L(s[0], s[1]), b = L(s[1], s[2]), c = L(s[2], s[3]), ab = L(a, b), bc = L(b, c), m = L(ab, bc);
    return [[s[0], a, ab, m], [m, bc, c, s[3]]];
  }
  function sub(s, t0, t1) {
    var left = t1 >= 1 ? s : splitAt(s, t1)[0];
    return t0 <= 0 ? left : splitAt(left, t0 / t1)[1];
  }
  function lengthTable(s, n) {
    var table = [0], prev = s[0], total = 0;
    for (var i = 1; i <= n; i += 1) { var q = bez(s, i / n); total += Math.hypot(q[0] - prev[0], q[1] - prev[1]); table.push(total); prev = q; }
    return table;
  }
  function tAtFraction(table, f) {
    var n = table.length - 1, target = f * table[n];
    for (var i = 1; i <= n; i += 1) if (table[i] >= target) { var span = table[i] - table[i - 1]; return (i - 1 + (span > 0 ? (target - table[i - 1]) / span : 0)) / n; }
    return 1;
  }

  // Cut the segments into exactly `count` pieces, allotted by arc length (at least one each).
  function resample(segs, count) {
    var tables = segs.map(function (s) { return lengthTable(s, 32); });
    var lengths = tables.map(function (t) { return t[t.length - 1]; });
    var total = lengths.reduce(function (a, b) { return a + b; }, 0) || 1;
    var extra = count - segs.length;
    var shares = lengths.map(function (l) { return (l / total) * extra; });
    var alloc = shares.map(function (s) { return 1 + Math.floor(s); });
    var left = count - alloc.reduce(function (a, b) { return a + b; }, 0);
    shares.map(function (s, i) { return [s - Math.floor(s), i]; }).sort(function (a, b) { return b[0] - a[0] || a[1] - b[1]; }).slice(0, left).forEach(function (r) { alloc[r[1]] += 1; });
    var out = [];
    segs.forEach(function (s, i) {
      var ts = [0];
      for (var j = 1; j < alloc[i]; j += 1) ts.push(tAtFraction(tables[i], j / alloc[i]));
      ts.push(1);
      for (var k = 0; k + 1 < ts.length; k += 1) out.push(sub(s, ts[k], ts[k + 1]));
    });
    return out;
  }

  function morph(dA, dB, opts) {
    var A = parsePath(dA), B = parsePath(dB);
    var count = Math.max((opts && opts.samples) || 64, A.segs.length, B.segs.length);
    var a = resample(A.segs, count), b = resample(B.segs, count);
    var closed = A.closed && B.closed;
    if (closed) {
      var best = 0, bestCost = Infinity;
      for (var r = 0; r < count; r += 1) {
        var cost = 0;
        for (var i = 0; i < count && cost < bestCost; i += 1) {
          var pa = a[i][0], pb = b[(i + r) % count][0];
          cost += (pa[0] - pb[0]) * (pa[0] - pb[0]) + (pa[1] - pb[1]) * (pa[1] - pb[1]);
        }
        if (cost < bestCost) { bestCost = cost; best = r; }
      }
      b = b.slice(best).concat(b.slice(0, best));
    }
    return function (p) {
      var q = clamp01(p);
      var P = function (x, y) { return fmt(lerp(x[0], y[0], q)) + ' ' + fmt(lerp(x[1], y[1], q)); };
      var d = 'M' + P(a[0][0], b[0][0]);
      for (var i = 0; i < count; i += 1) d += ' C' + P(a[i][1], b[i][1]) + ' ' + P(a[i][2], b[i][2]) + ' ' + P(a[i][3], b[i][3]);
      return closed ? d + ' Z' : d;
    };
  }

  root.LitStage = {
    define: define,
    text: text,
    ease: ease,
    bezier: bezier,
    spring: spring,
    kf: kf,
    stagger: stagger,
    seq: seq,
    at: at,
    rand: rand,
    splitText: splitText,
    drawPath: drawPath,
    morph: morph,
    clip: clip,
    circle: circle,
    mix: mix,
    rgb: rgb,
    hex: hex,
  };
})(typeof window !== 'undefined' ? window : this);
