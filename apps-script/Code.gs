/**
 * ระบบแจ้งผลงานนักเรียน — ระบบหลังบ้าน (Google Apps Script + Google Sheets + Google Drive)
 *
 * ติดตั้งโดยย่อ (รายละเอียดอยู่ใน README.md):
 *   1. แก้ STAFF_PASSCODE ด้านล่างเป็นรหัสสำหรับครูและฝ่ายประชาสัมพันธ์
 *   2. เลือกฟังก์ชัน setup ที่แถบด้านบน แล้วกด Run หนึ่งครั้ง (กดอนุญาตสิทธิ์ตามที่ Google ถาม)
 *   3. Deploy > New deployment > Web app
 *        Execute as: Me   |   Who has access: Anyone
 *   4. คัดลอก Web app URL (ลงท้ายด้วย /exec) ไปใส่ในไฟล์ config.js ของเว็บบน GitHub
 *
 * เปลี่ยนรหัสภายหลัง: แก้ STAFF_PASSCODE แล้วรัน setup อีกครั้ง (ไม่ต้อง Deploy ใหม่)
 * แก้โค้ดส่วนอื่นภายหลัง: Deploy > Manage deployments > แก้ไข (ไอคอนดินสอ) > Version: New version
 */

const STAFF_PASSCODE = 'CHANGE-ME';

const TZ = 'Asia/Bangkok';
const APP_FOLDER_NAME = 'ระบบแจ้งผลงานนักเรียน';
const SHEET_ITEMS = 'ผลงาน';
const SHEET_CONFIG = 'ตั้งค่า';
const MAX_PHOTOS = 6;
const MAX_FILE_BYTES = 6 * 1024 * 1024;
const IMAGE_TYPES = { 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp' };
const STATUS_TH = { pending: 'รอตรวจ', returned: 'ส่งกลับแก้ไข', approved: 'รอทำกราฟิก', announced: 'ประกาศแล้ว' };

// คอลัมน์ในชีต "ผลงาน" : [ชื่อในระบบ, หัวคอลัมน์ภาษาไทย]
const COLS = [
  ['id', 'รหัสอ้างอิง'], ['createdAt', 'วันเวลาที่แจ้ง'], ['status', 'สถานะ'],
  ['studentNames', 'ชื่อนักเรียน'], ['classes', 'ชั้น'],
  ['title', 'รายการแข่งขัน'], ['category', 'ประเภท'], ['level', 'ระดับ'], ['award', 'รางวัล'], ['date', 'วันที่แข่งขัน'],
  ['organizer', 'หน่วยงานผู้จัด'], ['venue', 'สถานที่'], ['coach', 'ครูผู้ฝึกสอน'],
  ['submitterRole', 'ผู้แจ้ง'], ['submitterName', 'ชื่อผู้แจ้ง'], ['submitterPhone', 'เบอร์โทรผู้แจ้ง'], ['consent', 'การยินยอมเผยแพร่'],
  ['note', 'รายละเอียดเพิ่มเติม'], ['photoIds', 'รูปภาพ (Drive file id)'],
  ['reviewNote', 'หมายเหตุการตรวจ'], ['reviewedBy', 'ตรวจโดย'], ['reviewedAt', 'วันเวลาที่ตรวจ'],
  ['announcedBy', 'ประกาศโดย'], ['announcedAt', 'วันเวลาที่ประกาศ'], ['channels', 'ช่องทางที่ประกาศ'],
  ['posterId', 'ไฟล์กราฟิก (Drive file id)'], ['captionFb', 'แคปชัน Facebook'], ['captionLine', 'ข้อความ LINE'],
  ['updatedAt', 'แก้ไขล่าสุด'], ['updatedBy', 'แก้ไขโดย'], ['studentsJson', 'ข้อมูลนักเรียน (ระบบใช้ ห้ามแก้)']
];

// แถวในชีต "ตั้งค่า" : [key, คำอธิบาย, ค่าเริ่มต้น]
const CONFIG_KEYS = [
  ['schoolName', 'ชื่อโรงเรียน', ''],
  ['affiliation', 'สังกัด / บรรทัดรองบนกราฟิก', ''],
  ['color1', 'สีหลักของกราฟิก', '#1b2f6e'],
  ['color2', 'สีริบบิ้น', '#d4a017'],
  ['hashtags', 'แฮชแท็กท้ายโพสต์', ''],
  ['fbUrl', 'ลิงก์เพจ Facebook ของโรงเรียน', ''],
  ['notifyEmails', 'อีเมลรับแจ้งเตือนเมื่อมีผลงานใหม่ (คั่นด้วยจุลภาค)', ''],
  ['formUrl', 'ลิงก์หน้าแบบฟอร์มแจ้งผลงาน', ''],
  ['staffUrl', 'ลิงก์หน้าหลังบ้าน', ''],
  ['logoId', 'ไฟล์ตราโรงเรียน (Drive file id)', '']
];

const TEXT_FIELDS = {
  title: 300, category: 60, level: 60, award: 120, date: 10, organizer: 200, venue: 200, coach: 200,
  submitterName: 120, submitterPhone: 30, note: 1000
};

/* ============================== ติดตั้ง ============================== */

function setup() {
  if (!STAFF_PASSCODE || STAFF_PASSCODE === 'CHANGE-ME' || STAFF_PASSCODE.length < 6) {
    throw new Error('กรุณาแก้ STAFF_PASSCODE ในบรรทัดบนสุดเป็นรหัสอย่างน้อย 6 ตัวอักษร แล้วรัน setup อีกครั้ง');
  }
  const props = PropertiesService.getScriptProperties();

  let root = props.getProperty('FOLDER_ID') ? DriveApp.getFolderById(props.getProperty('FOLDER_ID')) : null;
  if (!root) {
    root = DriveApp.createFolder(APP_FOLDER_NAME);
    props.setProperty('FOLDER_ID', root.getId());
  }
  if (!props.getProperty('PHOTO_FOLDER_ID')) props.setProperty('PHOTO_FOLDER_ID', root.createFolder('รูปผลงานนักเรียน').getId());
  if (!props.getProperty('POSTER_FOLDER_ID')) props.setProperty('POSTER_FOLDER_ID', root.createFolder('กราฟิกประกาศ').getId());

  let ss;
  if (props.getProperty('SHEET_ID')) {
    ss = SpreadsheetApp.openById(props.getProperty('SHEET_ID'));
  } else {
    ss = SpreadsheetApp.create('ข้อมูลผลงานนักเรียน');
    DriveApp.getFileById(ss.getId()).moveTo(root);
    ss.getSheets()[0].setName(SHEET_ITEMS);
    props.setProperty('SHEET_ID', ss.getId());
  }

  const sh = ss.getSheetByName(SHEET_ITEMS) || ss.insertSheet(SHEET_ITEMS);
  sh.getRange(1, 1, 1, COLS.length).setValues([COLS.map(c => c[1])])
    .setFontWeight('bold').setBackground('#152048').setFontColor('#ffffff');
  sh.setFrozenRows(1);

  let cf = ss.getSheetByName(SHEET_CONFIG);
  if (!cf) {
    cf = ss.insertSheet(SHEET_CONFIG);
    cf.getRange(1, 1, 1, 3).setValues([['key', 'ค่า', 'คำอธิบาย']]).setFontWeight('bold');
    writeConfig(defaultConfig());
  }

  props.setProperty('STAFF_PASSCODE', STAFF_PASSCODE);
  Logger.log('ติดตั้งเสร็จแล้ว\nโฟลเดอร์ใน Drive: ' + root.getUrl() + '\nชีตข้อมูล: ' + ss.getUrl());
}

/* ============================== รับคำขอจากเว็บ ============================== */

function doGet() {
  return out({ ok: true, app: 'student-achievements', ready: !!prop('SHEET_ID') });
}

function doPost(e) {
  let req;
  try {
    req = JSON.parse((e && e.postData && e.postData.contents) || '{}');
  } catch (err) {
    return out({ ok: false, error: 'bad_request' });
  }
  try {
    if (!prop('SHEET_ID')) return out({ ok: false, error: 'not_setup' });

    switch (req.action) {
      case 'publicConfig': return out({ ok: true, config: publicConfig() });
      case 'submit': return out(submitItem(req));
    }

    if (!checkPass(req.passcode)) {
      Utilities.sleep(1000);
      return out({ ok: false, error: 'unauthorized' });
    }
    switch (req.action) {
      case 'login': return out({ ok: true });
      case 'list': return out({ ok: true, items: listItems(), config: staffConfig() });
      case 'update': return out(withLock(() => updateItem(req)));
      case 'photos': return out(getPhotos(req));
      case 'addPhotos': return out(addPhotos(req));
      case 'removePhoto': return out(withLock(() => removePhoto(req)));
      case 'delete': return out(withLock(() => deleteItem(req)));
      case 'saveConfig': return out(saveConfig(req));
      case 'savePoster': return out(savePoster(req));
    }
    return out({ ok: false, error: 'unknown_action' });
  } catch (err) {
    console.error(err);
    return out({ ok: false, error: 'server_error', message: String((err && err.message) || err) });
  }
}

/* ============================== ผลงาน ============================== */

function submitItem(req) {
  if (req.hp) return { ok: true, id: '-' }; // กันสแปมบอต: ช่องซ่อนถูกกรอก
  const d = cleanItem(req.data || {}, false);
  if (!d.students.length || !d.title || !d.category || !d.level || !d.award || !d.date || !d.submitterName) {
    return { ok: false, error: 'missing_fields' };
  }
  const id = newId();
  const photos = Array.isArray(req.photos) ? req.photos.slice(0, MAX_PHOTOS) : [];
  const photoIds = photos.map((p, i) => savePhoto(p, id + '-' + (i + 1))).filter(Boolean);
  const now = nowIso();
  const it = Object.assign(d, {
    id: id, createdAt: now, status: 'pending', photoIds: photoIds,
    reviewNote: '', reviewedBy: '', reviewedAt: '', announcedBy: '', announcedAt: '', channels: null,
    posterId: '', captionFb: '', captionLine: '', updatedAt: now, updatedBy: d.submitterName
  });
  withLock(() => {
    const sh = itemsSheet();
    writeRow(sh, sh.getLastRow() + 1, it);
  });
  notifyNew(it);
  return { ok: true, id: id };
}

function listItems() {
  return readAll().rows.filter(r => r[0]).map(fromRow).reverse();
}

function updateItem(req) {
  const f = findItem(req.id);
  if (!f.item) return { ok: false, error: 'not_found' };
  const p = req.patch || {};
  const it = f.item;
  const by = str(req.by, 80);
  const now = nowIso();

  Object.assign(it, cleanItem(p, true));
  if ('reviewNote' in p) it.reviewNote = str(p.reviewNote, 500);
  if ('captionFb' in p) it.captionFb = str(p.captionFb, 5000);
  if ('captionLine' in p) it.captionLine = str(p.captionLine, 3000);
  if ('channels' in p) it.channels = p.channels ? { facebook: !!p.channels.facebook, line: !!p.channels.line } : null;

  if ('status' in p) {
    if (!STATUS_TH[p.status]) return { ok: false, error: 'bad_status' };
    const from = it.status, to = p.status;
    if ((to === 'approved' || to === 'returned') && (from === 'pending' || from === 'returned')) {
      it.reviewedBy = by; it.reviewedAt = now;
    }
    if (to === 'announced' && !it.announcedAt) { it.announcedBy = by; it.announcedAt = now; }
    if (to === 'approved' && from === 'announced') { it.announcedBy = ''; it.announcedAt = ''; }
    it.status = to;
  }
  it.updatedAt = now;
  it.updatedBy = by;
  writeRow(f.sh, f.row, it);
  return { ok: true, item: it };
}

function deleteItem(req) {
  const f = findItem(req.id);
  if (!f.item) return { ok: false, error: 'not_found' };
  f.item.photoIds.forEach(trash);
  trash(f.item.posterId);
  f.sh.deleteRow(f.row);
  return { ok: true };
}

/* ============================== รูปภาพ ============================== */

function savePhoto(p, baseName) {
  if (!p || !IMAGE_TYPES[p.mime] || typeof p.b64 !== 'string') return null;
  const bytes = Utilities.base64Decode(p.b64);
  if (!bytes.length || bytes.length > MAX_FILE_BYTES) return null;
  const file = folder('PHOTO_FOLDER_ID').createFile(Utilities.newBlob(bytes, p.mime, baseName + IMAGE_TYPES[p.mime]));
  return file.getId();
}

function getPhotos(req) {
  const ids = Array.isArray(req.ids) ? req.ids.slice(0, 8) : [];
  const allowed = [prop('PHOTO_FOLDER_ID'), prop('POSTER_FOLDER_ID'), prop('FOLDER_ID')];
  const photos = {};
  ids.forEach(id => {
    try {
      const f = DriveApp.getFileById(String(id));
      if (f.isTrashed() || !inFolders(f, allowed)) return;
      const b = f.getBlob();
      photos[id] = { mime: b.getContentType(), b64: Utilities.base64Encode(b.getBytes()) };
    } catch (e) { /* ไฟล์ถูกลบหรือไม่มีสิทธิ์ */ }
  });
  return { ok: true, photos: photos };
}

function addPhotos(req) {
  const f0 = findItem(req.id);
  if (!f0.item) return { ok: false, error: 'not_found' };
  const room = MAX_PHOTOS - f0.item.photoIds.length;
  if (room <= 0) return { ok: false, error: 'too_many_photos' };
  const stamp = Utilities.formatDate(new Date(), TZ, 'HHmmss');
  const ids = (Array.isArray(req.photos) ? req.photos : []).slice(0, room)
    .map((p, i) => savePhoto(p, req.id + '-' + stamp + '-' + (i + 1))).filter(Boolean);
  return withLock(() => {
    const f = findItem(req.id);
    if (!f.item) { ids.forEach(trash); return { ok: false, error: 'not_found' }; }
    f.item.photoIds = f.item.photoIds.concat(ids).slice(0, MAX_PHOTOS);
    f.item.updatedAt = nowIso();
    f.item.updatedBy = str(req.by, 80);
    writeRow(f.sh, f.row, f.item);
    return { ok: true, item: f.item };
  });
}

function removePhoto(req) {
  const f = findItem(req.id);
  if (!f.item) return { ok: false, error: 'not_found' };
  const fid = String(req.fileId || '');
  if (f.item.photoIds.indexOf(fid) < 0) return { ok: false, error: 'not_found' };
  f.item.photoIds = f.item.photoIds.filter(x => x !== fid);
  trash(fid);
  f.item.updatedAt = nowIso();
  f.item.updatedBy = str(req.by, 80);
  writeRow(f.sh, f.row, f.item);
  return { ok: true, item: f.item };
}

function savePoster(req) {
  const f0 = findItem(req.id);
  if (!f0.item) return { ok: false, error: 'not_found' };
  if (typeof req.b64 !== 'string') return { ok: false, error: 'bad_request' };
  const bytes = Utilities.base64Decode(req.b64);
  if (!bytes.length || bytes.length > MAX_FILE_BYTES * 2) return { ok: false, error: 'too_large' };
  const names = f0.item.students.map(s => s.name).join(', ').slice(0, 80);
  const file = folder('POSTER_FOLDER_ID').createFile(Utilities.newBlob(bytes, 'image/png', (f0.item.date || '') + ' ' + names + '.png'));
  return withLock(() => {
    const f = findItem(req.id);
    if (!f.item) { trash(file.getId()); return { ok: false, error: 'not_found' }; }
    trash(f.item.posterId);
    f.item.posterId = file.getId();
    f.item.updatedAt = nowIso();
    f.item.updatedBy = str(req.by, 80);
    writeRow(f.sh, f.row, f.item);
    return { ok: true, item: f.item, url: file.getUrl() };
  });
}

/* ============================== ตั้งค่า ============================== */

function defaultConfig() {
  const o = {};
  CONFIG_KEYS.forEach(k => { o[k[0]] = k[2]; });
  return o;
}

function readConfig() {
  const o = defaultConfig();
  const sh = book().getSheetByName(SHEET_CONFIG);
  const n = sh.getLastRow();
  if (n >= 2) {
    sh.getRange(2, 1, n - 1, 2).getValues().forEach(r => {
      if (r[0]) o[String(r[0])] = cellStr(r[1]);
    });
  }
  return o;
}

function writeConfig(o) {
  const sh = book().getSheetByName(SHEET_CONFIG);
  const rows = CONFIG_KEYS.map(k => [k[0], safeCell(o[k[0]] == null ? '' : o[k[0]]), k[1]]);
  sh.getRange(2, 1, rows.length, 3).setNumberFormat('@').setValues(rows);
}

function saveConfig(req) {
  const c = req.config || {};
  const next = readConfig();
  ['schoolName', 'affiliation', 'hashtags', 'fbUrl', 'notifyEmails', 'formUrl', 'staffUrl'].forEach(k => {
    if (k in c) next[k] = str(c[k], k === 'notifyEmails' ? 500 : 300);
  });
  ['color1', 'color2'].forEach(k => {
    if (k in c && /^#[0-9a-fA-F]{6}$/.test(String(c[k]))) next[k] = String(c[k]);
  });
  ['fbUrl', 'formUrl', 'staffUrl'].forEach(k => {
    if (next[k] && !/^https?:\/\//.test(next[k])) next[k] = '';
  });
  if (req.removeLogo) { trash(next.logoId); next.logoId = ''; }
  if (req.logo && IMAGE_TYPES[req.logo.mime] && typeof req.logo.b64 === 'string') {
    const bytes = Utilities.base64Decode(req.logo.b64);
    if (bytes.length && bytes.length <= MAX_FILE_BYTES) {
      const f = folder('FOLDER_ID').createFile(Utilities.newBlob(bytes, req.logo.mime, 'ตราโรงเรียน' + IMAGE_TYPES[req.logo.mime]));
      trash(next.logoId);
      next.logoId = f.getId();
    }
  }
  writeConfig(next);
  return { ok: true, config: staffConfig() };
}

function publicConfig() {
  const c = readConfig();
  return { schoolName: c.schoolName, affiliation: c.affiliation, color1: c.color1, color2: c.color2, logo: logoData(c.logoId) };
}

function staffConfig() {
  const c = readConfig();
  c.logo = logoData(c.logoId);
  return c;
}

function logoData(id) {
  if (!id) return null;
  try {
    const f = DriveApp.getFileById(id);
    if (f.isTrashed()) return null;
    const b = f.getBlob();
    return { mime: b.getContentType(), b64: Utilities.base64Encode(b.getBytes()) };
  } catch (e) {
    return null;
  }
}

/* ============================== แจ้งเตือนอีเมล ============================== */

function notifyNew(it) {
  try {
    const c = readConfig();
    const to = String(c.notifyEmails || '').split(/[,\s]+/).filter(x => /@/.test(x)).join(',');
    if (!to) return;
    const lines = [
      'มีผลงานนักเรียนแจ้งเข้ามาใหม่ รอครูตรวจ', '',
      'นักเรียน: ' + it.students.map(s => s.name + (s.cls ? ' (' + s.cls + ')' : '')).join(', '),
      'รายการ: ' + it.title,
      'รางวัล: ' + it.award,
      'ระดับ: ' + it.level,
      'ผู้แจ้ง: ' + it.submitterName + (it.submitterRole === 'teacher' ? ' (ครู)' : ' (ผู้ปกครอง)') + (it.submitterPhone ? ' โทร ' + it.submitterPhone : ''),
      'แนบรูป: ' + it.photoIds.length + ' รูป',
      'รหัสอ้างอิง: ' + it.id
    ];
    if (c.staffUrl) lines.push('', 'เข้าไปตรวจได้ที่: ' + c.staffUrl + '#review');
    MailApp.sendEmail({ to: to, subject: '[ผลงานนักเรียน] รอตรวจ: ' + it.title.slice(0, 80), body: lines.join('\n') });
  } catch (e) {
    console.warn('ส่งอีเมลแจ้งเตือนไม่สำเร็จ', e);
  }
}

/* ============================== แปลงข้อมูลแถว ============================== */

function toRow(it) {
  return COLS.map(c => {
    const k = c[0];
    switch (k) {
      case 'status': return STATUS_TH[it.status] || STATUS_TH.pending;
      case 'studentNames': return (it.students || []).map(s => s.name).join(', ');
      case 'classes': return uniq((it.students || []).map(s => s.cls).filter(Boolean)).join(', ');
      case 'studentsJson': return JSON.stringify(it.students || []);
      case 'submitterRole': return it.submitterRole === 'teacher' ? 'ครู' : 'ผู้ปกครอง';
      case 'consent': return it.consent ? 'ยินยอม' : 'ไม่ยินยอม';
      case 'photoIds': return (it.photoIds || []).join(',');
      case 'channels': return it.channels ? [it.channels.facebook ? 'Facebook' : '', it.channels.line ? 'LINE' : ''].filter(Boolean).join(', ') : '';
      default: return it[k] == null ? '' : it[k];
    }
  }).map(safeCell);
}

function fromRow(r) {
  const it = {};
  COLS.forEach((c, i) => { it[c[0]] = cellStr(r[i], c[0]); });
  const st = Object.keys(STATUS_TH).filter(code => STATUS_TH[code] === it.status || code === it.status)[0];
  it.status = st || 'pending';
  let students = [];
  try { students = JSON.parse(it.studentsJson || '[]'); } catch (e) { students = []; }
  if (!Array.isArray(students) || !students.length) {
    students = String(it.studentNames || '').split(',').map(s => ({ name: s.trim(), cls: '' })).filter(s => s.name);
  }
  it.students = students;
  delete it.studentsJson; delete it.studentNames; delete it.classes;
  it.submitterRole = (it.submitterRole === 'ครู' || it.submitterRole === 'teacher') ? 'teacher' : 'parent';
  it.consent = it.consent === 'ยินยอม' || it.consent === 'true' || it.consent === 'TRUE';
  it.photoIds = it.photoIds ? it.photoIds.split(',').map(s => s.trim()).filter(Boolean) : [];
  it.channels = it.channels ? { facebook: /facebook/i.test(it.channels), line: /line/i.test(it.channels) } : null;
  return it;
}

function cleanItem(d, partial) {
  const o = {};
  if (!partial || 'students' in d) {
    o.students = (Array.isArray(d.students) ? d.students : []).slice(0, 40)
      .map(s => ({ name: str(s && s.name, 120), cls: str(s && s.cls, 20) })).filter(s => s.name);
  }
  Object.keys(TEXT_FIELDS).forEach(k => {
    if (!partial || k in d) o[k] = str(d[k], TEXT_FIELDS[k]);
  });
  if (o.date && !/^\d{4}-\d{2}-\d{2}$/.test(o.date)) o.date = '';
  if (!partial || 'submitterRole' in d) o.submitterRole = d.submitterRole === 'teacher' ? 'teacher' : 'parent';
  if (!partial || 'consent' in d) o.consent = d.consent === true;
  return o;
}

/* ============================== เครื่องมือ ============================== */

function prop(k) { return PropertiesService.getScriptProperties().getProperty(k); }
function out(o) { return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }
function nowIso() { return new Date().toISOString(); }
function book() { return SpreadsheetApp.openById(prop('SHEET_ID')); }
function itemsSheet() { return book().getSheetByName(SHEET_ITEMS); }
function folder(key) { return DriveApp.getFolderById(prop(key)); }
function uniq(a) { return a.filter((x, i) => a.indexOf(x) === i); }

function checkPass(p) {
  const real = prop('STAFF_PASSCODE');
  return !!p && !!real && real !== 'CHANGE-ME' && String(p) === real;
}

function withLock(fn) {
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try { return fn(); } finally { lock.releaseLock(); }
}

function str(v, max) {
  return String(v == null ? '' : v).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '').trim().slice(0, max || 300);
}

// กันไม่ให้ข้อความที่ขึ้นต้นด้วย = + - @ ถูกตีความเป็นสูตรในชีต
function safeCell(v) {
  const s = String(v == null ? '' : v);
  return /^[=+\-@]/.test(s) ? "'" + s : s;
}

function cellStr(v, k) {
  if (v instanceof Date) return k === 'date' ? Utilities.formatDate(v, TZ, 'yyyy-MM-dd') : v.toISOString();
  return v == null ? '' : String(v);
}

function readAll() {
  const sh = itemsSheet();
  const n = sh.getLastRow();
  if (n < 2) return { sh: sh, rows: [] };
  return { sh: sh, rows: sh.getRange(2, 1, n - 1, COLS.length).getValues() };
}

function findItem(id) {
  const all = readAll();
  for (let i = 0; i < all.rows.length; i++) {
    if (String(all.rows[i][0]) === String(id)) return { sh: all.sh, row: i + 2, item: fromRow(all.rows[i]) };
  }
  return { sh: all.sh, row: 0, item: null };
}

function writeRow(sh, row, it) {
  sh.getRange(row, 1, 1, COLS.length).setNumberFormat('@').setValues([toRow(it)]);
}

function newId() {
  return 'R' + Utilities.formatDate(new Date(), TZ, 'yyMMdd') + '-' + Utilities.getUuid().replace(/-/g, '').slice(0, 4).toUpperCase();
}

function inFolders(file, ids) {
  const it = file.getParents();
  while (it.hasNext()) {
    if (ids.indexOf(it.next().getId()) >= 0) return true;
  }
  return false;
}

function trash(id) {
  if (!id) return;
  try { DriveApp.getFileById(id).setTrashed(true); } catch (e) { /* ไม่มีไฟล์แล้ว */ }
}
