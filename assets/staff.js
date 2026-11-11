/* ระบบแจ้งผลงานนักเรียน — หน้าหลังบ้าน (ตรวจผลงาน ทำกราฟิก ตั้งค่า) */
(function () {
  'use strict';
  const SA = window.SA, esc = SA.esc;
  const $ = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));
  const KEY = 'sa-staff';
  const MAX_PHOTOS = 6;
  const ROUTES = ['overview', 'review', 'publicity', 'school'];

  const S = {
    pass: '', by: '', items: [], byId: new Map(), config: {}, loaded: false, loadedAt: 0, route: 'overview',
    photos: new Map(), photoReq: new Map(), logoImg: null,
    pubId: null, poster: { tpl: 'ribbon', size: 'portrait', photoIdx: 0, usePhoto: true },
    returningId: null, returnDraft: '', busy: new Set(),
    modalId: null, modalMode: 'view', confirmDelete: false,
    scDirty: false, scLogo: null, scLogoRemoved: false,
    cfgVer: 0, editorCfgVer: -1
  };
  const SAMPLE = {
    id: '__sample', students: [{ name: 'ด.ญ.ตัวอย่าง ใจดี', cls: 'ป.5/2' }, { name: 'ด.ช.ทดลอง ตั้งใจ', cls: 'ป.5/1' }],
    title: 'การแข่งขันคัดลายมือภาษาไทย งานศิลปหัตถกรรมนักเรียน', category: 'ภาษา', level: 'ระดับเขตพื้นที่การศึกษา',
    award: 'เหรียญทอง ชนะเลิศ', date: SA.todayISO(), organizer: 'สำนักงานเขตพื้นที่การศึกษา (ตัวอย่าง)', venue: '', coach: 'ครูตัวอย่าง สอนดี',
    photoIds: [], consent: true, status: 'approved'
  };
  const EMPTY_ICON = '<svg viewBox="0 0 48 48" fill="none" aria-hidden="true"><path d="M15 4h7l4 12h-7z" fill="currentColor" opacity=".55"/><path d="M33 4h-7l-4 12h7z" fill="currentColor"/><circle cx="24" cy="30" r="13" fill="none" stroke="currentColor" stroke-width="3"/><path d="M24 23.5l2 4 4.4.6-3.2 3.1.8 4.4-4-2.1-4 2.1.8-4.4-3.2-3.1 4.4-.6z" fill="currentColor"/></svg>';

  function setHTML(el, html) { if (el && el._html !== html) { el.innerHTML = html; el._html = html; return true; } return false; }
  function st(it) { return SA.STATUS[it.status] || SA.STATUS.pending; }

  /* ---------- เข้าสู่ระบบ ---------- */
  function saveCreds(remember) {
    const v = JSON.stringify({ pass: S.pass, by: S.by });
    try { (remember ? localStorage : sessionStorage).setItem(KEY, v); (remember ? sessionStorage : localStorage).removeItem(KEY); } catch (e) {}
  }
  function loadCreds() {
    try { const v = sessionStorage.getItem(KEY) || localStorage.getItem(KEY); if (v) { const o = JSON.parse(v); S.pass = o.pass || ''; S.by = o.by || ''; } } catch (e) {}
    return !!S.pass;
  }
  function clearCreds() { try { localStorage.removeItem(KEY); sessionStorage.removeItem(KEY); } catch (e) {} }
  async function call(action, payload) {
    try { return await SA.api(action, Object.assign({ passcode: S.pass, by: S.by }, payload || {})); }
    catch (e) { if (e.code === 'unauthorized') logout('รหัสเจ้าหน้าที่ถูกเปลี่ยนหรือไม่ถูกต้อง เข้าสู่ระบบใหม่อีกครั้ง'); throw e; }
  }
  function showApp() {
    $('#login').hidden = true; $('#app').hidden = false; $('#tabsNav').hidden = false; $('#topActions').hidden = false;
    $('#whoami').textContent = S.by; route();
  }
  function logout(msg) {
    clearCreds(); S.pass = ''; S.items = []; S.byId = new Map(); S.photos.clear(); S.loaded = false; closeModal();
    $('#login').hidden = false; $('#app').hidden = true; $('#tabsNav').hidden = true; $('#topActions').hidden = true;
    $('#loginErr').hidden = !msg; $('#loginErr').textContent = msg || ''; $('#lg-pass').value = '';
  }
  $('#loginForm').addEventListener('submit', async e => {
    e.preventDefault();
    const name = $('#lg-name').value.trim(), pass = $('#lg-pass').value;
    const err = $('#loginErr');
    if (!name || !pass) { err.hidden = false; err.textContent = 'กรอกชื่อและรหัสเจ้าหน้าที่'; return; }
    const btn = $('#lg-btn'); btn.disabled = true; btn.textContent = 'กำลังตรวจรหัส…'; err.hidden = true;
    try {
      await SA.api('login', { passcode: pass });
      S.pass = pass; S.by = name; saveCreds($('#lg-remember').checked);
      showApp(); load();
    } catch (x) { err.hidden = false; err.textContent = SA.errText(x); }
    finally { btn.disabled = false; btn.textContent = 'เข้าสู่ระบบ'; }
  });
  $('#logoutBtn').addEventListener('click', () => logout(''));
  $('#refreshBtn').addEventListener('click', () => load());

  /* ---------- โหลดข้อมูล ---------- */
  let loadingP = null;
  function load() {
    if (loadingP) return loadingP;
    const btn = $('#refreshBtn'); btn.disabled = true; btn.textContent = 'กำลังโหลด…';
    loadingP = call('list').then(r => {
      setItems(r.items); setConfig(r.config); S.loadedAt = Date.now(); $('#appErr').hidden = true;
    }).catch(e => {
      if (e.code !== 'unauthorized') { $('#appErr').hidden = false; $('#appErr').textContent = 'โหลดข้อมูลไม่สำเร็จ: ' + SA.errText(e); }
    }).finally(() => {
      btn.disabled = false; btn.textContent = 'รีเฟรช'; S.loaded = true; loadingP = null; renderAll();
    });
    return loadingP;
  }
  function setItems(list) { S.items = list || []; S.byId = new Map(S.items.map(i => [i.id, i])); }
  function upsert(item) {
    if (!item) return;
    const i = S.items.findIndex(x => x.id === item.id);
    if (i >= 0) S.items[i] = item; else S.items.unshift(item);
    S.byId.set(item.id, item);
  }
  function setConfig(c) {
    S.config = c || {}; S.logoImg = null; S.cfgVer++;
    if (S.config.logo) SA.loadImg(SA.dataUrl(S.config.logo)).then(im => { S.logoImg = im; if (S.route === 'publicity') schedulePoster(); }).catch(() => {});
    fillSchool();
  }
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && S.pass && Date.now() - S.loadedAt > 60000) load();
  });

  /* ---------- รูปภาพจาก Drive (ผ่าน Apps Script เท่านั้น ไม่เปิดสาธารณะ) ---------- */
  function fetchPhotos(ids) {
    const need = Array.from(new Set(ids)).filter(id => id && !S.photos.has(id) && !S.photoReq.has(id));
    for (let i = 0; i < need.length; i += 6) {
      const ch = need.slice(i, i + 6);
      const p = call('photos', { ids: ch }).then(r => {
        ch.forEach(id => { const ph = r.photos && r.photos[id]; S.photos.set(id, ph ? SA.dataUrl(ph) : ''); });
      }).catch(() => {}).finally(() => ch.forEach(id => S.photoReq.delete(id)));
      ch.forEach(id => S.photoReq.set(id, p));
    }
    return Promise.all(ids.map(id => S.photoReq.get(id)).filter(Boolean));
  }
  async function photoUrl(id) { await fetchPhotos([id]); return S.photos.get(id) || ''; }
  function imgTag(id, alt) { return '<img data-photo="' + esc(id) + '" alt="' + esc(alt || 'รูปผลงาน') + '">'; }
  function hydrate(root) {
    const imgs = $$('img[data-photo]', root || document).filter(im => !im.getAttribute('src'));
    if (!imgs.length) return;
    const fill = () => imgs.forEach(im => { const u = S.photos.get(im.dataset.photo); if (u) im.src = u; else if (S.photos.has(im.dataset.photo)) im.alt = 'โหลดรูปไม่ได้'; });
    fill();
    fetchPhotos(imgs.map(im => im.dataset.photo)).then(fill);
  }
  // คลิกรูปเพื่อดูขนาดเต็ม (ใช้ตรวจตัวสะกดบนเกียรติบัตร)
  document.addEventListener('click', e => {
    const im = e.target.closest('.gallery img');
    if (!im || !im.src) return;
    const ov = document.createElement('div');
    ov.className = 'modal'; ov.style.zIndex = 40; ov.style.alignItems = 'center'; ov.setAttribute('role', 'dialog'); ov.setAttribute('aria-label', 'ดูรูปขนาดเต็ม');
    ov.innerHTML = '<img alt="' + esc(im.alt) + '" style="max-height:90vh;max-width:100%;border-radius:10px;background:#fff">';
    ov.firstChild.src = im.src;
    ov.addEventListener('click', () => ov.remove());
    document.body.appendChild(ov);
  });

  /* ---------- เส้นทาง ---------- */
  function route() {
    const h = (location.hash || '').replace('#', '');
    S.route = ROUTES.includes(h) ? h : 'overview';
    $$('[data-view]').forEach(v => { v.hidden = v.dataset.view !== S.route; });
    $$('.tab[data-tab]').forEach(t => { if (t.dataset.tab === S.route) t.setAttribute('aria-current', 'page'); else t.removeAttribute('aria-current'); });
    if (S.route === 'publicity') {
      renderPublicity(true);
      // ตั้งค่าโรงเรียนเปลี่ยนหลังเลือกผลงานไว้ → สร้างแคปชันและกราฟิกใหม่ด้วยชื่อ/สีล่าสุด
      if (S.editorCfgVer !== S.cfgVer) loadEditor(pubItem() || SAMPLE); else schedulePoster();
    }
    window.scrollTo(0, 0);
  }
  window.addEventListener('hashchange', route);

  /* ---------- ส่วนหัว ---------- */
  function renderHeader() {
    const c = S.config;
    $('#brandName').textContent = c.schoolName || 'ระบบแจ้งผลงานนักเรียน';
    const seal = $('#brandSeal');
    if (c.logo && seal.dataset.logo !== c.logoId) { seal.dataset.logo = c.logoId; seal.innerHTML = '<img alt="" src="' + SA.dataUrl(c.logo) + '">'; }
    const pend = S.items.filter(i => i.status === 'pending').length, appr = S.items.filter(i => i.status === 'approved').length;
    const a = $('#cntReview'), b = $('#cntPub'); a.textContent = pend; b.textContent = appr;
    if (pend) a.removeAttribute('data-zero'); else a.setAttribute('data-zero', '');
    if (appr) b.removeAttribute('data-zero'); else b.setAttribute('data-zero', '');
  }

  /* ---------- ภาพรวม ---------- */
  function filtered() {
    const q = $('#f-q').value.trim().toLowerCase(), yr = $('#f-year').value, lv = $('#f-level').value, ct = $('#f-cat').value, sf = $('#f-status').value;
    return S.items.filter(it => {
      if (yr && String(SA.acadYear(it.date)) !== yr) return false;
      if (lv && it.level !== lv) return false;
      if (ct && it.category !== ct) return false;
      if (sf && it.status !== sf) return false;
      if (q) {
        const hay = [it.id, it.title, it.coach, it.organizer, it.award, it.submitterName, (it.students || []).map(s => s.name + ' ' + s.cls).join(' ')].join(' ').toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    }).sort((a, b) => (b.date || '').localeCompare(a.date || '') || (b.createdAt || '').localeCompare(a.createdAt || ''));
  }
  function yearOptions() {
    const sel = $('#f-year'), cur = SA.acadYear(SA.todayISO()), ys = new Set([cur]);
    S.items.forEach(i => { const y = SA.acadYear(i.date); if (y) ys.add(y); });
    const keep = sel.dataset.init ? sel.value : String(cur);
    setHTML(sel, '<option value="">ทุกปีการศึกษา</option>' + Array.from(ys).sort((a, b) => b - a).map(y => '<option value="' + y + '">' + y + '</option>').join(''));
    sel.value = keep; sel.dataset.init = '1';
  }
  function barHTML(counts, order, labelFn) {
    const keys = order.filter(k => counts[k]);
    if (!keys.length) return '<p class="muted">ยังไม่มีผลงานที่ผ่านการตรวจ</p>';
    const max = Math.max.apply(null, keys.map(k => counts[k]));
    return keys.map(k => '<div class="bar"><span class="bar-label" title="' + esc(k) + '">' + esc(labelFn ? labelFn(k) : k) + '</span><span class="bar-track"><span class="bar-fill" style="width:' + (counts[k] / max * 100).toFixed(1) + '%"></span></span><span class="bar-n">' + counts[k] + '</span></div>').join('');
  }
  function formUrl() { return S.config.formUrl || location.href.split('#')[0].replace(/staff\.html.*$/, 'index.html'); }
  function renderOverview() {
    yearOptions();
    const pend = S.items.filter(i => i.status === 'pending').length, appr = S.items.filter(i => i.status === 'approved').length, ret = S.items.filter(i => i.status === 'returned').length;
    setHTML($('#queue'),
      '<a class="q-card" href="#review"><div><div class="q-n">' + pend + '</div><div class="q-label">ผลงานรอครูตรวจ' + (ret ? ' · ส่งกลับแก้ไข ' + ret : '') + '</div></div><span class="q-go">ไปตรวจ →</span></a>' +
      '<a class="q-card" href="#publicity"><div><div class="q-n">' + appr + '</div><div class="q-label">ผ่านการตรวจ รอทำกราฟิก</div></div><span class="q-go">ทำกราฟิก →</span></a>' +
      '<div class="q-card stack"><div class="q-label">ลิงก์แบบฟอร์มแจ้งผลงาน ส่งให้ผู้ปกครองและครูในกลุ่ม LINE</div><div class="copy-line"><input type="text" id="formLink" readonly value="' + esc(formUrl()) + '" aria-label="ลิงก์แบบฟอร์มแจ้งผลงาน"><button class="btn small" type="button" data-copy="formLink">คัดลอก</button></div></div>');

    const yr = $('#f-year').value;
    const ver = S.items.filter(i => (i.status === 'approved' || i.status === 'announced') && (!yr || String(SA.acadYear(i.date)) === yr));
    const kids = new Set(); ver.forEach(i => (i.students || []).forEach(s => s.name && kids.add(s.name.replace(/\s+/g, ' ').trim())));
    const high = ver.filter(i => SA.LEVELS.indexOf(i.level) >= 3).length, golds = ver.filter(i => SA.tier(i.award) === 'gold').length;
    const byL = {}, byC = {}; ver.forEach(i => { byL[i.level] = (byL[i.level] || 0) + 1; byC[i.category] = (byC[i.category] || 0) + 1; });
    setHTML($('#summaryPanel'),
      '<div class="panel-head"><h2>' + (yr ? 'สรุปผลงาน ปีการศึกษา ' + esc(yr) : 'สรุปผลงานทุกปีการศึกษา') + '</h2><span class="muted">นับเฉพาะผลงานที่ผ่านการตรวจแล้ว</span></div>' +
      '<div class="summary"><div><b>' + ver.length + '</b><span>รายการ</span></div><div><b>' + kids.size + '</b><span>นักเรียนที่มีผลงาน</span></div><div><b>' + high + '</b><span>ระดับจังหวัดขึ้นไป</span></div><div><b>' + golds + '</b><span>ชนะเลิศ / เหรียญทอง</span></div></div>' +
      '<div class="bars-grid"><div class="bars"><h3>แยกตามระดับ</h3>' + barHTML(byL, SA.LEVELS, SA.stripLevel) + '</div><div class="bars cat"><h3>แยกตามประเภท</h3>' + barHTML(byC, SA.CATS) + '</div></div>');

    const rows = filtered();
    $('#listTitle').textContent = 'ผลงานทั้งหมด (' + rows.length + ')';
    let html;
    if (!S.loaded) html = '<div class="empty"><span class="spinner"></span>กำลังโหลดผลงานจาก Google Drive…</div>';
    else if (!S.items.length) html = '<div class="empty">' + EMPTY_ICON + '<h3>ยังไม่มีผลงานในระบบ</h3><p>เมื่อผู้ปกครองหรือครูส่งแบบฟอร์มแจ้งผลงาน รายการจะแสดงที่นี่</p><a class="btn primary" href="index.html" target="_blank" rel="noopener">เปิดแบบฟอร์มแจ้งผลงาน</a></div>';
    else if (!rows.length) html = '<div class="empty">ไม่พบผลงานตามตัวกรองที่เลือก</div>';
    else html = rows.map(rowHTML).join('');
    setHTML($('#list'), html);
  }
  function rowHTML(it) {
    const s = st(it), cl = SA.classes(it.students).join(', ');
    return '<button type="button" class="row" data-act="open" data-id="' + esc(it.id) + '">' +
      '<span class="row-date">' + esc(SA.thDate(it.date)) + '</span>' +
      '<span class="row-main"><span class="row-title">' + esc(it.title || '(ไม่มีชื่อรายการ)') + '</span><span class="row-sub">' + esc(SA.joinNames(it.students)) + (cl ? ' · ' + esc(cl) : '') + (it.photoIds.length ? ' · รูป ' + it.photoIds.length : '') + '</span></span>' +
      '<span class="row-meta"><span class="medal medal-' + SA.tier(it.award) + '">' + esc(it.award || '-') + '</span><span class="lvl">' + esc(SA.stripLevel(it.level)) + '</span></span>' +
      '<span class="st ' + s.cls + '">' + s.label + '</span></button>';
  }
  ['f-q', 'f-year', 'f-level', 'f-cat', 'f-status'].forEach(id => $('#' + id).addEventListener(id === 'f-q' ? 'input' : 'change', renderOverview));
  $('#f-level').innerHTML = SA.options(SA.LEVELS, 'ทุกระดับ');
  $('#f-cat').innerHTML = SA.options(SA.CATS, 'ทุกประเภท');

  function csvCell(v) { v = String(v == null ? '' : v); return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; }
  $('#exportCsv').addEventListener('click', () => {
    const rows = filtered(); if (!rows.length) { SA.toast('ไม่มีข้อมูลตามตัวกรอง'); return; }
    const out = [['รหัสอ้างอิง', 'ปีการศึกษา', 'วันที่', 'ชื่อ-สกุล', 'ชั้น', 'รายการ', 'ประเภท', 'ระดับ', 'ผลการแข่งขัน', 'หน่วยงานผู้จัด', 'สถานที่', 'ครูผู้ฝึกสอน', 'สถานะ'].join(',')];
    rows.forEach(it => (it.students.length ? it.students : [{ name: '', cls: '' }]).forEach(s => out.push([it.id, SA.acadYear(it.date), SA.thDate(it.date), s.name, s.cls, it.title, it.category, it.level, it.award, it.organizer, it.venue, it.coach, st(it).label].map(csvCell).join(','))));
    download(new Blob(['﻿' + out.join('\r\n')], { type: 'text/csv;charset=utf-8' }), 'ผลงานนักเรียน-' + ($('#f-year').value || 'ทุกปี') + '.csv');
  });
  function download(blob, name) {
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name;
    document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  }

  /* ---------- รายละเอียด / แก้ไข ---------- */
  function detailDL(it) {
    const rows = [
      ['รหัสอ้างอิง', esc(it.id)],
      ['นักเรียน', (it.students || []).map(s => esc(s.name) + (s.cls ? ' <span class="muted">(' + esc(s.cls) + ')</span>' : '')).join('<br>')],
      ['รายการ', esc(it.title)], ['ประเภท', esc(it.category)], ['ระดับ', esc(it.level)],
      ['ผลที่ได้', '<span class="medal medal-' + SA.tier(it.award) + '">' + esc(it.award) + '</span>'],
      ['วันที่', esc(SA.thDate(it.date, true))], ['ผู้จัด', esc(it.organizer)], ['สถานที่', esc(it.venue)], ['ครูผู้ฝึกสอน', esc(it.coach)],
      ['ผู้แจ้ง', (it.submitterRole === 'teacher' ? 'ครู: ' : 'ผู้ปกครอง: ') + esc(it.submitterName) + (it.submitterPhone ? ' · โทร <a href="tel:' + esc(it.submitterPhone.replace(/[^\d+]/g, '')) + '">' + esc(it.submitterPhone) + '</a>' : '')],
      ['การยินยอม', it.consent ? 'ยินยอมให้เผยแพร่ชื่อและภาพ' : '<span style="color:var(--warn)">ยังไม่ยินยอมให้เผยแพร่ภาพ</span>'],
      ['รายละเอียด', esc(it.note)]
    ].filter(r => r[1]);
    return '<dl class="dl">' + rows.map(r => '<dt>' + r[0] + '</dt><dd>' + r[1] + '</dd>').join('') + '</dl>';
  }
  function galleryHTML(it) {
    if (!it.photoIds.length) return '<p class="muted">ไม่มีรูปแนบ</p>';
    return '<div class="gallery">' + it.photoIds.map((id, i) => imgTag(id, 'รูปผลงานที่ ' + (i + 1))).join('') + '</div><span class="hint">คลิกรูปเพื่อดูขนาดเต็ม</span>';
  }
  function openModal(id, mode) { S.modalId = id; S.modalMode = mode || 'view'; S.confirmDelete = false; renderModal(true); $('#modal').hidden = false; document.body.style.overflow = 'hidden'; }
  function closeModal() { S.modalId = null; $('#modal').hidden = true; document.body.style.overflow = ''; }
  function renderModal(force) {
    if (!S.modalId) return;
    const it = S.byId.get(S.modalId);
    if (!it) { closeModal(); return; }
    if (S.modalMode === 'edit') { if (force) renderEdit(it); return; }
    const s = st(it);
    let tl = '<div class="timeline">';
    if (it.createdAt) tl += '<span>แจ้งโดย ' + esc(it.submitterName) + ' · ' + esc(SA.thDateTime(it.createdAt)) + '</span>';
    if (it.reviewedAt) tl += '<span>' + (it.status === 'returned' ? 'ส่งกลับโดย ' : 'ตรวจโดย ') + esc(it.reviewedBy) + ' · ' + esc(SA.thDateTime(it.reviewedAt)) + '</span>';
    if (it.announcedAt) tl += '<span>ประกาศโดย ' + esc(it.announcedBy) + ' · ' + esc(SA.thDateTime(it.announcedAt)) + (it.channels ? ' (' + [it.channels.facebook ? 'Facebook' : '', it.channels.line ? 'LINE' : ''].filter(Boolean).join(', ') + ')' : '') + '</span>';
    if (it.updatedAt && it.updatedBy) tl += '<span>แก้ไขล่าสุดโดย ' + esc(it.updatedBy) + ' · ' + esc(SA.thDateTime(it.updatedAt)) + '</span>';
    tl += '</div>';
    let actions = '<div class="btn-row"><button class="btn" type="button" data-act="edit" data-id="' + esc(it.id) + '">แก้ไข</button>';
    if (it.status === 'pending') actions += '<a class="btn primary" href="#review" data-act="close">ไปหน้าตรวจ</a>';
    if (it.status === 'approved' || it.status === 'announced') actions += '<button class="btn primary" type="button" data-act="to-pub" data-id="' + esc(it.id) + '">ทำกราฟิก</button>';
    if (it.status === 'announced') actions += '<button class="btn" type="button" data-act="unannounce" data-id="' + esc(it.id) + '">ย้ายกลับไปรอทำกราฟิก</button>';
    actions += '<button class="btn danger" type="button" data-act="ask-delete">ลบ</button></div>';
    const confirm = S.confirmDelete ? '<div class="confirm">ลบผลงานนี้ออกจากชีต และย้ายรูปที่แนบไปถังขยะของ Drive? กู้คืนรายการไม่ได้<div class="btn-row"><button class="btn danger solid" type="button" data-act="delete" data-id="' + esc(it.id) + '">ลบผลงาน</button><button class="btn" type="button" data-act="cancel-delete">ยกเลิก</button></div></div>' : '';
    const panel = $('#modalPanel');
    panel.innerHTML = '<div class="modal-head"><div><span class="st ' + s.cls + '">' + s.label + '</span><h2 id="modalTitle" style="margin-top:8px">' + esc(it.title) + '</h2></div><button class="icon-btn" type="button" data-act="close" aria-label="ปิด">×</button></div>' +
      (it.status === 'returned' && it.reviewNote ? '<div class="note-box">สิ่งที่ต้องแก้: ' + esc(it.reviewNote) + '</div>' : '') +
      galleryHTML(it) + detailDL(it) + tl + actions + confirm;
    hydrate(panel);
  }
  function editPhotosHTML(it) {
    let h = it.photoIds.map((id, i) => '<figure class="thumb">' + imgTag(id, 'รูปที่ ' + (i + 1)) + '<button type="button" class="thumb-x" data-rmphoto="' + esc(id) + '" aria-label="เอารูปที่ ' + (i + 1) + ' ออก">×</button></figure>').join('');
    if (it.photoIds.length < MAX_PHOTOS) h += '<label class="add-photo">+ เพิ่มรูป<input type="file" id="edPhoto" accept="image/*" multiple aria-label="เพิ่มรูปภาพ"></label>';
    return h;
  }
  function renderEdit(it) {
    const panel = $('#modalPanel');
    const f = (id, label, val, extra) => '<div class="field"><label for="' + id + '"' + (extra && extra.req ? ' class="req"' : '') + '>' + label + '</label><input type="text" id="' + id + '" value="' + esc(val) + '"' + (extra && extra.list ? ' list="' + extra.list + '"' : '') + '></div>';
    panel.innerHTML = '<form id="editForm" novalidate>' +
      '<div class="modal-head"><h2 id="modalTitle">แก้ไขผลงาน <span class="muted" style="font-size:.9rem">' + esc(it.id) + '</span></h2><button class="icon-btn" type="button" data-act="close" aria-label="ปิด">×</button></div>' +
      '<fieldset><legend>นักเรียน</legend><div id="edRows" style="display:flex;flex-direction:column;gap:12px"></div><div><button class="btn small" type="button" id="edAdd">+ เพิ่มนักเรียน</button></div></fieldset>' +
      '<fieldset><legend>ผลงาน</legend>' + f('ed-title', 'ชื่อรายการแข่งขัน / กิจกรรม', it.title, { req: 1 }) +
        '<div class="grid3"><div class="field"><label class="req" for="ed-category">ประเภท</label><select id="ed-category">' + SA.options(SA.CATS, 'เลือกประเภท') + '</select></div>' +
        '<div class="field"><label class="req" for="ed-level">ระดับ</label><select id="ed-level">' + SA.options(SA.LEVELS, 'เลือกระดับ') + '</select></div>' +
        '<div class="field"><label class="req" for="ed-date">วันที่</label><input type="date" id="ed-date" value="' + esc(it.date) + '"></div></div>' +
        f('ed-award', 'รางวัลที่ได้', it.award, { req: 1, list: 'awardList' }) +
        '<div class="grid2">' + f('ed-organizer', 'หน่วยงานผู้จัด', it.organizer) + f('ed-venue', 'สถานที่', it.venue) + '</div>' + f('ed-coach', 'ครูผู้ฝึกสอน', it.coach) + '</fieldset>' +
      '<fieldset><legend>รูปภาพ</legend><div class="thumbs" id="edPhotos">' + editPhotosHTML(it) + '</div><span class="hint" id="edPhotoMsg" role="status">เอารูปออกแล้ว รูปจะอยู่ในถังขยะของ Google Drive 30 วัน</span></fieldset>' +
      '<fieldset><legend>ผู้แจ้ง</legend><div class="choice"><label><input type="radio" name="edRole" id="ed-role-parent" value="parent"> ผู้ปกครอง</label><label><input type="radio" name="edRole" id="ed-role-teacher" value="teacher"> ครู</label></div>' +
        '<div class="grid2">' + f('ed-sname', 'ชื่อผู้แจ้ง', it.submitterName, { req: 1 }) + f('ed-phone', 'เบอร์โทร', it.submitterPhone) + '</div>' +
        '<div class="field"><label for="ed-note">รายละเอียดเพิ่มเติม</label><textarea id="ed-note" rows="3">' + esc(it.note) + '</textarea></div>' +
        '<label class="check"><input type="checkbox" id="ed-consent"' + (it.consent ? ' checked' : '') + '> ผู้ปกครองยินยอมให้เผยแพร่ชื่อ ภาพ และผลงาน</label></fieldset>' +
      (it.status === 'returned' ? '<label class="check"><input type="checkbox" id="ed-resubmit" checked> แก้ไขแล้ว ส่งกลับไปรอตรวจ</label>' : '') +
      '<div class="form-actions"><button class="btn primary" type="submit" id="edSave">บันทึกการแก้ไข</button><button class="btn" type="button" data-act="view">ยกเลิก</button><span class="muted" id="edMsg" role="status"></span></div>' +
      '</form>';
    $('#ed-category').value = it.category; $('#ed-level').value = it.level;
    $(it.submitterRole === 'teacher' ? '#ed-role-teacher' : '#ed-role-parent').checked = true;
    $('#edPhotoMsg').textContent = 'เพิ่มได้สูงสุด ' + MAX_PHOTOS + ' รูป รูปที่เอาออกจะอยู่ในถังขยะของ Google Drive 30 วัน';
    const render = SA.bindStudentRows($('#edRows'), $('#edAdd'), 'ed');
    render(it.students);
    hydrate(panel);
  }
  async function saveEdit() {
    const it = S.byId.get(S.modalId); if (!it) return;
    const v = id => $('#' + id).value.trim();
    const patch = {
      students: SA.readStudents($('#edRows')).filter(s => s.name || s.cls), title: v('ed-title'), category: v('ed-category'), level: v('ed-level'),
      date: v('ed-date'), award: v('ed-award'), organizer: v('ed-organizer'), venue: v('ed-venue'), coach: v('ed-coach'),
      submitterRole: $('#ed-role-teacher').checked ? 'teacher' : 'parent', submitterName: v('ed-sname'), submitterPhone: v('ed-phone'),
      note: v('ed-note'), consent: $('#ed-consent').checked
    };
    const msg = $('#edMsg');
    if (!patch.students.length || patch.students.some(s => !s.name) || !patch.title || !patch.category || !patch.level || !patch.date || !patch.award || !patch.submitterName) {
      msg.textContent = 'กรอกช่องที่มีเครื่องหมาย * และชื่อนักเรียนให้ครบ'; return;
    }
    if ($('#ed-resubmit') && $('#ed-resubmit').checked) { patch.status = 'pending'; patch.reviewNote = ''; }
    const btn = $('#edSave'); btn.disabled = true; msg.textContent = 'กำลังบันทึก…';
    try {
      const r = await call('update', { id: it.id, patch: patch });
      upsert(r.item); S.modalMode = 'view'; renderAll(); renderModal(true); SA.toast('บันทึกการแก้ไขแล้ว');
    } catch (e) { msg.textContent = SA.errText(e); btn.disabled = false; }
  }
  $('#modalPanel').addEventListener('submit', e => { if (e.target.id === 'editForm') { e.preventDefault(); saveEdit(); } });
  $('#modalPanel').addEventListener('change', async e => {
    if (e.target.id !== 'edPhoto') return;
    const it = S.byId.get(S.modalId); if (!it) return;
    const files = Array.from(e.target.files || []).slice(0, MAX_PHOTOS - it.photoIds.length);
    const msg = $('#edPhotoMsg');
    try {
      const photos = [];
      for (let i = 0; i < files.length; i++) { msg.textContent = 'กำลังย่อรูปที่ ' + (i + 1) + '…'; const p = await SA.fileToPayload(files[i], 1600, 'image/jpeg', 0.85); photos.push({ mime: p.mime, b64: p.b64 }); }
      msg.textContent = 'กำลังอัปโหลดไป Google Drive…';
      const r = await call('addPhotos', { id: it.id, photos: photos });
      upsert(r.item); $('#edPhotos').innerHTML = editPhotosHTML(r.item); hydrate($('#edPhotos'));
      msg.textContent = 'เพิ่มรูปแล้ว'; renderAll();
    } catch (x) { msg.textContent = 'เพิ่มรูปไม่สำเร็จ: ' + SA.errText(x); }
  });

  /* ---------- ตรวจผลงาน ---------- */
  function reviewCard(it, mode) {
    const busy = S.busy.has(it.id);
    let actions = '';
    if (mode === 'pending') {
      if (S.returningId === it.id) {
        actions = '<div class="field"><label for="ret-note">สิ่งที่ต้องแก้ไข</label><textarea id="ret-note" rows="3" placeholder="เช่น ชื่อนักเรียนสะกดไม่ตรงกับเกียรติบัตร"></textarea></div>' +
          '<div class="btn-row"><button class="btn danger solid" type="button" data-act="return" data-id="' + esc(it.id) + '"' + (busy ? ' disabled' : '') + '>ยืนยันส่งกลับ</button><button class="btn" type="button" data-act="cancel-return">ยกเลิก</button></div>';
      } else {
        actions = '<div class="btn-row"><button class="btn good" type="button" data-act="approve" data-id="' + esc(it.id) + '"' + (busy ? ' disabled' : '') + '>' + (busy ? 'กำลังบันทึก…' : 'ผ่านการตรวจ') + '</button>' +
          '<button class="btn" type="button" data-act="ask-return" data-id="' + esc(it.id) + '">ส่งกลับแก้ไข</button><button class="btn" type="button" data-act="edit" data-id="' + esc(it.id) + '">แก้ไขเอง</button></div>';
      }
    } else {
      actions = '<div class="btn-row"><button class="btn primary" type="button" data-act="edit" data-id="' + esc(it.id) + '">แก้ไขและส่งตรวจใหม่</button></div>';
    }
    return '<article class="card"><div class="card-top"><div class="card-title">' + esc(it.title) + '</div><span class="st ' + st(it).cls + '">' + st(it).label + '</span></div>' +
      (mode === 'returned' && it.reviewNote ? '<div class="note-box">สิ่งที่ต้องแก้: ' + esc(it.reviewNote) + '</div>' : '') +
      galleryHTML(it) + detailDL(it) + '<div class="meta-line">แจ้งเมื่อ ' + esc(SA.thDateTime(it.createdAt)) + '</div>' + actions + '</article>';
  }
  function renderReview() {
    const pend = S.items.filter(i => i.status === 'pending').sort((a, b) => (a.createdAt || '').localeCompare(b.createdAt || ''));
    const ret = S.items.filter(i => i.status === 'returned');
    let html = '';
    if (!S.loaded) html = '<div class="panel"><div class="empty"><span class="spinner"></span>กำลังโหลด…</div></div>';
    else if (!pend.length) html = '<div class="panel"><div class="empty">' + EMPTY_ICON + '<h3>ไม่มีผลงานรอตรวจ</h3><p>เมื่อมีผู้แจ้งผลงานใหม่ จะมาแสดงที่นี่ ตั้งอีเมลแจ้งเตือนได้ที่แท็บตั้งค่าโรงเรียน</p></div></div>';
    else html = pend.map(i => reviewCard(i, 'pending')).join('');
    if (ret.length) html += '<h2 class="section-label">ส่งกลับแก้ไขแล้ว (' + ret.length + ')</h2>' + ret.map(i => reviewCard(i, 'returned')).join('');
    const el = $('#reviewBody');
    if (setHTML(el, html)) {
      const ta = $('#ret-note'); if (ta) { ta.value = S.returnDraft; ta.addEventListener('input', () => { S.returnDraft = ta.value; }); }
    }
    hydrate(el);
  }
  async function setStatus(id, patch, okMsg) {
    S.busy.add(id); renderReview();
    try { const r = await call('update', { id: id, patch: patch }); upsert(r.item); if (okMsg) SA.toast(okMsg); }
    catch (e) { SA.toast(SA.errText(e)); }
    finally { S.busy.delete(id); renderAll(); }
  }

  /* ---------- ทำกราฟิก ---------- */
  function pubItem() { return (S.pubId && S.byId.get(S.pubId)) || null; }
  function renderPublicity(force) {
    const appr = S.items.filter(i => i.status === 'approved').sort((a, b) => (a.reviewedAt || '').localeCompare(b.reviewedAt || ''));
    const done = S.items.filter(i => i.status === 'announced').sort((a, b) => (b.announcedAt || '').localeCompare(a.announcedAt || '')).slice(0, 12);
    if (!pubItem()) {
      if (appr[0]) selectPub(appr[0].id, true);
      else if (S.pubId !== null || force) { S.pubId = null; loadEditor(SAMPLE); }
    }
    const pick = i => '<button type="button" class="pick" data-act="pick" data-id="' + esc(i.id) + '" aria-pressed="' + (S.pubId === i.id) + '"><b>' + esc(SA.joinNames(i.students)) + '</b><span>' + esc(i.award) + ' · ' + esc(SA.stripLevel(i.level)) + '</span><span>' + esc(i.title) + '</span></button>';
    let html = '<div class="section-label">รอทำกราฟิก (' + appr.length + ')</div>' + (appr.length ? appr.map(pick).join('') : '<p class="muted" style="font-size:.92rem">ยังไม่มีผลงานที่ผ่านการตรวจ</p>');
    if (done.length) html += '<div class="section-label">ประกาศแล้วล่าสุด</div>' + done.map(pick).join('');
    setHTML($('#pubList'), html);
    const it = pubItem();
    $('#sampleNote').hidden = !!it;
    $('#announceBox').hidden = !it;
    $('#saveDrive').hidden = !it;
    const fb = S.config.fbUrl; $('#fbLink').hidden = !fb; if (fb) $('#fbLink').href = fb;
    if (it) $('#markAnnounced').textContent = it.status === 'announced' ? 'อัปเดตการประกาศ' : 'บันทึกว่าประกาศแล้ว';
  }
  function selectPub(id, silent) { S.pubId = id; const it = S.byId.get(id); if (it) loadEditor(it); if (!silent) renderPublicity(); }
  function loadEditor(it) {
    S.editorCfgVer = S.cfgVer;
    S.poster.photoIdx = 0; S.poster.usePhoto = it.consent !== false && (it.photoIds || []).length > 0;
    $('#consentWarn').hidden = !(it.id !== '__sample' && !it.consent);
    $('#headline').value = ''; $('#headline').placeholder = SA.Poster.defaultHeadline(it);
    renderPhotoPick(it);
    const cap = SA.Poster.captions(it, S.config);
    $('#capFb').value = it.captionFb || cap.fb; $('#capLine').value = it.captionLine || cap.line; updateLineLink();
    $('#ch-fb').checked = it.channels ? !!it.channels.facebook : true; $('#ch-line').checked = it.channels ? !!it.channels.line : true;
    $('#driveLink').hidden = true;
    schedulePoster();
  }
  function renderPhotoPick(it) {
    const ids = it.photoIds || [];
    let h = '<button type="button" data-act="ph" data-i="-1" aria-pressed="' + (!S.poster.usePhoto) + '">ไม่ใช้รูป</button>';
    if (it.consent !== false) h += ids.map((id, i) => '<button type="button" data-act="ph" data-i="' + i + '" aria-pressed="' + (S.poster.usePhoto && S.poster.photoIdx === i) + '" aria-label="ใช้รูปที่ ' + (i + 1) + '">' + imgTag(id, '') + '</button>').join('');
    $('#photoPick').innerHTML = h; hydrate($('#photoPick'));
  }
  function updateLineLink() { $('#lineShare').href = 'https://line.me/R/share?text=' + encodeURIComponent($('#capLine').value); }
  let drawSeq = 0, drawT = null;
  function schedulePoster() { clearTimeout(drawT); drawT = setTimeout(drawPoster, 60); }
  async function drawPoster() {
    const seq = ++drawSeq, it = pubItem() || SAMPLE, ids = it.photoIds || [];
    let photo = null;
    if (S.poster.usePhoto && it.consent !== false && ids[S.poster.photoIdx]) {
      try { const u = await photoUrl(ids[S.poster.photoIdx]); if (u) photo = await SA.loadImg(u); } catch (e) {}
    }
    if (seq !== drawSeq) return;
    await SA.Poster.draw($('#poster'), { item: it, config: S.config, logo: S.logoImg, photo: photo, tpl: S.poster.tpl, size: S.poster.size, headline: $('#headline').value });
  }
  function posterName() { const it = pubItem() || SAMPLE; return 'ยินดี-' + (it.date || SA.todayISO()) + '-' + (SA.joinNames(it.students).slice(0, 40) || 'ผลงาน') + '.png'; }
  $('#savePng').addEventListener('click', () => {
    $('#poster').toBlob(b => { if (b) download(b, posterName()); else SA.toast('สร้างภาพไม่สำเร็จ'); }, 'image/png');
  });
  $('#saveDrive').addEventListener('click', async () => {
    const it = pubItem(); if (!it) return;
    const btn = $('#saveDrive'); btn.disabled = true; btn.textContent = 'กำลังเก็บลง Drive…';
    try {
      const b64 = $('#poster').toDataURL('image/png').split(',')[1];
      const r = await call('savePoster', { id: it.id, b64: b64 });
      upsert(r.item); SA.toast('เก็บภาพลงโฟลเดอร์ “กราฟิกประกาศ” แล้ว');
      if (r.url) { $('#driveLink').href = r.url; $('#driveLink').hidden = false; }
    } catch (e) { SA.toast('เก็บภาพไม่สำเร็จ: ' + SA.errText(e)); }
    finally { btn.disabled = false; btn.textContent = 'เก็บภาพลง Google Drive'; }
  });
  $('#markAnnounced').addEventListener('click', async () => {
    const it = pubItem(); if (!it) return;
    const fb = $('#ch-fb').checked, ln = $('#ch-line').checked;
    if (!fb && !ln) { SA.toast('เลือกช่องทางที่ประกาศอย่างน้อยหนึ่งช่องทาง'); return; }
    const btn = $('#markAnnounced'); btn.disabled = true;
    try {
      const r = await call('update', { id: it.id, patch: { status: 'announced', channels: { facebook: fb, line: ln }, captionFb: $('#capFb').value, captionLine: $('#capLine').value } });
      upsert(r.item); SA.toast('บันทึกการประกาศแล้ว'); renderAll();
    } catch (e) { SA.toast(SA.errText(e)); }
    finally { btn.disabled = false; }
  });
  $$('input[name=tpl]').forEach(r => r.addEventListener('change', () => { S.poster.tpl = $('#tpl-cert').checked ? 'certificate' : 'ribbon'; schedulePoster(); }));
  $$('input[name=psize]').forEach(r => r.addEventListener('change', () => { S.poster.size = $('#size-square').checked ? 'square' : 'portrait'; schedulePoster(); }));
  $('#headline').addEventListener('input', schedulePoster);
  $('#capLine').addEventListener('input', updateLineLink);
  if (document.fonts && document.fonts.addEventListener) document.fonts.addEventListener('loadingdone', () => { if (S.route === 'publicity') schedulePoster(); });

  /* ---------- ตั้งค่าโรงเรียน ---------- */
  function fillSchool() {
    if (S.scDirty) return;
    const c = S.config, here = location.href.split('#')[0];
    $('#sc-name').value = c.schoolName || ''; $('#sc-aff').value = c.affiliation || ''; $('#sc-tags').value = c.hashtags || ''; $('#sc-fb').value = c.fbUrl || '';
    $('#sc-mail').value = c.notifyEmails || '';
    $('#sc-form').value = c.formUrl || here.replace(/staff\.html.*$/, 'index.html');
    $('#sc-staff').value = c.staffUrl || here;
    $('#sc-c1').value = c.color1 || '#1b2f6e'; $('#sc-c2').value = c.color2 || '#d4a017';
    S.scLogo = null; S.scLogoRemoved = false; renderLogoPrev();
  }
  function renderLogoPrev() {
    const p = $('#logoPrev');
    if (S.scLogo) p.innerHTML = '<img alt="ตราที่เลือก" src="' + S.scLogo.dataUrl + '">';
    else if (S.config.logo && !S.scLogoRemoved) p.innerHTML = '<img alt="ตราโรงเรียน" src="' + SA.dataUrl(S.config.logo) + '">';
    else p.innerHTML = '<span class="muted" style="font-size:.75rem">ไม่มีตรา</span>';
    $('#logoRemove').hidden = !(S.scLogo || (S.config.logo && !S.scLogoRemoved));
  }
  $('#schoolForm').addEventListener('input', () => { S.scDirty = true; });
  $('#sc-logo').addEventListener('change', async e => {
    const f = (e.target.files || [])[0]; e.target.value = ''; if (!f) return;
    try { S.scLogo = await SA.fileToPayload(f, 600, 'image/png'); S.scLogoRemoved = false; S.scDirty = true; renderLogoPrev(); }
    catch (x) { SA.toast(SA.errText(x)); }
  });
  $('#logoRemove').addEventListener('click', () => { if (S.scLogo) S.scLogo = null; else S.scLogoRemoved = true; S.scDirty = true; renderLogoPrev(); });
  $('#schoolForm').addEventListener('submit', async e => {
    e.preventDefault();
    const v = id => $('#' + id).value.trim(), msg = $('#scMsg');
    for (const id of ['sc-fb', 'sc-form', 'sc-staff']) { if (v(id) && !/^https?:\/\//.test(v(id))) { msg.textContent = 'ลิงก์ต้องขึ้นต้นด้วย https://'; $('#' + id).focus(); return; } }
    const btn = $('#sc-save'); btn.disabled = true; msg.textContent = 'กำลังบันทึก…';
    try {
      const payload = { config: { schoolName: v('sc-name'), affiliation: v('sc-aff'), hashtags: v('sc-tags'), fbUrl: v('sc-fb'), notifyEmails: v('sc-mail'), formUrl: v('sc-form'), staffUrl: v('sc-staff'), color1: $('#sc-c1').value, color2: $('#sc-c2').value } };
      if (S.scLogo) payload.logo = { mime: S.scLogo.mime, b64: S.scLogo.b64 };
      else if (S.scLogoRemoved) payload.removeLogo = true;
      const r = await call('saveConfig', payload);
      S.scDirty = false; setConfig(r.config); msg.textContent = ''; SA.toast('บันทึกการตั้งค่าแล้ว'); renderAll();
    } catch (x) { msg.textContent = 'บันทึกไม่สำเร็จ: ' + SA.errText(x); }
    finally { btn.disabled = false; }
  });

  /* ---------- การคลิกปุ่มต่าง ๆ ---------- */
  document.addEventListener('click', async e => {
    const cp = e.target.closest('[data-copy]');
    if (cp) { const el = $('#' + cp.dataset.copy); if (el) SA.copyText(el.value, el); return; }
    const rp = e.target.closest('[data-rmphoto]');
    if (rp) {
      const it = S.byId.get(S.modalId); if (!it) return; rp.disabled = true;
      try { const r = await call('removePhoto', { id: it.id, fileId: rp.dataset.rmphoto }); upsert(r.item); $('#edPhotos').innerHTML = editPhotosHTML(r.item); hydrate($('#edPhotos')); renderAll(); SA.toast('เอารูปออกแล้ว'); }
      catch (x) { rp.disabled = false; SA.toast(SA.errText(x)); }
      return;
    }
    const t = e.target.closest('[data-act]'); if (!t) return;
    const id = t.dataset.id;
    switch (t.dataset.act) {
      case 'open': openModal(id, 'view'); break;
      case 'close': closeModal(); break;
      case 'edit': openModal(id, 'edit'); break;
      case 'view': S.modalMode = 'view'; renderModal(true); break;
      case 'to-pub': closeModal(); selectPub(id); location.hash = '#publicity'; break;
      case 'ask-delete': S.confirmDelete = true; renderModal(true); break;
      case 'cancel-delete': S.confirmDelete = false; renderModal(true); break;
      case 'delete':
        t.disabled = true;
        try { await call('delete', { id: id }); S.items = S.items.filter(x => x.id !== id); S.byId.delete(id); closeModal(); renderAll(); SA.toast('ลบผลงานแล้ว'); }
        catch (x) { t.disabled = false; SA.toast(SA.errText(x)); }
        break;
      case 'unannounce': closeModal(); setStatus(id, { status: 'approved' }, 'ย้ายกลับไปรอทำกราฟิกแล้ว'); break;
      case 'approve': setStatus(id, { status: 'approved', reviewNote: '' }, 'ผ่านการตรวจ ส่งต่อฝ่ายประชาสัมพันธ์แล้ว'); break;
      case 'ask-return': S.returningId = id; S.returnDraft = ''; renderReview(); { const ta = $('#ret-note'); if (ta) ta.focus(); } break;
      case 'cancel-return': S.returningId = null; S.returnDraft = ''; renderReview(); break;
      case 'return': {
        const note = (($('#ret-note') || {}).value || '').trim();
        if (!note) { SA.toast('บอกสิ่งที่ต้องแก้ไขก่อนส่งกลับ'); return; }
        S.returningId = null; S.returnDraft = '';
        setStatus(id, { status: 'returned', reviewNote: note }, 'ส่งกลับให้แก้ไขแล้ว'); break;
      }
      case 'pick': selectPub(id); break;
      case 'ph': {
        const i = +t.dataset.i; if (i < 0) S.poster.usePhoto = false; else { S.poster.usePhoto = true; S.poster.photoIdx = i; }
        $$('#photoPick button').forEach(b => b.setAttribute('aria-pressed', String(+b.dataset.i === (S.poster.usePhoto ? S.poster.photoIdx : -1))));
        schedulePoster(); break;
      }
    }
  });
  $('#modal').addEventListener('click', e => { if (e.target.id === 'modal') closeModal(); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && !$('#modal').hidden) closeModal(); });

  /* ---------- เริ่มต้น ---------- */
  function renderAll() { renderHeader(); renderOverview(); renderReview(); renderPublicity(); renderModal(false); }
  SA.datalists();
  if (!SA.apiReady()) { $('#loginCfg').hidden = false; $('#loginCfg').textContent = SA.errText({ code: 'not_configured' }); }
  if (loadCreds()) { showApp(); renderAll(); load(); }
  else { try { const o = JSON.parse(localStorage.getItem(KEY + '-name') || 'null'); if (o) $('#lg-name').value = o; } catch (e) {} }
  $('#lg-name').addEventListener('change', () => { try { localStorage.setItem(KEY + '-name', JSON.stringify($('#lg-name').value.trim())); } catch (e) {} });
})();
