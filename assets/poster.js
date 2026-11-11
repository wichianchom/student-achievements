/* ระบบแจ้งผลงานนักเรียน — วาดกราฟิกแสดงความยินดี และสร้างแคปชัน */
(function () {
  'use strict';
  const SA = window.SA;
  const FD = '"Mitr","Sarabun",sans-serif', FB = '"Sarabun",sans-serif', FS = '"Charmonman","Mitr",serif';

  let fontsP = null;
  function ensureFonts() {
    if (!fontsP) {
      fontsP = (document.fonts && document.fonts.load) ? Promise.all([
        document.fonts.load('700 80px "Charmonman"', 'ขอแสดงความยินดี'),
        document.fonts.load('600 48px "Mitr"', 'ชนะเลิศ 2569'),
        document.fonts.load('500 32px "Mitr"', 'โรงเรียน'),
        document.fonts.load('400 28px "Sarabun"', 'ครูผู้ฝึกสอน'),
        document.fonts.load('500 28px "Sarabun"', 'นักเรียนชั้น'),
        document.fonts.load('600 32px "Sarabun"', 'การแข่งขัน')
      ]).catch(() => {}) : Promise.resolve();
    }
    return fontsP;
  }

  // ตัดบรรทัดภาษาไทยตามคำ (ภาษาไทยไม่มีเว้นวรรคระหว่างคำ)
  const seg = (typeof Intl !== 'undefined' && Intl.Segmenter) ? new Intl.Segmenter('th', { granularity: 'word' }) : null;
  function tokens(t) {
    if (seg) return Array.from(seg.segment(t), s => s.segment);
    const o = [];
    for (const ch of t) { if (/[ัิ-ฺ็-๎]/.test(ch) && o.length) o[o.length - 1] += ch; else o.push(ch); }
    return o;
  }
  function wrap(ctx, text, maxW) {
    const lines = [];
    for (const para of String(text).split('\n')) {
      let line = '';
      for (const t of tokens(para)) {
        const test = line + t;
        if (line && ctx.measureText(test).width > maxW) { lines.push(line.trim()); line = t.replace(/^\s+/, ''); }
        else line = test;
      }
      lines.push(line.trim());
    }
    return lines.filter((l, i, a) => l || a.length === 1);
  }
  function fitText(ctx, text, fontFn, maxW, maxLines, start, min) {
    let s = start, lines;
    while (s >= min) {
      ctx.font = fontFn(s); lines = wrap(ctx, text, maxW);
      if (lines.length <= maxLines && lines.every(l => ctx.measureText(l).width <= maxW + 1)) return { size: s, lines: lines };
      s -= 2;
    }
    ctx.font = fontFn(min); lines = wrap(ctx, text, maxW);
    if (lines.length > maxLines) { lines = lines.slice(0, maxLines); lines[maxLines - 1] = lines[maxLines - 1].slice(0, -2) + '…'; }
    return { size: min, lines: lines };
  }
  function drawLines(ctx, r, y, lh, W) { r.lines.forEach((l, i) => ctx.fillText(l, W / 2, y + r.size * (0.95 + i * lh))); return y + r.size * r.lines.length * lh; }

  function hexRGB(h) { h = String(h || '#000').replace('#', ''); if (h.length === 3) h = h.split('').map(c => c + c).join(''); const n = parseInt(h, 16) || 0; return [n >> 16 & 255, n >> 8 & 255, n & 255]; }
  function rgba(h, a) { const c = hexRGB(h); return 'rgba(' + c[0] + ',' + c[1] + ',' + c[2] + ',' + a + ')'; }
  function shade(h, amt) { const c = hexRGB(h); const f = v => Math.round(amt >= 0 ? v + (255 - v) * amt : v * (1 + amt)); return 'rgb(' + f(c[0]) + ',' + f(c[1]) + ',' + f(c[2]) + ')'; }
  function lum(h) { const c = hexRGB(h).map(v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }); return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]; }
  function rr(ctx, x, y, w, h, r) { ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); }

  function themeFor(tpl, c1, c2) {
    if (tpl === 'certificate') return { fg: c1, fg2: rgba(c1, 0.78), head: c1, accent: c2, ribbonFg: lum(c2) > 0.35 ? '#1c1606' : '#ffffff', tailA: c1, tailB: c2 };
    const light = lum(c1) > 0.45;
    return { fg: light ? '#15151a' : '#ffffff', fg2: light ? 'rgba(20,20,26,.78)' : 'rgba(255,255,255,.82)', head: light ? shade(c2, -0.35) : c2, accent: c2,
      ribbonFg: lum(c2) > 0.35 ? (light ? '#15151a' : c1) : '#ffffff', tailA: light ? shade(c1, -0.25) : '#ffffff', tailB: c2 };
  }
  function drawBg(ctx, W, H, tpl, c1, c2) {
    if (tpl === 'certificate') {
      ctx.fillStyle = '#fbf8f1'; ctx.fillRect(0, 0, W, H);
      ctx.save(); ctx.strokeStyle = rgba(c1, 0.045); ctx.lineWidth = 2;
      for (let r = 50; r < Math.max(W, H); r += 24) { ctx.beginPath(); ctx.arc(W / 2, H * 0.46, r, 0, Math.PI * 2); ctx.stroke(); }
      ctx.restore();
      ctx.strokeStyle = c1; ctx.lineWidth = 16; ctx.strokeRect(30, 30, W - 60, H - 60);
      ctx.strokeStyle = c2; ctx.lineWidth = 3; ctx.strokeRect(54, 54, W - 108, H - 108);
      ctx.fillStyle = c2;
      [[54, 54], [W - 54, 54], [54, H - 54], [W - 54, H - 54]].forEach(p => { ctx.beginPath(); ctx.moveTo(p[0], p[1] - 16); ctx.lineTo(p[0] + 16, p[1]); ctx.lineTo(p[0], p[1] + 16); ctx.lineTo(p[0] - 16, p[1]); ctx.closePath(); ctx.fill(); });
      return;
    }
    ctx.fillStyle = c1; ctx.fillRect(0, 0, W, H);
    const cx = W / 2, cy = H * 0.42, R = Math.hypot(W, H);
    ctx.save(); ctx.fillStyle = 'rgba(255,255,255,0.05)';
    const n = 36; for (let i = 0; i < n; i += 2) { ctx.beginPath(); ctx.moveTo(cx, cy); ctx.arc(cx, cy, R, i / n * Math.PI * 2, (i + 1) / n * Math.PI * 2); ctx.closePath(); ctx.fill(); }
    ctx.restore();
    const g = ctx.createRadialGradient(cx, cy, 40, cx, cy, R * 0.62); g.addColorStop(0, 'rgba(255,255,255,0.14)'); g.addColorStop(1, 'rgba(0,0,0,0.30)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    ctx.save(); ctx.fillStyle = c2;
    const band = (a, b, alpha) => {
      ctx.globalAlpha = alpha;
      ctx.beginPath(); ctx.moveTo(0, a); ctx.lineTo(a, 0); ctx.lineTo(b, 0); ctx.lineTo(0, b); ctx.closePath(); ctx.fill();
      ctx.beginPath(); ctx.moveTo(W, H - a); ctx.lineTo(W - a, H); ctx.lineTo(W - b, H); ctx.lineTo(W, H - b); ctx.closePath(); ctx.fill();
    };
    band(110, 148, 0.95); band(168, 182, 0.55); ctx.restore();
  }
  function cover(ctx, img, x, y, w, h) { const iw = img.naturalWidth, ih = img.naturalHeight, s = Math.max(w / iw, h / ih), dw = iw * s, dh = ih * s; ctx.drawImage(img, x + (w - dw) / 2, y + (h - dh) * 0.3, dw, dh); }
  function drawPhoto(ctx, img, x, y, w, h, T, tpl) {
    ctx.save(); ctx.shadowColor = 'rgba(0,0,0,.35)'; ctx.shadowBlur = 36; ctx.shadowOffsetY = 12; rr(ctx, x, y, w, h, 22); ctx.fillStyle = '#000'; ctx.fill(); ctx.restore();
    ctx.save(); rr(ctx, x, y, w, h, 22); ctx.clip(); cover(ctx, img, x, y, w, h); ctx.restore();
    ctx.save(); rr(ctx, x, y, w, h, 22); ctx.lineWidth = tpl === 'certificate' ? 5 : 8; ctx.strokeStyle = T.accent; ctx.stroke(); ctx.restore();
  }
  function star(ctx, cx, cy, r) { ctx.beginPath(); for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, rad = i % 2 ? r * 0.45 : r; ctx.lineTo(cx + Math.cos(a) * rad, cy + Math.sin(a) * rad); } ctx.closePath(); }
  function drawMedal(ctx, cx, top, ph, T, t) {
    const pal = { gold: ['#fff0b3', '#e0ad2a', '#9a6c0a'], silver: ['#ffffff', '#c3cad4', '#7b8592'], bronze: ['#ffd9b5', '#c47d40', '#7a451c'], plain: ['#fff0b3', '#e0ad2a', '#9a6c0a'] }[t];
    const r = Math.min(ph * 0.36, 128), cy = top + ph - r - 4;
    ctx.fillStyle = T.tailA; ctx.beginPath(); ctx.moveTo(cx - r * 0.95, top); ctx.lineTo(cx - r * 0.35, top); ctx.lineTo(cx + r * 0.25, cy - r * 0.55); ctx.lineTo(cx - r * 0.35, cy - r * 0.55); ctx.closePath(); ctx.fill();
    ctx.fillStyle = T.tailB; ctx.beginPath(); ctx.moveTo(cx + r * 0.35, top); ctx.lineTo(cx + r * 0.95, top); ctx.lineTo(cx + r * 0.35, cy - r * 0.55); ctx.lineTo(cx - r * 0.25, cy - r * 0.55); ctx.closePath(); ctx.fill();
    ctx.save(); ctx.shadowColor = 'rgba(0,0,0,.35)'; ctx.shadowBlur = 24; ctx.shadowOffsetY = 8;
    const g = ctx.createLinearGradient(cx - r, cy - r, cx + r, cy + r); g.addColorStop(0, pal[0]); g.addColorStop(0.55, pal[1]); g.addColorStop(1, pal[2]);
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fillStyle = g; ctx.fill(); ctx.restore();
    ctx.beginPath(); ctx.arc(cx, cy, r * 0.78, 0, Math.PI * 2); ctx.lineWidth = Math.max(3, r * 0.04); ctx.strokeStyle = 'rgba(0,0,0,.18)'; ctx.stroke();
    star(ctx, cx, cy, r * 0.46); ctx.fillStyle = pal[2]; ctx.globalAlpha = 0.75; ctx.fill(); ctx.globalAlpha = 1;
  }
  function drawAward(ctx, text, cx, y, W, T) {
    let s = 46; ctx.font = '600 ' + s + 'px ' + FD; let tw = ctx.measureText(text).width; const maxW = W - 260;
    while (tw > maxW && s > 26) { s -= 2; ctx.font = '600 ' + s + 'px ' + FD; tw = ctx.measureText(text).width; }
    const bh = Math.round(s * 1.75), bw = Math.min(W - 120, tw + 130), x0 = cx - bw / 2, notch = 28;
    const g = ctx.createLinearGradient(x0, 0, x0 + bw, 0); g.addColorStop(0, shade(T.accent, -0.14)); g.addColorStop(0.5, shade(T.accent, 0.22)); g.addColorStop(1, shade(T.accent, -0.14));
    ctx.beginPath(); ctx.moveTo(x0, y); ctx.lineTo(x0 + bw, y); ctx.lineTo(x0 + bw - notch, y + bh / 2); ctx.lineTo(x0 + bw, y + bh); ctx.lineTo(x0, y + bh); ctx.lineTo(x0 + notch, y + bh / 2); ctx.closePath(); ctx.fillStyle = g; ctx.fill();
    ctx.fillStyle = T.ribbonFg; ctx.textBaseline = 'middle'; ctx.fillText(text, cx, y + bh / 2 + 2); ctx.textBaseline = 'alphabetic';
    return bh;
  }
  function drawLogo(ctx, img, cx, cy, r) {
    ctx.save(); ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fillStyle = '#ffffff'; ctx.fill(); ctx.clip();
    const iw = img.naturalWidth, ih = img.naturalHeight, s = Math.min(r * 1.6 / iw, r * 1.6 / ih);
    ctx.drawImage(img, cx - iw * s / 2, cy - ih * s / 2, iw * s, ih * s); ctx.restore();
  }

  function layout(ctx, P) {
    const W = P.W, H = P.H, tpl = P.tpl, c1 = P.c1, c2 = P.c2, it = P.item, cfg = P.config, sq = H < 1200, cert = tpl === 'certificate';
    const T = themeFor(tpl, c1, c2);
    ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, W, H); ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
    drawBg(ctx, W, H, tpl, c1, c2);
    const side = cert ? 140 : 100, maxW = W - side * 2;
    let y = cert ? 88 : 60;
    if (P.logo) { const r = sq ? 38 : 46; drawLogo(ctx, P.logo, W / 2, y + r, r); y += r * 2 + 12; }
    ctx.fillStyle = T.fg; y = drawLines(ctx, fitText(ctx, cfg.schoolName || 'ชื่อโรงเรียน', s => '500 ' + s + 'px ' + FD, maxW, 1, sq ? 32 : 36, 22), y, 1.25, W);
    if (cfg.affiliation) { ctx.fillStyle = T.fg2; y = drawLines(ctx, fitText(ctx, cfg.affiliation, s => '400 ' + s + 'px ' + FB, maxW, 1, sq ? 22 : 24, 17), y, 1.3, W); }
    y += 6;
    ctx.fillStyle = T.head; y = drawLines(ctx, fitText(ctx, P.headline, s => '700 ' + s + 'px ' + FS, W - (cert ? 220 : 140), 1, sq ? 88 : 104, 54), y, 1.22, W);
    if (cert) { ctx.strokeStyle = c2; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(W / 2 - 130, y + 2); ctx.lineTo(W / 2 + 130, y + 2); ctx.stroke(); y += 10; }
    y += 14;
    if (P.photo) { const pw = Math.min(W - 2 * (cert ? 120 : 84), Math.round(P.ph * 1.5)); drawPhoto(ctx, P.photo, (W - pw) / 2, y, pw, P.ph, T, tpl); y += P.ph + 30; }
    else { drawMedal(ctx, W / 2, y, P.ph, T, SA.tier(it.award)); y += P.ph + 18; }
    ctx.fillStyle = T.fg; y = drawLines(ctx, fitText(ctx, SA.joinNames(it.students) || 'ชื่อนักเรียน', s => '600 ' + s + 'px ' + FD, maxW, 3, sq ? 50 : 58, 30), y, 1.28, W);
    const cl = SA.classLine(it.students);
    if (cl) { ctx.fillStyle = T.fg2; y = drawLines(ctx, fitText(ctx, cl, s => '500 ' + s + 'px ' + FB, maxW, 1, 30, 22), y + 2, 1.3, W); }
    y += 14;
    if (it.award) y += drawAward(ctx, it.award, W / 2, y, W, T) + 18;
    ctx.fillStyle = T.fg; y = drawLines(ctx, fitText(ctx, it.title || '', s => '600 ' + s + 'px ' + FB, maxW, 2, sq ? 32 : 36, 24), y, 1.3, W);
    const l2 = [it.level, it.organizer ? 'จัดโดย ' + it.organizer : ''].filter(Boolean).join(' · ');
    if (l2) { ctx.fillStyle = T.fg2; y = drawLines(ctx, fitText(ctx, l2, s => '400 ' + s + 'px ' + FB, maxW, 2, sq ? 25 : 28, 20), y + 4, 1.3, W); }
    const l3 = [it.date ? 'วันที่ ' + SA.thDate(it.date, true) : '', it.venue ? 'ณ ' + it.venue : ''].filter(Boolean).join(' ');
    if (l3) { ctx.fillStyle = T.fg2; y = drawLines(ctx, fitText(ctx, l3, s => '400 ' + s + 'px ' + FB, maxW, 1, sq ? 24 : 26, 18), y + 2, 1.3, W); }
    if (it.coach) { ctx.fillStyle = T.fg2; y = drawLines(ctx, fitText(ctx, 'ครูผู้ฝึกสอน: ' + it.coach, s => '400 ' + s + 'px ' + FB, maxW, 2, sq ? 24 : 26, 18), y + 2, 1.3, W); }
    const fy = cert ? H - 82 : H - 46;
    if (cfg.hashtags) {
      ctx.fillStyle = T.fg2; const r = fitText(ctx, cfg.hashtags, s => '500 ' + s + 'px ' + FB, W - (cert ? 240 : 180), 1, 24, 16);
      ctx.font = '500 ' + r.size + 'px ' + FB; ctx.fillText(r.lines[0], W / 2, fy);
    }
    if (!cert) { ctx.strokeStyle = rgba(c2, 0.85); ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(W / 2 - 70, fy - 40); ctx.lineTo(W / 2 + 70, fy - 40); ctx.stroke(); }
    return y;
  }

  // opts: {item, config, logo: Image|null, photo: Image|null, tpl: 'ribbon'|'certificate', size: 'portrait'|'square', headline}
  async function draw(canvas, opts) {
    await ensureFonts();
    const sq = opts.size === 'square', W = 1080, H = sq ? 1080 : 1350;
    if (canvas.width !== W) canvas.width = W;
    if (canvas.height !== H) canvas.height = H;
    const ctx = canvas.getContext('2d');
    const cfg = opts.config || {};
    const it = opts.item;
    const headline = (opts.headline || '').trim() || defaultHeadline(it);
    const tries = opts.photo ? (sq ? [340, 290, 240, 200] : [520, 450, 390, 330, 270]) : (sq ? [200, 170, 140, 120] : [290, 240, 200, 160]);
    const limit = H - (opts.tpl === 'certificate' ? 120 : 96);
    for (const ph of tries) {
      const end = layout(ctx, { W, H, tpl: opts.tpl, c1: cfg.color1 || '#1b2f6e', c2: cfg.color2 || '#d4a017', logo: opts.logo, photo: opts.photo, ph, item: it, config: cfg, headline });
      if (end <= limit) break;
    }
  }
  function defaultHeadline(it) { return SA.isParticipation(it && it.award) ? 'ขอชื่นชม' : 'ขอแสดงความยินดี'; }

  function captions(it, cfg) {
    const school = (cfg && cfg.schoolName) || 'โรงเรียน', part = SA.isParticipation(it.award);
    const names = SA.joinNames(it.students, true), cl = SA.classes(it.students);
    const date = it.date ? SA.thDate(it.date, true) : '';
    const fb = [
      part ? '👏 ขอชื่นชม' : '🏆 ขอแสดงความยินดี',
      'กับ ' + names + (cl.length ? ' นักเรียนชั้น ' + cl.join(', ') : ''),
      part ? 'ที่เป็นตัวแทน' + school + 'เข้าร่วม' + it.title : 'ที่ได้รับรางวัล' + it.award + ' ' + it.title,
      [it.level, it.organizer ? 'จัดโดย ' + it.organizer : ''].filter(Boolean).join(' ') || null,
      date ? 'เมื่อวันที่ ' + date + (it.venue ? ' ณ ' + it.venue : '') : null,
      it.coach ? 'ครูผู้ฝึกสอน: ' + it.coach : null,
      '',
      school + 'ขอชื่นชมในความมุ่งมั่นตั้งใจ และขอบคุณคุณครูและผู้ปกครองทุกท่านที่ให้การสนับสนุน',
      (cfg && cfg.hashtags) || null
    ].filter(l => l !== null).join('\n');
    const line = [
      '📣 ข่าวดีจาก' + school,
      (part ? 'ขอชื่นชม ' : 'ขอแสดงความยินดีกับ ') + names + (cl.length ? ' (' + cl.join(', ') + ')' : ''),
      '🏅 ' + it.award,
      it.title,
      [it.level, date].filter(Boolean).join(' · ') || null
    ].filter(l => l !== null).join('\n');
    return { fb: fb, line: line };
  }

  SA.Poster = { draw, captions, defaultHeadline };
})();
