/* ระบบแจ้งผลงานนักเรียน — ค่าคงที่และเครื่องมือที่ใช้ร่วมกันทุกหน้า */
(function () {
  'use strict';
  const API_URL = (window.APP_CONFIG && window.APP_CONFIG.API_URL) || '';

  const LEVELS = ['ระดับโรงเรียน', 'ระดับกลุ่มโรงเรียน/อำเภอ', 'ระดับเขตพื้นที่การศึกษา', 'ระดับจังหวัด', 'ระดับภาค', 'ระดับชาติ', 'ระดับนานาชาติ'];
  const CATS = ['วิชาการ', 'วิทยาศาสตร์และเทคโนโลยี', 'ภาษา', 'ศิลปะ', 'ดนตรีและนาฏศิลป์', 'กีฬา', 'คุณธรรมและจิตอาสา', 'อื่น ๆ'];
  const AWARDS = ['ชนะเลิศ', 'รองชนะเลิศอันดับ 1', 'รองชนะเลิศอันดับ 2', 'ชมเชย', 'เหรียญทอง', 'เหรียญทอง ชนะเลิศ', 'เหรียญเงิน', 'เหรียญทองแดง', 'ผ่านการคัดเลือกเป็นตัวแทน', 'เข้าร่วมการแข่งขัน'];
  const STATUS = {
    pending: { label: 'รอตรวจ', cls: 'st-pending' },
    returned: { label: 'ส่งกลับแก้ไข', cls: 'st-returned' },
    approved: { label: 'รอทำกราฟิก', cls: 'st-approved' },
    announced: { label: 'ประกาศแล้ว', cls: 'st-announced' }
  };
  const M_S = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
  const M_F = ['มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน', 'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'];
  const CLASS_LIST = (function () { const c = ['อ.1', 'อ.2', 'อ.3']; for (let i = 1; i <= 6; i++) c.push('ป.' + i); for (let i = 1; i <= 6; i++) c.push('ม.' + i); return c; })();

  const ERR = {
    network: 'เชื่อมต่อระบบหลังบ้านไม่ได้ ตรวจอินเทอร์เน็ต หรือให้ผู้ดูแลตรวจลิงก์ API_URL ใน config.js',
    not_configured: 'ผู้ดูแลยังไม่ได้ใส่ลิงก์ระบบหลังบ้านในไฟล์ config.js',
    not_setup: 'ผู้ดูแลยังไม่ได้รันฟังก์ชัน setup ใน Google Apps Script',
    unauthorized: 'รหัสเจ้าหน้าที่ไม่ถูกต้อง',
    missing_fields: 'กรอกข้อมูลที่มีเครื่องหมาย * ให้ครบ',
    not_found: 'ไม่พบรายการนี้ อาจถูกลบไปแล้ว ลองรีเฟรช',
    too_many_photos: 'แนบรูปได้สูงสุด 6 รูปต่อผลงาน',
    too_large: 'ไฟล์ใหญ่เกินไป',
    bad_image: 'เปิดไฟล์รูปนี้ไม่ได้ ลองเลือกรูปแบบ JPG หรือ PNG',
    server_error: 'ระบบหลังบ้านขัดข้อง ลองอีกครั้ง'
  };

  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
  function todayISO() { const d = new Date(); return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10); }
  function thDate(iso, full) { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso || ''); if (!m) return iso || ''; return (+m[3]) + ' ' + (full ? M_F : M_S)[+m[2] - 1] + ' ' + (+m[1] + 543); }
  function thDateTime(iso) { if (!iso) return ''; const d = new Date(iso); if (isNaN(d)) return iso; const loc = new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString(); return thDate(loc.slice(0, 10)) + ' ' + loc.slice(11, 16) + ' น.'; }
  function acadYear(iso) { const m = /^(\d{4})-(\d{2})/.exec(iso || ''); if (!m) return null; const y = +m[1] + 543; return (+m[2]) >= 5 ? y : y - 1; }
  function tier(a) { a = a || ''; if (/ทองแดง|รองชนะเลิศอันดับ\s*2/.test(a)) return 'bronze'; if (/เงิน|รองชนะเลิศ/.test(a)) return 'silver'; if (/ชนะเลิศ|ทอง|อันดับ\s*1|ที่\s*1/.test(a)) return 'gold'; return 'plain'; }
  function isParticipation(a) { return /เข้าร่วม/.test(a || '') && tier(a) === 'plain'; }
  function stripLevel(l) { return String(l || '').replace(/^ระดับ/, ''); }
  function joinNames(list, all) {
    const n = (list || []).map(s => s.name).filter(Boolean);
    if (n.length <= 1) return n[0] || '';
    if (n.length === 2) return n.join(' และ ');
    if (all || n.length <= 5) return n.slice(0, -1).join(', ') + ' และ ' + n[n.length - 1];
    return n.slice(0, 4).join(', ') + ' และคณะ รวม ' + n.length + ' คน';
  }
  function classes(list) { return Array.from(new Set((list || []).map(s => s.cls).filter(Boolean))); }
  function classLine(list) { const c = classes(list); return c.length ? 'นักเรียนชั้น ' + c.join(', ') : ''; }
  function options(list, placeholder) { return (placeholder != null ? '<option value="">' + esc(placeholder) + '</option>' : '') + list.map(v => '<option value="' + esc(v) + '">' + esc(v) + '</option>').join(''); }
  function errText(e) { const c = (e && e.code) || 'server_error'; return ERR[c] || ('เกิดข้อผิดพลาด (' + c + ')'); }

  function apiReady() { return !!API_URL && !/ใส่รหัส|XXXX/.test(API_URL); }
  async function api(action, payload) {
    if (!apiReady()) throw { code: 'not_configured' };
    let res;
    try {
      res = await fetch(API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify(Object.assign({ action: action }, payload || {})),
        redirect: 'follow'
      });
    } catch (e) { throw { code: 'network' }; }
    let j;
    try { j = await res.json(); } catch (e) { throw { code: res.ok ? 'server_error' : 'network' }; }
    if (!j.ok) throw { code: j.error || 'server_error', message: j.message };
    return j;
  }

  function loadImg(src) { return new Promise((res, rej) => { const im = new Image(); im.onload = () => res(im); im.onerror = () => rej({ code: 'bad_image' }); im.src = src; }); }
  // ย่อรูปในเครื่องก่อนส่ง เพื่อให้ส่งเร็วและประหยัดพื้นที่ Drive
  async function fileToPayload(file, max, type, quality) {
    const url = URL.createObjectURL(file);
    try {
      const im = await loadImg(url);
      const k = Math.min(1, (max || 1600) / Math.max(im.naturalWidth, im.naturalHeight));
      const c = document.createElement('canvas');
      c.width = Math.max(1, Math.round(im.naturalWidth * k));
      c.height = Math.max(1, Math.round(im.naturalHeight * k));
      const ctx = c.getContext('2d');
      const mime = type || 'image/jpeg';
      if (mime === 'image/jpeg') { ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, c.width, c.height); }
      ctx.drawImage(im, 0, 0, c.width, c.height);
      const dataUrl = c.toDataURL(mime, quality || 0.85);
      return { mime: mime, b64: dataUrl.split(',')[1], dataUrl: dataUrl };
    } finally { URL.revokeObjectURL(url); }
  }
  function dataUrl(p) { return p ? 'data:' + p.mime + ';base64,' + p.b64 : ''; }

  // แถวกรอกชื่อนักเรียน (ใช้ทั้งหน้าแบบฟอร์มและหน้าแก้ไขของครู)
  function studentRowsHTML(list, prefix) {
    prefix = prefix || 'stu';
    if (!list.length) list = [{ name: '', cls: '' }];
    return list.map((s, i) => '<div class="stu-row">' +
      '<div class="field"><label for="' + prefix + '-name-' + i + '"' + (i === 0 ? ' class="req"' : '') + '>ชื่อ–สกุล นักเรียน' + (list.length > 1 ? ' คนที่ ' + (i + 1) : '') + '</label>' +
      '<input type="text" id="' + prefix + '-name-' + i + '" data-stu="name" value="' + esc(s.name) + '" placeholder="เช่น ด.ญ.กานต์ธิดา ใจดี" autocomplete="off"></div>' +
      '<div class="field"><label for="' + prefix + '-cls-' + i + '">ชั้น</label><input type="text" id="' + prefix + '-cls-' + i + '" data-stu="cls" list="clsList" value="' + esc(s.cls) + '" placeholder="ป.5/2" autocomplete="off"></div>' +
      (list.length > 1 ? '<button type="button" class="icon-btn" data-rm-stu="' + i + '" aria-label="ลบนักเรียนคนที่ ' + (i + 1) + '">×</button>' : '<span style="width:44px"></span>') +
      '</div>').join('');
  }
  function readStudents(container) {
    return Array.from(container.querySelectorAll('.stu-row')).map(r => ({
      name: r.querySelector('[data-stu=name]').value.trim(),
      cls: r.querySelector('[data-stu=cls]').value.trim()
    }));
  }
  function bindStudentRows(container, addBtn, prefix) {
    const render = list => { container.innerHTML = studentRowsHTML(list, prefix); };
    container.addEventListener('click', e => {
      const b = e.target.closest('[data-rm-stu]'); if (!b) return;
      const l = readStudents(container); l.splice(+b.dataset.rmStu, 1); render(l);
    });
    if (addBtn) addBtn.addEventListener('click', () => {
      const l = readStudents(container); l.push({ name: '', cls: '' }); render(l);
      const inputs = container.querySelectorAll('[data-stu=name]'); inputs[inputs.length - 1].focus();
    });
    return render;
  }
  function datalists() {
    if (document.getElementById('clsList')) return;
    const d1 = document.createElement('datalist'); d1.id = 'clsList'; d1.innerHTML = CLASS_LIST.map(c => '<option value="' + c + '"></option>').join('');
    const d2 = document.createElement('datalist'); d2.id = 'awardList'; d2.innerHTML = AWARDS.map(a => '<option value="' + esc(a) + '"></option>').join('');
    document.body.append(d1, d2);
  }

  let toastT;
  function toast(msg) {
    let t = document.getElementById('toast');
    if (!t) { t = document.createElement('div'); t.id = 'toast'; t.className = 'toast'; t.setAttribute('role', 'status'); document.body.appendChild(t); }
    t.textContent = msg; t.hidden = false; clearTimeout(toastT); toastT = setTimeout(() => { t.hidden = true; }, 3400);
  }
  async function copyText(text, el) {
    try { await navigator.clipboard.writeText(text); toast('คัดลอกแล้ว'); }
    catch (e) { if (el && el.select) { el.focus(); el.select(); } toast('เลือกข้อความแล้ว กดคัดลอกจากเมนูของเครื่อง'); }
  }

  window.SA = {
    API_URL, LEVELS, CATS, AWARDS, STATUS, CLASS_LIST,
    esc, todayISO, thDate, thDateTime, acadYear, tier, isParticipation, stripLevel, joinNames, classes, classLine, options, errText,
    apiReady, api, loadImg, fileToPayload, dataUrl, studentRowsHTML, readStudents, bindStudentRows, datalists, toast, copyText
  };
})();
