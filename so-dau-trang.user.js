// ==UserScript==
// @name         Sổ Dấu Trang
// @namespace    so-dau-trang
// @version      2.8.1
// @description  Lưu dấu trang theo thư mục và nhãn; nút ruy băng cho biết trang đang mở đã lưu chưa. Dữ liệu chỉ nằm trong trình duyệt.
// @homepageURL  https://github.com/Cungbonvotang/SoulBookmarks
// @updateURL    https://raw.githubusercontent.com/Cungbonvotang/SoulBookmarks/main/so-dau-trang.user.js
// @downloadURL  https://raw.githubusercontent.com/Cungbonvotang/SoulBookmarks/main/so-dau-trang.user.js
// @match        *://*/*
// @include      *
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_deleteValue
// @grant        GM_listValues
// @grant        GM_openInTab
// @grant        GM_setClipboard
// @grant        GM_registerMenuCommand
// @grant        unsafeWindow
// @run-at       document-idle
// @noframes
// ==/UserScript==
(function () {
'use strict';
if (window.top !== window.self) return;
if (!document.documentElement) return;
const SDTNS = {};
/* Sổ Dấu Trang — logic thuần (không chạm DOM, không chạm chrome hay GM).
   Dùng được trong trang tiện ích, service worker, userscript và Node (để thử). */
(function (root) {
  'use strict';

  const DATA_VERSION = 2;
  const STORAGE_KEY = 'sdt_data';           // khóa của dữ liệu v1 (một khối)
  const APP_ID = 'so-dau-trang';
  const ALLOWED_PROTOCOLS = ['http:', 'https:', 'ftp:', 'file:'];
  const ROOT_NAME = 'Dấu trang';
  const TAG_COLORS = ['blue', 'green', 'purple', 'pink', 'orange', 'yellow', 'teal', 'red', 'brown', 'gray'];
  const TAG_COLOR_NAMES = { blue: 'Xanh lam', green: 'Xanh lá', purple: 'Tím', pink: 'Hồng', orange: 'Cam', yellow: 'Vàng', teal: 'Xanh ngọc', red: 'Đỏ', brown: 'Nâu', gray: 'Xám' };

  /* ---------- tiện ích chung ---------- */
  function emptyData() { return { version: DATA_VERSION, folders: [], bookmarks: [], tagColors: {} }; }
  let idSeq = 0;
  function makeId() {
    idSeq = (idSeq + 1) % 1296;
    return Date.now().toString(36) + idSeq.toString(36).padStart(2, '0') + Math.random().toString(36).slice(2, 7);
  }
  function fold(s) {
    return String(s == null ? '' : s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd');
  }
  function lower(s) { return String(s == null ? '' : s).toLowerCase(); }
  function squash(s) { return String(s == null ? '' : s).replace(/\s+/g, ' ').trim(); }
  const collator = (typeof Intl !== 'undefined') ? new Intl.Collator('vi', { sensitivity: 'base', numeric: true }) : null;
  function cmpText(a, b) { return collator ? collator.compare(a, b) : (a < b ? -1 : a > b ? 1 : 0); }
  // FNV-1a 32 bit: chia dữ liệu thành phần, gán màu nhãn tự động.
  function hash32(str) {
    let h = 0x811c9dc5;
    const s = String(str);
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); }
    return h >>> 0;
  }
  function assign(o, p) { return Object.assign({}, o, p); }

  /* ---------- địa chỉ ---------- */
  function normalizeUrl(raw) {
    const s = String(raw == null ? '' : raw).trim();
    let u;
    try { u = new URL(s); } catch (e) { return s.toLowerCase(); }
    if (u.protocol === 'http:' || u.protocol === 'https:') {
      const host = u.hostname.toLowerCase().replace(/^www\./, '');
      const port = u.port ? ':' + u.port : '';
      const path = u.pathname.replace(/\/+$/, '');
      return host + port + path + u.search;
    }
    let out = u.href.replace(/#.*$/, '');
    if (!u.search) out = out.replace(/\/+$/, '');
    return out;
  }
  function isSavableUrl(raw) {
    try { return ALLOWED_PROTOCOLS.includes(new URL(String(raw)).protocol); } catch (e) { return false; }
  }
  const SCHEME_RE = /^[a-z][a-z0-9+.\-]*:\/\//i;
  const SPECIAL_SCHEME_RE = /^(about|chrome|edge|brave|opera|vivaldi|javascript|data|mailto|tel|file|view-source|chrome-extension|blob):/i;
  function fixUrl(input) {
    let s = String(input == null ? '' : input).trim();
    if (!s) return { ok: false, error: 'Nhập địa chỉ trang web.' };
    if (!SCHEME_RE.test(s) && !SPECIAL_SCHEME_RE.test(s)) s = 'https://' + s;
    let u;
    try { u = new URL(s); } catch (e) { return { ok: false, error: 'Địa chỉ không hợp lệ. Ví dụ đúng: https://vnexpress.net' }; }
    if (!ALLOWED_PROTOCOLS.includes(u.protocol)) return { ok: false, error: 'Chỉ lưu được địa chỉ bắt đầu bằng http, https, ftp hoặc file.' };
    if (u.protocol !== 'file:') {
      const h = u.hostname;
      if (!h || !(h.includes('.') || h === 'localhost' || h.startsWith('['))) return { ok: false, error: 'Địa chỉ không hợp lệ. Ví dụ đúng: https://vnexpress.net' };
    }
    return { ok: true, url: /\s/.test(s) ? u.href : s };
  }
  function domainOf(raw) {
    try {
      const u = new URL(raw);
      if (u.protocol === 'file:') return 'tệp trên máy';
      return u.hostname.replace(/^www\./, '') || u.protocol.replace(':', '');
    } catch (e) { return String(raw || ''); }
  }

  /* ---------- nhãn ---------- */
  function cleanTag(t) { return squash(String(t == null ? '' : t).replace(/^#+/, '')).slice(0, 50); }
  function normalizeTags(list) {
    const out = [];
    const seen = new Set();
    for (const t of (Array.isArray(list) ? list : [])) {
      const c = cleanTag(t);
      if (!c) continue;
      const k = lower(c);
      if (seen.has(k)) continue;
      seen.add(k);
      out.push(c);
    }
    return out;
  }
  function parseTags(str) { return normalizeTags(String(str == null ? '' : str).split(/[,\n]/)); }
  function tagCounts(data) {
    const map = new Map();
    for (const b of data.bookmarks) {
      for (const t of b.tags) {
        const k = lower(t);
        let e = map.get(k);
        if (!e) { e = { tag: t, count: 0 }; map.set(k, e); }
        e.count++;
      }
    }
    return [...map.values()].sort((a, b) => cmpText(a.tag, b.tag));
  }
  function autoTagColor(tag) { return TAG_COLORS[hash32(lower(tag)) % TAG_COLORS.length]; }
  function tagColor(data, tag) {
    const c = data && data.tagColors ? data.tagColors[lower(tag)] : null;
    return TAG_COLORS.includes(c) ? c : autoTagColor(tag);
  }
  function setTagColor(data, tag, color) {
    if (!TAG_COLORS.includes(color)) return { ok: false, error: 'Màu không hợp lệ.' };
    const tagColors = assign(data.tagColors || {}, { [lower(tag)]: color });
    return { ok: true, data: assign(data, { tagColors }) };
  }
  function renameTag(data, oldTag, newTag, now) {
    const nn = cleanTag(newTag);
    if (!nn) return { ok: false, error: 'Nhập tên nhãn mới.' };
    const ok = lower(oldTag);
    const existing = tagCounts(data).find(t => lower(t.tag) === lower(nn) && lower(t.tag) !== ok);
    const target = existing ? existing.tag : nn;
    let changed = 0;
    const bookmarks = data.bookmarks.map(b => {
      if (!b.tags.some(t => lower(t) === ok)) return b;
      const tags = normalizeTags(b.tags.map(t => (lower(t) === ok ? target : t)));
      if (JSON.stringify(tags) === JSON.stringify(b.tags)) return b;
      changed++;
      return assign(b, { tags, updatedAt: now });
    });
    // Màu: đổi tên giữ màu cũ; gộp thì giữ màu nhãn đích.
    const tagColors = assign(data.tagColors || {}, {});
    const oldColor = tagColor(data, oldTag);
    if (!existing && lower(target) !== ok) tagColors[lower(target)] = oldColor;
    if (lower(target) !== ok) delete tagColors[ok];
    return { ok: true, data: assign(data, { bookmarks, tagColors }), changed, merged: !!existing, name: target };
  }
  function deleteTag(data, tag, now) {
    const k = lower(tag);
    let changed = 0;
    const bookmarks = data.bookmarks.map(b => {
      if (!b.tags.some(t => lower(t) === k)) return b;
      changed++;
      return assign(b, { tags: b.tags.filter(t => lower(t) !== k), updatedAt: now });
    });
    const tagColors = assign(data.tagColors || {}, {});
    delete tagColors[k];
    return { ok: true, data: assign(data, { bookmarks, tagColors }), changed };
  }

  /* ---------- thứ tự ---------- */
  function byOrder(a, b) { return (a.order - b.order) || (a.createdAt - b.createdAt) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0); }
  function maxOrder(list) { let m = -1; for (const x of list) if (x.order > m) m = x.order; return m; }

  /* ---------- thư mục ---------- */
  function getFolder(data, id) { return id ? data.folders.find(f => f.id === id) || null : null; }
  function childMap(data) {
    const m = new Map();
    for (const f of data.folders) {
      const p = f.parentId || null;
      if (!m.has(p)) m.set(p, []);
      m.get(p).push(f);
    }
    return m;
  }
  function childrenOf(data, parentId, sort) {
    const p = parentId || null;
    const list = data.folders.filter(f => (f.parentId || null) === p);
    return list.sort(sort === 'name' ? (a, b) => cmpText(a.name, b.name) : (a, b) => byOrder(a, b) || cmpText(a.name, b.name));
  }
  function descendantIds(data, id, cmap) {
    const m = cmap || childMap(data);
    const out = [];
    const stack = [id];
    const seen = new Set([id]);
    while (stack.length) {
      for (const f of (m.get(stack.pop()) || [])) {
        if (!seen.has(f.id)) { seen.add(f.id); out.push(f.id); stack.push(f.id); }
      }
    }
    return out;
  }
  function folderPath(data, id) {
    const names = [];
    const seen = new Set();
    let f = getFolder(data, id);
    while (f && !seen.has(f.id)) { seen.add(f.id); names.unshift(f.name); f = getFolder(data, f.parentId); }
    return names;
  }
  function folderChain(data, id) {
    const out = [];
    const seen = new Set();
    let f = getFolder(data, id);
    while (f && !seen.has(f.id)) { seen.add(f.id); out.unshift(f); f = getFolder(data, f.parentId); }
    return out;
  }
  function folderLabel(data, id, sep) {
    if (!id) return ROOT_NAME;
    const p = folderPath(data, id);
    return p.length ? p.join(sep || ' › ') : ROOT_NAME;
  }
  function folderTreeList(data) {
    const out = [];
    const m = childMap(data);
    for (const v of m.values()) v.sort((a, b) => byOrder(a, b) || cmpText(a.name, b.name));
    const walk = (pid, depth) => { for (const f of (m.get(pid) || [])) { out.push({ folder: f, depth }); walk(f.id, depth + 1); } };
    walk(null, 0);
    return out;
  }
  function nameTaken(data, name, parentId, excludeId) {
    const k = lower(name);
    const p = parentId || null;
    return data.folders.some(f => (f.parentId || null) === p && f.id !== excludeId && lower(f.name) === k);
  }
  function validateFolderName(data, name, parentId, excludeId) {
    const n = squash(name);
    if (!n) return { ok: false, error: 'Nhập tên thư mục.' };
    if (n.length > 100) return { ok: false, error: 'Tên thư mục dài quá 100 ký tự.' };
    if (nameTaken(data, n, parentId, excludeId)) return { ok: false, error: 'Đã có thư mục "' + n + '" ở chỗ này.' };
    return { ok: true, name: n };
  }
  function uniqueName(data, name, parentId, excludeId) {
    if (!nameTaken(data, name, parentId, excludeId)) return name;
    let i = 2;
    while (nameTaken(data, name + ' (' + i + ')', parentId, excludeId)) i++;
    return name + ' (' + i + ')';
  }
  function addFolder(data, name, parentId, now) {
    const pid = parentId && getFolder(data, parentId) ? parentId : null;
    const v = validateFolderName(data, name, pid, null);
    if (!v.ok) return v;
    const order = maxOrder(data.folders.filter(f => (f.parentId || null) === pid)) + 1;
    const folder = { id: makeId(), name: v.name, parentId: pid, createdAt: now, order };
    return { ok: true, folder, data: assign(data, { folders: data.folders.concat([folder]) }) };
  }
  function renameFolder(data, id, name) {
    const f = getFolder(data, id);
    if (!f) return { ok: false, error: 'Không tìm thấy thư mục.' };
    const v = validateFolderName(data, name, f.parentId, id);
    if (!v.ok) return v;
    return { ok: true, data: assign(data, { folders: data.folders.map(x => (x.id === id ? assign(x, { name: v.name }) : x)) }) };
  }
  function moveFolder(data, id, newParentId, now) {
    const f = getFolder(data, id);
    if (!f) return { ok: false, error: 'Không tìm thấy thư mục.' };
    if ((f.parentId || null) === (newParentId || null)) return { ok: true, data, unchanged: true };
    const r = placeItems(data, [{ kind: 'f', id }], newParentId || null, 'end', now || Date.now());
    if (r.ok && r.moved === 0) return { ok: true, data, unchanged: true };
    return r;
  }
  function folderContent(data, id) {
    return { folders: data.folders.filter(f => f.parentId === id).length, bookmarks: data.bookmarks.filter(b => b.folderId === id).length };
  }
  // mode: 'move' = chuyển nội dung lên thư mục cha (xếp cuối); 'all' = xóa hết.
  function deleteFolder(data, id, mode, now) {
    const f = getFolder(data, id);
    if (!f) return { ok: false, error: 'Không tìm thấy thư mục.' };
    if (mode === 'all') {
      const ids = new Set([id].concat(descendantIds(data, id)));
      const removed = data.bookmarks.filter(b => ids.has(b.folderId)).length;
      return {
        ok: true, removedBookmarks: removed, removedFolders: ids.size,
        data: assign(data, { folders: data.folders.filter(x => !ids.has(x.id)), bookmarks: data.bookmarks.filter(b => !ids.has(b.folderId)) }),
      };
    }
    const parent = f.parentId || null;
    let d = assign(data, { folders: data.folders.filter(x => x.id !== id) });
    const kids = data.folders.filter(x => x.parentId === id).sort(byOrder);
    let fo = maxOrder(d.folders.filter(x => (x.parentId || null) === parent && x.parentId !== id));
    for (const k of kids) {
      const nm = uniqueName(d, k.name, parent, k.id);
      fo += 1;
      const o = fo;
      d = assign(d, { folders: d.folders.map(x => (x.id === k.id ? assign(x, { parentId: parent, name: nm, order: o }) : x)) });
    }
    let bo = maxOrder(d.bookmarks.filter(b => (b.folderId || null) === parent));
    const moving = d.bookmarks.filter(b => b.folderId === id).sort(byOrder);
    const newOrder = new Map(moving.map(b => [b.id, ++bo]));
    d = assign(d, { bookmarks: d.bookmarks.map(b => (b.folderId === id ? assign(b, { folderId: parent, updatedAt: now, order: newOrder.get(b.id) }) : b)) });
    return { ok: true, data: d, movedBookmarks: moving.length, movedFolders: kids.length };
  }

  /* ---------- đặt chỗ, chuyển, chép (kéo thả, cắt/dán) ---------- */
  // items: [{kind:'f'|'b', id}] theo thứ tự hiển thị. pos: 'end' | 'start' | {before:id} | {after:{kind,id}}
  // Thư mục chỉ đổi chỗ trong nhóm thư mục, dấu trang trong nhóm dấu trang.
  function ordersFor(siblings, pos, count, kind) {
    let idx = siblings.length;
    if (pos === 'start') idx = 0;
    else if (pos && pos.before) { const i = siblings.findIndex(x => x.id === pos.before); idx = i < 0 ? siblings.length : i; }
    else if (pos && pos.after) {
      if (pos.after.kind === kind) { const i = siblings.findIndex(x => x.id === pos.after.id); idx = i < 0 ? siblings.length : i + 1; }
      else idx = kind === 'b' ? 0 : siblings.length;   // dán dấu trang sau một thư mục → đầu nhóm dấu trang
    }
    const prev = siblings[idx - 1];
    const next = siblings[idx];
    if (!prev && !next) return { orders: Array.from({ length: count }, (_, i) => i), renumber: null };
    if (!next) return { orders: Array.from({ length: count }, (_, i) => prev.order + 1 + i), renumber: null };
    if (!prev) return { orders: Array.from({ length: count }, (_, i) => next.order - count + i), renumber: null };
    const step = (next.order - prev.order) / (count + 1);
    const between = Array.from({ length: count }, (_, i) => prev.order + step * (i + 1));
    // Số thực hết chỗ phân biệt (thứ tự cỡ Date.now() chỉ còn bước ~0,0002): phải đánh số lại.
    let distinct = step > 1e-6 && between[0] > prev.order && between[count - 1] < next.order;
    for (let i = 1; distinct && i < count; i++) if (!(between[i] > between[i - 1])) distinct = false;
    if (distinct) return { orders: between, renumber: null };
    // Hết khe: đánh số lại cả nhóm anh em.
    const map = new Map();
    let n = 0;
    for (let i = 0; i < siblings.length; i++) {
      if (i === idx) n += count;
      map.set(siblings[i].id, n++);
    }
    const start = idx < siblings.length ? map.get(siblings[idx].id) - count : n;
    return { orders: Array.from({ length: count }, (_, i) => start + i), renumber: map };
  }

  function placeItems(data, items, parentId, pos, now) {
    const pid = parentId || null;
    if (pid && !getFolder(data, pid)) return { ok: false, error: 'Không tìm thấy thư mục đích.' };
    const fIds = items.filter(i => i.kind === 'f').map(i => i.id).filter(id => getFolder(data, id));
    const bSet = new Set(data.bookmarks.map(b => b.id));
    const bIds = items.filter(i => i.kind === 'b').map(i => i.id).filter(id => bSet.has(id));
    if (pid) {
      for (const id of fIds) {
        if (id === pid || descendantIds(data, id).includes(pid)) return { ok: false, error: 'Không thể chuyển thư mục vào chính nó hoặc vào thư mục con của nó.' };
      }
    }
    let d = data;
    if (fIds.length) {
      const moving = new Set(fIds);
      const sib = d.folders.filter(f => (f.parentId || null) === pid && !moving.has(f.id)).sort(byOrder);
      const r = ordersFor(sib, pos, fIds.length, 'f');
      const ord = new Map(fIds.map((id, i) => [id, r.orders[i]]));
      let folders = d.folders.map(f => {
        if (ord.has(f.id)) return f;
        if (r.renumber && r.renumber.has(f.id) && r.renumber.get(f.id) !== f.order) return assign(f, { order: r.renumber.get(f.id) });
        return f;
      });
      d = assign(d, { folders });
      for (const id of fIds) {
        const f = getFolder(d, id);
        const nm = (f.parentId || null) === pid ? f.name : uniqueName(d, f.name, pid, id);
        folders = d.folders.map(x => (x.id === id ? assign(x, { parentId: pid, name: nm, order: ord.get(id) }) : x));
        d = assign(d, { folders });
      }
    }
    if (bIds.length) {
      const moving = new Set(bIds);
      const sib = d.bookmarks.filter(b => (b.folderId || null) === pid && !moving.has(b.id)).sort(byOrder);
      const r = ordersFor(sib, pos, bIds.length, 'b');
      const ord = new Map(bIds.map((id, i) => [id, r.orders[i]]));
      d = assign(d, {
        bookmarks: d.bookmarks.map(b => {
          if (ord.has(b.id)) {
            const changedFolder = (b.folderId || null) !== pid;
            return assign(b, changedFolder ? { folderId: pid, order: ord.get(b.id), updatedAt: Math.max(now, b.createdAt) } : { order: ord.get(b.id) });
          }
          if (r.renumber && r.renumber.has(b.id) && r.renumber.get(b.id) !== b.order) return assign(b, { order: r.renumber.get(b.id) });
          return b;
        }),
      });
    }
    return { ok: true, data: d, moved: fIds.length + bIds.length, skipped: items.length - fIds.length - bIds.length };
  }

  function copyItems(data, items, parentId, pos, now) {
    const pid = parentId || null;
    if (pid && !getFolder(data, pid)) return { ok: false, error: 'Không tìm thấy thư mục đích.' };
    const newFolders = [];
    const newBookmarks = [];
    const tops = [];
    const cmap = childMap(data);
    const byFolder = new Map();
    for (const b of data.bookmarks) { const k = b.folderId || null; if (!byFolder.has(k)) byFolder.set(k, []); byFolder.get(k).push(b); }
    const copyFolderTree = (f, newParent) => {
      const nf = { id: makeId(), name: f.name, parentId: newParent, createdAt: now, order: f.order };
      newFolders.push(nf);
      for (const c of (cmap.get(f.id) || [])) copyFolderTree(c, nf.id);
      for (const b of (byFolder.get(f.id) || [])) newBookmarks.push(assign(b, { id: makeId(), folderId: nf.id, createdAt: now, updatedAt: now }));
      return nf;
    };
    let skipped = 0;
    for (const it of items) {
      if (it.kind === 'f') {
        const f = getFolder(data, it.id);
        if (!f) { skipped++; continue; }
        const nf = copyFolderTree(f, '__tmp__');
        tops.push({ kind: 'f', id: nf.id });
      } else {
        const b = data.bookmarks.find(x => x.id === it.id);
        if (!b) { skipped++; continue; }
        const nb = assign(b, { id: makeId(), folderId: '__tmp__', createdAt: now, updatedAt: now });
        newBookmarks.push(nb);
        tops.push({ kind: 'b', id: nb.id });
      }
    }
    // Tạm đặt vào thư mục ảo rồi dùng placeItems để đưa vào đúng chỗ.
    const tmp = { id: '__tmp__', name: '__tmp__', parentId: null, createdAt: now, order: -1e15 };
    let d = assign(data, { folders: data.folders.concat([tmp], newFolders), bookmarks: data.bookmarks.concat(newBookmarks) });
    const r = placeItems(d, tops, pid, pos, now);
    if (!r.ok) return r;
    d = r.data;
    // Các mục cấp trên đã được placeItems đưa khỏi thư mục ảo; chỉ còn bỏ thư mục ảo.
    d = assign(d, { folders: d.folders.filter(f => f.id !== '__tmp__') });
    // Tên thư mục trùng ở nơi dán → thêm " (2)".
    for (const t of tops.filter(x => x.kind === 'f')) {
      const f = getFolder(d, t.id);
      const nm = uniqueName(d, f.name, pid, f.id);
      if (nm !== f.name) d = assign(d, { folders: d.folders.map(x => (x.id === f.id ? assign(x, { name: nm }) : x)) });
    }
    return { ok: true, data: d, copied: tops.length, skipped, newIds: tops };
  }

  /* ---------- dấu trang ---------- */
  function prepareBookmark(data, input) {
    const fx = fixUrl(input && input.url);
    if (!fx.ok) return fx;
    const title = squash(input.title).slice(0, 500) || fx.url;
    const folderId = input.folderId && getFolder(data, input.folderId) ? input.folderId : null;
    return { ok: true, fields: { title, url: fx.url, urlKey: normalizeUrl(fx.url), folderId, tags: normalizeTags(input.tags) } };
  }
  function findByUrl(data, url, excludeId) {
    const key = normalizeUrl(url);
    return data.bookmarks.filter(b => b.urlKey === key && b.id !== excludeId).sort((a, b) => b.updatedAt - a.updatedAt);
  }
  // opts.order: đặt sẵn thứ tự (popup không có đủ dữ liệu để tính max).
  function addBookmark(data, input, now, opts) {
    const p = prepareBookmark(data, input);
    if (!p.ok) return p;
    const order = opts && Number.isFinite(opts.order) ? opts.order : maxOrder(data.bookmarks.filter(b => (b.folderId || null) === p.fields.folderId)) + 1;
    const b = assign({ id: makeId() }, p.fields);
    b.createdAt = now; b.updatedAt = now; b.order = order;
    return { ok: true, bookmark: b, data: assign(data, { bookmarks: data.bookmarks.concat([b]) }) };
  }
  function updateBookmark(data, id, input, now, opts) {
    const old = data.bookmarks.find(b => b.id === id);
    if (!old) return { ok: false, error: 'Dấu trang này không còn nữa.' };
    const p = prepareBookmark(data, input);
    if (!p.ok) return p;
    const f = p.fields;
    const folderChanged = (f.folderId || null) !== (old.folderId || null);
    const changed = f.title !== old.title || f.url !== old.url || folderChanged || JSON.stringify(f.tags) !== JSON.stringify(old.tags);
    if (!changed) return { ok: true, changed: false, bookmark: old, data };
    const extra = { updatedAt: Math.max(now, old.createdAt) };
    if (folderChanged) extra.order = opts && Number.isFinite(opts.order) ? opts.order : maxOrder(data.bookmarks.filter(b => (b.folderId || null) === (f.folderId || null))) + 1;
    const b = assign(assign(old, f), extra);
    return { ok: true, changed: true, bookmark: b, data: assign(data, { bookmarks: data.bookmarks.map(x => (x.id === id ? b : x)) }) };
  }
  function deleteBookmarks(data, ids) {
    const set = new Set(ids);
    const removed = [];
    data.bookmarks.forEach((b, index) => { if (set.has(b.id)) removed.push({ bookmark: b, index }); });
    return { ok: true, removed, data: assign(data, { bookmarks: data.bookmarks.filter(b => !set.has(b.id)) }) };
  }
  function restoreBookmarks(data, removed) {
    const list = data.bookmarks.slice();
    const have = new Set(list.map(b => b.id));
    for (const r of removed.slice().sort((a, b) => a.index - b.index)) {
      if (have.has(r.bookmark.id)) continue;
      const b = r.bookmark.folderId && !getFolder(data, r.bookmark.folderId) ? assign(r.bookmark, { folderId: null }) : r.bookmark;
      list.splice(Math.min(r.index, list.length), 0, b);
      have.add(b.id);
    }
    return assign(data, { bookmarks: list });
  }
  function bulkAddTags(data, ids, tags, now) {
    const add = normalizeTags(tags);
    if (!add.length) return { ok: false, error: 'Nhập nhãn cần thêm.' };
    const set = new Set(ids);
    return {
      ok: true,
      data: assign(data, {
        bookmarks: data.bookmarks.map(b => {
          if (!set.has(b.id)) return b;
          const t = normalizeTags(b.tags.concat(add));
          return t.length === b.tags.length ? b : assign(b, { tags: t, updatedAt: now });
        }),
      }),
    };
  }
  function bulkMove(data, ids, folderId, now) {
    return placeItems(data, ids.map(id => ({ kind: 'b', id })), folderId || null, 'end', now);
  }
  // Xóa nhiều mục (thư mục kèm toàn bộ bên trong, và dấu trang).
  function deleteItems(data, items) {
    const fIds = new Set();
    for (const it of items) if (it.kind === 'f' && getFolder(data, it.id)) { fIds.add(it.id); for (const d of descendantIds(data, it.id)) fIds.add(d); }
    const bIds = new Set(items.filter(i => i.kind === 'b').map(i => i.id));
    const bookmarks = data.bookmarks.filter(b => !bIds.has(b.id) && !(b.folderId && fIds.has(b.folderId)));
    return { ok: true, data: assign(data, { folders: data.folders.filter(f => !fIds.has(f.id)), bookmarks }), removedBookmarks: data.bookmarks.length - bookmarks.length, removedFolders: fIds.size };
  }

  /* ---------- xem thư mục, tìm kiếm ---------- */
  const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
  const MONTH_RE = /^\d{4}-\d{2}$/;
  function isDay(s) { return typeof s === 'string' && DAY_RE.test(s); }
  function isMonth(s) { return typeof s === 'string' && MONTH_RE.test(s); }
  function dayStart(s) { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d).getTime(); }
  function dayEnd(s) { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d + 1).getTime() - 1; }
  function monthStart(s) { const [y, m] = s.split('-').map(Number); return new Date(y, m - 1, 1).getTime(); }
  function monthEnd(s) { const [y, m] = s.split('-').map(Number); return new Date(y, m, 1).getTime() - 1; }

  function defaultQuery() {
    return { text: '', title: '', urlText: '', tags: [], dateField: 'createdAt', dateMode: 'exact', date: '', month: '', from: '', to: '', folder: 'all', scope: 'folder', sort: 'created',
      caseSensitive: false, phrase: false, regex: false };
  }
  function textModeCount(q) { return (q.caseSensitive ? 1 : 0) + (q.regex ? 1 : (q.phrase ? 1 : 0)); }
  function normalizeRange(from, to) {
    if (isDay(from) && isDay(to) && from > to) return { from: to, to: from, swapped: true };
    return { from, to, swapped: false };
  }
  function hasDate(q) {
    return q.dateMode === 'exact' ? isDay(q.date) : q.dateMode === 'month' ? isMonth(q.month) : (isDay(q.from) || isDay(q.to));
  }
  function hasFilters(q) {
    return !!(squash(q.title) || squash(q.urlText) || (q.tags && q.tags.length) || hasDate(q) || q.scope === 'all');
  }
  function isSearching(q) { return !!(squash(q.text) || squash(q.title) || squash(q.urlText) || (q.tags && q.tags.length) || hasDate(q)); }

  function sortBookmarks(list, sort) {
    const by = {
      manual: byOrder,
      created: (a, b) => b.createdAt - a.createdAt,
      updated: (a, b) => b.updatedAt - a.updatedAt,
      az: (a, b) => cmpText(a.title, b.title),
      za: (a, b) => cmpText(b.title, a.title),
    }[sort] || ((a, b) => b.createdAt - a.createdAt);
    return list.slice().sort((a, b) => by(a, b) || (a.id < b.id ? -1 : 1));
  }
  // Bộ đệm chữ đã bỏ dấu theo từng đối tượng dấu trang (đối tượng không đổi → bộ đệm luôn đúng).
  const foldCache = new WeakMap();
  function foldedOf(b) {
    let f = foldCache.get(b);
    if (!f) { f = { t: fold(b.title), u: fold(b.url), g: fold(b.tags.join(' ')) }; f.all = f.t + '\n' + f.u + '\n' + f.g; foldCache.set(b, f); }
    return f;
  }
  function tokens(s) { return fold(s).split(/\s+/).filter(Boolean); }
  // Bỏ dấu nhưng giữ hoa thường (dùng khi bật "Phân biệt hoa thường", không bật "Đúng cụm"/Regex).
  function foldKeepCase(s) { return String(s == null ? '' : s).normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D'); }
  const foldCaseCache = new WeakMap();
  function foldedCaseOf(b) {
    let f = foldCaseCache.get(b);
    if (!f) { f = { t: foldKeepCase(b.title), u: foldKeepCase(b.url), g: foldKeepCase(b.tags.join(' ')) }; f.all = f.t + '\n' + f.u + '\n' + f.g; foldCaseCache.set(b, f); }
    return f;
  }
  const REGEX_MAX = 200;
  // Thử cờ u (đúng chữ Việt, emoji); cách viết hợp lệ quen thuộc mà cờ u không nhận (\-, \_, a{2…) thì thử lại không có u.
  function makeRegex(src, flags) {
    try { return { re: new RegExp(src, flags + 'u') }; } catch (e1) {
      try { return { re: new RegExp(src, flags) }; } catch (e2) { return { error: 'Biểu thức chưa đúng: ' + String(e2.message).replace(/^Invalid regular expression: /, '') }; }
    }
  }
  // Chỉ mở / hiện liên kết cho địa chỉ http, https, ftp, file.
  const SAFE_URL_RE = /^(https?|ftp|file):/i;
  function safeUrl(u) { return typeof u === 'string' && SAFE_URL_RE.test(u.trim()); }
  const SEARCH_BUDGET_MS = 1500;
  const nfc = s => String(s == null ? '' : s).normalize('NFC');
  /* Bộ so chữ cho một ô điều kiện. field: 'all' (tên, địa chỉ, nhãn) | 't' (tên) | 'u' (địa chỉ).
     Trả về null nếu ô trống, { error } nếu biểu thức sai, hoặc { test(b) }. */
  function textMatcher(input, field, q) {
    const raw = String(input == null ? '' : input);
    if (!raw.trim()) return null;
    const pick = (b, i) => (i === 't' ? b.title : i === 'u' ? b.url : b.tags.join(' '));
    const parts = field === 'all' ? ['t', 'u', 'g'] : [field];
    if (q.regex) {
      const src = raw.trim();
      if (src.length > REGEX_MAX) return { error: 'Biểu thức dài quá ' + REGEX_MAX + ' ký tự.' };
      const mk = makeRegex(nfc(src), q.caseSensitive ? '' : 'i');
      if (mk.error) return { error: mk.error };
      const re = mk.re;
      return { test: b => parts.some(i => { re.lastIndex = 0; return re.test(nfc(pick(b, i))); }) };
    }
    if (q.phrase) {
      const needle = squash(nfc(raw));
      if (q.caseSensitive) return { test: b => parts.some(i => nfc(pick(b, i)).includes(needle)) };
      const n = needle.toLowerCase();
      return { test: b => parts.some(i => nfc(pick(b, i)).toLowerCase().includes(n)) };
    }
    if (q.caseSensitive) {
      const toks = foldKeepCase(raw).split(/\s+/).filter(Boolean);
      const key = field === 'all' ? 'all' : field;
      return { test: b => { const f = foldedCaseOf(b)[key]; return toks.every(x => f.includes(x)); } };
    }
    const toks = tokens(raw);
    const key = field === 'all' ? 'all' : field;
    return { test: b => { const f = foldedOf(b)[key]; return toks.every(x => f.includes(x)); } };
  }

  function search(data, query) {
    const q = assign(defaultQuery(), query || {});
    const r = normalizeRange(q.from, q.to);
    let lo = -Infinity, hi = Infinity;
    if (q.dateMode === 'exact') { if (isDay(q.date)) { lo = dayStart(q.date); hi = dayEnd(q.date); } }
    else if (q.dateMode === 'month') { if (isMonth(q.month)) { lo = monthStart(q.month); hi = monthEnd(q.month); } }
    else { if (isDay(r.from)) lo = dayStart(r.from); if (isDay(r.to)) hi = dayEnd(r.to); }
    let folderSet = null;
    if (q.scope !== 'all' && q.folder !== 'all' && q.folder !== 'root' && q.folder) {
      folderSet = new Set([q.folder].concat(descendantIds(data, q.folder)));
    }
    const matchers = [textMatcher(q.text, 'all', q), textMatcher(q.title, 't', q), textMatcher(q.urlText, 'u', q)].filter(Boolean);
    const bad = matchers.find(m => m.error);
    if (bad) return { items: [], swapped: r.swapped, from: r.from, to: r.to, error: bad.error };
    const tagKeys = (q.tags || []).map(lower);
    const dateField = q.dateField === 'updatedAt' ? 'updatedAt' : 'createdAt';
    const needText = matchers.length > 0;
    const timed = !!q.regex;
    const t0 = timed ? Date.now() : 0;
    let timedOut = false;
    const items = [];
    for (let i = 0; i < data.bookmarks.length; i++) {
      const b = data.bookmarks[i];
      if (timed && (i & 15) === 15 && Date.now() - t0 > SEARCH_BUDGET_MS) { timedOut = true; break; }
      if (folderSet && !folderSet.has(b.folderId)) continue;
      const t = b[dateField];
      if (t < lo || t > hi) continue;
      if (tagKeys.length) {
        let okTags = true;
        for (const k of tagKeys) { if (!b.tags.some(x => lower(x) === k)) { okTags = false; break; } }
        if (!okTags) continue;
      }
      if (needText && !matchers.every(m => m.test(b))) continue;
      items.push(b);
    }
    if (timedOut) return { items: [], swapped: r.swapped, from: r.from, to: r.to, error: 'Tìm quá lâu nên đã dừng. Hãy viết biểu thức đơn giản hơn.' };
    return { items: sortBookmarks(items, q.sort), swapped: r.swapped, from: r.from, to: r.to };
  }
  /* ---------- đổi chữ hàng loạt ở tên / địa chỉ (2.4.0) ---------- */
  // opt: { field: 'url' | 'title' | 'both', find, replace, caseSensitive, regex }
  // Trả về { ok, data, changed, skipped:[{id,title,reason}], dups, samples:[{id, field, before, after}] } hoặc { ok:false, error }.
  function bulkReplace(data, ids, opt, now) {
    const o = assign({ field: 'url', find: '', replace: '', caseSensitive: false, regex: false }, opt || {});
    const find = String(o.find == null ? '' : o.find).normalize('NFC');
    if (!find) return { ok: false, error: 'Nhập chữ cần tìm.' };
    if (o.regex && find.length > REGEX_MAX) return { ok: false, error: 'Biểu thức dài quá ' + REGEX_MAX + ' ký tự.' };
    const mk = makeRegex(o.regex ? find : find.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g' + (o.caseSensitive ? '' : 'i'));
    if (mk.error) return { ok: false, error: mk.error };
    const re = mk.re;
    const rep = String(o.replace == null ? '' : o.replace).normalize('NFC');
    const swap = s => (o.regex ? s.replace(re, rep) : s.replace(re, () => rep));
    const want = new Set(ids);
    const doTitle = o.field === 'title' || o.field === 'both';
    const doUrl = o.field === 'url' || o.field === 'both';
    const skipped = [], samples = [], changedIds = new Set();
    const t0 = Date.now();
    const bookmarks = new Array(data.bookmarks.length);
    for (let i = 0; i < data.bookmarks.length; i++) {
      const b = data.bookmarks[i];
      bookmarks[i] = b;
      if (!want.has(b.id)) continue;
      if (o.regex && (i & 15) === 15 && Date.now() - t0 > SEARCH_BUDGET_MS * 2) return { ok: false, error: 'Biểu thức chạy quá lâu nên đã dừng. Hãy viết đơn giản hơn.' };
      let title = b.title, url = b.url;
      if (doTitle) {
        const nt = squash(swap(b.title.normalize('NFC'))).slice(0, 500);
        if (nt !== b.title.normalize('NFC')) {
          if (!nt) { skipped.push({ id: b.id, title: b.title, reason: 'tên thành rỗng' }); continue; }
          title = nt;
        }
      }
      if (doUrl) {
        const nu = swap(b.url).trim();
        if (nu !== b.url) {
          const fx = /^(https?|ftp|file):/i.test(nu) ? fixUrl(nu) : { ok: false };
          if (!fx.ok) { skipped.push({ id: b.id, title: b.title, reason: 'địa chỉ mới không hợp lệ: ' + nu.slice(0, 80) }); continue; }
          url = fx.url;
        }
      }
      if (title === b.title && url === b.url) continue;
      if (samples.length < 5) samples.push({ id: b.id, before: { title: b.title, url: b.url }, after: { title, url } });
      bookmarks[i] = assign(b, { title, url, urlKey: url === b.url ? b.urlKey : normalizeUrl(url), updatedAt: now });
      changedIds.add(b.id);
    }
    let dups = 0;
    if (doUrl && changedIds.size) {
      const cnt = new Map();
      for (const b of bookmarks) cnt.set(b.urlKey, (cnt.get(b.urlKey) || 0) + 1);
      for (const b of bookmarks) if (changedIds.has(b.id) && cnt.get(b.urlKey) > 1) dups++;
    }
    return { ok: true, data: assign(data, { bookmarks }), changed: changedIds.size, skipped, dups, samples };
  }
  /* ---------- dấu trang trùng (2.5.0) ---------- */
  // mode 'url': cùng khóa địa chỉ (CN-05); 'title': cùng tên, không phân biệt hoa thường và khoảng trắng thừa, vẫn phân biệt dấu.
  function dupKey(b, mode) { return mode === 'title' ? lower(squash(String(b.title).normalize('NFC'))) : b.urlKey; }
  function findDuplicates(data, mode) {
    const m = new Map();
    for (const b of data.bookmarks) {
      const k = dupKey(b, mode);
      if (!k) continue;
      const a = m.get(k);
      if (a) a.push(b); else m.set(k, [b]);
    }
    const groups = [];
    for (const [key, items] of m) {
      if (items.length < 2) continue;
      items.sort((x, y) => (y.updatedAt - x.updatedAt) || (y.createdAt - x.createdAt) || (x.id < y.id ? -1 : 1));
      groups.push({ key, items, newest: items[0].updatedAt });
    }
    groups.sort((a, b) => (b.items.length - a.items.length) || (b.newest - a.newest) || (a.key < b.key ? -1 : 1));
    return groups;
  }
  // plan: [{ keep: [id…], remove: [id…] }]. Nhóm không còn mục giữ thì bỏ qua (không xóa gì).
  function resolveDuplicates(data, plan, mergeTags, now) {
    const byId = new Map(data.bookmarks.map(b => [b.id, b]));
    const del = new Set(), extra = new Map();
    let skippedGroups = 0;
    for (const g of plan) {
      const keep = (g.keep || []).filter(id => byId.has(id));
      const rem = (g.remove || []).filter(id => byId.has(id) && !keep.includes(id));
      if (!keep.length) { skippedGroups++; continue; }
      if (!rem.length) continue;
      for (const id of rem) del.add(id);
      if (mergeTags) {
        const tags = [];
        for (const id of rem) tags.push(...byId.get(id).tags);
        if (tags.length) for (const id of keep) extra.set(id, (extra.get(id) || []).concat(tags));
      }
    }
    let tagged = 0;
    const bookmarks = [];
    for (const b of data.bookmarks) {
      if (del.has(b.id)) continue;
      const add = extra.get(b.id);
      if (add) {
        const tags = normalizeTags(b.tags.concat(add));
        if (tags.length !== b.tags.length) { bookmarks.push(assign(b, { tags, updatedAt: now })); tagged++; continue; }
      }
      bookmarks.push(b);
    }
    return { data: assign(data, { bookmarks }), removed: del.size, tagged, skippedGroups };
  }
  // Nội dung một thư mục (null = gốc): thư mục con rồi dấu trang trực tiếp.
  function listFolder(data, folderId, sort) {
    const fid = folderId || null;
    const folders = childrenOf(data, fid, sort === 'manual' ? 'manual' : 'name');
    const bookmarks = sortBookmarks(data.bookmarks.filter(b => (b.folderId || null) === fid), sort);
    return { folders, bookmarks };
  }
  // Tổng số dấu trang nằm trong mỗi thư mục, tính cả thư mục con (2.7.0).
  function folderTotals(data) {
    const m = new Map(), parent = new Map();
    for (const f of data.folders) { m.set(f.id, 0); parent.set(f.id, f.parentId || null); }
    const direct = new Map();
    for (const b of data.bookmarks) if (b.folderId && m.has(b.folderId)) direct.set(b.folderId, (direct.get(b.folderId) || 0) + 1);
    for (const [id, n] of direct) {
      let cur = id, guard = 0;
      while (cur && m.has(cur) && guard++ < 500) { m.set(cur, m.get(cur) + n); cur = parent.get(cur); }
    }
    return m;
  }
  /* Vùng chữ khớp trong một chuỗi đang hiện trên dòng, để tô (2.7.0).
     field: 't' (tên) | 'u' (địa chỉ, tên miền). Trả về [[đầu, cuối), …] theo vị trí trong chuỗi gốc, đã gộp vùng chồng nhau. */
  const HL_MAX_LEN = 600, HL_MAX_HITS = 40;
  function highlightRanges(str, field, query) {
    const s = String(str == null ? '' : str);
    const q = assign(defaultQuery(), query || {});
    const inputs = [q.text, field === 't' ? q.title : q.urlText].map(x => String(x == null ? '' : x)).filter(x => x.trim());
    if (!s || s.length > HL_MAX_LEN || !inputs.length) return [];
    // Đổi từng cụm (chữ + dấu rời đi kèm) rồi nhớ cụm đó nằm ở đâu trong chuỗi gốc.
    const tr = q.regex || q.phrase ? (q.caseSensitive || q.regex ? nfc : c => nfc(c).toLowerCase()) : (q.caseSensitive ? foldKeepCase : fold);
    let T = ''; const st = [], en = [];
    for (let i = 0; i < s.length;) {
      let j = i + 1;
      if (s.charCodeAt(i) >= 0xD800 && s.charCodeAt(i) <= 0xDBFF && j < s.length) j++;
      while (j < s.length && s.charCodeAt(j) >= 0x300 && s.charCodeAt(j) <= 0x36F) j++;
      const t = tr(s.slice(i, j));
      for (let k = 0; k < t.length; k++) { st.push(i); en.push(j); }
      T += t; i = j;
    }
    const hits = [];
    const add = (a, b) => { if (b > a && hits.length < HL_MAX_HITS) hits.push([st[a], en[b - 1]]); };
    const findAll = needle => { if (!needle) return; for (let at = T.indexOf(needle); at >= 0 && hits.length < HL_MAX_HITS; at = T.indexOf(needle, at + needle.length)) add(at, at + needle.length); };
    for (const raw of inputs) {
      if (q.regex) {
        const src = raw.trim();
        if (src.length > REGEX_MAX) continue;
        const mk = makeRegex(nfc(src), q.caseSensitive ? 'g' : 'gi');
        if (mk.error) continue;
        let m, guard = 0;
        mk.re.lastIndex = 0;
        while ((m = mk.re.exec(T)) && guard++ < HL_MAX_HITS) { if (m[0].length) add(m.index, m.index + m[0].length); else mk.re.lastIndex++; }
      } else if (q.phrase) {
        const needle = squash(nfc(raw));
        findAll(q.caseSensitive ? needle : needle.toLowerCase());
      } else {
        for (const tok of (q.caseSensitive ? foldKeepCase(raw).split(/\s+/).filter(Boolean) : tokens(raw))) findAll(tok);
      }
    }
    hits.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    const out = [];
    for (const h of hits) { const last = out[out.length - 1]; if (last && h[0] <= last[1]) last[1] = Math.max(last[1], h[1]); else out.push([h[0], h[1]]); }
    return out;
  }
  function folderStats(data) {
    // Số mục trực tiếp (thư mục con + dấu trang) của mỗi thư mục.
    const m = new Map();
    for (const f of data.folders) if (f.parentId) m.set(f.parentId, (m.get(f.parentId) || 0) + 1);
    for (const b of data.bookmarks) if (b.folderId) m.set(b.folderId, (m.get(b.folderId) || 0) + 1);
    return m;
  }

  /* ---------- kiểm dữ liệu, chuyển đổi, sao lưu ---------- */
  // opts.trusted: dữ liệu đọc từ kho của chính app → bỏ bước kiểm từng địa chỉ cho nhanh.
  function validateData(obj, opts) {
    const trusted = !!(opts && opts.trusted);
    if (typeof obj === 'string') {
      try { obj = JSON.parse(obj); } catch (e) { return { ok: false, error: 'Không phải dữ liệu JSON hợp lệ.' }; }
    }
    if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return { ok: false, error: 'Không đúng định dạng dữ liệu của Sổ Dấu Trang.' };
    const v = obj.version;
    if (typeof v !== 'number' || !Number.isInteger(v) || v < 1) return { ok: false, error: 'Không đúng định dạng dữ liệu của Sổ Dấu Trang (thiếu số phiên bản dữ liệu).' };
    if (v > DATA_VERSION) return { ok: false, code: 'newer', error: 'Dữ liệu được tạo bởi bản mới hơn (dữ liệu v' + v + ', bản này đọc được tới v' + DATA_VERSION + '). Hãy cập nhật Sổ Dấu Trang.' };
    if (!Array.isArray(obj.folders) || !Array.isArray(obj.bookmarks)) return { ok: false, error: 'Không đúng định dạng dữ liệu của Sổ Dấu Trang (thiếu danh sách thư mục hoặc dấu trang).' };
    let bad = 0, dropped = 0;
    const folders = [];
    const fseen = new Set();
    for (const f of obj.folders) {
      if (!f || typeof f.id !== 'string' || !f.id || typeof f.name !== 'string' || !squash(f.name) || fseen.has(f.id)) { bad++; continue; }
      fseen.add(f.id);
      folders.push({
        id: f.id, name: squash(f.name).slice(0, 100),
        parentId: typeof f.parentId === 'string' && f.parentId ? f.parentId : null,
        createdAt: Number.isFinite(f.createdAt) ? f.createdAt : 0,
        order: Number.isFinite(f.order) ? f.order : NaN,
      });
    }
    const bookmarks = [];
    const bseen = new Set();
    for (const b of obj.bookmarks) {
      if (!b || typeof b.id !== 'string' || !b.id || bseen.has(b.id) || typeof b.url !== 'string' || !Number.isFinite(b.createdAt) || !Number.isFinite(b.updatedAt)) { bad++; continue; }
      let url = b.url;
      if (!trusted) {
        const fx = fixUrl(b.url);
        if (!fx.ok) { bad++; continue; }
        url = fx.url;
      } else if (!SAFE_URL_RE.test(url)) { dropped++; continue; }   // kho bị chèn địa chỉ lạ (javascript:…): bỏ qua, không khóa app
      bseen.add(b.id);
      bookmarks.push({
        id: b.id,
        title: trusted && typeof b.title === 'string' && b.title ? b.title : (squash(b.title).slice(0, 500) || url),
        url,
        urlKey: trusted && typeof b.urlKey === 'string' ? b.urlKey : normalizeUrl(url),
        folderId: typeof b.folderId === 'string' && b.folderId ? b.folderId : null,
        tags: trusted && Array.isArray(b.tags) ? b.tags : normalizeTags(b.tags),
        createdAt: b.createdAt,
        updatedAt: Math.max(b.updatedAt, b.createdAt),
        order: Number.isFinite(b.order) ? b.order : NaN,
      });
    }
    if (bad) return { ok: false, error: 'Có ' + bad + ' mục bị hỏng hoặc trùng mã, không đọc được.' };
    const tagColors = {};
    if (obj.tagColors && typeof obj.tagColors === 'object') {
      for (const [k, c] of Object.entries(obj.tagColors)) if (TAG_COLORS.includes(c)) tagColors[lower(k)] = c;
    }
    const data = migrate(fixRefs({ version: v, folders, bookmarks, tagColors }), v);
    return { ok: true, data, fromVersion: v, dropped };
  }
  function fixRefs(data) {
    const ids = new Set(data.folders.map(f => f.id));
    let folders = data.folders.map(f => (f.parentId && !ids.has(f.parentId) ? assign(f, { parentId: null }) : f));
    const byId = new Map(folders.map(f => [f.id, f]));
    for (const f of folders) {
      const seen = new Set([f.id]);
      let p = f.parentId;
      while (p) {
        if (seen.has(p)) { byId.set(f.id, assign(byId.get(f.id), { parentId: null })); break; }
        seen.add(p);
        const pf = byId.get(p);
        p = pf ? pf.parentId : null;
      }
    }
    folders = folders.map(f => byId.get(f.id));
    const bookmarks = data.bookmarks.map(b => (b.folderId && !ids.has(b.folderId) ? assign(b, { folderId: null }) : b));
    return assign(data, { folders, bookmarks });
  }
  // v1 → v2: gán thứ tự (thư mục theo tên, dấu trang theo ngày tạo cũ → mới). Mục thiếu thứ tự cũng được gán như vậy.
  function migrate(data) {
    const needF = data.folders.some(f => !Number.isFinite(f.order));
    const needB = data.bookmarks.some(b => !Number.isFinite(b.order));
    let folders = data.folders;
    let bookmarks = data.bookmarks;
    if (needF) {
      const groups = new Map();
      for (const f of folders) { const k = f.parentId || null; if (!groups.has(k)) groups.set(k, []); groups.get(k).push(f); }
      const ord = new Map();
      for (const list of groups.values()) {
        const has = list.filter(f => Number.isFinite(f.order)).sort(byOrder);
        const miss = list.filter(f => !Number.isFinite(f.order)).sort((a, b) => cmpText(a.name, b.name));
        let n = has.length ? has[has.length - 1].order + 1 : 0;
        for (const f of miss) ord.set(f.id, n++);
      }
      folders = folders.map(f => (ord.has(f.id) ? assign(f, { order: ord.get(f.id) }) : f));
    }
    if (needB) {
      const groups = new Map();
      for (const b of bookmarks) { const k = b.folderId || null; if (!groups.has(k)) groups.set(k, []); groups.get(k).push(b); }
      const ord = new Map();
      for (const list of groups.values()) {
        const has = list.filter(b => Number.isFinite(b.order)).sort(byOrder);
        const miss = list.filter(b => !Number.isFinite(b.order)).sort((a, b) => (a.createdAt - b.createdAt) || (a.id < b.id ? -1 : 1));
        let n = has.length ? has[has.length - 1].order + 1 : 0;
        for (const b of miss) ord.set(b.id, n++);
      }
      bookmarks = bookmarks.map(b => (ord.has(b.id) ? assign(b, { order: ord.get(b.id) }) : b));
    }
    return { version: DATA_VERSION, folders, bookmarks, tagColors: data.tagColors || {} };
  }
  function mergeData(cur, inc) {
    let d = assign(cur, { folders: cur.folders.slice(), bookmarks: cur.bookmarks.slice() });
    const have = new Set(d.folders.map(f => f.id));
    const addedF = inc.folders.filter(f => !have.has(f.id));
    d.folders = d.folders.concat(addedF);
    d = fixRefs(d);
    for (const f of addedF) {
      const cf = d.folders.find(x => x.id === f.id);
      const nm = uniqueName(d, cf.name, cf.parentId, cf.id);
      if (nm !== cf.name) d.folders = d.folders.map(x => (x.id === f.id ? assign(x, { name: nm }) : x));
    }
    const idx = new Map(d.bookmarks.map((b, i) => [b.id, i]));
    let added = 0, updated = 0, kept = 0;
    for (const b of inc.bookmarks) {
      if (idx.has(b.id)) {
        const i = idx.get(b.id);
        if (b.updatedAt > d.bookmarks[i].updatedAt) { d.bookmarks[i] = b; updated++; } else kept++;
      } else { idx.set(b.id, d.bookmarks.length); d.bookmarks.push(b); added++; }
    }
    d = fixRefs(d);
    d.tagColors = assign(inc.tagColors || {}, cur.tagColors || {});   // màu đã chọn ở máy này được ưu tiên
    return { data: d, added, updated, kept, foldersAdded: addedF.length };
  }

  // So hai bản dữ liệu (đối tượng không đổi giữ nguyên) → phần cần ghi.
  function diffData(a, b) {
    const aMap = new Map(a.bookmarks.map(x => [x.id, x]));
    const seen = new Set();
    const upserts = [];
    const olds = new Map();
    for (const x of b.bookmarks) {
      seen.add(x.id);
      const o = aMap.get(x.id);
      if (o !== x) { upserts.push(x); if (o) olds.set(x.id, o); }
    }
    const deletes = [];
    for (const o of a.bookmarks) if (!seen.has(o.id)) deletes.push(o);
    // Thư mục, màu nhãn: ghi theo từng mục để không đè thay đổi của nơi khác.
    let folderUpserts = [], folderDeletes = [];
    if (a.folders !== b.folders) {
      const fa = new Map(a.folders.map(f => [f.id, f]));
      const fb = new Set();
      for (const f of b.folders) { fb.add(f.id); const o = fa.get(f.id); if (!o || (o !== f && JSON.stringify(o) !== JSON.stringify(f))) folderUpserts.push(f); }
      for (const f of a.folders) if (!fb.has(f.id)) folderDeletes.push(f.id);
    }
    const foldersChanged = folderUpserts.length > 0 || folderDeletes.length > 0;
    const ca = a.tagColors || {}, cb = b.tagColors || {};
    const tagColorSet = {};
    for (const k of new Set(Object.keys(ca).concat(Object.keys(cb)))) if (ca[k] !== cb[k]) tagColorSet[k] = cb[k] === undefined ? null : cb[k];
    const tagColorsChanged = Object.keys(tagColorSet).length > 0;
    return { upserts, deletes, olds, folders: foldersChanged ? b.folders : null, folderUpserts, folderDeletes, tagColors: tagColorsChanged ? cb : null, tagColorSet };
  }

  // Hoàn tác: trả lại đúng các mục mà bước before → after đã đổi, trên dữ liệu hiện tại (giữ thay đổi của nơi khác).
  function revertChanges(cur, before, after) {
    const undo = (curList, bList, aList) => {
      if (bList === aList) return curList;
      const bMap = new Map(bList.map(x => [x.id, x])), aIds = new Set();
      const restore = new Map(), remove = new Set();
      for (const x of aList) { aIds.add(x.id); const o = bMap.get(x.id); if (o !== x) { if (o) restore.set(x.id, o); else remove.add(x.id); } }
      for (const o of bList) if (!aIds.has(o.id)) restore.set(o.id, o);
      if (!restore.size && !remove.size) return curList;
      const out = [], seen = new Set();
      for (const x of curList) {
        if (remove.has(x.id)) continue;
        if (restore.has(x.id)) { out.push(restore.get(x.id)); seen.add(x.id); } else out.push(x);
      }
      for (const [id, o] of restore) if (!seen.has(id)) out.push(o);
      return out;
    };
    const tagColors = assign(cur.tagColors || {}, {});
    const ca = before.tagColors || {}, cb = after.tagColors || {};
    for (const k of new Set(Object.keys(ca).concat(Object.keys(cb)))) if (ca[k] !== cb[k]) { if (ca[k] === undefined) delete tagColors[k]; else tagColors[k] = ca[k]; }
    return fixRefs(assign(cur, {
      folders: undo(cur.folders, before.folders, after.folders),
      bookmarks: undo(cur.bookmarks, before.bookmarks, after.bookmarks),
      tagColors,
    }));
  }

  // Ghép thay đổi (base → next) lên bản dữ liệu hiện tại: dùng khi dữ liệu đã đổi trong lúc một thao tác đang chờ ghi.
  function rebaseChanges(cur, base, next) { return cur === base ? next : revertChanges(cur, next, base); }

  function pad(n) { return String(n).padStart(2, '0'); }
  function localDay(ms) { const d = new Date(ms); return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function exportFileName(ms) { return APP_ID + '-' + localDay(ms) + '.json'; }
  function exportPayload(data, ms) {
    return {
      app: APP_ID, version: DATA_VERSION, exportedAt: new Date(ms).toISOString(),
      folders: data.folders, bookmarks: data.bookmarks.map(b => { const c = assign(b, {}); delete c.urlKey; return c; }),
      tagColors: data.tagColors || {},
    };
  }
  /* ---------- tệp dấu trang HTML của trình duyệt (định dạng Netscape) ---------- */
  function exportHtmlFileName(ms) { return APP_ID + '-' + localDay(ms) + '.html'; }
  function isBookmarksHtml(text) {
    const head = String(text || '').slice(0, 4096);
    if (/<!DOCTYPE\s+NETSCAPE-Bookmark-file/i.test(head)) return true;
    return /<DL[\s>]/i.test(head) && /<DT>\s*<(A|H3)[\s>]/i.test(head) && !/<(body|head)[\s>]/i.test(head);
  }
  const ENT = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };
  function decodeEntities(s) {
    return String(s).replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) => {
      if (e[0] === '#') {
        const n = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
        return n > 0 && n <= 0x10ffff ? String.fromCodePoint(n) : m;
      }
      const v = ENT[e.toLowerCase()];
      return v === undefined ? m : v;
    });
  }
  function escHtml(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
  function cleanText(s) { return squash(decodeEntities(s).replace(/[​-‍﻿]/g, '')); }
  // Ngày trong tệp: Chrome/Firefox ghi giây, Soul ghi mili giây, có tệp ghi micro giây.
  function htmlTime(v) {
    const n = Number(v);
    if (!v || !Number.isFinite(n) || n <= 0) return null;
    if (n < 1e11) return Math.round(n * 1000);
    if (n > 1e14) return Math.floor(n / 1000);
    return Math.round(n);
  }
  function attrsOf(s) {
    const out = {};
    const re = /([A-Za-z_][\w-]*)\s*=\s*"([^"]*)"/g;
    let m;
    while ((m = re.exec(s))) out[m[1].toUpperCase()] = m[2];
    return out;
  }
  // Đọc tệp dấu trang HTML → { ok, data, skipped:[{title,url}], renamed } hoặc { ok:false, error }.
  function parseBookmarksHtml(text, now) {
    text = String(text || '');
    if (!isBookmarksHtml(text)) return { ok: false, error: 'Tệp này không phải tệp dấu trang HTML của trình duyệt.' };
    // Dấu trang: ưu tiên dạng có ADD_DATE ngay sau HREF (đúng cả khi địa chỉ javascript chứa dấu ngoặc kép), không thì dạng chung.
    const ATTRS = '((?:\\s+[A-Za-z_][\\w-]*\\s*=\\s*"[^"]*")*)';
    const RE = new RegExp('<DT>\\s*<H3\\b([^>]*)>([\\s\\S]*?)</H3>' +
      '|<DT>\\s*<A\\s+HREF="((?:(?!<DT>)[\\s\\S])*?)"(\\s+ADD_DATE="[^"]*"' + ATTRS.slice(1, -1) + ')\\s*>([\\s\\S]*?)</A>' +
      '|<DT>\\s*<A\\s+HREF="([\\s\\S]*?)"' + ATTRS + '\\s*>([\\s\\S]*?)</A>' +
      '|<DL\\b[^>]*>|</DL>', 'gi');
    const base = 'h' + now.toString(36) + Math.random().toString(36).slice(2, 6);
    let seq = 0;
    const nid = () => base + (seq++).toString(36);
    const folders = [], bookmarks = [], skipped = [];
    let renamed = 0;
    const ctx = id => ({ id, names: new Set(), fo: 0, bo: 0 });
    const stack = [];
    let pending = null;
    let m;
    while ((m = RE.exec(text))) {
      const tok = m[0];
      if (tok[1] === '/') { if (stack.length) stack.pop(); continue; }
      if (/^<DL/i.test(tok)) { stack.push(pending || (stack.length ? stack[stack.length - 1] : ctx(null))); pending = null; continue; }
      if (!stack.length) stack.push(ctx(null));
      const parent = stack[stack.length - 1];
      if (m[1] !== undefined) {
        const a = attrsOf(m[1]);
        const base0 = cleanText(m[2]).slice(0, 100) || 'Thư mục không tên';
        let name = base0, i = 2;
        while (parent.names.has(lower(name))) name = base0.slice(0, 94) + ' (' + i++ + ')';
        if (name !== base0) renamed++;
        parent.names.add(lower(name));
        const t = htmlTime(a.ADD_DATE) || now;
        const f = { id: nid(), name, parentId: parent.id, createdAt: t, order: ++parent.fo };
        folders.push(f);
        pending = ctx(f.id);
        continue;
      }
      pending = null;
      const anchored = m[3] !== undefined;
      const a = attrsOf((anchored ? m[4] : m[7]) || '');
      const href = decodeEntities(anchored ? m[3] : m[6]).trim();
      const title = cleanText(anchored ? m[5] : m[8]);
      const fx = /^(https?|ftp|file):/i.test(href) ? fixUrl(href) : { ok: false };
      if (!fx.ok) { skipped.push({ title: title || href.slice(0, 60), url: href.slice(0, 200) }); continue; }
      const c = htmlTime(a.ADD_DATE) || now;
      const u = htmlTime(a.LAST_MODIFIED);
      bookmarks.push({
        id: nid(), title: title.slice(0, 500) || fx.url, url: fx.url, urlKey: normalizeUrl(fx.url),
        folderId: parent.id, tags: a.TAGS ? normalizeTags(decodeEntities(a.TAGS).split(',')) : [],
        createdAt: c, updatedAt: u && u > c ? u : c, order: ++parent.bo,
      });
    }
    if (!folders.length && !bookmarks.length) {
      return { ok: false, error: skipped.length ? 'Tệp không có dấu trang nào lưu được (' + skipped.length + ' mục không phải trang web).' : 'Tệp không có dấu trang hay thư mục nào.' };
    }
    return { ok: true, data: { version: DATA_VERSION, folders, bookmarks, tagColors: {} }, skipped, renamed };
  }
  // Gộp dữ liệu đọc từ tệp HTML: ghép thư mục cùng tên ở cùng chỗ, bỏ dấu trang cùng địa chỉ trong cùng thư mục.
  function mergeImported(cur, inc) {
    const folders = cur.folders.slice();
    const bookmarks = cur.bookmarks.slice();
    const kids = new Map();                 // cha → Map(tên thường → id)
    const fOrd = new Map(), bOrd = new Map(), keys = new Map();
    const k = id => id || '';
    for (const f of folders) {
      const p = k(f.parentId);
      if (!kids.has(p)) kids.set(p, new Map());
      if (!kids.get(p).has(lower(f.name))) kids.get(p).set(lower(f.name), f.id);
      if (!(fOrd.get(p) >= f.order)) fOrd.set(p, f.order);
    }
    for (const b of bookmarks) {
      const p = k(b.folderId);
      if (!keys.has(p)) keys.set(p, new Set());
      keys.get(p).add(b.urlKey);
      if (!(bOrd.get(p) >= b.order)) bOrd.set(p, b.order);
    }
    const map = new Map();
    let foldersAdded = 0, added = 0, dup = 0, dupInFile = 0;
    const fromFile = new Map();             // thư mục → khóa địa chỉ thêm từ chính tệp này
    // thư mục theo thứ tự trong tệp: cha luôn đứng trước con
    for (const f of inc.folders) {
      const p = f.parentId ? map.get(f.parentId) : null;
      const pk = k(p);
      if (!kids.has(pk)) kids.set(pk, new Map());
      const same = kids.get(pk).get(lower(f.name));
      if (same) { map.set(f.id, same); continue; }
      const order = (fOrd.has(pk) ? fOrd.get(pk) : 0) + 1;
      fOrd.set(pk, order);
      const nf = assign(f, { parentId: p, order });
      folders.push(nf);
      kids.get(pk).set(lower(nf.name), nf.id);
      map.set(f.id, nf.id);
      foldersAdded++;
    }
    for (const b of inc.bookmarks) {
      const fid = b.folderId ? map.get(b.folderId) : null;
      const pk = k(fid);
      if (!keys.has(pk)) keys.set(pk, new Set());
      if (!fromFile.has(pk)) fromFile.set(pk, new Set());
      if (keys.get(pk).has(b.urlKey)) { if (fromFile.get(pk).has(b.urlKey)) dupInFile++; else dup++; continue; }
      keys.get(pk).add(b.urlKey);
      fromFile.get(pk).add(b.urlKey);
      const order = (bOrd.has(pk) ? bOrd.get(pk) : 0) + 1;
      bOrd.set(pk, order);
      bookmarks.push(assign(b, { folderId: fid, order }));
      added++;
    }
    return { data: assign(cur, { folders, bookmarks }), added, dup, dupInFile, foldersAdded };
  }
  function exportHtml(data, ms) {
    const sec = t => Math.floor((Number.isFinite(t) ? t : ms) / 1000);
    const fk = new Map(), bk = new Map();
    for (const f of data.folders) { const p = f.parentId || ''; if (!fk.has(p)) fk.set(p, []); fk.get(p).push(f); }
    for (const b of data.bookmarks) { const p = b.folderId || ''; if (!bk.has(p)) bk.set(p, []); bk.get(p).push(b); }
    const out = [
      '<!DOCTYPE NETSCAPE-Bookmark-file-1>',
      '<!-- This is an automatically generated file.',
      '     It will be read and overwritten.',
      '     DO NOT EDIT! -->',
      '<META HTTP-EQUIV="Content-Type" CONTENT="text/html; charset=UTF-8">',
      '<TITLE>Bookmarks</TITLE>',
      '<H1>Bookmarks</H1>',
      '<DL><p>',
    ];
    const walk = (pid, depth) => {
      const pad = '    '.repeat(depth);
      for (const f of (fk.get(pid) || []).slice().sort(byOrder)) {
        out.push(pad + '<DT><H3 ADD_DATE="' + sec(f.createdAt) + '" LAST_MODIFIED="' + sec(f.createdAt) + '">' + escHtml(f.name) + '</H3>');
        out.push(pad + '<DL><p>');
        walk(f.id, depth + 1);
        out.push(pad + '</DL><p>');
      }
      for (const b of (bk.get(pid) || []).slice().sort(byOrder)) {
        out.push(pad + '<DT><A HREF="' + escHtml(b.url) + '" ADD_DATE="' + sec(b.createdAt) + '" LAST_MODIFIED="' + sec(b.updatedAt) + '"' +
          (b.tags && b.tags.length ? ' TAGS="' + escHtml(b.tags.join(',')) + '"' : '') + '>' + escHtml(b.title) + '</A>');
      }
    };
    walk('', 1);
    out.push('</DL><p>', '');
    return out.join('\n');
  }
  function formatDate(ms) { const d = new Date(ms); return pad(d.getDate()) + '/' + pad(d.getMonth() + 1) + '/' + d.getFullYear(); }
  function formatDateTime(ms) { const d = new Date(ms); return formatDate(ms) + ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes()); }
  function dayToVN(s) { if (!isDay(s)) return ''; const [y, m, d] = s.split('-'); return d + '/' + m + '/' + y; }
  function monthToVN(s) { if (!isMonth(s)) return ''; const [y, m] = s.split('-'); return Number(m) + '/' + y; }

  const SDT = {
    DATA_VERSION, STORAGE_KEY, APP_ID, ROOT_NAME, TAG_COLORS, TAG_COLOR_NAMES,
    emptyData, makeId, fold, lower, hash32, normalizeUrl, isSavableUrl, fixUrl, domainOf,
    cleanTag, normalizeTags, parseTags, tagCounts, autoTagColor, tagColor, setTagColor, renameTag, deleteTag,
    byOrder, getFolder, childMap, childrenOf, descendantIds, folderPath, folderChain, folderLabel, folderTreeList,
    validateFolderName, uniqueName, addFolder, renameFolder, moveFolder, folderContent, deleteFolder,
    placeItems, copyItems, findByUrl, addBookmark, updateBookmark, deleteBookmarks, restoreBookmarks, bulkAddTags, bulkMove, deleteItems,
    isDay, isMonth, dayStart, dayEnd, monthStart, monthEnd, defaultQuery, textModeCount, foldKeepCase, bulkReplace, findDuplicates, resolveDuplicates, normalizeRange, hasDate, hasFilters, isSearching,
    sortBookmarks, foldedOf, search, listFolder, folderStats, folderTotals, highlightRanges,
    validateData, fixRefs, migrate, mergeData, diffData, revertChanges, rebaseChanges, safeUrl, exportFileName, exportPayload, localDay,
    exportHtmlFileName, isBookmarksHtml, decodeEntities, parseBookmarksHtml, mergeImported, exportHtml,
    formatDate, formatDateTime, dayToVN, monthToVN,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = SDT;
  root.SDT = SDT;
})(SDTNS);

const SDT = SDTNS.SDT;
/* Sổ Dấu Trang — kho dữ liệu chia phần (v2), dùng chung cho bản tiện ích và bản Soul.
   backend = { get(keys) → Promise<{khóa: giá trị}>, set(obj) → Promise, remove(keys) → Promise,
               getAll?() → Promise<obj>, subscribe?(fn(changes)) }
   Khóa: sdt_meta, sdt_folders, sdt_tagstat, sdt_b_<0..63> (dấu trang theo mã), sdt_i_<0..63> (bảng tra urlKey → mã). */
(function (root) {
  'use strict';
  const SDT = root.SDT;
  const SHARDS = 64;
  const BUCKETS = 64;
  const K = { meta: 'sdt_meta', folders: 'sdt_folders', tagstat: 'sdt_tagstat', v1: 'sdt_data', backupV1: 'sdt_data_backup_v1', error: 'sdt_error' };
  const shardKey = k => 'sdt_b_' + k;
  const bucketKey = k => 'sdt_i_' + k;
  const shardOf = id => SDT.hash32(id) % SHARDS;
  const bucketOf = urlKey => SDT.hash32(urlKey) % BUCKETS;
  const ALL_SHARD_KEYS = Array.from({ length: SHARDS }, (_, i) => shardKey(i));
  const ALL_BUCKET_KEYS = Array.from({ length: BUCKETS }, (_, i) => bucketKey(i));

  function tagstatOf(bookmarks) {
    const st = {};
    for (const b of bookmarks) for (const t of b.tags) {
      const k = SDT.lower(t);
      if (st[k]) st[k][1]++; else st[k] = [t, 1];
    }
    return st;
  }
  function cleanBookmark(b) {
    return { id: b.id, title: b.title, url: b.url, urlKey: b.urlKey, folderId: b.folderId || null, tags: b.tags, createdAt: b.createdAt, updatedAt: b.updatedAt, order: b.order };
  }
  // Toàn bộ khóa của một bản dữ liệu (dùng khi chuyển đổi và khi "Thay thế toàn bộ").
  function layout(data, rev, writer) {
    const out = {};
    const shards = ALL_SHARD_KEYS.map(() => []);
    const buckets = ALL_BUCKET_KEYS.map(() => ({}));
    for (const b of data.bookmarks) {
      shards[shardOf(b.id)].push(cleanBookmark(b));
      const m = buckets[bucketOf(b.urlKey)];
      (m[b.urlKey] || (m[b.urlKey] = [])).push(b.id);
    }
    ALL_SHARD_KEYS.forEach((k, i) => { out[k] = shards[i]; });
    ALL_BUCKET_KEYS.forEach((k, i) => { out[k] = buckets[i]; });
    out[K.folders] = data.folders;
    out[K.tagstat] = tagstatOf(data.bookmarks);
    out[K.meta] = { version: SDT.DATA_VERSION, rev, writer, shards: SHARDS, buckets: BUCKETS, tagColors: data.tagColors || {} };
    return out;
  }

  function makeStore(backend) {
    const writer = SDT.makeId();
    const listeners = new Set();
    let migrating = null;
    let lastRev = null;

    function emit(info) { for (const cb of listeners) { try { cb(info); } catch (e) { /* bỏ qua */ } } }
    if (backend.subscribe) {
      backend.subscribe(changes => {
        const m = changes[K.meta];
        const bad = changes[K.error] && changes[K.error].newValue;   // nơi khác phát hiện dữ liệu hỏng
        if (!m && !bad) return;
        const nv = m ? m.newValue : null;
        if (m && nv && nv.writer === writer && !bad) return;          // chính mình ghi: đã báo qua kênh trong trang
        if (m) lastRev = nv ? nv.rev : null;
        emit({ own: false, origin: null, rev: lastRev, keys: Object.keys(changes) });
      });
    }

    function checkMeta(meta) {
      if (!meta || typeof meta !== 'object') return 'Phần mô tả dữ liệu bị hỏng.';
      if (meta.version > SDT.DATA_VERSION) return 'Dữ liệu được tạo bởi bản mới hơn (dữ liệu v' + meta.version + '). Hãy cập nhật Sổ Dấu Trang.';
      if (meta.version !== SDT.DATA_VERSION) return 'Phiên bản dữ liệu lạ (v' + meta.version + ').';
      return null;
    }

    // Đảm bảo kho ở dạng v2. Kho trống → không ghi gì. Dữ liệu v1 → chép dự phòng rồi chuyển. Hỏng → báo, không ghi.
    async function ensure() {
      let r;
      try { r = await backend.get([K.meta, K.error]); } catch (e) { return { ok: false, error: 'Không đọc được dữ liệu: ' + e.message }; }
      if (r[K.error]) return { ok: false, error: String(r[K.error]), raw: r };   // đã phát hiện hỏng trước đó: không ghi nữa
      if (r[K.meta] !== undefined) {
        const err = checkMeta(r[K.meta]);
        return err ? { ok: false, error: err, raw: r } : { ok: true, meta: r[K.meta] };
      }
      if (!migrating) {
        migrating = (async () => {
          let o;
          try { o = await backend.get([K.v1]); } catch (e) { return { ok: false, error: 'Dữ liệu cũ bị hỏng: ' + e.message }; }
          const raw = o[K.v1];
          if (raw === undefined || raw === null || raw === '') return { ok: true, meta: null, empty: true };
          const v = SDT.validateData(raw);
          if (!v.ok) return { ok: false, error: v.error, raw: o };
          const lay = layout(v.data, 1, writer);
          lay[K.backupV1] = raw;
          await backend.set(lay);
          await backend.remove([K.v1]);
          return { ok: true, meta: lay[K.meta], migrated: true };
        })();
      }
      try { return await migrating; } finally { migrating = null; }
    }

    // Ghi dấu "dữ liệu hỏng" vào khóa riêng (không đụng dữ liệu) để mọi nơi ngừng ghi cho tới khi người dùng thay thế toàn bộ.
    async function markBad(error, raw) {
      try { await backend.set({ [K.error]: error }); } catch (e) { /* bỏ qua */ }
      return { ok: false, error, raw };
    }

    async function loadAll() {
      const e = await ensure();
      if (!e.ok) return e;
      if (!e.meta) { lastRev = 0; return { ok: true, data: SDT.emptyData(), empty: true, rev: 0 }; }
      let r;
      try { r = await backend.get([K.folders].concat(ALL_SHARD_KEYS)); } catch (err) { return { ok: false, error: 'Một phần dữ liệu bị hỏng: ' + err.message }; }
      const bookmarks = [];
      for (const k of ALL_SHARD_KEYS) {
        const list = r[k];
        if (list === undefined) continue;
        if (!Array.isArray(list)) return markBad('Phần dữ liệu "' + k + '" bị hỏng.', r);
        for (const b of list) bookmarks.push(b);
      }
      const folders = r[K.folders] === undefined ? [] : r[K.folders];
      const v = SDT.validateData({ version: SDT.DATA_VERSION, folders, bookmarks, tagColors: e.meta.tagColors }, { trusted: true });
      if (!v.ok) return markBad(v.error, r);
      lastRev = e.meta.rev;
      return { ok: true, data: v.data, rev: e.meta.rev, meta: e.meta, dropped: v.dropped || 0 };
    }

    // Phần nhẹ cho popup / bảng lưu nhanh: thư mục, màu nhãn, danh sách nhãn.
    async function loadLite() {
      const e = await ensure();
      if (!e.ok) return e;
      if (!e.meta) return { ok: true, folders: [], tagColors: {}, tags: [] };
      const r = await backend.get([K.folders, K.tagstat]);
      const v = SDT.validateData({ version: SDT.DATA_VERSION, folders: r[K.folders] || [], bookmarks: [], tagColors: e.meta.tagColors }, { trusted: true });
      if (!v.ok) return { ok: false, error: v.error, raw: r };
      const st = r[K.tagstat] || {};
      const tags = Object.values(st).filter(x => Array.isArray(x) && x[1] > 0).map(x => x[0]);
      return { ok: true, folders: v.data.folders, tagColors: v.data.tagColors, tags };
    }

    // Trang này đã lưu chưa: chỉ đọc một bảng tra nhỏ.
    async function idsForUrl(url) {
      const key = SDT.normalizeUrl(url);
      const bk = bucketKey(bucketOf(key));
      const r = await backend.get([K.meta, K.error, bk]);
      if (r[K.error]) return { ok: false, error: String(r[K.error]), ids: [] };
      if (!r[K.meta]) return { ok: true, ids: [], noMeta: true };
      const m = r[bk] || {};
      return { ok: true, ids: Array.isArray(m[key]) ? m[key] : [] };
    }
    async function lookupUrl(url) {
      const e = await ensure();
      if (!e.ok) return e;
      if (!e.meta) return { ok: true, bookmarks: [] };
      const { ids } = await idsForUrl(url);
      if (!ids.length) return { ok: true, bookmarks: [] };
      const keys = [...new Set(ids.map(id => shardKey(shardOf(id))))];
      const r = await backend.get(keys);
      const want = new Set(ids);
      const out = [];
      for (const k of keys) for (const b of (r[k] || [])) if (want.has(b.id)) out.push(b);
      out.sort((a, b) => b.updatedAt - a.updatedAt);
      return { ok: true, bookmarks: out };
    }

    // Mọi lần ghi xếp hàng lần lượt (đọc–sửa–ghi không được chồng nhau). backend.lock: khóa chung giữa các trang (tiện ích).
    let queue = Promise.resolve();
    function serial(fn) {
      const run = () => (backend.lock ? backend.lock(fn) : fn());
      const p = queue.then(run, run);
      queue = p.catch(() => {});
      return p;
    }
    function apply(diff, origin) { return serial(() => applyNow(diff, origin)); }
    function replaceAll(data, origin) { return serial(() => replaceAllNow(data, origin)); }

    // Ghi phần thay đổi: chỉ đọc/ghi các phần bị chạm.
    async function applyNow(diff, origin) {
      const e = await ensure();
      if (!e.ok) throw new Error(e.error);
      const meta = Object.assign({ version: SDT.DATA_VERSION, rev: 0, shards: SHARDS, buckets: BUCKETS, tagColors: {} }, e.meta || {});
      const upserts = diff.upserts || [];
      const deletes = diff.deletes || [];
      const out = {};
      if (upserts.length || deletes.length) {
        const dirtyShards = new Set();
        for (const b of upserts) dirtyShards.add(shardOf(b.id));
        for (const b of deletes) dirtyShards.add(shardOf(b.id));
        const cur = await backend.get([...dirtyShards].map(shardKey).concat([K.tagstat]));
        for (const k of dirtyShards) {
          const v = cur[shardKey(k)];
          if (v !== undefined && !Array.isArray(v)) { await markBad('Phần dữ liệu "' + shardKey(k) + '" bị hỏng.', cur); throw new Error('Dữ liệu đang lỗi nên không ghi.'); }
        }
        const stored = new Map();
        for (const k of dirtyShards) for (const b of (cur[shardKey(k)] || [])) stored.set(b.id, b);
        const dirtyBuckets = new Set();
        for (const b of upserts) { dirtyBuckets.add(bucketOf(b.urlKey)); const o = stored.get(b.id); if (o) dirtyBuckets.add(bucketOf(o.urlKey)); }
        for (const b of deletes) { const o = stored.get(b.id) || b; dirtyBuckets.add(bucketOf(o.urlKey)); }
        const curB = await backend.get([...dirtyBuckets].map(bucketKey));
        const up = new Map(upserts.map(b => [b.id, b]));
        const del = new Set(deletes.map(b => b.id));
        for (const k of dirtyShards) {
          const list = (cur[shardKey(k)] || []).filter(b => !del.has(b.id) && !up.has(b.id));
          for (const b of upserts) if (shardOf(b.id) === k) list.push(cleanBookmark(b));
          out[shardKey(k)] = list;
        }
        for (const k of dirtyBuckets) out[bucketKey(k)] = Object.assign({}, curB[bucketKey(k)] || {});
        const rm = (key, id) => { const m = out[bucketKey(bucketOf(key))]; const a = m[key]; if (!a) return; const n = a.filter(x => x !== id); if (n.length) m[key] = n; else delete m[key]; };
        const add = (key, id) => { const m = out[bucketKey(bucketOf(key))]; const a = m[key] || []; if (!a.includes(id)) m[key] = a.concat([id]); };
        const st = Object.assign({}, cur[K.tagstat] || {});
        const dec = tags => { for (const t of tags || []) { const k = SDT.lower(t); if (st[k]) { st[k] = [st[k][0], st[k][1] - 1]; if (st[k][1] <= 0) delete st[k]; } } };
        const inc = tags => { for (const t of tags || []) { const k = SDT.lower(t); st[k] = st[k] ? [st[k][0], st[k][1] + 1] : [t, 1]; } };
        for (const b of deletes) { const o = stored.get(b.id); if (o) { rm(o.urlKey, o.id); dec(o.tags); } }
        for (const b of upserts) { const o = stored.get(b.id); if (o) { rm(o.urlKey, o.id); dec(o.tags); } add(b.urlKey, b.id); inc(b.tags); }
        out[K.tagstat] = st;
      }
      // Thư mục: đọc bản đang lưu rồi áp từng thay đổi (không đè thư mục nơi khác vừa tạo / sửa).
      const fu = diff.folderUpserts || [], fd = diff.folderDeletes || [];
      if (fu.length || fd.length) {
        let stored;
        try { stored = (await backend.get([K.folders]))[K.folders]; } catch (err) { stored = undefined; }
        if (stored !== undefined && !Array.isArray(stored)) { await markBad('Phần dữ liệu "' + K.folders + '" bị hỏng.', { [K.folders]: stored }); throw new Error('Dữ liệu đang lỗi nên không ghi.'); }
        const del = new Set(fd), up = new Map(fu.map(f => [f.id, f]));
        const list = (stored || []).filter(f => f && !del.has(f.id) && !up.has(f.id));
        for (const f of fu) list.push(f);
        out[K.folders] = list;
      } else if (diff.folders) out[K.folders] = diff.folders;
      // Màu nhãn: chỉ đổi các nhãn vừa đổi màu.
      const tcs = diff.tagColorSet;
      if (tcs && Object.keys(tcs).length) {
        const tc = Object.assign({}, meta.tagColors || {});
        for (const [k, c] of Object.entries(tcs)) { if (c === null) delete tc[k]; else tc[k] = c; }
        meta.tagColors = tc;
      } else if (diff.tagColors && !tcs) meta.tagColors = diff.tagColors;
      meta.rev = (meta.rev || 0) + 1;
      meta.writer = writer;
      out[K.meta] = meta;
      await backend.set(out);
      lastRev = meta.rev;
      emit({ own: true, origin: origin || null, rev: meta.rev, keys: Object.keys(out) });
      return { rev: meta.rev, keys: Object.keys(out) };
    }

    async function save(oldData, newData, origin) {
      const d = SDT.diffData(oldData, newData);
      if (!d.upserts.length && !d.deletes.length && !d.folders && !d.tagColors) return { rev: lastRev, keys: [] };   // (folders/tagColors chỉ khác null khi có thay đổi theo mục)
      return apply(d, origin);
    }

    async function replaceAllNow(data, origin) {
      let rev = 0;
      try { const r = await backend.get([K.meta]); if (r[K.meta] && Number.isFinite(r[K.meta].rev)) rev = r[K.meta].rev; } catch (e) { /* kho hỏng: ghi đè theo yêu cầu người dùng */ }
      const lay = layout(data, rev + 1, writer);
      await backend.set(lay);
      try { await backend.remove([K.v1, K.error]); } catch (e) { /* bỏ qua */ }
      lastRev = rev + 1;
      emit({ own: true, origin: origin || null, rev: lastRev });
      return { rev: lastRev };
    }

    // Bản Soul không có sự kiện đổi dữ liệu giữa các tab: so rev khi tab hiện lại.
    async function checkExternal() {
      try {
        const r = await backend.get([K.meta]);
        const rev = r[K.meta] ? r[K.meta].rev : null;
        if (rev !== lastRev) { lastRev = rev; emit({ own: false, origin: null, rev }); return true; }
      } catch (e) { /* bỏ qua */ }
      return false;
    }

    async function raw() { return backend.getAll ? backend.getAll() : {}; }
    async function readKeys(keys) { return backend.get(keys); }

    return {
      writer, ensure, loadAll, readKeys, loadLite, idsForUrl, lookupUrl, apply, save, replaceAll, checkExternal, raw,
      onChange(cb) { listeners.add(cb); return () => listeners.delete(cb); },
    };
  }

  root.SDTStorage = { makeStore, layout, shardOf, bucketOf, shardKey, bucketKey, SHARDS, BUCKETS, KEYS: K };
})(SDTNS);

const SDTStorage = SDTNS.SDTStorage;
/* Sổ Dấu Trang — mảnh giao diện dùng chung cho popup, trình quản lý và bản Soul. */
(function (root) {
  'use strict';
  const SDT = root.SDT;

  // Nơi gắn giao diện: document.body (tiện ích) hoặc phần tử trong Shadow DOM (bản Soul).
  const CFG = { host: null, copy: null, favicon: true };
  function config(o) { Object.assign(CFG, o || {}); }
  function hostEl() { return CFG.host || document.body; }
  function rootNode() { return hostEl().getRootNode(); }
  function activeIn(node) { const r = node.getRootNode(); return r.activeElement || document.activeElement; }
  function coarse() { return !!(window.matchMedia && matchMedia('(pointer:coarse)').matches); }

  function h(tag, attrs, ...kids) {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (v === undefined || v === null || v === false) continue;
      if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
      else if (k === 'class') el.className = v;
      else if (k === 'text') el.textContent = v;
      else if (k === 'style') el.style.cssText = v; // CSSOM: không bị CSP chặn như thuộc tính style
      else if (k === 'svg') el.append(svg(v[0], v[1], v[2]));
      else if (k in el && typeof v !== 'string') el[k] = v;
      else el.setAttribute(k, v === true ? '' : v);
    }
    for (const kid of kids.flat()) {
      if (kid === null || kid === undefined || kid === false) continue;
      el.append(kid instanceof Node ? kid : document.createTextNode(String(kid)));
    }
    return el;
  }

  const ICONS = {
    edit: '<path d="M4 20h4l10.5-10.5a2.8 2.8 0 0 0-4-4L4 16v4z"/><path d="M13.5 6.5l4 4"/>',
    copy: '<rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V5a1 1 0 0 1 1-1h10"/>',
    trash: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    menu: '<path d="M4 7h16M4 12h16M4 17h10"/>',
    filter: '<path d="M4 6h16M7 12h10M10 18h4"/>',
    more: '<circle cx="12" cy="5.5" r="1.4"/><circle cx="12" cy="12" r="1.4"/><circle cx="12" cy="18.5" r="1.4"/>',
    close: '<path d="M7 7l10 10M17 7L7 17"/>',
    folder: '<path d="M3 7.5A2.5 2.5 0 0 1 5.5 5H9l2 2h7.5A2.5 2.5 0 0 1 21 9.5v7a2.5 2.5 0 0 1-2.5 2.5h-13A2.5 2.5 0 0 1 3 16.5z"/>',
    folderPlus: '<path d="M3 7.5A2.5 2.5 0 0 1 5.5 5H9l2 2h7.5A2.5 2.5 0 0 1 21 9.5v7a2.5 2.5 0 0 1-2.5 2.5h-13A2.5 2.5 0 0 1 3 16.5z"/><path d="M12 10.5v5M9.5 13h5"/>',
    chevron: '<path d="M9 6l6 6-6 6"/>',
    down: '<path d="M6 9l6 6 6-6"/>',
    check: '<path d="M5 12l5 5 9-10"/>',
    search: '<circle cx="11" cy="11" r="6.5"/><path d="M20 20l-4.2-4.2"/>',
    grip: '<path d="M5 9h14M5 15h14"/>',
    rows: '<path d="M4 5.5h16M4 10h16M4 14.5h16M4 19h16"/>',
    sort: '<path d="M7 5v14M4 16l3 3 3-3M17 19V5M14 8l3-3 3 3"/>',
    all: '<path d="M5 5h14M5 12h14M5 19h14"/>',
    bm: '<path d="M7 4h10v16l-5-4-5 4z"/>',
    cut: '<circle cx="6" cy="17" r="2.5"/><circle cx="18" cy="17" r="2.5"/><path d="M8 15.5L17 4M16 15.5L7 4"/>',
    paste: '<rect x="6" y="5" width="12" height="15" rx="2"/><path d="M9 5V3.5h6V5M9 11h6M9 15h4"/>',
    open: '<path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/>',
    link: '<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>',
    select: '<rect x="4" y="4" width="16" height="16" rx="4"/><path d="M8.5 12l2.5 2.5 4.5-5"/>',
    move: '<path d="M3 7.5A2.5 2.5 0 0 1 5.5 5H9l2 2h7.5A2.5 2.5 0 0 1 21 9.5v7a2.5 2.5 0 0 1-2.5 2.5h-13A2.5 2.5 0 0 1 3 16.5z"/><path d="M10 13h5M13 10.5L15.5 13 13 15.5"/>',
    palette: '<path d="M12 3a9 9 0 1 0 0 18c1 0 1.5-.8 1.5-1.6 0-1-.8-1.4-.8-2.4 0-.9.7-1.5 1.6-1.5H17a4 4 0 0 0 4-4C21 6.6 17 3 12 3z"/><circle cx="7.5" cy="11" r="1"/><circle cx="10" cy="7.5" r="1"/><circle cx="14.5" cy="7.5" r="1"/>',
    tag: '<path d="M3 12V4h8l10 10-8 8z"/><circle cx="7.5" cy="8" r="1.3"/>',
  };
  const SVGNS = 'http://www.w3.org/2000/svg';
  // Dựng SVG bằng createElementNS (không dùng innerHTML: trang như YouTube bật Trusted Types sẽ chặn).
  function svg(viewBox, inner, attrs) {
    const el = document.createElementNS(SVGNS, 'svg');
    el.setAttribute('viewBox', viewBox);
    for (const [k, v] of Object.entries(attrs || {})) el.setAttribute(k, v);
    const re = /<(\w+)((?:\s+[\w-]+="[^"]*")*)\s*\/>/g;
    let m;
    while ((m = re.exec(inner || ''))) {
      const c = document.createElementNS(SVGNS, m[1]);
      const are = /([\w-]+)="([^"]*)"/g;
      let a;
      while ((a = are.exec(m[2]))) c.setAttribute(a[1], a[2]);
      el.append(c);
    }
    return el;
  }
  const iconCache = new Map();
  function icon(name, extraClass) {
    let tpl = iconCache.get(name);
    if (!tpl) {
      tpl = document.createElement('span');
      tpl.setAttribute('aria-hidden', 'true');
      tpl.append(svg('0 0 24 24', ICONS[name] || '', { fill: 'none', stroke: 'currentColor', 'stroke-width': '1.8', 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }));
      iconCache.set(name, tpl);
    }
    const span = tpl.cloneNode(true);
    span.className = 'ic' + (extraClass ? ' ' + extraClass : '');
    return span;
  }
  function ribbonSvg(saved, hanging) {
    const d = hanging ? 'M3 0V43L15 34L27 43V0' : 'M3 3H27V43L15 34L3 43Z';
    return svg('0 0 30 46', '<path d="' + d + '" stroke-width="3" stroke-linejoin="round"/>', { class: 'ribbon-svg' + (saved ? ' on' : '') });
  }

  /* ---------- nhãn có màu ---------- */
  function tagClass(colorSrc, tag) { return 'tc-' + SDT.tagColor(colorSrc, tag); }

  function TagInput(opts) {
    const prefix = opts.prefix || 'bm';
    const colorSrc = () => (opts.colorSrc ? opts.colorSrc() : null);
    let tags = SDT.normalizeTags(opts.tags || []);
    const chips = h('span', { class: 'chips' });
    const input = h('input', {
      type: 'text', class: 'tag-entry', 'data-test': prefix + '-tags-input',
      placeholder: 'Thêm nhãn…', autocomplete: 'off', enterkeyhint: 'enter', 'aria-label': 'Nhãn',
    });
    const box = h('div', { class: 'tagbox', onclick: e => { if (e.target === box || e.target === chips) input.focus(); } }, chips, input);
    const sugg = h('div', { class: 'suggest', 'data-test': prefix + '-tag-suggest', hidden: true });
    const wrap = h('div', { class: 'tag-input' }, box, sugg);
    function render() {
      chips.textContent = '';
      for (const t of tags) {
        chips.append(h('span', { class: 'chip tag ' + tagClass(colorSrc(), t), 'data-test': 'tag-chip', 'data-tag': t },
          h('span', { class: 'chip-t' }, t),
          h('button', {
            type: 'button', class: 'chip-x', 'aria-label': 'Bỏ nhãn ' + t, 'data-test': 'tag-chip-remove',
            onclick: () => { tags = tags.filter(x => x !== t); render(); renderSuggest(); opts.onChange && opts.onChange(); },
          }, '×')));
      }
      input.placeholder = tags.length ? 'Thêm nhãn…' : 'Thêm nhãn, cách nhau bằng dấu phẩy';
    }
    function commit(text) {
      const add = SDT.parseTags(text);
      if (!add.length) return false;
      const before = tags.length;
      tags = SDT.normalizeTags(tags.concat(add));
      render();
      if (tags.length !== before && opts.onChange) opts.onChange();
      return true;
    }
    function renderSuggest() {
      const q = SDT.fold(input.value.split(',').pop().trim());
      const have = new Set(tags.map(t => t.toLowerCase()));
      const all = (opts.getAll ? opts.getAll() : []).filter(t => !have.has(t.toLowerCase()));
      const list = q ? all.filter(t => SDT.fold(t).includes(q)).sort((a, b) => (SDT.fold(a).startsWith(q) ? 0 : 1) - (SDT.fold(b).startsWith(q) ? 0 : 1)) : [];
      sugg.textContent = '';
      for (const t of list.slice(0, 8)) {
        sugg.append(h('button', {
          type: 'button', class: 'sug tag ' + tagClass(colorSrc(), t), 'data-test': 'tag-suggestion', 'data-tag': t,
          onmousedown: e => e.preventDefault(),
          onclick: () => { const parts = input.value.split(','); parts.pop(); commit(parts.join(',')); commit(t); input.value = ''; renderSuggest(); input.focus(); },
        }, t));
      }
      sugg.hidden = !sugg.childElementCount;
    }
    input.addEventListener('keydown', e => {
      if (e.key === 'Enter') {
        if (input.value.trim()) { e.preventDefault(); commit(input.value); input.value = ''; renderSuggest(); }
      } else if (e.key === 'Backspace' && !input.value && tags.length) {
        tags = tags.slice(0, -1); render(); opts.onChange && opts.onChange();
      }
    });
    input.addEventListener('input', () => {
      if (input.value.includes(',')) {
        const parts = input.value.split(',');
        const last = parts.pop();
        commit(parts.join(','));
        input.value = last.replace(/^\s+/, '');
      }
      renderSuggest();
    });
    input.addEventListener('blur', () => { setTimeout(() => { if (activeIn(input) !== input) { if (input.value.trim()) { commit(input.value); input.value = ''; } sugg.hidden = true; } }, 120); });
    render();
    return {
      el: wrap, input,
      get() { return SDT.normalizeTags(tags.concat(SDT.parseTags(input.value))); },
      set(t) { tags = SDT.normalizeTags(t); input.value = ''; render(); renderSuggest(); },
      refresh: render,
    };
  }

  /* ---------- hộp thoại ---------- */
  function openDialog(opts) {
    return new Promise(resolve => {
      const errorEl = h('p', { class: 'form-error', 'data-test': 'dlg-error', role: 'alert', hidden: true });
      const actions = h('div', { class: 'dlg-actions' });
      const body = h('div', { class: 'dlg-body' });
      if (opts.message) body.append(h('p', { class: 'dlg-msg', 'data-test': 'dlg-message' }, opts.message));
      if (opts.body) body.append(opts.body);
      const closeBtn = h('button', { type: 'button', class: 'icon-btn dlg-close', 'aria-label': 'Đóng', 'data-test': 'dlg-close', onclick: () => finish(null) }, icon('close'));
      const dlg = h('dialog', {
        class: 'dlg' + (opts.sheet ? ' sheet' : '') + (opts.wide ? ' wide' : '') + (opts.cls ? ' ' + opts.cls : ''),
        'data-test': opts.test || 'dialog', 'aria-label': opts.title || '',
      },
        opts.sheet ? h('div', { class: 'grab', 'aria-hidden': 'true' }) : null,
        opts.title !== null ? h('div', { class: 'dlg-head' }, h('h2', { class: 'dlg-title' }, opts.title || ''), closeBtn) : null,
        body, errorEl, (opts.actions && opts.actions.length) || opts.footer ? actions : null);
      let done = false;
      function finish(v) {
        if (done) return;
        done = true;
        try { dlg.close(); } catch (e) { /* đã đóng */ }
        // Thông báo đang hiện trong hộp này (có thể kèm Hoàn tác): chuyển ra ngoài thay vì mất theo hộp.
        const t = dlg.querySelector('#toast');
        if (t) {
          const rest = [...rootNode().querySelectorAll('dialog[open]')].filter(d => d !== dlg);
          (rest.length ? rest[rest.length - 1] : hostEl()).append(t);
        }
        dlg.remove();
        if (opts.onClose) opts.onClose(v);
        resolve(v);
      }
      const api = { el: dlg, body, close: finish, error(msg) { errorEl.textContent = msg || ''; errorEl.hidden = !msg; } };
      async function run(value) {
        api.error('');
        if (opts.onAction) {
          const r = await opts.onAction(value, api);
          if (typeof r === 'string' && r) { api.error(r); return; }
          if (r === false) return;
        }
        finish(value);
      }
      api.run = run;
      if (opts.footer) actions.append(opts.footer(api));
      for (const a of (opts.actions || [])) {
        actions.append(h('button', {
          type: 'button', class: 'btn ' + (a.kind || 'quiet') + (a.cls ? ' ' + a.cls : ''), 'data-test': a.test || 'dlg-action', 'data-value': a.value,
          onclick: () => (a.value === null ? finish(null) : run(a.value)),
        }, a.label));
      }
      dlg.addEventListener('cancel', e => { e.preventDefault(); finish(null); });
      dlg.addEventListener('click', e => { if (e.target === dlg) finish(null); });
      dlg.addEventListener('keydown', e => {
        if (e.key === 'Enter' && opts.enterValue !== undefined && e.target.tagName === 'INPUT' && !e.target.classList.contains('tag-entry')) { e.preventDefault(); run(opts.enterValue); }
      });
      hostEl().append(dlg);
      dlg.showModal();
      if (opts.position) {
        // Menu cạnh con trỏ (máy tính).
        const r = dlg.getBoundingClientRect();
        const x = Math.min(opts.position.x, window.innerWidth - r.width - 8);
        const y = Math.min(opts.position.y, window.innerHeight - r.height - 8);
        dlg.style.cssText = 'margin:0;position:fixed;left:' + Math.max(8, x) + 'px;top:' + Math.max(8, y) + 'px;';
      }
      const f = dlg.querySelector('[autofocus]') || (opts.noFocus ? null : dlg.querySelector('.dlg-body input:not([type=checkbox]):not([type=radio]), .dlg-body textarea'));
      if (f && !coarse()) f.focus();
      else if (!opts.position) { const last = actions.lastElementChild; if (last && !coarse()) last.focus(); }
      if (opts.onOpen) opts.onOpen(api);
    });
  }
  function confirmDialog(o) {
    return openDialog({
      title: o.title, message: o.message, test: o.test || 'dlg-confirm', body: o.body,
      actions: [{ label: o.cancelText || 'Hủy', value: null, test: 'dlg-cancel' }, { label: o.okText || 'Đồng ý', value: 'ok', kind: o.danger ? 'danger' : 'primary', test: 'dlg-ok' }],
    }).then(v => v === 'ok');
  }
  function promptDialog(o) {
    const input = h('input', { type: 'text', 'data-test': 'dlg-input', value: o.value || '', maxlength: o.maxlength || '100', autocomplete: 'off', autofocus: true, 'aria-label': o.label || o.title });
    let result = null;
    return openDialog({
      title: o.title, test: o.test || 'dlg-prompt', enterValue: 'ok',
      body: h('label', { class: 'field' }, h('span', { class: 'lab' }, o.label || ''), input),
      actions: [{ label: 'Hủy', value: null, test: 'dlg-cancel' }, { label: o.okText || 'Lưu', value: 'ok', kind: 'primary', test: 'dlg-ok' }],
      onAction: async () => { const err = o.validate ? await o.validate(input.value) : null; if (err) return err; result = input.value; return true; },
      onOpen: () => { input.select(); },
    }).then(v => (v === 'ok' ? result : null));
  }

  /* ---------- menu ngữ cảnh ---------- */
  // items: [{label, icon, test, onSelect, danger, disabled} | 'sep']; at: {x, y} để hiện cạnh chuột (máy tính).
  function contextMenu(items, at, title) {
    const useAt = at && !coarse() && window.innerWidth > 640;
    let chosen = null;
    return openDialog({
      title: useAt ? null : (title || null), test: 'ctx-menu', cls: 'cmenu' + (useAt ? ' at' : ''), sheet: !useAt, position: useAt ? at : null, noFocus: true,
      onOpen: api => {
        const list = h('div', { class: 'menu', role: 'menu' });
        for (const it of items) {
          if (!it) continue;
          if (it === 'sep') { list.append(h('div', { class: 'menu-sep', role: 'separator' })); continue; }
          list.append(h('button', {
            type: 'button', role: 'menuitem', class: 'menu-item' + (it.danger ? ' danger-text' : ''), 'data-test': it.test, disabled: !!it.disabled,
            onclick: () => { chosen = it; api.close(null); },
          }, icon(it.icon || 'chevron'), h('span', {}, it.label), it.hint ? h('span', { class: 'menu-hint' }, it.hint) : null));
        }
        api.body.append(list);
        const first = list.querySelector('button:not([disabled])');
        if (first && useAt) first.focus();
      },
    }).then(() => { if (chosen && chosen.onSelect) chosen.onSelect(); });
  }

  /* ---------- chọn thư mục bằng cây ---------- */
  // opts: { data, selected, disabled:Set, title, okText, onCreate(name, parentId) → Promise<{ok, data, folder, error}> }
  // Kết quả: { id } (id null = gốc) hoặc null khi hủy.
  function pickFolder(opts) {
    let data = opts.data;
    let selected = opts.selected || null;
    const disabled = opts.disabled || new Set();
    const expanded = new Set(SDT.folderChain(data, selected).map(f => f.id));
    const tree = h('div', { class: 'ptree', role: 'tree' });
    const filter = h('input', { type: 'search', class: 'pfilter', 'data-test': 'pick-filter', placeholder: 'Lọc thư mục theo tên', 'aria-label': 'Lọc thư mục', autocomplete: 'off' });
    const pathEl = h('p', { class: 'ppath', 'data-test': 'pick-path' });
    function draw() {
      tree.textContent = '';
      pathEl.textContent = 'Đang chọn: ' + SDT.folderLabel(data, selected);
      const q = SDT.fold(filter.value.trim());
      const node = (id, name, depth, kids, isOpen) => {
        const off = id && disabled.has(id);
        return h('div', { class: 'pnode' + (selected === id ? ' sel' : '') + (off ? ' off' : ''), style: '--depth:' + depth, role: 'treeitem', 'aria-selected': String(selected === id) },
          kids ? h('button', { type: 'button', class: 'caret' + (isOpen ? ' open' : ''), 'data-test': 'pick-caret', 'data-id': id || '', 'aria-label': isOpen ? 'Thu gọn' : 'Mở',
            onclick: () => { isOpen ? expanded.delete(id) : expanded.add(id); draw(); } }, icon('chevron')) : h('span', { class: 'caret-sp' }),
          h('button', { type: 'button', class: 'pname', 'data-test': 'pick-node', 'data-id': id || '', disabled: !!off,
            onclick: () => { selected = id; draw(); } }, icon(id ? 'folder' : 'bm', 'pico'), h('span', {}, name)));
      };
      if (q) {
        const hits = data.folders.filter(f => SDT.fold(f.name).includes(q)).slice(0, 200);
        for (const f of hits) {
          const el = node(f.id, SDT.folderLabel(data, f.id), 0, false, false);
          tree.append(el);
        }
        if (!hits.length) tree.append(h('p', { class: 'muted pempty' }, 'Không có thư mục nào khớp.'));
        return;
      }
      const cmap = SDT.childMap(data);
      for (const v of cmap.values()) v.sort((a, b) => SDT.byOrder(a, b));
      tree.append(node(null, SDT.ROOT_NAME, 0, false, true));
      const walk = (pid, depth) => {
        for (const f of (cmap.get(pid) || [])) {
          const kids = (cmap.get(f.id) || []).length > 0;
          const open = expanded.has(f.id);
          tree.append(node(f.id, f.name, depth, kids, open));
          if (kids && open) walk(f.id, depth + 1);
        }
      };
      walk(null, 1);
    }
    filter.addEventListener('input', draw);
    const body = h('div', { class: 'pick' }, data.folders.length > 12 ? filter : null, tree, pathEl);
    let result = null;
    return openDialog({
      title: opts.title || 'Chọn thư mục', test: 'dlg-picker', sheet: true, body, noFocus: true,
      footer: api => h('div', { class: 'pfoot' },
        h('button', { type: 'button', class: 'btn quiet', 'data-test': 'pick-new', onclick: async () => {
          if (!opts.onCreate) return;
          const parent = selected && !disabled.has(selected) ? selected : null;
          const name = await promptDialog({
            title: 'Thư mục mới trong “' + SDT.folderLabel(data, parent) + '”', label: 'Tên thư mục', okText: 'Tạo thư mục', test: 'dlg-folder-name',
            validate: v => { const r = SDT.validateFolderName(data, v, parent, null); return r.ok ? null : r.error; },
          });
          if (name === null) return;
          const r = await opts.onCreate(name, parent);
          if (!r || !r.ok) { api.error(r && r.error ? r.error : 'Không tạo được thư mục.'); return; }
          data = r.data; selected = r.folder.id; if (parent) expanded.add(parent);
          filter.value = '';
          draw();
        } }, icon('folderPlus'), 'Thư mục mới'),
        h('span', { class: 'grow' }),
        h('button', { type: 'button', class: 'btn quiet', 'data-test': 'pick-cancel', onclick: () => api.close(null) }, 'Hủy'),
        h('button', { type: 'button', class: 'btn primary', 'data-test': 'pick-ok', onclick: () => {
          if (selected && disabled.has(selected)) { api.error('Không chuyển vào thư mục này được.'); return; }
          result = { id: selected, data }; api.close('ok');
        } }, opts.okText || 'Chọn')),
      onOpen: () => { draw(); const s = tree.querySelector('.pnode.sel'); if (s && s.scrollIntoView) s.scrollIntoView({ block: 'nearest' }); },
    }).then(() => result);
  }

  /* ---------- biểu mẫu dấu trang ---------- */
  // opts: { prefix, getData, values, onChange, onCreateFolder(name, parentId) → Promise<{ok,data,folder}> }
  function BookmarkForm(opts) {
    const p = opts.prefix || 'bm';
    const getData = opts.getData;
    let folderId = (opts.values && opts.values.folderId) || null;
    const title = h('input', { type: 'text', 'data-test': p + '-title', id: p + '-title', maxlength: '500', autocomplete: 'off', placeholder: 'Để trống thì dùng địa chỉ làm tên' });
    const url = h('input', { type: 'url', 'data-test': p + '-url', id: p + '-url', autocomplete: 'off', inputmode: 'url', placeholder: 'https://…', spellcheck: 'false' });
    const folderLabel = h('span', { class: 'fsel-t', 'data-test': p + '-folder-label' });
    const folderBtn = h('button', { type: 'button', class: 'fsel', 'data-test': p + '-folder', 'aria-haspopup': 'dialog',
      onclick: async () => {
        const r = await pickFolder({ data: getData(), selected: folderId, onCreate: opts.onCreateFolder });
        if (r) { folderId = r.id; drawFolder(); opts.onChange && opts.onChange(); }
      } }, icon('folder', 'fsel-ic'), folderLabel, icon('down', 'fsel-dn'));
    const tags = TagInput({ prefix: p, getAll: () => (opts.getTags ? opts.getTags() : SDT.tagCounts(getData()).map(t => t.tag)), colorSrc: getData, onChange: opts.onChange });
    const error = h('p', { class: 'form-error', 'data-test': p + '-error', role: 'alert', hidden: true });
    function drawFolder() { const d = getData(); if (folderId && !SDT.getFolder(d, folderId)) folderId = null; folderLabel.textContent = SDT.folderLabel(d, folderId); }
    const el = h('div', { class: 'form' },
      h('label', { class: 'field' }, h('span', { class: 'lab' }, 'Tên'), title),
      h('label', { class: 'field' }, h('span', { class: 'lab' }, 'Địa chỉ'), url),
      h('div', { class: 'field' }, h('span', { class: 'lab' }, 'Thư mục'), folderBtn),
      h('div', { class: 'field' }, h('span', { class: 'lab' }, 'Nhãn'), tags.el),
      error);
    function set(v) { title.value = v.title || ''; url.value = v.url || ''; folderId = v.folderId || null; drawFolder(); tags.set(v.tags || []); }
    set(opts.values || {});
    return {
      el, set, tags, fields: { title, url, folder: folderBtn },
      get() { return { title: title.value, url: url.value, folderId, tags: tags.get() }; },
      showError(msg) { error.textContent = msg || ''; error.hidden = !msg; },
      refreshFolders: drawFolder,
    };
  }

  /* ---------- thông báo ngắn ---------- */
  let toastTimer = null;
  function toast(msg, o) {
    o = o || {};
    let el = rootNode().getElementById('toast');
    if (!el) el = h('div', { id: 'toast', class: 'toast', role: 'status', 'aria-live': 'polite', 'data-test': 'toast' });
    const dlgs = rootNode().querySelectorAll('dialog[open]');
    const host = dlgs.length ? dlgs[dlgs.length - 1] : hostEl();
    if (el.parentNode !== host) host.append(el);
    el.textContent = '';
    el.append(h('span', { class: 'toast-msg', 'data-test': 'toast-msg' }, msg));
    if (o.action) el.append(h('button', { type: 'button', class: 'toast-act', 'data-test': 'toast-action', onclick: () => { hide(); o.onAction && o.onAction(); } }, o.action));
    el.classList.toggle('error', !!o.error);
    el.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(hide, o.duration || (o.action ? 6000 : 2600));
    function hide() { el.classList.remove('show'); clearTimeout(toastTimer); }
    return hide;
  }
  async function copyText(text) {
    if (CFG.copy) { try { if (CFG.copy(text) !== false) return true; } catch (e) { /* thử cách khác */ } }
    try { await navigator.clipboard.writeText(text); return true; } catch (e) {
      const ta = h('textarea', { style: 'position:fixed;opacity:0' }, text);
      hostEl().append(ta); ta.select();
      let ok = false;
      try { ok = document.execCommand('copy'); } catch (e2) { ok = false; }
      ta.remove();
      return ok;
    }
  }
  let favBase = null;
  function faviconUrl(pageUrl) {
    if (CFG.favicon === false) return '';
    if (favBase === null) {
      favBase = '';
      try {
        if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.getManifest && chrome.runtime.getManifest().permissions.includes('favicon')) favBase = chrome.runtime.getURL('/_favicon/?size=32&pageUrl=');
      } catch (e) { /* bỏ qua */ }
    }
    return favBase ? favBase + encodeURIComponent(pageUrl) : '';
  }

  root.SDTUI = { config, activeIn, coarse, h, svg, icon, ribbonSvg, tagClass, TagInput, BookmarkForm, pickFolder, openDialog, confirmDialog, promptDialog, contextMenu, toast, copyText, faviconUrl };
})(SDTNS);

const SDTUI = SDTNS.SDTUI;
/* Sổ Dấu Trang — bảng lưu nhanh (popup của tiện ích, tấm trượt của bản Soul).
   SDTPopup.mount(phầnTử, env)
   env = {
     store: kho SDTStorage (loadLite, lookupUrl, save, onChange),
     getTarget(): Promise<{url, title}>,
     openManager(),
     prefs: { get(k), set(k, v) }
   }
   Popup chỉ đọc phần dữ liệu cần: thư mục, nhãn, và dấu trang của đúng địa chỉ này. */
(function (root) {
  'use strict';
  const { h, BookmarkForm, toast, activeIn, ribbonSvg } = root.SDTUI;
  const ORIGIN = 'popup';

  function mount(app, env) {
    const store = env.store;
    const S = { data: null, tags: [], tab: null, current: null, matches: [], form: null, forceDup: false, dupBox: null };

    function ribbon(saved) { return h('div', { class: 'ribbon' + (saved ? ' on' : ''), 'data-test': 'popup-ribbon', 'aria-hidden': 'true' }, ribbonSvg(saved, true)); }

    function renderMessage(title, text, test) {
      app.textContent = '';
      app.append(
        h('header', { class: 'p-head' }, ribbon(false), h('div', { class: 'p-status' }, h('p', { class: 'p-state', 'data-test': 'popup-status' }, title))),
        h('p', { class: 'p-note', 'data-test': test }, text),
        h('div', { class: 'p-actions' }, h('button', { type: 'button', class: 'btn quiet', 'data-test': 'popup-open-manager', onclick: () => env.openManager() }, 'Mở trình quản lý')));
    }
    function lastFolder() { try { const id = env.prefs.get('lastFolder'); return id && SDT.getFolder(S.data, id) ? id : null; } catch (e) { return null; } }
    function rememberFolder(id) { try { env.prefs.set('lastFolder', id || ''); } catch (e) { /* bỏ qua */ } }
    function clearDup() { S.forceDup = false; if (S.dupBox) S.dupBox.hidden = true; }

    async function createFolder(name, parentId) {
      const r = SDT.addFolder(S.data, name, parentId, Date.now());
      if (!r.ok) return r;
      try { await store.save(S.data, r.data, ORIGIN); } catch (e) { return { ok: false, error: 'Không lưu được: ' + e.message }; }
      S.data = r.data;
      return r;
    }

    function render() {
      S.current = S.matches[0] || null;
      const saved = !!S.current;
      app.textContent = '';
      const detail = saved ? 'Trong ' + SDT.folderLabel(S.data, S.current.folderId) + ', lưu ngày ' + SDT.formatDate(S.current.createdAt) : 'Điền thông tin rồi bấm Lưu.';
      const head = h('header', { class: 'p-head' }, ribbon(saved),
        h('div', { class: 'p-status' },
          h('p', { class: 'p-state', 'data-test': 'popup-status' }, saved ? 'Đã lưu' : 'Chưa lưu'),
          h('p', { class: 'p-detail', 'data-test': 'popup-status-detail' }, detail),
          S.matches.length > 1 ? h('p', { class: 'p-detail', 'data-test': 'popup-multi' }, 'Trang này có ' + S.matches.length + ' dấu trang; đang hiện bản sửa gần nhất.') : null));
      const values = saved
        ? { title: S.current.title, url: S.current.url, folderId: S.current.folderId, tags: S.current.tags }
        : { title: S.tab.title || '', url: S.tab.url, folderId: lastFolder(), tags: [] };
      S.form = BookmarkForm({ prefix: 'popup', getData: () => S.data, getTags: () => S.tags, values, onChange: clearDup, onCreateFolder: createFolder });
      S.form.fields.url.addEventListener('input', clearDup);
      S.dupBox = h('div', { class: 'dup', 'data-test': 'dup-warning', hidden: true });
      const saveBtn = h('button', { type: 'submit', class: 'btn primary', 'data-test': 'popup-save' }, saved ? 'Cập nhật' : 'Lưu dấu trang');
      const delBtn = saved ? h('button', { type: 'button', class: 'btn danger-soft', 'data-test': 'popup-delete', onclick: onDelete }, 'Xóa') : null;
      const form = h('form', { class: 'p-form', novalidate: true, onsubmit: e => { e.preventDefault(); onSave(); } },
        S.form.el, S.dupBox, h('div', { class: 'p-actions' }, delBtn, saveBtn));
      const foot = h('footer', { class: 'p-foot' },
        h('button', { type: 'button', class: 'link', 'data-test': 'popup-open-manager', onclick: () => env.openManager() }, 'Mở trình quản lý'),
        saved ? h('span', { class: 'p-meta', 'data-test': 'popup-meta' }, 'Cập nhật ' + SDT.formatDateTime(S.current.updatedAt)) : null);
      app.append(head, form, foot);
    }

    function showDup(others, values) {
      const b = others[0];
      S.dupBox.textContent = '';
      S.dupBox.append(
        h('p', {}, 'Địa chỉ này đã lưu ở ', h('strong', {}, SDT.folderLabel(S.data, b.folderId)), ' với tên “' + b.title + '”.'),
        h('div', { class: 'dup-actions' },
          h('button', { type: 'button', class: 'btn quiet small', 'data-test': 'dup-open', onclick: async () => { S.tab = Object.assign({}, S.tab, { url: b.url }); await loadMatches(); render(); } }, 'Mở bản cũ để sửa'),
          h('button', { type: 'button', class: 'btn quiet small', 'data-test': 'dup-force', onclick: () => { S.forceDup = true; onSave(values); } }, 'Vẫn lưu thêm')));
      S.dupBox.hidden = false;
    }

    async function loadMatches() {
      const r = await store.lookupUrl(S.tab.url);
      S.matches = r.ok ? r.bookmarks : [];
      S.data = Object.assign({}, S.data, { bookmarks: S.matches });
    }

    async function onSave(valuesOverride) {
      S.form.showError('');
      const values = valuesOverride || S.form.get();
      const fx = SDT.fixUrl(values.url);
      if (!fx.ok) { S.form.showError(fx.error); S.form.fields.url.focus(); return; }
      if (!S.forceDup && (!S.current || SDT.normalizeUrl(fx.url) !== S.current.urlKey)) {
        const lk = await store.lookupUrl(fx.url);
        const others = (lk.ok ? lk.bookmarks : []).filter(b => !S.current || b.id !== S.current.id);
        if (others.length) { showDup(others, values); return; }
      }
      const wasEdit = !!S.current;
      const now = Date.now();
      const r = wasEdit ? SDT.updateBookmark(S.data, S.current.id, values, now, { order: now }) : SDT.addBookmark(S.data, values, now, { order: now });
      if (!r.ok) { S.form.showError(r.error); return; }
      if (wasEdit && !r.changed) { toast('Không có gì thay đổi.'); return; }
      try { await store.save(S.data, r.data, ORIGIN); } catch (e) { S.form.showError('Không lưu được: ' + e.message); return; }
      rememberFolder(r.bookmark.folderId);
      S.tab = Object.assign({}, S.tab, { url: r.bookmark.url });
      S.forceDup = false;
      S.data = r.data;
      for (const t of r.bookmark.tags) if (!S.tags.some(x => x.toLowerCase() === t.toLowerCase())) S.tags.push(t);
      // Cập nhật ngay từ dữ liệu vừa lưu, không đọc lại kho.
      const key = SDT.normalizeUrl(S.tab.url);
      S.matches = S.data.bookmarks.filter(b => b.urlKey === key).sort((a, b) => b.updatedAt - a.updatedAt);
      render();
      toast(wasEdit ? 'Đã cập nhật.' : 'Đã lưu.');
    }

    async function onDelete() {
      const b = S.current;
      if (!b) return;
      const before = S.data;
      const r = SDT.deleteBookmarks(S.data, [b.id]);
      try { await store.save(before, r.data, ORIGIN); } catch (e) { toast('Không xóa được: ' + e.message, { error: true }); return; }
      await loadMatches();
      render();
      toast('Đã xóa dấu trang.', {
        action: 'Hoàn tác',
        onAction: async () => {
          const cur = S.data;
          const back = Object.assign({}, cur, { bookmarks: cur.bookmarks.concat([b]) });
          await store.save(cur, back, ORIGIN);
          await loadMatches();
          render();
          toast('Đã khôi phục.');
        },
      });
    }

    async function refresh(focusTitle) {
      try { S.tab = await env.getTarget(); } catch (e) { S.tab = null; }
      const lite = await store.loadLite();
      if (!lite.ok) { S.data = null; renderMessage('Không đọc được dữ liệu', lite.error + ' Mở trình quản lý để xem cách xử lý.', 'popup-data-error'); return; }
      S.data = { version: SDT.DATA_VERSION, folders: lite.folders, bookmarks: [], tagColors: lite.tagColors };
      S.tags = lite.tags.slice();
      if (!S.tab || !SDT.isSavableUrl(S.tab.url)) {
        renderMessage('Không lưu được trang này', 'Đây là trang nội bộ của trình duyệt. Chỉ lưu được trang web có địa chỉ http, https, ftp hoặc file.', 'popup-unsupported');
        return;
      }
      await loadMatches();
      render();
      if (!window.__sdtFirstRender) window.__sdtFirstRender = performance.now();
      const t = S.form && S.form.fields.title;
      if (focusTitle && t && !(window.matchMedia && matchMedia('(pointer:coarse)').matches)) t.focus();
    }

    store.onChange(async info => {
      if (!S.data || info.origin === ORIGIN || !S.tab) return;
      const active = activeIn(app);
      if (active && S.form && S.form.el.contains(active)) return;     // đang gõ: không vẽ lại
      await refresh(false);
    });

    const ready = refresh(true);
    return { refresh, ready };
  }

  root.SDTPopup = { mount };
})(SDTNS);

/* Sổ Dấu Trang — trình quản lý (bản 2.0).
   SDTManager.mount(phầnTửChứa, env)
   env = {
     store: kho SDTStorage (loadAll, save, replaceAll, onChange, raw),
     openUrl?(url)        // mở dấu trang (bản Soul: GM_openInTab); không có thì dùng liên kết thường
     onClose?()           // có thì hiện nút Đóng (bản Soul)
     pasteBackup?: bool   // thêm Chép / Dán dữ liệu ở màn Sao lưu
     keyTarget?           // nơi nghe phím tắt
     scroller?()          // phần tử cuộn danh sách (mặc định là trang)
     state?: { load(), save(obj) }   // nhớ cách sắp xếp, chỗ đang xem, vị trí cuộn (2.6.0)
   } */
(function (root) {
  'use strict';
  const UI = root.SDTUI;
  const { h, icon, BookmarkForm, openDialog, confirmDialog, promptDialog, contextMenu, pickFolder, toast, copyText, faviconUrl, tagClass } = UI;
  const ORIGIN = 'manager';
  const PAGE = 60;
  const BULK_CONFIRM = 10;      // xóa từ chừng này dấu trang trở lên thì hỏi lại

  function buildLayout(withClose) {
    const ib = (id, test, label, extra) => h('button', Object.assign({ type: 'button', class: 'icon-btn', id, 'data-test': test, 'aria-label': label }, extra || {}));
    return h('div', { class: 'layout' },
      h('aside', { class: 'side', id: 'side', 'data-test': 'sidebar', 'aria-label': 'Thư mục' },
        h('div', { class: 'side-head' },
          h('span', { class: 'brand' }, h('span', { class: 'brand-mark', svg: ['0 0 20 32', '<path d="M2.5 2.5H17.5V29L10 22.5L2.5 29Z"/>'] }), 'Sổ Dấu Trang'),
          ib('side-close', 'btn-drawer-close', 'Đóng danh sách thư mục', { class: 'icon-btn only-mobile' })),
        h('nav', { class: 'tree', id: 'tree' })),
      h('div', { class: 'scrim', id: 'scrim', 'data-test': 'drawer-scrim' }),
      h('main', { class: 'main' },
        h('header', { class: 'topbar' },
          ib('btn-drawer', 'btn-drawer', 'Mở danh sách thư mục', { class: 'icon-btn only-mobile' }),
          h('label', { class: 'search' },
            h('span', { class: 'search-ic', id: 'search-ic' }),
            h('input', { type: 'search', id: 'search', 'data-test': 'search-input', placeholder: 'Tìm dấu trang', autocomplete: 'off', enterkeyhint: 'search', 'aria-label': 'Tìm dấu trang' })),
          ib('btn-filter', 'btn-filter', 'Lọc', { class: 'icon-btn badge-host' }),
          ib('btn-more', 'btn-more', 'Thêm'),
          withClose ? ib('btn-close-manager', 'btn-close-manager', 'Đóng trình quản lý') : null),
        h('div', { id: 'banner' }),
        h('section', { class: 'listhead', id: 'listhead' }),
        h('section', { class: 'list', id: 'list', 'data-test': 'list', 'aria-live': 'polite' }),
        h('div', { class: 'bulkbar', id: 'bulkbar', 'data-test': 'bulkbar', hidden: true }),
        h('button', { type: 'button', class: 'fab', id: 'fab', 'data-test': 'fab-add', 'aria-label': 'Thêm dấu trang' })));
  }

  function mount(container, env) {
    const store = env.store;
    container.classList.add('sdt', 'mgr');
    container.textContent = '';
    container.append(buildLayout(!!env.onClose));
    const $ = id => container.querySelector('#' + id);
    const rootNode = container.getRootNode();
    const scroller = () => (env.scroller ? env.scroller() : (document.scrollingElement || document.documentElement));

    const S = {
      data: SDT.emptyData(), readOnly: false, loadError: '', rawBad: undefined,
      view: 'root',                 // 'all' | 'root' | mã thư mục
      q: SDT.defaultQuery(),
      sortFolder: 'manual', sortFlat: 'created',
      selectMode: false, selected: new Map(),
      dense: false,                 // kiểu xem Gọn (được nhớ)
      reorder: false,               // điện thoại: đang hiện tay nắm để xếp lại
      clip: null,                   // { mode: 'cut'|'copy', items: [{kind,id}] }
      expanded: new Set(),
      notice: '',
      entries: [], shown: 0, observer: null,
      drag: null,
    };
    const keyOf = it => it.kind + ':' + it.id;

    /* ---------- lưu ---------- */
    // Mọi lần ghi và đọc lại xếp hàng lần lượt. Thao tác được tính từ bản dữ liệu lúc bấm (base);
    // nếu tới lượt mà dữ liệu đã đổi (thao tác trước, popup, tab khác) thì ghép thay đổi của nó lên bản mới nhất.
    let chain = Promise.resolve();
    function enqueue(fn) { const p = chain.then(fn, fn); chain = p.catch(() => {}); return p; }
    function commit(newData, opts) { const base = S.data; return enqueue(() => commitNow(base, newData, opts || {})); }
    async function commitNow(base, wanted, opts) {
      if (S.readOnly && !opts.force) { toast('Dữ liệu đang lỗi nên không ghi được. Xem thông báo ở đầu trang.', { error: true }); return false; }
      const prev = S.data;
      const newData = opts.replace ? wanted : SDT.rebaseChanges(prev, base, wanted);
      try {
        if (opts.replace) await store.replaceAll(newData, ORIGIN);
        else await store.save(prev, newData, ORIGIN);
      } catch (e) { toast('Không lưu được: ' + (e && e.message ? e.message : e), { error: true }); return false; }
      S.data = newData;
      if (opts.force) { S.readOnly = false; S.loadError = ''; S.rawBad = undefined; }
      if (S.selected.size) {
        const fIds = new Set(S.data.folders.map(f => f.id)), bIds = new Set(S.data.bookmarks.map(b => b.id));
        for (const [k, it] of [...S.selected]) if (!(it.kind === 'f' ? fIds.has(it.id) : bIds.has(it.id))) S.selected.delete(k);
      }
      if (!['all', 'root'].includes(S.view) && !SDT.getFolder(S.data, S.view)) S.view = 'root';
      renderAll(opts.keepScroll !== false);
      if (opts.undo) {
        // Hoàn tác chỉ trả lại các mục bước này đã đổi; thay đổi của nơi khác (popup, tab khác) giữ nguyên.
        toast(opts.undo, { action: 'Hoàn tác', duration: opts.undoMs || 0, onAction: async () => { if (await commit(SDT.revertChanges(S.data, prev, newData), { keepScroll: true })) toast('Đã hoàn tác.'); } });
      }
      return true;
    }
    function exists(it) { return it.kind === 'f' ? !!SDT.getFolder(S.data, it.id) : S.data.bookmarks.some(b => b.id === it.id); }
    function bookmarkById(id) { return S.data.bookmarks.find(b => b.id === id) || null; }

    /* ---------- ngăn kéo ---------- */
    function setDrawer(open) { container.classList.toggle('drawer-open', open); }

    /* ---------- cây thư mục ---------- */
    function renderTree() {
      const tree = $('tree');
      tree.textContent = '';
      const stats = SDT.folderTotals(S.data);
      const rootCount = S.data.bookmarks.filter(b => !b.folderId).length + S.data.folders.filter(f => !f.parentId).length;
      const fixed = (key, label, count, test, ic) => h('div', { class: 'trow' + (S.view === key ? ' active' : ''), 'data-drop': key === 'root' ? '' : null },
        h('button', { type: 'button', class: 'tbtn', 'data-test': test, 'aria-current': S.view === key ? 'true' : null, onclick: () => goView(key) },
          icon(ic, 'tic'), h('span', { class: 'tname' }, label), h('span', { class: 'tcount' }, String(count))));
      tree.append(fixed('all', 'Tất cả dấu trang', S.data.bookmarks.length, 'folder-all', 'all'));
      tree.append(fixed('root', SDT.ROOT_NAME, rootCount, 'folder-root', 'bm'));
      tree.append(h('div', { class: 'tsec' }, h('span', {}, 'Thư mục'),
        h('button', { type: 'button', class: 'icon-btn small', 'data-test': 'folder-add', 'aria-label': 'Thêm thư mục', onclick: () => newFolder(null) }, icon('plus'))));
      // Mở sẵn đường dẫn tới thư mục đang xem.
      if (!['all', 'root'].includes(S.view)) for (const f of SDT.folderChain(S.data, S.view)) if (f.id !== S.view) S.expanded.add(f.id);
      const cmap = SDT.childMap(S.data);
      for (const v of cmap.values()) v.sort((a, b) => SDT.byOrder(a, b));
      const list = h('div', { class: 'tfolders', role: 'tree' });
      const walk = (pid, depth) => {
        for (const f of (cmap.get(pid) || [])) {
          const kids = (cmap.get(f.id) || []).length;
          const open = S.expanded.has(f.id);
          list.append(h('div', { class: 'trow folder' + (S.view === f.id ? ' active' : ''), 'data-test': 'folder-item', 'data-id': f.id, 'data-drop': f.id, style: '--depth:' + depth, role: 'treeitem', 'aria-expanded': kids ? String(open) : null },
            kids ? h('button', { type: 'button', class: 'caret' + (open ? ' open' : ''), 'data-test': 'folder-caret', 'aria-label': open ? 'Thu gọn ' + f.name : 'Mở ' + f.name,
              onclick: () => { open ? S.expanded.delete(f.id) : S.expanded.add(f.id); renderTree(); } }, icon('chevron')) : h('span', { class: 'caret-sp' }),
            h('button', { type: 'button', class: 'tbtn', 'data-test': 'folder-open', 'aria-current': S.view === f.id ? 'true' : null, onclick: () => goView(f.id) },
              icon('folder', 'tic fic'), h('span', { class: 'tname', 'data-test': 'folder-name' }, f.name), h('span', { class: 'tcount', 'data-test': 'folder-count', title: 'Số dấu trang, tính cả thư mục con' }, String(stats.get(f.id) || 0))),
            h('button', { type: 'button', class: 'icon-btn small tmenu', 'data-test': 'folder-menu', 'aria-label': 'Tùy chọn thư mục ' + f.name, onclick: e => folderMenu(f.id, null, e) }, icon('more'))));
          if (kids && open) walk(f.id, depth + 1);
        }
      };
      walk(null, 0);
      if (!S.data.folders.length) list.append(h('p', { class: 'tempty' }, 'Chưa có thư mục. Bấm + để tạo.'));
      tree.append(list);
      scheduleSave();
    }

    function goView(key) {
      S.view = key;
      S.selected.clear();
      S.selectMode = false;
      S.reorder = false;
      if (SDT.isSearching(S.q) && key !== 'all') S.q.scope = 'folder';
      setDrawer(false);
      renderAll(false);
    }

    /* ---------- trạng thái xem ---------- */
    const searching = () => SDT.isSearching(S.q);
    const folderView = () => S.view !== 'all' && !searching();
    const curFolderId = () => (S.view === 'all' || S.view === 'root' ? null : S.view);
    const curSort = () => (folderView() ? S.sortFolder : S.sortFlat);
    const canPasteHere = () => folderView();
    function filterCount() {
      const q = S.q;
      let n = 0;
      if (q.title.trim()) n++;
      if (q.urlText.trim()) n++;
      n += q.tags.length;
      if (SDT.hasDate(q)) n++;
      if (q.scope === 'all' && S.view !== 'all' && S.view !== 'root') n++;
      n += SDT.textModeCount(q);
      return n;
    }

    /* ---------- tiêu đề, thẻ điều kiện ---------- */
    function dateChipText() {
      const q = S.q;
      const df = q.dateField === 'updatedAt' ? 'Cập nhật' : 'Tạo';
      if (q.dateMode === 'exact' && SDT.isDay(q.date)) return df + ' ngày ' + SDT.dayToVN(q.date);
      if (q.dateMode === 'month' && SDT.isMonth(q.month)) return df + ' trong tháng ' + SDT.monthToVN(q.month);
      if (q.dateMode === 'range') {
        if (SDT.isDay(q.from) && SDT.isDay(q.to)) return df + ' từ ' + SDT.dayToVN(q.from) + ' đến ' + SDT.dayToVN(q.to);
        if (SDT.isDay(q.from)) return df + ' từ ' + SDT.dayToVN(q.from) + ' tới nay';
        if (SDT.isDay(q.to)) return df + ' tới hết ' + SDT.dayToVN(q.to);
      }
      return '';
    }
    function conditionChips() {
      const q = S.q;
      const chips = [];
      const chip = (key, label, onX, cls) => h('span', { class: 'cchip' + (cls ? ' tag ' + cls : ''), 'data-test': 'cond-chip', 'data-key': key },
        h('span', {}, label), h('button', { type: 'button', class: 'cchip-x', 'data-test': 'cond-x', 'aria-label': 'Bỏ điều kiện ' + label, onclick: () => { onX(); S.notice = ''; renderAll(false); } }, icon('close')));
      const dt = dateChipText();
      if (dt) chips.push(chip('date', dt, () => { q.date = ''; q.month = ''; q.from = ''; q.to = ''; }));
      for (const t of q.tags) chips.push(chip('tag:' + t, 'Nhãn: ' + t, () => { q.tags = q.tags.filter(x => x !== t); }, tagClass(S.data, t)));
      if (q.urlText.trim()) chips.push(chip('url', 'Địa chỉ: ' + q.urlText.trim(), () => { q.urlText = ''; }));
      if (q.title.trim()) chips.push(chip('title', 'Tên: ' + q.title.trim(), () => { q.title = ''; }));
      if (q.scope === 'all' && S.view !== 'all' && S.view !== 'root') chips.push(chip('scope', 'Trong toàn bộ thư mục', () => { q.scope = 'folder'; }));
      if (q.regex) chips.push(chip('regex', '.* Regex', () => { q.regex = false; }));
      else if (q.phrase) chips.push(chip('phrase', '“…” Đúng cụm', () => { q.phrase = false; }));
      if (q.caseSensitive) chips.push(chip('case', 'Aa Phân biệt hoa thường', () => { q.caseSensitive = false; }));
      return chips;
    }

    function renderHead(counts) {
      const head = $('listhead');
      head.textContent = '';
      const fid = curFolderId();
      // Đường dẫn
      if (S.view !== 'all' && S.view !== 'root') {
        const chain = SDT.folderChain(S.data, S.view);
        const crumbs = h('nav', { class: 'crumbs', 'aria-label': 'Đường dẫn' },
          h('button', { type: 'button', class: 'crumb', 'data-test': 'crumb', 'data-id': '', onclick: () => goView('root') }, SDT.ROOT_NAME));
        for (const f of chain.slice(0, -1)) {
          crumbs.append(icon('chevron', 'crumb-sep'), h('button', { type: 'button', class: 'crumb', 'data-test': 'crumb', 'data-id': f.id, onclick: () => goView(f.id) }, f.name));
        }
        crumbs.append(icon('chevron', 'crumb-sep'));
        head.append(crumbs);
      }
      container.classList.toggle('dense', S.dense);
      const title = searching() ? 'Kết quả' : S.view === 'all' ? 'Tất cả dấu trang' : S.view === 'root' ? SDT.ROOT_NAME : (SDT.getFolder(S.data, fid) || {}).name;
      const countText = searching() ? counts.b + ' kết quả' : folderView() ? (counts.f ? counts.f + ' thư mục · ' : '') + counts.b + ' dấu trang' : counts.b + ' dấu trang';
      head.append(h('div', { class: 'lh-row' }, h('h1', { class: 'lh-title', 'data-test': 'view-title' }, title), h('span', { class: 'lh-count', 'data-test': 'list-count' }, countText),
        h('button', { type: 'button', class: 'pill dense-pill' + (S.dense ? ' on' : ''), 'data-test': 'btn-dense', 'aria-pressed': String(S.dense), 'aria-label': 'Xem gọn', title: S.dense ? 'Đang xem gọn. Bấm để xem thoáng.' : 'Xem gọn',
          onclick: () => { S.dense = !S.dense; renderList(true); } }, icon('rows'))));
      const sort = h('select', { 'data-test': 'sort-select', 'aria-label': 'Sắp xếp', class: 'sort' },
        folderView() ? h('option', { value: 'manual' }, 'Tự xếp') : null,
        h('option', { value: 'created' }, 'Mới lưu trước'), h('option', { value: 'updated' }, 'Mới cập nhật trước'),
        h('option', { value: 'az' }, 'Tên A–Z'), h('option', { value: 'za' }, 'Tên Z–A'));
      sort.value = curSort();
      sort.addEventListener('change', () => { if (folderView()) S.sortFolder = sort.value; else S.sortFlat = sort.value; renderList(); });
      // Điện thoại: tay nắm chỉ hiện khi bật "Sắp xếp lại" (CSS ẩn nút này trên máy tính).
      const canReorder = folderView() && curSort() === 'manual' && !S.selectMode && !S.readOnly && S.entries.length > 1;
      if (!canReorder) S.reorder = false;
      container.classList.toggle('reordering', S.reorder);
      head.append(h('div', { class: 'lh-row tools' },
        h('label', { class: 'pill sortpill' }, icon('sort'), sort),
        h('button', { type: 'button', class: 'pill' + (S.selectMode ? ' on' : ''), 'data-test': 'btn-select-mode', 'aria-pressed': String(S.selectMode),
          onclick: () => { S.selectMode = !S.selectMode; S.selected.clear(); renderList(); } }, S.selectMode ? 'Xong' : 'Chọn nhiều'),
        canReorder ? h('button', { type: 'button', class: 'pill reorder-pill' + (S.reorder ? ' on' : ''), 'data-test': 'btn-reorder', 'aria-pressed': String(S.reorder),
          onclick: () => { S.reorder = !S.reorder; renderList(true); } }, icon('grip'), S.reorder ? 'Xong' : 'Sắp xếp lại') : null,
        S.clip && canPasteHere() ? h('button', { type: 'button', class: 'pill accent', 'data-test': 'btn-paste-here', onclick: () => pasteInto(fid, 'end') },
          icon('paste'), 'Dán ' + S.clip.items.length + ' mục vào đây') : null));
      const chips = conditionChips();
      if (chips.length) {
        head.append(h('div', { class: 'cchips', 'data-test': 'filter-summary' }, chips,
          h('button', { type: 'button', class: 'link small', 'data-test': 'btn-clear-filter-inline', onclick: clearFilters }, 'Bỏ lọc')));
      }
      if (searching() && S.view !== 'all' && S.view !== 'root' && S.q.scope !== 'all') {
        head.append(h('p', { class: 'scope-note', 'data-test': 'scope-note' },
          h('span', {}, 'Đang tìm trong “' + ((SDT.getFolder(S.data, S.view) || {}).name || '') + '”.'),
          h('button', { type: 'button', class: 'link small', 'data-test': 'scope-all', onclick: () => { S.q.scope = 'all'; S.notice = ''; renderAll(false); } }, 'Tìm ở tất cả thư mục')));
      }
      if (S.searchError) head.append(h('p', { class: 'lh-notice err', role: 'alert', 'data-test': 'search-error' }, S.searchError));
      if (S.notice) head.append(h('p', { class: 'lh-notice', 'data-test': 'notice' }, S.notice));
      const se = $('search');
      if (se) se.placeholder = S.q.regex ? 'Tìm bằng regex' : S.q.phrase ? 'Tìm đúng cụm' : 'Tìm dấu trang';
    }

    /* ---------- dòng trong danh sách ---------- */
    function folderRow(f, stats) {
      const it = { kind: 'f', id: f.id };
      const sel = S.selected.has(keyOf(it));
      const kids = S.kids ? (S.kids.get(f.id) || []).length : 0;
      const lead = S.selectMode
        ? h('input', { type: 'checkbox', class: 'row-check', 'data-test': 'item-check', checked: sel, 'aria-label': 'Chọn ' + f.name, onchange: e => toggleSel(it, e.target.checked) })
        : h('span', { class: 'ico fico' }, icon('folder'));
      const row = h('div', { class: 'row frow' + (sel ? ' sel' : '') + (isCut(it) ? ' cut' : ''), 'data-test': 'list-folder', 'data-id': f.id, 'data-row': 'f', 'data-drop': f.id, tabindex: '0' },
        lead,
        h('div', { class: 'rtext' },
          h('div', { class: 'rtitle', 'data-test': 'folder-row-name' }, f.name),
          h('div', { class: 'rmeta', 'data-test': 'folder-row-meta' }, (stats.get(f.id) || 0) + ' dấu trang' + (kids ? ' · ' + kids + ' thư mục con' : ''))),
        h('div', { class: 'racts' },
          h('button', { type: 'button', class: 'icon-btn rmenu', 'data-test': 'row-menu', 'aria-label': 'Tùy chọn ' + f.name, onclick: e => { e.stopPropagation(); folderMenu(f.id, row, e); } }, icon('more')),
          handle(it)));
      row.addEventListener('click', e => {
        if (e.target.closest('button,input,a')) return;
        if (S.selectMode) toggleSel(it, !S.selected.has(keyOf(it))); else goView(f.id);
      });
      row.addEventListener('keydown', e => { if (e.key === 'Enter' && e.target === row) goView(f.id); });
      row.addEventListener('contextmenu', e => { e.preventDefault(); e.stopPropagation(); folderMenu(f.id, row, e); });
      return row;
    }
    function bookmarkRow(b) {
      const it = { kind: 'b', id: b.id };
      const sel = S.selected.has(keyOf(it));
      const dateText = (S.q.dateField === 'updatedAt' && SDT.hasDate(S.q)) || curSort() === 'updated' ? 'Sửa ' + SDT.formatDate(b.updatedAt) : 'Lưu ' + SDT.formatDate(b.createdAt);
      const fav = faviconUrl(b.url);
      const letter = (SDT.domainOf(b.url)[0] || '?').toUpperCase();
      const lead = S.selectMode
        ? h('input', { type: 'checkbox', class: 'row-check', 'data-test': 'item-check', checked: sel, 'aria-label': 'Chọn ' + b.title, onchange: e => toggleSel(it, e.target.checked) })
        : h('span', { class: 'ico fav', 'data-letter': letter }, fav ? h('img', { src: fav, alt: '', loading: 'lazy', width: '20', height: '20', onerror: e => e.target.remove() }) : null);
      const showPath = !folderView();
      const row = h('div', { class: 'row brow' + (sel ? ' sel' : '') + (isCut(it) ? ' cut' : ''), 'data-test': 'list-item', 'data-id': b.id, 'data-row': 'b', tabindex: '0' },
        lead,
        h('div', { class: 'rtext' },
          h('a', { class: 'rtitle item-title', 'data-test': 'item-title', href: SDT.safeUrl(b.url) ? b.url : null, target: '_blank', rel: 'noopener noreferrer', title: b.url, draggable: 'false',
            onclick: e => { if (S.selectMode) { e.preventDefault(); toggleSel(it, !S.selected.has(keyOf(it))); return; } if (!SDT.safeUrl(b.url)) { e.preventDefault(); return; } if (env.openUrl) { e.preventDefault(); env.openUrl(b.url); } } }, hl(b.title, 't')),
          h('div', { class: 'rmeta' },
            h('span', { class: 'dom', 'data-test': 'item-domain' }, hl(SDT.domainOf(b.url), 'u')),
            h('span', { class: 'date', 'data-test': 'item-date' }, dateText)),
          showPath ? h('button', { type: 'button', class: 'rpath', 'data-test': 'item-path', onclick: () => { clearAllFilters(); goView(b.folderId || 'root'); revealItem(it); } },
            icon('folder'), SDT.folderLabel(S.data, b.folderId)) : null,
          b.tags.length ? h('div', { class: 'rtags' }, b.tags.map(t => h('button', {
            type: 'button', class: 'tag ' + tagClass(S.data, t), 'data-test': 'item-tag', 'data-tag': t, title: 'Lọc theo nhãn ' + t,
            onclick: () => { if (!S.q.tags.some(x => x.toLowerCase() === t.toLowerCase())) S.q.tags = S.q.tags.concat([t]); S.notice = ''; renderAll(false); },
          }, t))) : null),
        h('div', { class: 'racts' },
          h('button', { type: 'button', class: 'icon-btn rmenu', 'data-test': 'row-menu', 'aria-label': 'Tùy chọn ' + b.title, onclick: e => { e.stopPropagation(); bookmarkMenu(b.id, row, e); } }, icon('more')),
          handle(it)));
      row.addEventListener('click', e => {
        if (!S.selectMode || e.target.closest('button,input,a')) return;
        toggleSel(it, !S.selected.has(keyOf(it)));
      });
      row.addEventListener('contextmenu', e => { e.preventDefault(); e.stopPropagation(); bookmarkMenu(b.id, row, e); });
      return row;
    }
    // Tô phần chữ khớp điều kiện tìm (tên: 't', tên miền: 'u').
    function hl(text, field) {
      if (!S.hlOn) return text;
      const rs = SDT.highlightRanges(text, field, S.q);
      if (!rs.length) return text;
      const out = []; let at = 0;
      for (const [a, b] of rs) { if (a > at) out.push(text.slice(at, a)); out.push(h('mark', { class: 'hl', 'data-test': 'hl' }, text.slice(a, b))); at = b; }
      if (at < text.length) out.push(text.slice(at));
      return out;
    }
    // Cuộn tới một mục trong danh sách đang hiện và làm nổi nó trong chốc lát.
    function revealItem(it) {
      const idx = S.entries.findIndex(e => e.kind === it.kind && e.item.id === it.id);
      if (idx < 0) return;
      if (S.shown <= idx) appendMore(idx + 1 - S.shown + 10);
      const row = $('list').querySelector('[data-row="' + it.kind + '"][data-id="' + CSS.escape(it.id) + '"]');
      if (!row) return;
      row.scrollIntoView({ block: 'center' });
      row.classList.add('flash');
      setTimeout(() => row.classList.remove('flash'), 2400);
    }
    function handle(it) {
      if (!folderView() || curSort() !== 'manual' || S.selectMode || S.readOnly) return null;
      const el = h('button', { type: 'button', class: 'icon-btn grip', 'data-test': 'row-handle', 'aria-label': 'Kéo để đổi chỗ', tabindex: '-1' }, icon('grip'));
      el.addEventListener('pointerdown', e => startDrag(e, it, el));
      return el;
    }
    function isCut(it) { return !!(S.clip && S.clip.mode === 'cut' && S.clip.items.some(x => x.kind === it.kind && x.id === it.id)); }
    function toggleSel(it, on) {
      on ? S.selected.set(keyOf(it), it) : S.selected.delete(keyOf(it));
      const row = $('list').querySelector('[data-row="' + it.kind + '"][data-id="' + CSS.escape(it.id) + '"]');
      if (row) { row.classList.toggle('sel', on); const c = row.querySelector('.row-check'); if (c) c.checked = on; }
      renderBulk();
    }

    /* ---------- danh sách (vẽ dần) ---------- */
    function computeEntries() {
      if (folderView()) {
        S.searchError = '';
        const lf = SDT.listFolder(S.data, curFolderId(), curSort());
        return { entries: lf.folders.map(f => ({ kind: 'f', item: f })).concat(lf.bookmarks.map(b => ({ kind: 'b', item: b }))), f: lf.folders.length, b: lf.bookmarks.length };
      }
      const q = Object.assign({}, S.q, { folder: S.view === 'all' ? 'all' : S.view === 'root' ? 'root' : S.view, sort: curSort() });
      const res = SDT.search(S.data, q);
      S.searchError = res.error || '';
      return { entries: res.items.map(b => ({ kind: 'b', item: b })), f: 0, b: res.items.length };
    }
    function renderList(keepScroll) {
      const sc = scroller();
      const top = keepScroll ? sc.scrollTop : 0;
      const keepShown = keepScroll ? S.shown : 0;
      const c = computeEntries();
      S.entries = c.entries;
      renderHead(c);
      const list = $('list');
      list.textContent = '';
      if (S.observer) { S.observer.disconnect(); S.observer = null; }
      S.stats = folderView() ? SDT.folderTotals(S.data) : new Map();
      S.kids = folderView() ? SDT.childMap(S.data) : null;
      S.hlOn = searching() && !S.searchError && !!(String(S.q.text || '').trim() || String(S.q.title || '').trim() || String(S.q.urlText || '').trim());
      if (!S.data.bookmarks.length && !S.data.folders.length) {
        list.append(h('div', { class: 'empty', 'data-test': 'empty-state' }, h('p', { class: 'empty-t' }, 'Chưa có dấu trang nào'),
          h('p', {}, 'Khi đang xem một trang web, bấm biểu tượng Sổ Dấu Trang để lưu trang đó. Hoặc bấm + để thêm bằng tay.')));
      } else if (!S.entries.length) {
        if (searching()) {
          // Đang tìm trong một thư mục: cho biết nơi khác có bao nhiêu kết quả.
          let elsewhere = 0;
          const scoped = S.view !== 'all' && S.view !== 'root' && S.q.scope !== 'all';
          if (scoped && !S.searchError) elsewhere = SDT.search(S.data, Object.assign({}, S.q, { folder: 'all', scope: 'all' })).items.length;
          list.append(h('div', { class: 'empty', 'data-test': 'empty-state' }, h('p', { class: 'empty-t' }, 'Không tìm thấy'),
            h('p', {}, scoped ? 'Không có dấu trang nào khớp trong thư mục này.' : 'Không có dấu trang nào thỏa mọi điều kiện đang đặt.'),
            h('div', { class: 'empty-acts' },
              scoped && elsewhere ? h('button', { type: 'button', class: 'btn primary', 'data-test': 'empty-scope-all', onclick: () => { S.q.scope = 'all'; renderAll(false); } }, 'Xem ' + elsewhere + ' kết quả ở thư mục khác') : null,
              h('button', { type: 'button', class: 'btn quiet', 'data-test': 'btn-clear-filter', onclick: clearAllFilters }, 'Xóa bộ lọc'))));
        } else if (folderView()) {
          list.append(h('div', { class: 'empty', 'data-test': 'empty-state' }, h('p', { class: 'empty-t' }, 'Thư mục trống'),
            h('div', { class: 'empty-acts' },
              h('button', { type: 'button', class: 'btn quiet', 'data-test': 'empty-add-bm', onclick: () => openEditor(null) }, icon('plus'), 'Thêm dấu trang'),
              h('button', { type: 'button', class: 'btn quiet', 'data-test': 'empty-add-folder', onclick: () => newFolder(curFolderId()) }, icon('folderPlus'), 'Thêm thư mục'))));
        } else {
          list.append(h('div', { class: 'empty', 'data-test': 'empty-state' }, h('p', { class: 'empty-t' }, 'Chưa có dấu trang nào')));
        }
      } else {
        S.shown = 0;
        appendMore(Math.max(PAGE, keepShown));
      }
      renderBulk();
      updateFilterBadge();
      if (keepScroll) sc.scrollTop = top; else if (sc.scrollTop > 0 && !keepScroll) sc.scrollTop = 0;
      scheduleSave();
    }
    function appendMore(n) {
      const list = $('list');
      const old = list.querySelector('.sentinel');
      if (old) old.remove();
      const end = Math.min(S.entries.length, S.shown + (n || PAGE));
      const fFrag = document.createDocumentFragment();
      let group = list.querySelector('.group:last-of-type');
      for (let i = S.shown; i < end; i++) {
        const e = S.entries[i];
        const wantGroup = e.kind === 'f' ? 'gf' : 'gb';
        if (!group || !group.classList.contains(wantGroup)) {
          group = h('div', { class: 'group ' + wantGroup });
          fFrag.append(group);
        }
        group.append(e.kind === 'f' ? folderRow(e.item, S.stats) : bookmarkRow(e.item));
      }
      list.append(fFrag);
      S.shown = end;
      if (S.shown < S.entries.length) {
        const sen = h('div', { class: 'sentinel', 'data-test': 'list-more' }, 'Đang hiện ' + S.shown + ' / ' + S.entries.length);
        list.append(sen);
        if (typeof IntersectionObserver !== 'undefined') {
          S.observer = new IntersectionObserver(es => { if (es.some(x => x.isIntersecting)) { S.observer.disconnect(); S.observer = null; appendMore(PAGE); } }, { rootMargin: '600px' });
          S.observer.observe(sen);
        }
      }
    }
    function renderBulk() {
      const bar = $('bulkbar');
      bar.textContent = '';
      bar.hidden = !S.selectMode;
      container.classList.toggle('selecting', S.selectMode);
      if (!S.selectMode) return;
      const items = [...S.selected.values()];
      const none = !items.length;
      const onlyB = items.every(i => i.kind === 'b');
      const bb = (test, label, ic, fn, extra) => h('button', Object.assign({ type: 'button', class: 'bbtn', 'data-test': test, disabled: none, onclick: fn }, extra || {}), icon(ic), h('span', {}, label));
      bar.append(
        h('div', { class: 'bulk-top' },
          h('span', { class: 'bulk-n', 'data-test': 'bulk-count' }, items.length + ' đã chọn'),
          h('button', { type: 'button', class: 'link small', 'data-test': 'bulk-all', onclick: () => { for (const e of S.entries) S.selected.set(keyOf({ kind: e.kind, id: e.item.id }), { kind: e.kind, id: e.item.id }); renderList(true); } }, 'Chọn hết'),
          h('span', { class: 'grow' }),
          h('button', { type: 'button', class: 'link small', 'data-test': 'bulk-cancel', onclick: () => { S.selectMode = false; S.selected.clear(); renderList(true); } }, 'Xong')),
        h('div', { class: 'bulk-acts' },
          bb('bulk-tag', 'Nhãn', 'tag', () => bulkTag(items), { disabled: none || !onlyB }),
          bb('bulk-move', 'Chuyển', 'move', () => moveItemsDlg(items)),
          bb('bulk-cut', 'Cắt', 'cut', () => setClip('cut', items)),
          bb('bulk-copy', 'Sao chép', 'copy', () => setClip('copy', items)),
          bb('bulk-replace', 'Đổi chữ', 'edit', () => openReplace(items.filter(i => i.kind === 'b').map(i => i.id)), { disabled: none || !items.some(i => i.kind === 'b') }),
          bb('bulk-delete', 'Xóa', 'trash', () => deleteItemsDlg(items), { class: 'bbtn danger-text' })));
    }
    function updateFilterBadge() {
      const n = filterCount();
      const fb = $('btn-filter');
      const old = fb.querySelector('.badge');
      if (old) old.remove();
      if (n) fb.append(h('span', { class: 'badge', 'data-test': 'filter-badge' }, String(n)));
      fb.classList.toggle('on', !!n);
      fb.setAttribute('aria-label', n ? 'Lọc (' + n + ' điều kiện)' : 'Lọc');
    }
    function renderBanner() {
      const el = $('banner');
      el.textContent = '';
      if (!S.readOnly) {
        // Lời nhắc của môi trường chạy (bản Soul: chưa cài script Kho…)
        const n = env.notice ? env.notice() : null;
        if (n) el.append(h('div', { class: 'banner info', role: 'status', 'data-test': 'env-banner' },
          h('p', { class: 'banner-t' }, n.title),
          h('p', {}, n.text),
          n.action ? h('div', { class: 'banner-acts' },
            h('button', { type: 'button', class: 'btn quiet small', 'data-test': 'env-banner-act', onclick: n.action.fn }, n.action.label)) : null));
        return;
      }
      el.append(h('div', { class: 'banner', role: 'alert', 'data-test': 'error-banner' },
        h('p', { class: 'banner-t' }, 'Không đọc được dữ liệu đã lưu'),
        h('p', {}, S.loadError + ' Để không làm mất dữ liệu, Sổ Dấu Trang sẽ không ghi đè lên dữ liệu cũ.'),
        h('p', {}, 'Hãy xuất dữ liệu thô để giữ lại, rồi nhập một tệp sao lưu bằng cách “Thay thế toàn bộ”.'),
        h('div', { class: 'banner-acts' },
          h('button', { type: 'button', class: 'btn quiet small', 'data-test': 'banner-export-raw', onclick: exportRaw }, 'Xuất dữ liệu thô'),
          h('button', { type: 'button', class: 'btn quiet small', 'data-test': 'banner-backup', onclick: openBackup }, 'Mở sao lưu'))));
    }
    function renderAll(keepScroll) { renderBanner(); renderTree(); renderList(keepScroll); }

    /* ---------- menu ---------- */
    const at = e => (e && e.clientX !== undefined && (e.clientX || e.clientY) ? { x: e.clientX, y: e.clientY } : null);
    function targetsFor(it) {
      // Bấm menu trên một dòng đang được chọn → áp dụng cho cả nhóm đang chọn.
      if (S.selectMode && S.selected.has(keyOf(it)) && S.selected.size > 1) return [...S.selected.values()];
      return [it];
    }
    function pasteItem(afterIt) {
      if (!S.clip || !canPasteHere()) return null;
      return { label: 'Dán ' + S.clip.items.length + ' mục vào sau', icon: 'paste', test: 'm-paste', onSelect: () => pasteInto(curFolderId(), { after: afterIt }) };
    }
    function bookmarkMenu(id, row, e) {
      const b = bookmarkById(id);
      if (!b) return;
      const it = { kind: 'b', id };
      contextMenu([
        { label: 'Mở trong tab mới', icon: 'open', test: 'm-open', onSelect: () => { if (!SDT.safeUrl(b.url)) return; env.openUrl ? env.openUrl(b.url) : window.open(b.url, '_blank', 'noopener'); } },
        { label: 'Sửa', icon: 'edit', test: 'm-edit', onSelect: () => openEditor(id) },
        { label: 'Chép địa chỉ', icon: 'link', test: 'm-copyurl', onSelect: async () => toast((await copyText(b.url)) ? 'Đã chép địa chỉ.' : 'Không chép được.') },
        'sep',
        { label: 'Cắt', icon: 'cut', test: 'm-cut', hint: 'Ctrl+X', onSelect: () => setClip('cut', targetsFor(it)) },
        { label: 'Sao chép', icon: 'copy', test: 'm-copy', hint: 'Ctrl+C', onSelect: () => setClip('copy', targetsFor(it)) },
        pasteItem(it),
        { label: 'Chuyển vào…', icon: 'move', test: 'm-move', onSelect: () => moveItemsDlg(targetsFor(it)) },
        { label: 'Chọn', icon: 'select', test: 'm-select', onSelect: () => { S.selectMode = true; S.selected.set(keyOf(it), it); renderList(true); } },
        'sep',
        { label: 'Xóa', icon: 'trash', test: 'm-delete', danger: true, hint: 'Delete', onSelect: () => deleteItemsDlg(targetsFor(it)) },
      ], at(e), b.title);
    }
    function folderMenu(id, row, e) {
      const f = SDT.getFolder(S.data, id);
      if (!f) return;
      const it = { kind: 'f', id };
      contextMenu([
        { label: 'Mở', icon: 'folder', test: 'm-open', onSelect: () => goView(id) },
        { label: 'Thư mục con mới', icon: 'folderPlus', test: 'm-newsub', onSelect: () => newFolder(id) },
        { label: 'Đổi tên', icon: 'edit', test: 'm-rename', onSelect: () => renameFolderDlg(id) },
        'sep',
        { label: 'Cắt', icon: 'cut', test: 'm-cut', onSelect: () => setClip('cut', targetsFor(it)) },
        { label: 'Sao chép', icon: 'copy', test: 'm-copy', onSelect: () => setClip('copy', targetsFor(it)) },
        S.clip ? { label: 'Dán vào thư mục này', icon: 'paste', test: 'm-paste-into', onSelect: () => pasteInto(id, 'end') } : null,
        row && S.clip && canPasteHere() ? pasteItem(it) : null,
        { label: 'Chuyển vào…', icon: 'move', test: 'm-move', onSelect: () => moveItemsDlg(targetsFor(it)) },
        row ? { label: 'Chọn', icon: 'select', test: 'm-select', onSelect: () => { S.selectMode = true; S.selected.set(keyOf(it), it); renderList(true); } } : null,
        'sep',
        { label: 'Xóa thư mục', icon: 'trash', test: 'm-delete', danger: true, onSelect: () => (targetsFor(it).length > 1 ? deleteItemsDlg(targetsFor(it)) : deleteFolderDlg(id)) },
      ], at(e), f.name);
    }
    function backgroundMenu(e) {
      contextMenu([
        { label: 'Dấu trang mới', icon: 'plus', test: 'm-newbm', onSelect: () => openEditor(null) },
        { label: 'Thư mục mới', icon: 'folderPlus', test: 'm-newfolder', onSelect: () => newFolder(folderView() ? curFolderId() : null) },
        S.clip && canPasteHere() ? { label: 'Dán ' + S.clip.items.length + ' mục', icon: 'paste', test: 'm-paste', onSelect: () => pasteInto(curFolderId(), 'end') } : null,
      ], at(e));
    }

    /* ---------- cắt / chép / dán ---------- */
    function setClip(mode, items) {
      S.clip = { mode, items: items.map(i => ({ kind: i.kind, id: i.id })) };
      S.selectMode = false; S.selected.clear();
      renderList(true);
      toast((mode === 'cut' ? 'Đã cắt ' : 'Đã chép ') + items.length + ' mục. Mở thư mục cần đến rồi chọn Dán.');
    }
    async function pasteInto(folderId, pos) {
      if (!S.clip) return;
      const now = Date.now();
      const r = S.clip.mode === 'cut' ? SDT.placeItems(S.data, S.clip.items, folderId, pos, now) : SDT.copyItems(S.data, S.clip.items, folderId, pos, now);
      if (!r.ok) { toast(r.error, { error: true }); return; }
      const n = S.clip.mode === 'cut' ? r.moved : r.copied;
      const skipped = r.skipped || 0;
      const wasCut = S.clip.mode === 'cut';
      if (!n) { if (wasCut) S.clip = null; toast('Không còn mục nào để dán.', { error: true }); renderList(true); return; }
      const clip = S.clip;
      if (wasCut) S.clip = null;                     // để danh sách vẽ lại không còn mờ "đã cắt"
      if (!(await commit(r.data, { undo: 'Đã dán ' + n + ' mục' + (skipped ? ' (bỏ qua ' + skipped + ' mục không còn)' : '') + '.' })) && wasCut) { S.clip = clip; renderList(true); }
    }

    /* ---------- thư mục ---------- */
    async function newFolder(parentId) {
      const name = await promptDialog({
        title: parentId ? 'Thư mục con trong “' + SDT.getFolder(S.data, parentId).name + '”' : 'Thư mục mới', label: 'Tên thư mục', okText: 'Tạo thư mục', test: 'dlg-folder-name',
        validate: v => { const r = SDT.validateFolderName(S.data, v, parentId, null); return r.ok ? null : r.error; },
      });
      if (name === null) return;
      const r = SDT.addFolder(S.data, name, parentId, Date.now());
      if (!r.ok) { toast(r.error, { error: true }); return; }
      if (parentId) S.expanded.add(parentId);
      if (await commit(r.data)) toast('Đã tạo thư mục “' + r.folder.name + '”.');
    }
    async function createFolderFromPicker(name, parentId) {
      const r = SDT.addFolder(S.data, name, parentId, Date.now());
      if (!r.ok) return r;
      if (!(await commit(r.data, { keepScroll: true }))) return { ok: false, error: 'Không lưu được.' };
      return r;
    }
    async function renameFolderDlg(id) {
      const f = SDT.getFolder(S.data, id);
      const name = await promptDialog({
        title: 'Đổi tên thư mục', label: 'Tên mới', value: f.name, okText: 'Đổi tên', test: 'dlg-folder-rename',
        validate: v => { const r = SDT.validateFolderName(S.data, v, f.parentId, id); return r.ok ? null : r.error; },
      });
      if (name === null) return;
      const r = SDT.renameFolder(S.data, id, name);
      if (!r.ok) { toast(r.error, { error: true }); return; }
      if (await commit(r.data, { keepScroll: true })) toast('Đã đổi tên thành “' + SDT.getFolder(S.data, id).name + '”.');
    }
    async function moveItemsDlg(items) {
      const disabled = new Set();
      for (const it of items) if (it.kind === 'f') { disabled.add(it.id); for (const d of SDT.descendantIds(S.data, it.id)) disabled.add(d); }
      const r = await pickFolder({ data: S.data, selected: curFolderId(), disabled, title: 'Chuyển ' + items.length + ' mục vào', okText: 'Chuyển vào đây', onCreate: createFolderFromPicker });
      if (!r) return;
      const m = SDT.placeItems(S.data, items, r.id, 'end', Date.now());
      if (!m.ok) { toast(m.error, { error: true }); return; }
      S.selectMode = false; S.selected.clear();
      await commit(m.data, { keepScroll: true, undo: 'Đã chuyển ' + m.moved + ' mục vào ' + SDT.folderLabel(m.data, r.id) + '.' });
    }
    async function deleteFolderDlg(id) {
      const f = SDT.getFolder(S.data, id);
      const c = SDT.folderContent(S.data, id);
      const parentName = f.parentId ? '“' + SDT.getFolder(S.data, f.parentId).name + '”' : '“' + SDT.ROOT_NAME + '”';
      let r;
      if (!c.folders && !c.bookmarks) {
        const ok = await confirmDialog({ title: 'Xóa thư mục “' + f.name + '”?', message: 'Thư mục này đang trống.', okText: 'Xóa thư mục', danger: true, test: 'dlg-delete-folder' });
        if (!ok) return;
        r = SDT.deleteFolder(S.data, id, 'move', Date.now());
      } else {
        const parts = [];
        if (c.bookmarks) parts.push(c.bookmarks + ' dấu trang');
        if (c.folders) parts.push(c.folders + ' thư mục con');
        const moveR = h('input', { type: 'radio', name: 'delmode', value: 'move', checked: true, 'data-test': 'del-mode-move' });
        const allR = h('input', { type: 'radio', name: 'delmode', value: 'all', 'data-test': 'del-mode-all' });
        const body = h('div', { class: 'radios' },
          h('label', { class: 'radio' }, moveR, h('span', {}, 'Chuyển nội dung lên ' + parentName)),
          h('label', { class: 'radio' }, allR, h('span', {}, 'Xóa hết, kể cả dấu trang và thư mục con bên trong')));
        const v = await openDialog({
          title: 'Xóa thư mục “' + f.name + '”?', test: 'dlg-delete-folder', message: 'Thư mục này còn ' + parts.join(' và ') + '.', body,
          actions: [{ label: 'Hủy', value: null, test: 'dlg-cancel' }, { label: 'Xóa thư mục', value: 'ok', kind: 'danger', test: 'dlg-ok' }],
        });
        if (v !== 'ok') return;
        r = SDT.deleteFolder(S.data, id, allR.checked ? 'all' : 'move', Date.now());
      }
      if (!r.ok) { toast(r.error, { error: true }); return; }
      if (S.view === id || (!['all', 'root'].includes(S.view) && !SDT.getFolder(r.data, S.view))) S.view = f.parentId && SDT.getFolder(r.data, f.parentId) ? f.parentId : 'root';
      await commit(r.data, { keepScroll: true, undo: r.removedBookmarks ? 'Đã xóa thư mục và ' + r.removedBookmarks + ' dấu trang.' : 'Đã xóa thư mục “' + f.name + '”.' });
    }
    async function deleteItemsDlg(items) {
      const nf = items.filter(i => i.kind === 'f').length;
      if (nf === 1 && items.length === 1) return deleteFolderDlg(items[0].id);
      if (nf) {
        const ok = await confirmDialog({ title: 'Xóa ' + items.length + ' mục?', message: 'Gồm ' + nf + ' thư mục và mọi thứ bên trong chúng.', okText: 'Xóa', danger: true, test: 'dlg-delete-items' });
        if (!ok) return;
      } else if (items.length >= BULK_CONFIRM) {
        const ok = await confirmDialog({ title: 'Xóa ' + items.length + ' dấu trang?', message: 'Sau khi xóa có nút Hoàn tác trong ít giây.', okText: 'Xóa ' + items.length + ' dấu trang', danger: true, test: 'dlg-delete-items' });
        if (!ok) return;
      }
      const r = SDT.deleteItems(S.data, items);
      S.selectMode = false; S.selected.clear();
      const label = items.length === 1 && items[0].kind === 'b' ? 'Đã xóa “' + ((bookmarkById(items[0].id) || {}).title || '') + '”.' : 'Đã xóa ' + items.length + ' mục.';
      await commit(r.data, { keepScroll: true, undo: label, undoMs: items.length >= BULK_CONFIRM ? 12000 : 0 });
    }
    /* ---------- dấu trang trùng (2.5.0) ---------- */
    function openDuplicates() {
      const PAGE_G = 30;
      const st = { mode: 'url', keep: { url: new Map(), title: new Map() }, skip: { url: new Set(), title: new Set() }, shown: PAGE_G, groups: [] };
      const modeSeg = seg('dup-mode', [['url', 'Trùng địa chỉ'], ['title', 'Trùng tên']], 'url', 'dup-mode');
      const merge = h('input', { type: 'checkbox', 'data-test': 'dup-merge-tags', checked: true });
      const summary = h('p', { class: 'dup-sum', 'data-test': 'dup-summary', role: 'status' });
      const allBtn = h('button', { type: 'button', class: 'btn danger', 'data-test': 'dup-apply-all' }, 'Áp dụng tất cả');
      const list = h('div', { class: 'dup-list' });
      const body = h('div', { class: 'dups' },
        modeSeg,
        h('label', { class: 'optrow' }, merge, h('span', {}, h('b', {}, 'Gộp nhãn vào mục giữ lại'), h('small', {}, 'Nhãn của mục bị xóa được thêm vào mục giữ lại.'))),
        h('div', { class: 'dup-bar' }, summary, allBtn),
        list);
      const keepMap = () => st.keep[st.mode];
      const isKept = (g, b) => { const m = keepMap(); return m.has(b.id) ? m.get(b.id) : b === g.items[0]; };
      const visible = () => st.groups.filter(g => !st.skip[st.mode].has(g.key));
      const planOf = gs => gs.map(g => ({ keep: g.items.filter(b => isKept(g, b)).map(b => b.id), remove: g.items.filter(b => !isKept(g, b)).map(b => b.id) }));
      const extraCount = gs => planOf(gs).reduce((n, p) => n + p.remove.length, 0);
      function recompute() { st.groups = SDT.findDuplicates(S.data, st.mode); }
      function renderSummary() {
        const vg = visible();
        const extra = vg.reduce((n, g) => n + g.items.length - 1, 0);
        const rm = extraCount(vg);
        summary.textContent = vg.length ? 'Có ' + vg.length + ' nhóm trùng, ' + extra + ' dấu trang thừa.' : 'Không có dấu trang ' + (st.mode === 'url' ? 'trùng địa chỉ.' : 'trùng tên.');
        allBtn.textContent = 'Áp dụng tất cả (xóa ' + rm + ')';
        allBtn.disabled = !rm || S.readOnly;
      }
      function field(cls, test, text, differ) { return h('div', { class: 'df ' + cls + (differ ? ' diff' : ''), 'data-test': test }, text); }
      function renderGroup(g) {
        const differs = k => new Set(g.items.map(k)).size > 1;
        const dTitle = differs(b => b.title), dUrl = differs(b => b.url), dFolder = differs(b => b.folderId || ''),
          dTags = differs(b => b.tags.map(SDT.lower).sort().join(',')), dC = differs(b => b.createdAt), dU = differs(b => b.updatedAt);
        const rmN = g.items.filter(b => !isKept(g, b)).length;
        const el = h('section', { class: 'dgroup', 'data-test': 'dup-group', 'data-key': g.key },
          h('div', { class: 'dg-head' }, h('b', {}, g.items.length + ' mục'), h('span', { class: 'dg-key' }, g.key)),
          h('div', { class: 'dg-items' }, ...g.items.map(b => {
            const kept = isKept(g, b);
            const cb = h('input', { type: 'checkbox', 'data-test': 'dup-keep', checked: kept });
            cb.addEventListener('change', () => {
              const m = keepMap();
              m.set(b.id, cb.checked);
              if (!g.items.some(x => isKept(g, x))) { m.set(b.id, true); toast('Mỗi nhóm phải giữ lại ít nhất một mục.', { error: true }); }
              el.replaceWith(renderGroup(g)); renderSummary();
            });
            return h('article', { class: 'ditem' + (kept ? ' kept' : ''), 'data-test': 'dup-item', 'data-id': b.id },
              h('label', { class: 'dkeep' }, cb, h('span', {}, kept ? 'Giữ' : 'Xóa')),
              h('div', { class: 'dbody' },
                h('a', { class: 'df dt' + (dTitle ? ' diff' : ''), 'data-test': 'dup-open', href: SDT.safeUrl(b.url) ? b.url : null, target: '_blank', rel: 'noopener noreferrer',
                  onclick: e => { if (!SDT.safeUrl(b.url)) { e.preventDefault(); return; } if (env.openUrl) { e.preventDefault(); env.openUrl(b.url); } } }, b.title),
                field('du', 'dup-url', b.url, dUrl),
                field('dp', 'dup-folder', '📁 ' + SDT.folderLabel(S.data, b.folderId), dFolder),
                h('div', { class: 'df dtags' + (dTags ? ' diff' : '') }, ...(b.tags.length ? b.tags.map(t => h('span', { class: 'tag ' + tagClass(S.data, t) }, t)) : [h('span', { class: 'muted' }, 'Không có nhãn')])),
                field('dd', 'dup-dates', 'Tạo ' + SDT.formatDateTime(b.createdAt) + ' · Sửa ' + SDT.formatDateTime(b.updatedAt), dC || dU)));
          })),
          h('div', { class: 'dg-acts' },
            h('button', { type: 'button', class: 'btn quiet small', 'data-test': 'dup-skip', onclick: () => { st.skip[st.mode].add(g.key); render(); } }, 'Bỏ qua nhóm này'),
            h('button', { type: 'button', class: 'btn danger small', 'data-test': 'dup-apply-group', disabled: !rmN || S.readOnly, onclick: () => apply([g]) }, rmN ? 'Xóa ' + rmN + ' mục không giữ' : 'Không có mục để xóa')));
        return el;
      }
      function render() {
        list.textContent = '';
        const vg = visible();
        for (const g of vg.slice(0, st.shown)) list.append(renderGroup(g));
        if (vg.length > st.shown) list.append(h('button', { type: 'button', class: 'btn quiet', 'data-test': 'dup-more', onclick: () => { st.shown += PAGE_G; render(); } }, 'Xem thêm ' + Math.min(PAGE_G, vg.length - st.shown) + ' nhóm'));
        renderSummary();
      }
      async function apply(gs) {
        const plan = planOf(gs);
        const n = plan.reduce((k, p) => k + p.remove.length, 0);
        if (!n) return;
        const r = SDT.resolveDuplicates(S.data, plan, merge.checked, Date.now());
        if (await commit(r.data, { keepScroll: true, undo: 'Đã xóa ' + r.removed + ' dấu trang trùng.' + (r.tagged ? ' Gộp nhãn vào ' + r.tagged + ' mục giữ lại.' : '') })) { recompute(); render(); }
      }
      allBtn.addEventListener('click', async () => {
        const vg = visible(); const n = extraCount(vg);
        if (!n) return;
        const ok = await confirmDialog({ title: 'Xóa dấu trang trùng?', message: 'Xóa ' + n + ' dấu trang không giữ trong ' + vg.length + ' nhóm. Có thể hoàn tác ngay sau đó.', okText: 'Xóa ' + n + ' mục', danger: true, test: 'dlg-dup-all' });
        if (ok) await apply(vg);
      });
      modeSeg.addEventListener('change', () => { st.mode = segValue(body, 'dup-mode') || 'url'; st.shown = PAGE_G; recompute(); render(); });
      // Hoàn tác từ thông báo: tính lại khi dữ liệu đổi.
      const unsub = store.onChange ? store.onChange(() => setTimeout(() => { recompute(); render(); }, 0)) : null;
      recompute(); render();
      openDialog({ title: 'Dấu trang trùng', test: 'dlg-dups', sheet: true, wide: true, cls: 'tall', body,
        actions: [{ label: 'Xong', value: null, test: 'dup-close', kind: 'quiet' }],
        onClose: () => { if (typeof unsub === 'function') unsub(); } });
    }

    /* ---------- đổi chữ hàng loạt (tên / địa chỉ) ---------- */
    async function openReplace(ids) {
      if (!ids.length) return;
      const q = S.q;
      const pre = q.urlText.trim() ? { field: 'url', find: q.urlText.trim() } : q.title.trim() ? { field: 'title', find: q.title.trim() } : { field: 'url', find: q.text.trim() };
      const find = h('input', { type: 'text', 'data-test': 'rp-find', value: pre.find, placeholder: 'Ví dụ: www.sangtacviet.com', autocomplete: 'off', spellcheck: 'false' });
      const withEl = h('input', { type: 'text', 'data-test': 'rp-with', value: '', placeholder: 'Ví dụ: www.sangtacviet.app', autocomplete: 'off', spellcheck: 'false' });
      const fieldSeg = seg('rp-field', [['url', 'Địa chỉ'], ['title', 'Tên'], ['both', 'Cả hai']], pre.field, 'rp-field');
      const opt = (test, label, hint, checked) => {
        const cb = h('input', { type: 'checkbox', 'data-test': test, checked });
        return { cb, el: h('label', { class: 'optrow' }, cb, h('span', {}, h('b', {}, label), h('small', {}, hint))) };
      };
      const oCase = opt('rp-case', 'Aa  Phân biệt hoa thường', 'Chỉ đổi chỗ viết đúng hoa thường.', !!q.caseSensitive);
      const oRegex = opt('rp-regex', '.*  Regex', 'Dùng $1, $2… trong “Thay bằng” để giữ phần đã bắt.', !!q.regex);
      const info = h('p', { class: 'rp-info', 'data-test': 'rp-preview', role: 'status' });
      const list = h('div', { class: 'rp-samples' });
      const body = h('div', { class: 'filter rp' },
        h('p', { class: 'muted' }, 'Áp dụng cho ' + ids.length + ' dấu trang. Mục không chứa chữ cần tìm giữ nguyên.'),
        h('section', {}, h('span', { class: 'lab' }, 'Đổi ở'), fieldSeg),
        h('section', {}, h('label', { class: 'field' }, h('span', { class: 'lab' }, 'Tìm'), find)),
        h('section', {}, h('label', { class: 'field' }, h('span', { class: 'lab' }, 'Thay bằng'), withEl)),
        h('section', {}, oCase.el, oRegex.el),
        h('section', {}, info, list));
      const opts = () => ({ field: segValue(body, 'rp-field') || 'url', find: find.value, replace: withEl.value, caseSensitive: oCase.cb.checked, regex: oRegex.cb.checked });
      let last = null, timer = 0, okBtn = null;
      const preview = () => {
        const r = last = SDT.bulkReplace(S.data, ids, opts(), Date.now());
        list.textContent = '';
        info.classList.toggle('err', !r.ok);
        if (!r.ok) { info.textContent = r.error; }
        else {
          const bits = [r.changed ? 'Sẽ đổi ' + r.changed + ' dấu trang.' : 'Không có dấu trang nào đổi.'];
          if (r.skipped.length) bits.push('Bỏ qua ' + r.skipped.length + ' mục (' + r.skipped[0].reason + (r.skipped.length > 1 ? '…' : '') + ').');
          if (r.dups) bits.push(r.dups + ' mục sẽ trùng địa chỉ với dấu trang khác.');
          info.textContent = bits.join(' ');
          const f = opts().field;
          for (const x of r.samples) {
            const lines = [];
            if (f !== 'title' && x.before.url !== x.after.url) lines.push([x.before.url, x.after.url]);
            if (f !== 'url' && x.before.title !== x.after.title) lines.push([x.before.title, x.after.title]);
            for (const [a, b2] of lines) list.append(h('div', { class: 'rp-row', 'data-test': 'rp-sample' }, h('s', {}, a), h('span', { class: 'rp-arrow' }, '→'), h('b', {}, b2)));
          }
        }
        if (okBtn) {
          const n = r.ok ? r.changed : 0;
          okBtn.disabled = !n;
          okBtn.textContent = n ? 'Đổi ' + n + ' dấu trang' : 'Đổi';
        }
      };
      const later = () => { clearTimeout(timer); timer = setTimeout(preview, 150); };
      for (const el of [find, withEl]) el.addEventListener('input', later);
      for (const el of [fieldSeg, oCase.cb, oRegex.cb]) el.addEventListener('change', preview);
      let ready = null;
      const v = await openDialog({
        title: 'Đổi chữ hàng loạt', test: 'dlg-replace-text', sheet: true, wide: true, body,
        actions: [{ label: 'Hủy', value: null, test: 'rp-cancel', kind: 'quiet' }, { label: 'Đổi', value: 'go', kind: 'primary', test: 'rp-ok', cls: 'grow' }],
        onOpen: api => { okBtn = api.el.querySelector('[data-test="rp-ok"]'); preview(); },
        onAction: async () => {
          clearTimeout(timer);
          const r = SDT.bulkReplace(S.data, ids, opts(), Date.now());
          if (!r.ok) return r.error;
          if (!r.changed) return 'Không có dấu trang nào đổi.';
          ready = r;
          return true;
        },
      });
      // Ghi sau khi hộp đã đóng để thông báo (kèm Hoàn tác) không mất theo hộp.
      if (v !== 'go' || !ready) return;
      const r = ready;
      const extra = (r.skipped.length ? ' Bỏ qua ' + r.skipped.length + ' mục.' : '') + (r.dups ? ' ' + r.dups + ' mục trùng địa chỉ với dấu trang khác.' : '');
      if (r.changed > 500) { toast('Đang đổi ' + r.changed + ' dấu trang…'); await new Promise(res => setTimeout(res, 30)); }
      await commit(r.data, { keepScroll: true, undo: 'Đã đổi ' + r.changed + ' dấu trang.' + extra });
    }

    async function bulkTag(items) {
      const val = await promptDialog({
        title: 'Thêm nhãn cho ' + items.length + ' dấu trang', label: 'Nhãn (cách nhau bằng dấu phẩy)', okText: 'Thêm nhãn', test: 'dlg-bulk-tag',
        validate: v => (SDT.parseTags(v).length ? null : 'Nhập ít nhất một nhãn.'),
      });
      if (val === null) return;
      const r = SDT.bulkAddTags(S.data, items.map(i => i.id), SDT.parseTags(val), Date.now());
      if (!r.ok) { toast(r.error, { error: true }); return; }
      await commit(r.data, { keepScroll: true, undo: 'Đã thêm nhãn.' });
    }

    /* ---------- kéo thả bằng tay nắm ---------- */
    function startDrag(e, it, handleEl) {
      if (e.button !== undefined && e.button !== 0) return;
      e.preventDefault();
      const row = handleEl.closest('[data-row]');
      const rect = row.getBoundingClientRect();
      const line = h('div', { class: 'drop-line', 'data-test': 'drop-line' });
      $('list').append(line);
      S.drag = { it, row, startY: e.clientY, offset: e.clientY - rect.top, target: null, y: e.clientY, x: e.clientX, raf: 0, line };
      row.classList.add('dragging');
      try { handleEl.setPointerCapture(e.pointerId); } catch (err) { /* bỏ qua */ }
      const move = ev => { S.drag.x = ev.clientX; S.drag.y = ev.clientY; dragUpdate(); ev.preventDefault(); };
      const up = () => { finish(true); };
      const cancel = () => { finish(false); };
      const key = ev => { if (ev.key === 'Escape') { ev.preventDefault(); finish(false); } };
      function finish(drop) {
        handleEl.removeEventListener('pointermove', move);
        handleEl.removeEventListener('pointerup', up);
        handleEl.removeEventListener('pointercancel', cancel);
        window.removeEventListener('keydown', key, true);
        cancelAnimationFrame(S.drag.raf);
        const d = S.drag;
        S.drag = null;
        d.row.classList.remove('dragging');
        d.row.style.transform = '';
        d.line.remove();
        container.querySelectorAll('.drop-into').forEach(x => x.classList.remove('drop-into'));
        if (drop && d.target) applyDrop(d.it, d.target);
      }
      handleEl.addEventListener('pointermove', move);
      handleEl.addEventListener('pointerup', up);
      handleEl.addEventListener('pointercancel', cancel);
      window.addEventListener('keydown', key, true);
      const tick = () => {
        if (!S.drag) return;
        const sc = scroller();
        const vh = window.innerHeight;
        let dy = 0;
        if (S.drag.y < 110) dy = -Math.ceil((110 - S.drag.y) / 6);
        else if (S.drag.y > vh - 70) dy = Math.ceil((S.drag.y - (vh - 70)) / 6);
        if (dy) { sc.scrollTop += dy; dragUpdate(); }
        S.drag.raf = requestAnimationFrame(tick);
      };
      S.drag.raf = requestAnimationFrame(tick);
      dragUpdate();
    }
    function dragUpdate() {
      const d = S.drag;
      if (!d) return;
      const r0 = d.row.getBoundingClientRect();
      d.row.style.transform = 'translateY(' + (d.y - d.offset - r0.top + (parseFloat((d.row.style.transform.match(/-?[\d.]+/) || [0])[0]) || 0)) + 'px)';
      container.querySelectorAll('.drop-into').forEach(x => x.classList.remove('drop-into'));
      d.line.style.display = 'none';
      d.target = null;
      const stack = (rootNode.elementsFromPoint ? rootNode.elementsFromPoint(d.x, d.y) : document.elementsFromPoint(d.x, d.y)) || [];
      const el = stack.find(x => !d.row.contains(x) && container.contains(x));
      if (!el) return;
      const rowEl = el.closest('[data-row]');
      const treeEl = el.closest('.trow[data-drop]');
      if (treeEl && !rowEl) {
        const fid = treeEl.getAttribute('data-drop') || null;
        if (d.it.kind === 'f' && fid && (fid === d.it.id || SDT.descendantIds(S.data, d.it.id).includes(fid))) { d.target = { invalid: true }; return; }
        treeEl.classList.add('drop-into');
        d.target = { into: fid };
        return;
      }
      if (!rowEl || rowEl === d.row) return;
      const kind = rowEl.getAttribute('data-row');
      const id = rowEl.getAttribute('data-id');
      const rr = rowEl.getBoundingClientRect();
      const rel = (d.y - rr.top) / rr.height;
      if (kind === 'f' && rel > 0.25 && rel < 0.75) {
        if (d.it.kind === 'f' && (id === d.it.id || SDT.descendantIds(S.data, d.it.id).includes(id))) { d.target = { invalid: true }; return; }
        rowEl.classList.add('drop-into');
        d.target = { into: id };
        return;
      }
      if (kind !== d.it.kind) return;
      const before = rel < 0.5;
      const lr = $('list').getBoundingClientRect();
      d.line.style.display = 'block';
      d.line.style.top = ((before ? rr.top : rr.bottom) - lr.top - 1) + 'px';
      d.target = before ? { before: id } : { after: id };
    }
    async function applyDrop(it, t) {
      if (t.invalid) { toast('Không thể chuyển thư mục vào chính nó hoặc vào thư mục con của nó.', { error: true }); return; }
      const now = Date.now();
      let r;
      if (t.into !== undefined) r = SDT.placeItems(S.data, [it], t.into, 'end', now);
      else if (t.before) r = SDT.placeItems(S.data, [it], curFolderId(), { before: t.before }, now);
      else r = SDT.placeItems(S.data, [it], curFolderId(), { after: { kind: it.kind, id: t.after } }, now);
      if (!r.ok) { toast(r.error, { error: true }); return; }
      const msg = t.into !== undefined ? 'Đã chuyển vào ' + SDT.folderLabel(r.data, t.into) + '.' : 'Đã đổi chỗ.';
      await commit(r.data, { keepScroll: true, undo: msg });
    }

    /* ---------- thêm / sửa ---------- */
    async function openEditor(id) {
      const old = id ? bookmarkById(id) : null;
      if (id && !old) { toast('Dấu trang này không còn nữa.', { error: true }); return; }
      let force = false;
      let openOld = null;
      const dup = h('div', { class: 'dup', 'data-test': 'dup-warning', hidden: true });
      const form = BookmarkForm({
        prefix: 'bm', getData: () => S.data,
        values: old ? { title: old.title, url: old.url, folderId: old.folderId, tags: old.tags } : { folderId: folderView() ? curFolderId() : null },
        onChange: () => { force = false; dup.hidden = true; }, onCreateFolder: createFolderFromPicker,
      });
      form.fields.url.addEventListener('input', () => { force = false; dup.hidden = true; });
      const meta = old ? h('p', { class: 'meta', 'data-test': 'bm-meta' }, 'Tạo ', h('span', { 'data-test': 'bm-created' }, SDT.formatDateTime(old.createdAt)), ' · Cập nhật ', h('span', { 'data-test': 'bm-updated' }, SDT.formatDateTime(old.updatedAt))) : null;
      let saved = null;
      const v = await openDialog({
        title: old ? 'Sửa dấu trang' : 'Thêm dấu trang', test: 'dlg-editor', wide: true, sheet: true, enterValue: 'save',
        body: h('div', {}, form.el, dup, meta),
        actions: [{ label: 'Hủy', value: null, test: 'bm-cancel' }, { label: 'Lưu', value: 'save', kind: 'primary', test: 'bm-save' }],
        onOpen: () => { if (!old && !UI.coarse()) form.fields.url.focus(); },
        onAction: async (value, api) => {
          form.showError('');
          const values = form.get();
          const fx = SDT.fixUrl(values.url);
          if (!fx.ok) { form.showError(fx.error); form.fields.url.focus(); return false; }
          // Chỉ cảnh báo trùng khi thêm mới hoặc khi đã đổi địa chỉ.
          const urlChanged = !old || SDT.normalizeUrl(fx.url) !== old.urlKey;
          const others = urlChanged ? SDT.findByUrl(S.data, fx.url, old ? old.id : null) : [];
          if (others.length && !force) {
            const o = others[0];
            dup.textContent = '';
            dup.append(
              h('p', {}, 'Trang này đã lưu ở ', h('strong', {}, SDT.folderLabel(S.data, o.folderId)), ' với tên “' + o.title + '”.'),
              h('div', { class: 'dup-actions' },
                h('button', { type: 'button', class: 'btn quiet small', 'data-test': 'dup-open', onclick: () => { openOld = o.id; api.close(null); } }, 'Mở bản cũ để sửa'),
                h('button', { type: 'button', class: 'btn quiet small', 'data-test': 'dup-force', onclick: () => { force = true; api.run('save'); } }, old ? 'Vẫn lưu' : 'Vẫn lưu thêm')));
            dup.hidden = false;
            return false;
          }
          const now = Date.now();
          const r = old ? SDT.updateBookmark(S.data, old.id, values, now) : SDT.addBookmark(S.data, values, now);
          if (!r.ok) { form.showError(r.error); return false; }
          saved = r;
          return true;
        },
      });
      if (openOld) { openEditor(openOld); return; }
      if (v !== 'save' || !saved) return;
      if (old && !saved.changed) { toast('Không có gì thay đổi.'); return; }
      if (await commit(saved.data, { keepScroll: true })) toast(old ? 'Đã cập nhật dấu trang.' : 'Đã thêm dấu trang.');
    }

    /* ---------- lọc ---------- */
    function clearFilters() {
      S.q = Object.assign(SDT.defaultQuery(), { text: S.q.text });
      S.notice = '';
      renderAll(false);
    }
    function clearAllFilters() {
      S.q = SDT.defaultQuery();
      $('search').value = '';
      S.notice = '';
      renderAll(false);
    }
    function seg(name, options, value, test) {
      return h('div', { class: 'seg', role: 'radiogroup' }, options.map(([v, label]) => h('label', { class: 'seg-o' },
        h('input', { type: 'radio', name, value: v, checked: v === value, 'data-test': test + '-' + v }), h('span', {}, label))));
    }
    function segValue(rootEl, name) { const r = rootEl.querySelector('input[name="' + name + '"]:checked'); return r ? r.value : ''; }
    function openFilter() {
      const q = S.q;
      const title = h('input', { type: 'text', 'data-test': 'filter-title', value: q.title, placeholder: 'Ví dụ: Conan', autocomplete: 'off' });
      const url = h('input', { type: 'text', 'data-test': 'filter-url', value: q.urlText, placeholder: 'Ví dụ: vidu.vn', autocomplete: 'off', spellcheck: 'false' });
      const tags = SDT.tagCounts(S.data);
      const chosen = new Set(q.tags.map(t => t.toLowerCase()));
      const tagBox = h('div', { class: 'tagpick' });
      const tagSearch = tags.length > 20 ? h('input', { type: 'search', class: 'tsearch', 'data-test': 'filter-tag-search', placeholder: 'Tìm nhãn', autocomplete: 'off' }) : null;
      const drawTags = () => {
        tagBox.textContent = '';
        const f = tagSearch ? SDT.fold(tagSearch.value.trim()) : '';
        const shown = tags.filter(t => !f || SDT.fold(t.tag).includes(f) || chosen.has(t.tag.toLowerCase()));
        if (!tags.length) { tagBox.append(h('p', { class: 'muted' }, 'Chưa có nhãn nào.')); return; }
        if (shown.length > 200) tagBox.append(h('p', { class: 'muted', 'data-test': 'filter-tag-more' }, 'Đang hiện 200 trong ' + shown.length + ' nhãn. Gõ vào ô “Tìm nhãn” để thấy nhãn khác.'));
        for (const t of shown.slice(0, 200)) {
          const cb = h('input', { type: 'checkbox', value: t.tag, checked: chosen.has(t.tag.toLowerCase()), 'data-test': 'filter-tag', 'data-tag': t.tag,
            onchange: e => { e.target.checked ? chosen.add(t.tag.toLowerCase()) : chosen.delete(t.tag.toLowerCase()); } });
          tagBox.append(h('label', { class: 'tpick tag ' + tagClass(S.data, t.tag) }, cb, h('span', {}, h('i', { class: 'dot' }), t.tag, h('small', {}, ' ' + t.count))));
        }
      };
      if (tagSearch) tagSearch.addEventListener('input', drawTags);
      drawTags();
      const dateField = h('select', { 'data-test': 'filter-datefield', 'aria-label': 'Loại ngày' }, h('option', { value: 'createdAt' }, 'Ngày tạo'), h('option', { value: 'updatedAt' }, 'Ngày cập nhật'));
      dateField.value = q.dateField;
      const date = h('input', { type: 'date', 'data-test': 'filter-date', value: q.date, 'aria-label': 'Ngày' });
      const month = h('input', { type: 'month', 'data-test': 'filter-month', value: q.month, 'aria-label': 'Tháng' });
      const from = h('input', { type: 'date', 'data-test': 'filter-from', value: q.from, 'aria-label': 'Từ ngày' });
      const to = h('input', { type: 'date', 'data-test': 'filter-to', value: q.to, 'aria-label': 'Đến ngày' });
      const exactBox = h('label', { class: 'field' }, h('span', { class: 'lab' }, 'Ngày'), date);
      const monthBox = h('label', { class: 'field' }, h('span', { class: 'lab' }, 'Tháng'), month);
      const rangeBox = h('div', { class: 'range' }, h('label', { class: 'field' }, h('span', { class: 'lab' }, 'Từ ngày'), from), h('label', { class: 'field' }, h('span', { class: 'lab' }, 'Đến ngày'), to));
      const mode = seg('f-datemode', [['exact', 'Đúng ngày'], ['month', 'Trong tháng'], ['range', 'Khoảng ngày']], q.dateMode, 'filter-datemode');
      const syncMode = () => { const m = segValue(body, 'f-datemode'); exactBox.hidden = m !== 'exact'; monthBox.hidden = m !== 'month'; rangeBox.hidden = m !== 'range'; };
      mode.addEventListener('change', syncMode);
      const inFolder = S.view !== 'all' && S.view !== 'root';
      const opt = (test, label, hint, checked) => {
        const cb = h('input', { type: 'checkbox', 'data-test': test, checked });
        return { cb, el: h('label', { class: 'optrow' }, cb, h('span', {}, h('b', {}, label), h('small', {}, hint))) };
      };
      const oCase = opt('filter-case', 'Aa  Phân biệt hoa thường', '“Conan” không khớp “conan”.', !!q.caseSensitive);
      const oPhrase = opt('filter-phrase', '“…”  Đúng cụm', 'Khớp nguyên cụm đã gõ, liền nhau, kể cả dấu.', !!q.phrase);
      const oRegex = opt('filter-regex', '.*  Regex', 'Biểu thức chính quy, ví dụ: tập \\d+  ·  ^https://vidu\\.vn/  ·  conan|kid', !!q.regex);
      const syncOpts = () => { oPhrase.cb.disabled = oRegex.cb.checked; oPhrase.el.classList.toggle('off', oRegex.cb.checked); };
      oRegex.cb.addEventListener('change', syncOpts);
      syncOpts();
      const body = h('div', { class: 'filter' },
        h('section', {}, h('label', { class: 'field' }, h('span', { class: 'lab' }, 'Tên có chữ'), title)),
        h('section', {}, h('label', { class: 'field' }, h('span', { class: 'lab' }, 'Địa chỉ có chữ'), url)),
        h('section', { 'data-test': 'filter-textmode' }, h('div', { class: 'lab' }, 'Cách so chữ ', h('small', {}, '(cho ô tìm, Tên, Địa chỉ)')), oCase.el, oPhrase.el, oRegex.el),
        h('section', {}, h('div', { class: 'lab' }, 'Nhãn ', h('small', {}, '(có đủ các nhãn chọn)')), tagSearch, tagBox),
        h('section', {}, h('div', { class: 'h3row' }, h('span', { class: 'lab' }, 'Thời gian'),
          h('button', { type: 'button', class: 'link small', 'data-test': 'filter-clear-dates', onclick: () => { date.value = ''; month.value = ''; from.value = ''; to.value = ''; } }, 'Bỏ ngày')),
          dateField, mode, exactBox, monthBox, rangeBox),
        inFolder ? h('section', {}, h('span', { class: 'lab' }, 'Phạm vi'), seg('f-scope', [['folder', 'Thư mục đang xem'], ['all', 'Toàn bộ']], q.scope, 'filter-scope')) : null);
      syncMode();
      openDialog({
        title: 'Lọc dấu trang', test: 'dlg-filter', sheet: true, wide: true, body, noFocus: true,
        actions: [{ label: 'Xóa bộ lọc', value: 'reset', test: 'filter-reset', kind: 'quiet' }, { label: 'Áp dụng', value: 'apply', kind: 'primary', test: 'filter-apply', cls: 'grow' }],
        onAction: value => {
          if (value === 'reset') { clearFilters(); return true; }
          const m = segValue(body, 'f-datemode') || 'exact';
          const r = SDT.normalizeRange(from.value, to.value);
          Object.assign(S.q, {
            title: title.value, urlText: url.value,
            tags: tags.filter(t => chosen.has(t.tag.toLowerCase())).map(t => t.tag),
            dateField: dateField.value, dateMode: m, date: date.value, month: month.value, from: r.from, to: r.to,
            scope: inFolder ? (segValue(body, 'f-scope') || 'folder') : 'folder',
            caseSensitive: oCase.cb.checked, regex: oRegex.cb.checked, phrase: oPhrase.cb.checked && !oRegex.cb.checked,
          });
          S.notice = (m === 'range' && r.swapped) ? 'Ngày “Từ” sau ngày “Đến” nên đã đổi chỗ hai ngày.' : '';
          renderAll(false);
          if (S.notice) toast(S.notice);
          return true;
        },
      });
    }

    /* ---------- nhãn ---------- */
    function openTags() {
      openDialog({
        title: 'Nhãn', test: 'dlg-tags', sheet: true, noFocus: true,
        onOpen: api => {
          const search = h('input', { type: 'search', class: 'tsearch', 'data-test': 'tags-search', placeholder: 'Tìm nhãn', autocomplete: 'off' });
          const box = h('div', { class: 'taglist' });
          const draw = () => {
            box.textContent = '';
            const all = SDT.tagCounts(S.data);
            const f = SDT.fold(search.value.trim());
            const tags = all.filter(t => !f || SDT.fold(t.tag).includes(f));
            if (!all.length) { box.append(h('p', { class: 'muted', 'data-test': 'tags-empty' }, 'Chưa có nhãn nào. Thêm nhãn khi lưu hoặc sửa dấu trang.')); return; }
            if (tags.length > 300) box.append(h('p', { class: 'muted', 'data-test': 'tags-more' }, 'Đang hiện 300 trong ' + tags.length + ' nhãn. Gõ vào ô “Tìm nhãn” để thấy nhãn khác.'));
            for (const t of tags.slice(0, 300)) {
              box.append(h('div', { class: 'tagrow', 'data-test': 'tags-row', 'data-tag': t.tag },
                h('button', { type: 'button', class: 'cdot ' + tagClass(S.data, t.tag), 'data-test': 'tag-color', 'aria-label': 'Đổi màu nhãn ' + t.tag, onclick: async () => { await colorDlg(t.tag); draw(); } }),
                h('button', { type: 'button', class: 'tagrow-name', 'data-test': 'tag-open', onclick: () => { api.close(null); S.q = Object.assign(SDT.defaultQuery(), { tags: [t.tag] }); S.view = 'all'; $('search').value = ''; renderAll(false); } },
                  h('span', { class: 'tag ' + tagClass(S.data, t.tag) }, t.tag), h('span', { class: 'tcount', 'data-test': 'tag-count' }, t.count + ' dấu trang')),
                h('button', { type: 'button', class: 'icon-btn', 'data-test': 'tag-rename', 'aria-label': 'Đổi tên nhãn ' + t.tag, onclick: async () => { await renameTagDlg(t.tag); draw(); } }, icon('edit')),
                h('button', { type: 'button', class: 'icon-btn', 'data-test': 'tag-delete', 'aria-label': 'Xóa nhãn ' + t.tag, onclick: async () => { await deleteTagDlg(t.tag); draw(); } }, icon('trash'))));
            }
          };
          search.addEventListener('input', draw);
          if (SDT.tagCounts(S.data).length > 20) api.body.append(search);
          api.body.append(box);
          draw();
        },
      });
    }
    async function colorDlg(tag) {
      let chosen = null;
      const cur = SDT.tagColor(S.data, tag);
      await openDialog({
        title: 'Màu cho nhãn “' + tag + '”', test: 'dlg-color', noFocus: true,
        onOpen: api => {
          api.body.append(h('div', { class: 'palette' }, SDT.TAG_COLORS.map(c => h('button', {
            type: 'button', class: 'swatch tag tc-' + c + (c === cur ? ' on' : ''), 'data-test': 'color-opt', 'data-color': c, 'aria-pressed': String(c === cur),
            onclick: () => { chosen = c; api.close('ok'); },
          }, h('i', { class: 'dot' }), SDT.TAG_COLOR_NAMES[c]))));
        },
      });
      if (!chosen || chosen === cur) return;
      const r = SDT.setTagColor(S.data, tag, chosen);
      if (r.ok && await commit(r.data, { keepScroll: true })) toast('Đã đổi màu nhãn “' + tag + '”.');
    }
    async function renameTagDlg(tag) {
      const val = await promptDialog({ title: 'Đổi tên nhãn “' + tag + '”', label: 'Tên mới', value: tag, okText: 'Đổi tên', maxlength: '50', test: 'dlg-tag-rename', validate: v => (SDT.cleanTag(v) ? null : 'Nhập tên nhãn mới.') });
      if (val === null) return;
      const r = SDT.renameTag(S.data, tag, val, Date.now());
      if (!r.ok) { toast(r.error, { error: true }); return; }
      S.q.tags = S.q.tags.map(t => (t.toLowerCase() === tag.toLowerCase() ? r.name : t)).filter((t, i, a) => a.findIndex(x => x.toLowerCase() === t.toLowerCase()) === i);
      await commit(r.data, { keepScroll: true, undo: r.merged ? 'Đã gộp vào nhãn “' + r.name + '”.' : 'Đã đổi tên nhãn.' });
    }
    async function deleteTagDlg(tag) {
      const ok = await confirmDialog({ title: 'Xóa nhãn “' + tag + '”?', message: 'Nhãn sẽ được gỡ khỏi mọi dấu trang. Dấu trang vẫn giữ nguyên.', okText: 'Xóa nhãn', danger: true, test: 'dlg-tag-delete' });
      if (!ok) return;
      const r = SDT.deleteTag(S.data, tag, Date.now());
      S.q.tags = S.q.tags.filter(t => t.toLowerCase() !== tag.toLowerCase());
      await commit(r.data, { keepScroll: true, undo: 'Đã xóa nhãn “' + tag + '” khỏi ' + r.changed + ' dấu trang.' });
    }

    /* ---------- sao lưu ---------- */
    function download(name, text, type) {
      const blob = new Blob([text], { type: type || 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = h('a', { href: url, download: name, 'data-test': 'download-link' });
      container.append(a);
      a.click();
      setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 4000);
    }
    function exportData() {
      const now = Date.now();
      download(SDT.exportFileName(now), JSON.stringify(SDT.exportPayload(S.data, now)));
      toast('Đã xuất ' + S.data.bookmarks.length + ' dấu trang.');
    }
    function exportHtmlData() {
      const now = Date.now();
      download(SDT.exportHtmlFileName(now), SDT.exportHtml(S.data, now), 'text/html');
      toast('Đã xuất ' + S.data.bookmarks.length + ' dấu trang ra tệp HTML.');
    }
    async function exportRaw() {
      let raw = S.rawBad;
      try { raw = await store.raw(); } catch (e) { /* dùng bản đã có */ }
      download('so-dau-trang-du-lieu-loi-' + SDT.localDay(Date.now()) + '.json', JSON.stringify(raw === undefined ? null : raw));
    }
    function openBackup() {
      const file = h('input', { type: 'file', accept: '.json,.html,.htm,application/json,text/html', 'data-test': 'backup-file', 'aria-label': 'Chọn tệp sao lưu' });
      const result = h('p', { class: 'result', 'data-test': 'backup-result', role: 'status' });
      const pasteSection = () => {
        const ta = h('textarea', { class: 'paste', 'data-test': 'backup-paste', rows: '4', placeholder: 'Dán dữ liệu đã chép vào đây', 'aria-label': 'Dữ liệu dán' });
        return h('section', {},
          h('h3', {}, 'Chép / dán'),
          h('p', { class: 'muted' }, 'Dùng khi không tải hoặc chọn được tệp. “Chép dữ liệu” đưa toàn bộ dữ liệu vào bộ nhớ tạm; dán vào ô dưới ở máy khác rồi bấm Nhập (theo cách Gộp/Thay thế đã chọn ở trên).'),
          h('button', { type: 'button', class: 'btn quiet', 'data-test': 'backup-copy', disabled: S.readOnly, onclick: async () => {
            const ok = await copyText(JSON.stringify(SDT.exportPayload(S.data, Date.now())));
            toast(ok ? 'Đã chép dữ liệu ' + S.data.bookmarks.length + ' dấu trang.' : 'Không chép được.', { error: !ok });
          } }, 'Chép dữ liệu'),
          ta,
          h('button', { type: 'button', class: 'btn quiet', 'data-test': 'backup-import-paste', onclick: () => importText(ta.value, 'dữ liệu dán', segValue(body, 'b-mode'), result) }, 'Nhập dữ liệu đã dán'));
      };
      const body = h('div', { class: 'backup' },
        env.storageInfo ? h('p', { class: 'muted', 'data-test': 'backup-storage-info' }, env.storageInfo()) : null,
        h('section', {},
          h('h3', {}, 'Xuất'),
          h('p', { class: 'muted' }, 'Tệp JSON giữ đủ thư mục, dấu trang, nhãn và màu nhãn, dùng để sao lưu. Tệp HTML là dạng dấu trang chung của trình duyệt, dùng để chuyển sang Chrome, Edge, Soul… Nên sao lưu thường xuyên vì gỡ app hoặc xóa dữ liệu trình duyệt sẽ mất dấu trang.'),
          h('div', { class: 'btnrow' },
            h('button', { type: 'button', class: 'btn primary', 'data-test': 'backup-export', disabled: S.readOnly, onclick: exportData }, 'Xuất tệp JSON'),
            h('button', { type: 'button', class: 'btn quiet', 'data-test': 'backup-export-html', disabled: S.readOnly, onclick: exportHtmlData }, 'Xuất tệp HTML'))),
        h('section', {},
          h('h3', {}, 'Nhập'),
          h('p', { class: 'muted' }, 'Tệp JSON đã xuất từ Sổ Dấu Trang (bản 1.x, 2.x), hoặc tệp dấu trang HTML xuất từ trình duyệt (Chrome, Edge, Soul, Firefox…).'),
          file,
          seg('b-mode', [['merge', 'Gộp vào dữ liệu hiện có'], ['replace', 'Thay thế toàn bộ']], S.readOnly ? 'replace' : 'merge', 'backup-mode'),
          h('button', { type: 'button', class: 'btn quiet', 'data-test': 'backup-import', onclick: () => doImport(file, segValue(body, 'b-mode'), result) }, 'Nhập tệp'),
          result),
        env.pasteBackup ? pasteSection() : null);
      openDialog({ title: 'Sao lưu', test: 'dlg-backup', sheet: true, wide: true, body, noFocus: true });
    }
    async function doImport(fileInput, mode, result) {
      const f = fileInput.files && fileInput.files[0];
      if (!f) { result.textContent = 'Chọn một tệp .json hoặc .html trước.'; result.classList.add('err'); toast('Chọn một tệp .json hoặc .html trước.', { error: true }); return; }
      result.textContent = 'Đang đọc tệp…'; result.classList.remove('err');
      await new Promise(r => setTimeout(r, 30));
      let text;
      try { text = await f.text(); } catch (e) { result.textContent = 'Không đọc được tệp. Dữ liệu hiện tại giữ nguyên.'; result.classList.add('err'); return; }
      return importText(text, 'Tệp “' + f.name + '”', mode, result, { html: true, name: f.name });
    }
    async function importText(text, label, mode, result, opt) {
      const show = (msg, err) => { result.textContent = msg; result.classList.toggle('err', !!err); if (err) toast(msg, { error: true }); };
      const head = String(text || '').slice(0, 2048).trimStart();
      if (opt && opt.html && head[0] !== '{' && (SDT.isBookmarksHtml(text) || /\.html?$/i.test(opt.name || '') || /^<(!doctype|html)/i.test(head))) {
        return importHtml(text, label, mode, show);
      }
      let obj;
      try { obj = JSON.parse(String(text || '').trim()); } catch (e) { show(label.charAt(0).toUpperCase() + label.slice(1) + ' không phải JSON hợp lệ. Dữ liệu hiện tại giữ nguyên.', true); return; }
      const v = SDT.validateData(obj);
      if (!v.ok) { show(v.error + ' Dữ liệu hiện tại giữ nguyên.', true); return; }
      if (mode === 'replace') {
        const ok = await confirmDialog({
          title: 'Thay thế toàn bộ?', okText: 'Thay thế', danger: true, test: 'dlg-replace',
          message: 'Toàn bộ ' + S.data.bookmarks.length + ' dấu trang và ' + S.data.folders.length + ' thư mục hiện có sẽ bị thay bằng ' + v.data.bookmarks.length + ' dấu trang và ' + v.data.folders.length + ' thư mục trong tệp.',
        });
        if (!ok) { show('Đã hủy. Dữ liệu hiện tại giữ nguyên.'); return; }
        S.view = 'root';
        if (await commit(v.data, { force: true, replace: true })) show('Đã thay thế: ' + v.data.bookmarks.length + ' dấu trang, ' + v.data.folders.length + ' thư mục.');
        return;
      }
      if (S.readOnly) { show('Dữ liệu đang lỗi nên không gộp được. Hãy chọn “Thay thế toàn bộ”.', true); return; }
      const m = SDT.mergeData(S.data, v.data);
      if (await commit(m.data)) show('Đã gộp: thêm ' + m.added + ' dấu trang, cập nhật ' + m.updated + ', giữ nguyên ' + m.kept + '; thêm ' + m.foldersAdded + ' thư mục.');
    }
    async function importHtml(text, label, mode, show) {
      const r = SDT.parseBookmarksHtml(text, Date.now());
      if (!r.ok) { show(label + ': ' + r.error + ' Dữ liệu hiện tại giữ nguyên.', true); return; }
      const sk = r.skipped;
      const skipMsg = sk.length ? ' Bỏ ' + sk.length + ' mục không phải trang web: ' + sk.slice(0, 10).map(x => '“' + x.title + '”').join(', ') + (sk.length > 10 ? '…' : '') + '.' : '';
      if (mode === 'replace') {
        const ok = await confirmDialog({
          title: 'Thay thế toàn bộ?', okText: 'Thay thế', danger: true, test: 'dlg-replace',
          message: 'Toàn bộ ' + S.data.bookmarks.length + ' dấu trang và ' + S.data.folders.length + ' thư mục hiện có sẽ bị thay bằng ' + r.data.bookmarks.length + ' dấu trang và ' + r.data.folders.length + ' thư mục trong tệp.',
        });
        if (!ok) { show('Đã hủy. Dữ liệu hiện tại giữ nguyên.'); return; }
        S.view = 'root';
        if (await commit(r.data, { force: true, replace: true })) show('Đã thay thế: ' + r.data.bookmarks.length + ' dấu trang, ' + r.data.folders.length + ' thư mục.' + skipMsg);
        return;
      }
      if (S.readOnly) { show('Dữ liệu đang lỗi nên không gộp được. Hãy chọn “Thay thế toàn bộ”.', true); return; }
      const m = SDT.mergeImported(S.data, r.data);
      const inFile = m.dupInFile ? ' Bỏ ' + m.dupInFile + ' mục trùng nhau ngay trong tệp.' : '';
      if (!m.added && !m.foldersAdded) { show('Đã gộp: thêm 0 dấu trang, bỏ qua ' + m.dup + ' đã có; thêm 0 thư mục.' + inFile + skipMsg); return; }
      if (await commit(m.data)) show('Đã gộp: thêm ' + m.added + ' dấu trang, bỏ qua ' + m.dup + ' đã có; thêm ' + m.foldersAdded + ' thư mục.' + inFile + skipMsg);
    }

    function openMore() {
      contextMenu([
        { label: 'Thêm dấu trang', icon: 'plus', test: 'menu-add', onSelect: () => openEditor(null) },
        { label: 'Thư mục mới', icon: 'folderPlus', test: 'menu-folder', onSelect: () => newFolder(folderView() ? curFolderId() : null) },
        'sep',
        searching() && S.entries.length ? { label: 'Đổi chữ các kết quả (' + S.entries.length + ')', icon: 'edit', test: 'menu-replace',
          onSelect: () => openReplace(S.entries.filter(e => e.kind === 'b').map(e => e.item.id)) } : null,
        { label: 'Tìm dấu trang trùng', icon: 'copy', test: 'menu-dups', onSelect: openDuplicates },
        { label: 'Nhãn và màu nhãn', icon: 'tag', test: 'menu-tags', onSelect: openTags },
        { label: 'Sao lưu: xuất / nhập', icon: 'paste', test: 'menu-backup', onSelect: openBackup },
      ], null, 'Sổ Dấu Trang');
    }

    /* ---------- nhớ cách sắp xếp, chỗ đang xem, vị trí cuộn (2.6.0) ---------- */
    const ST = env.state || null;
    let stateReady = false, stateTimer = 0;
    const SORTS_F = ['manual', 'created', 'updated', 'az', 'za'], SORTS_L = ['created', 'updated', 'az', 'za'];
    function scTopY() {
      const sc = scroller();
      const own = sc === document.scrollingElement || sc === document.documentElement || sc === document.body;
      const top = own ? 0 : sc.getBoundingClientRect().top;
      const bar = container.querySelector('.topbar');
      return { sc, top, edge: Math.max(top, bar ? bar.getBoundingClientRect().bottom : top) };
    }
    function snapshotAnchor() {
      if (searching()) return S.lastAnchor || null;            // đang tìm: giữ chỗ cũ của thư mục
      const { top, edge } = scTopY();
      const rows = $('list').querySelectorAll('[data-row]');
      for (let i = 0; i < rows.length; i++) {
        const r = rows[i].getBoundingClientRect();
        if (r.height && r.bottom > edge + 1) {
          const a = { view: S.view, kind: rows[i].getAttribute('data-row'), id: rows[i].getAttribute('data-id'), idx: i, dy: Math.round(r.top - top) };
          S.lastAnchor = a;
          return a;
        }
      }
      return S.lastAnchor && S.lastAnchor.view === S.view ? S.lastAnchor : null;
    }
    function saveState() {
      clearTimeout(stateTimer); stateTimer = 0;
      if (!ST || !stateReady || container.offsetParent === null && !container.getClientRects().length) return;
      try {
        ST.save({ v: 1, view: S.view, chain: ['all', 'root'].includes(S.view) ? [] : SDT.folderChain(S.data, S.view).map(f => f.id),
          sortFolder: S.sortFolder, sortFlat: S.sortFlat, dense: S.dense, expanded: [...S.expanded], anchor: snapshotAnchor() });
      } catch (e) { /* bỏ qua */ }
    }
    function scheduleSave() { if (!ST || !stateReady) return; clearTimeout(stateTimer); stateTimer = setTimeout(saveState, 300); }
    function readState() { if (!ST) return null; try { const o = ST.load(); return o && typeof o === 'object' ? o : null; } catch (e) { return null; } }
    // Áp trạng thái đã nhớ: thư mục đã mất → thư mục cha gần nhất còn lại, không thì "Dấu trang".
    function applyState(st) {
      if (!st) return null;
      if (SORTS_F.includes(st.sortFolder)) S.sortFolder = st.sortFolder;
      if (SORTS_L.includes(st.sortFlat)) S.sortFlat = st.sortFlat;
      S.dense = st.dense === true;
      if (Array.isArray(st.expanded)) S.expanded = new Set(st.expanded.filter(id => SDT.getFolder(S.data, id)));
      let view = 'root';
      if (st.view === 'all' || st.view === 'root') view = st.view;
      else if (typeof st.view === 'string' && SDT.getFolder(S.data, st.view)) view = st.view;
      else if (Array.isArray(st.chain)) { for (let i = st.chain.length - 1; i >= 0; i--) if (SDT.getFolder(S.data, st.chain[i])) { view = st.chain[i]; break; } }
      S.view = view;
      return st.anchor && st.anchor.view === view ? st.anchor : null;
    }
    function restoreAnchor(a) {
      if (!a || !S.entries.length) return;
      let idx = S.entries.findIndex(e => e.kind === a.kind && e.item.id === a.id);
      if (idx < 0) idx = Math.min(Number(a.idx) || 0, S.entries.length - 1);     // mục đã mất: vị trí gần nhất
      if (S.shown <= idx) appendMore(idx + 1 - S.shown + PAGE);
      const e = S.entries[idx];
      const row = $('list').querySelector('[data-row="' + e.kind + '"][data-id="' + CSS.escape(e.item.id) + '"]');
      if (!row) return;
      const { sc, top } = scTopY();
      sc.scrollTop += row.getBoundingClientRect().top - top - (Number(a.dy) || 0);
      S.lastAnchor = { view: S.view, kind: e.kind, id: e.item.id, idx, dy: Number(a.dy) || 0 };
    }
    async function reopen() {
      const st = readState();
      await reload();
      const a = applyState(st);
      if (st) { renderAll(false); restoreAnchor(a); }
    }

    /* ---------- phím tắt ---------- */
    function focusedItem() {
      const ae = rootNode.activeElement || document.activeElement;
      const row = ae && ae.closest ? ae.closest('[data-row]') : null;
      return row && container.contains(row) ? { kind: row.getAttribute('data-row'), id: row.getAttribute('data-id') } : null;
    }
    function onKey(e) {
      const ae = rootNode.activeElement || document.activeElement;
      if (rootNode.querySelector && rootNode.querySelector('dialog[open]')) return;
      if (ae && ae.closest && (ae.closest('textarea,select,[contenteditable]') || (ae.tagName === 'INPUT' && !['checkbox', 'radio', 'button'].includes(ae.type)))) return;
      if (e.key === '/' ) { e.preventDefault(); $('search').focus(); return; }
      const mod = e.ctrlKey || e.metaKey;
      const items = S.selectMode && S.selected.size ? [...S.selected.values()] : (focusedItem() ? [focusedItem()] : []);
      const k = e.key.toLowerCase();
      if (mod && k === 'x' && items.length) { e.preventDefault(); setClip('cut', items); }
      else if (mod && k === 'c' && items.length) { e.preventDefault(); setClip('copy', items); }
      else if (mod && k === 'v' && S.clip) { e.preventDefault(); if (canPasteHere()) pasteInto(curFolderId(), 'end'); else toast('Mở một thư mục để dán.', { error: true }); }
      else if ((e.key === 'Delete') && items.length) { e.preventDefault(); deleteItemsDlg(items); }
      else if (e.key === 'Escape' && S.selectMode) { S.selectMode = false; S.selected.clear(); renderList(true); }
    }

    /* ---------- khởi động ---------- */
    function wire() {
      $('btn-drawer').append(icon('menu'));
      $('side-close').append(icon('close'));
      $('search-ic').append(icon('search'));
      $('btn-filter').append(icon('filter'));
      $('btn-more').append(icon('more'));
      $('fab').append(icon('plus'));
      if ($('btn-close-manager')) { $('btn-close-manager').append(icon('close')); $('btn-close-manager').addEventListener('click', () => env.onClose()); }
      $('btn-drawer').addEventListener('click', () => setDrawer(true));
      $('side-close').addEventListener('click', () => setDrawer(false));
      $('scrim').addEventListener('click', () => setDrawer(false));
      $('btn-filter').addEventListener('click', openFilter);
      $('btn-more').addEventListener('click', openMore);
      $('fab').addEventListener('click', () => openEditor(null));
      let t = null;
      $('search').addEventListener('input', () => {
        clearTimeout(t);
        t = setTimeout(() => { S.q.text = $('search').value || ''; S.notice = ''; renderList(false); }, 70);
      });
      $('list').addEventListener('contextmenu', e => { if (e.target.closest('[data-row]')) return; e.preventDefault(); backgroundMenu(e); });
      (env.keyTarget || container).addEventListener('keydown', onKey);
      store.onChange(info => { if (info.origin === ORIGIN && info.own) return; reload(info); });   // reload tự xếp hàng sau các lần ghi đang chờ
    }
    // Đổi từ nơi khác (popup, tab khác): nếu biết khóa nào đổi thì chỉ đọc lại các phần đó.
    async function reloadPartial(keys) {
      const shardKeys = keys.filter(k => /^sdt_b_\d+$/.test(k));
      const want = shardKeys.slice();
      if (keys.includes('sdt_folders')) want.push('sdt_folders');
      want.push('sdt_meta');
      const r = await store.readKeys(want);
      const meta = r.sdt_meta;
      if (!meta || meta.version !== SDT.DATA_VERSION) return false;
      for (const k of shardKeys) if (r[k] !== undefined && !Array.isArray(r[k])) return false;
      const changed = new Set(shardKeys.map(k => Number(k.slice(6))));
      const incoming = [];
      for (const k of shardKeys) for (const b of (r[k] || [])) incoming.push(b);
      // Kiểm cùng danh sách thư mục hiện có (nếu không, dấu trang sẽ bị coi là mất thư mục).
      const v = SDT.validateData({ version: SDT.DATA_VERSION, folders: keys.includes('sdt_folders') ? (r.sdt_folders || []) : S.data.folders, bookmarks: incoming, tagColors: meta.tagColors }, { trusted: true });
      if (!v.ok) return false;
      const kept = changed.size ? S.data.bookmarks.filter(b => !changed.has(SDTStorage.shardOf(b.id))) : S.data.bookmarks;
      S.data = { version: SDT.DATA_VERSION, folders: keys.includes('sdt_folders') ? v.data.folders : S.data.folders, bookmarks: kept.concat(v.data.bookmarks), tagColors: v.data.tagColors };
      return true;
    }
    function reload(info) { return enqueue(() => reloadNow(info)); }
    async function reloadNow(info) {
      if (info && info.keys && !info.keys.includes('sdt_error') && !S.readOnly && root.SDTStorage) {
        try {
          if (await reloadPartial(info.keys)) {
            if (!['all', 'root'].includes(S.view) && !SDT.getFolder(S.data, S.view)) S.view = 'root';
            renderAll(true);
            return;
          }
        } catch (e) { /* rơi xuống đọc lại toàn bộ */ }
      }
      const fresh = await store.loadAll();
      if (!fresh.ok) { S.readOnly = true; S.loadError = fresh.error; S.rawBad = fresh.raw; renderAll(true); return; }
      S.data = fresh.data; S.readOnly = false; S.loadError = ''; S.rawBad = undefined;
      if (!['all', 'root'].includes(S.view) && !SDT.getFolder(S.data, S.view)) S.view = 'root';
      renderAll(true);
      warmSearch();
    }
    async function start() {
      wire();
      const res = await store.loadAll();
      if (res.ok) S.data = res.data;
      else { S.readOnly = true; S.loadError = res.error; S.rawBad = res.raw; S.data = SDT.emptyData(); }
      const anchor = res.ok ? applyState(readState()) : null;
      renderAll(false);
      restoreAnchor(anchor);
      stateReady = true;
      const scEl = env.scroller ? env.scroller() : window;
      scEl.addEventListener('scroll', scheduleSave, { passive: true });
      window.addEventListener('pagehide', saveState);
      document.addEventListener('visibilitychange', () => { if (document.hidden) saveState(); });
      if (res.ok && res.dropped) toast('Bỏ qua ' + res.dropped + ' mục có địa chỉ không hợp lệ trong dữ liệu.', { error: true });
      container.classList.add('ready');
      if (!window.__sdtReady) window.__sdtReady = performance.now();
      warmSearch();
    }
    // Chuẩn bị sẵn chữ bỏ dấu cho ô tìm khi rảnh, từng phần nhỏ để không làm giật.
    function warmSearch() {
      const list = S.data.bookmarks;
      let i = 0;
      const idle = window.requestIdleCallback || (cb => setTimeout(() => cb({ timeRemaining: () => 8 }), 30));
      const step = dl => {
        const until = performance.now() + Math.max(4, Math.min(12, dl.timeRemaining()));
        while (i < list.length && performance.now() < until) SDT.foldedOf(list[i++]);
        if (i < list.length && list === S.data.bookmarks) idle(step);
      };
      idle(step);
    }
    const ready = start();
    return { reload, reopen, saveState, setDrawer, ready };
  }

  root.SDTManager = { mount };
})(SDTNS);

const SDT_CSS = "/* Sổ Dấu Trang 2.0 — nền chung (sáng, dịu; tối theo máy) */\n:root, :host {\n  --bg: #F5F6FA;\n  --surface: #FFFFFF;\n  --side: #EEF1F7;\n  --field: #F1F3F8;\n  --hover: #EDF0F6;\n  --ink: #1D2433;\n  --muted: #667085;\n  --faint: #98A2B3;\n  --line: #E4E8F0;\n  --accent: #3D6BE0;\n  --accent-ink: #FFFFFF;\n  --accent-soft: #E9EFFD;\n  --accent-strong: #2F59C4;\n  --ribbon: #E5484D;\n  --ribbon-soft: #FDECEC;\n  --folder: #E89B2A;\n  --folder-soft: #FEF4E2;\n  --focus: #3D6BE0;\n  --hl: #FFE49A;\n  --shadow-1: 0 1px 2px rgba(20, 30, 60, .06);\n  --shadow-2: 0 10px 34px rgba(20, 30, 60, .18);\n  --font: 'Be Vietnam Pro', system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif;\n  /* màu nhãn: nền nhạt / chữ */\n  --tc-blue-bg: #E8EEFD; --tc-blue-fg: #3157C8;\n  --tc-green-bg: #E3F5E9; --tc-green-fg: #1F7A45;\n  --tc-purple-bg: #F0E9FD; --tc-purple-fg: #6B3FC4;\n  --tc-pink-bg: #FCE8F1; --tc-pink-fg: #B5306E;\n  --tc-orange-bg: #FEEEDF; --tc-orange-fg: #B45309;\n  --tc-yellow-bg: #FDF6D8; --tc-yellow-fg: #8A6A00;\n  --tc-teal-bg: #DFF5F3; --tc-teal-fg: #11766E;\n  --tc-red-bg: #FDE8E8; --tc-red-fg: #C0392B;\n  --tc-brown-bg: #F3ECE6; --tc-brown-fg: #7A5236;\n  --tc-gray-bg: #EEF0F4; --tc-gray-fg: #4A5568;\n  color-scheme: light;\n}\n@media (prefers-color-scheme: dark) {\n  :root, :host {\n    --bg: #12151C; --surface: #1B202A; --side: #161A22; --field: #232937; --hover: #232A37;\n    --ink: #E7EAF1; --muted: #98A2B3; --faint: #6B7586; --line: #2A3140;\n    --accent: #7D9BF7; --accent-ink: #0F1420; --accent-soft: #232D45; --accent-strong: #9DB4FA;\n    --ribbon: #FF6B70; --ribbon-soft: #3A2226; --folder: #F5B75A; --folder-soft: #3A2F1C; --focus: #9DB4FA; --hl: #6A5413;\n    --shadow-1: 0 1px 2px rgba(0, 0, 0, .3); --shadow-2: 0 12px 36px rgba(0, 0, 0, .55);\n    --tc-blue-bg: #24304D; --tc-blue-fg: #9DB4FA;\n    --tc-green-bg: #1E3527; --tc-green-fg: #7ED3A0;\n    --tc-purple-bg: #2F2547; --tc-purple-fg: #C4A8FA;\n    --tc-pink-bg: #43222F; --tc-pink-fg: #F29BC4;\n    --tc-orange-bg: #40291A; --tc-orange-fg: #F8B37A;\n    --tc-yellow-bg: #3B3415; --tc-yellow-fg: #E8CF6A;\n    --tc-teal-bg: #17363A; --tc-teal-fg: #76D5CB;\n    --tc-red-bg: #44201F; --tc-red-fg: #F59A92;\n    --tc-brown-bg: #352A22; --tc-brown-fg: #D4B094;\n    --tc-gray-bg: #2A2F3A; --tc-gray-fg: #B7C0CE;\n    color-scheme: dark;\n  }\n}\n\n*, *::before, *::after { box-sizing: border-box; }\nhtml, body { margin: 0; }\n.sdt { font: 400 15px/1.5 var(--font); color: var(--ink); background: var(--bg); -webkit-text-size-adjust: 100%; }\nh1, h2, h3, p { margin: 0; }\nbutton, input, select, textarea { font: inherit; color: inherit; }\n[hidden] { display: none !important; }\n:focus-visible { outline: 2px solid var(--focus); outline-offset: 2px; }\n.grow { flex: 1 1 auto; }\n.muted { color: var(--muted); font-size: 14px; }\n\n.ic { display: inline-flex; width: 20px; height: 20px; flex: none; }\n.ic svg { width: 100%; height: 100%; }\n\n/* nút */\n.btn {\n  display: inline-flex; align-items: center; justify-content: center; gap: 8px;\n  min-height: 46px; padding: 0 18px; border-radius: 14px; border: 0;\n  background: var(--field); color: var(--ink); font-weight: 600; font-size: 15px; cursor: pointer; white-space: nowrap;\n}\n.btn:hover { background: var(--hover); }\n.btn.primary { background: var(--accent); color: var(--accent-ink); }\n.btn.primary:hover { background: var(--accent-strong); }\n.btn.danger { background: var(--ribbon); color: #fff; }\n.btn.danger-soft { background: var(--ribbon-soft); color: var(--ribbon); }\n.btn.small { min-height: 40px; padding: 0 14px; font-size: 14px; border-radius: 12px; }\n.btn:disabled { opacity: .45; cursor: default; }\n.btn .ic { width: 18px; height: 18px; }\n.icon-btn {\n  display: inline-flex; align-items: center; justify-content: center; position: relative;\n  width: 44px; height: 44px; border-radius: 12px; border: 0; background: transparent; color: var(--muted); cursor: pointer; flex: none;\n}\n.icon-btn:hover { background: var(--hover); color: var(--ink); }\n.icon-btn.small { width: 36px; height: 36px; border-radius: 10px; }\n.icon-btn.on { color: var(--accent); }\n.link { border: 0; background: none; padding: 0; color: var(--accent); font-weight: 600; cursor: pointer; min-height: 36px; font-size: 14px; }\n.link.small { font-size: 13px; min-height: 32px; }\n.danger-text { color: var(--ribbon) !important; }\n\n/* ô nhập */\n.form { display: grid; gap: 12px; }\n.field { display: grid; gap: 5px; }\n.lab { font-size: 12.5px; font-weight: 600; color: var(--muted); }\n.lab small { font-weight: 400; }\ninput[type=text], input[type=url], input[type=search], input[type=date], input[type=month], select, textarea {\n  width: 100%; min-height: 46px; padding: 10px 14px; border: 0; border-radius: 12px; background: var(--field); color: var(--ink);\n}\ninput:focus, select:focus, textarea:focus { outline: 2px solid var(--focus); outline-offset: -2px; background: var(--surface); }\n.form-error { color: var(--ribbon); font-size: 14px; font-weight: 600; }\n\n/* chọn thư mục (nút) */\n.fsel { display: flex; align-items: center; gap: 10px; width: 100%; min-height: 46px; padding: 0 12px 0 14px; border: 0; border-radius: 12px; background: var(--field); cursor: pointer; text-align: left; }\n.fsel:hover { background: var(--hover); }\n.fsel-ic { color: var(--folder); }\n.fsel-t { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }\n.fsel-dn { color: var(--muted); }\n\n/* nhãn có màu */\n.tag { --tbg: var(--tc-gray-bg); --tfg: var(--tc-gray-fg); background: var(--tbg); color: var(--tfg); }\n.tc-blue { --tbg: var(--tc-blue-bg); --tfg: var(--tc-blue-fg); }\n.tc-green { --tbg: var(--tc-green-bg); --tfg: var(--tc-green-fg); }\n.tc-purple { --tbg: var(--tc-purple-bg); --tfg: var(--tc-purple-fg); }\n.tc-pink { --tbg: var(--tc-pink-bg); --tfg: var(--tc-pink-fg); }\n.tc-orange { --tbg: var(--tc-orange-bg); --tfg: var(--tc-orange-fg); }\n.tc-yellow { --tbg: var(--tc-yellow-bg); --tfg: var(--tc-yellow-fg); }\n.tc-teal { --tbg: var(--tc-teal-bg); --tfg: var(--tc-teal-fg); }\n.tc-red { --tbg: var(--tc-red-bg); --tfg: var(--tc-red-fg); }\n.tc-brown { --tbg: var(--tc-brown-bg); --tfg: var(--tc-brown-fg); }\n.tc-gray { --tbg: var(--tc-gray-bg); --tfg: var(--tc-gray-fg); }\n.tag-input { position: relative; }\n.tagbox { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; min-height: 46px; padding: 7px 8px 7px 10px; border-radius: 12px; background: var(--field); cursor: text; }\n.tagbox:focus-within { outline: 2px solid var(--focus); outline-offset: -2px; background: var(--surface); }\n.chips { display: contents; }\n.chip { display: inline-flex; align-items: center; gap: 0; padding: 0 2px 0 10px; border-radius: 14px; font-size: 13.5px; font-weight: 500; max-width: 100%; min-height: 28px; }\n.chip-t { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }\n.chip-x { border: 0; background: none; width: 26px; height: 26px; border-radius: 13px; cursor: pointer; color: inherit; opacity: .7; font-size: 17px; line-height: 1; }\n.chip-x:hover { opacity: 1; }\n.tagbox input.tag-entry { flex: 1 1 120px; width: auto; min-width: 110px; min-height: 30px; padding: 4px; border: 0; outline: 0; background: transparent; }\n.tagbox input.tag-entry:focus { outline: 0; background: transparent; }\n.suggest { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 8px; }\n.sug { border: 0; border-radius: 14px; padding: 0 12px; min-height: 34px; cursor: pointer; font-size: 13.5px; font-weight: 500; }\n\n/* cảnh báo trùng */\n.dup { background: var(--ribbon-soft); padding: 12px 14px; border-radius: 12px; font-size: 14px; display: grid; gap: 10px; margin-top: 12px; }\n.dup-actions { display: flex; flex-wrap: wrap; gap: 8px; }\n.dup .btn { background: var(--surface); }\n\n/* hộp thoại */\n.dlg {\n  border: 0; padding: 0; border-radius: 20px; background: var(--surface); color: var(--ink);\n  width: min(440px, calc(100vw - 24px)); max-height: calc(100vh - 32px); box-shadow: var(--shadow-2);\n  display: flex; flex-direction: column; overflow: hidden; font: 400 15px/1.5 var(--font);\n}\n.dlg:not([open]) { display: none; }\n.dlg.wide { width: min(560px, calc(100vw - 24px)); }\n.dlg::backdrop { background: rgba(17, 24, 39, .42); }\n.dlg .grab { width: 40px; height: 4px; border-radius: 2px; background: var(--line); margin: 10px auto 0; flex: none; }\n.dlg-head { display: flex; align-items: center; gap: 8px; padding: 14px 10px 4px 22px; }\n.dlg-title { font-size: 18px; font-weight: 600; flex: 1; overflow-wrap: anywhere; }\n.dlg-body { padding: 8px 22px 6px; overflow: auto; display: grid; gap: 14px; }\n.dlg-msg { color: var(--muted); }\n.dlg > .form-error { padding: 0 22px; }\n.dlg-actions { display: flex; justify-content: flex-end; flex-wrap: wrap; gap: 10px; padding: 12px 22px 20px; }\n.dlg-actions .btn.grow { flex: 1 1 auto; }\n@media (max-width: 640px) {\n  .dlg.sheet { margin: auto 0 0; width: 100vw; max-width: 100vw; border-radius: 22px 22px 0 0; max-height: 90vh; }\n  .dlg-actions .btn { flex: 1 1 auto; }\n}\n@media (min-width: 641px) { .dlg .grab { display: none; } }\n\n/* menu */\n.menu { display: grid; padding: 4px 0 8px; }\n.menu-item { display: flex; align-items: center; gap: 14px; text-align: left; border: 0; background: none; min-height: 48px; padding: 0 12px; border-radius: 12px; font-size: 15.5px; cursor: pointer; color: var(--ink); }\n.menu-item .ic { color: var(--muted); }\n.menu-item:hover, .menu-item:focus-visible { background: var(--hover); }\n.menu-item:disabled { opacity: .4; }\n.menu-hint { margin-left: auto; font-size: 12px; color: var(--muted); }\n.menu-sep { height: 1px; background: var(--line); margin: 6px 12px; }\n.dlg.cmenu .dlg-body { padding: 4px 12px 8px; }\n.dlg.cmenu.at { width: 260px; border-radius: 14px; }\n.dlg.cmenu.at::backdrop { background: transparent; }\n.dlg.cmenu.at .menu-item { min-height: 40px; font-size: 14.5px; }\n.dlg.cmenu.at .menu { padding: 4px 0; }\n.dlg.cmenu.at .dlg-body { padding: 6px; }\n\n/* radio, nhóm lựa chọn */\n.radios { display: grid; gap: 4px; }\n.radio { display: flex; align-items: flex-start; gap: 10px; padding: 10px 0; cursor: pointer; }\n.radio input { width: 20px; height: 20px; margin: 2px 0 0; accent-color: var(--accent); flex: none; }\n.seg { display: flex; flex-wrap: wrap; background: var(--field); border-radius: 12px; padding: 3px; gap: 3px; }\n.seg-o { flex: 1 1 auto; position: relative; }\n.seg-o input { position: absolute; opacity: 0; inset: 0; margin: 0; cursor: pointer; }\n.seg-o span { display: flex; align-items: center; justify-content: center; min-height: 40px; padding: 0 10px; border-radius: 9px; font-size: 13.5px; font-weight: 500; color: var(--muted); text-align: center; }\n.seg-o input:checked + span { background: var(--surface); color: var(--ink); font-weight: 600; box-shadow: 0 1px 3px rgba(20, 30, 60, .12); }\n.seg-o input:focus-visible + span { outline: 2px solid var(--focus); outline-offset: -2px; }\n\n/* hộp cây thư mục */\n.pick { display: grid; gap: 10px; }\n.ptree { display: grid; gap: 2px; max-height: 52vh; overflow: auto; margin: 0 -8px; padding: 0 8px; }\n.pnode { display: flex; align-items: center; padding-left: calc(var(--depth, 0) * 18px); border-radius: 12px; }\n.pnode.sel { background: var(--accent-soft); }\n.pnode.sel .pname { color: var(--accent); font-weight: 600; }\n.pnode.off { opacity: .4; }\n.pname { flex: 1; min-width: 0; display: flex; align-items: center; gap: 10px; min-height: 44px; border: 0; background: none; text-align: left; cursor: pointer; padding: 0 8px; border-radius: 12px; }\n.pname span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }\n.pname:disabled { cursor: not-allowed; }\n.pico { color: var(--folder); }\n.pnode.sel .pico { color: var(--accent); }\n.caret, .caret-sp { width: 30px; height: 36px; flex: none; }\n.caret { border: 0; background: none; color: var(--muted); cursor: pointer; display: inline-flex; align-items: center; justify-content: center; border-radius: 8px; }\n.caret .ic { width: 16px; height: 16px; transition: transform .15s; }\n.caret.open .ic { transform: rotate(90deg); }\n.ppath { font-size: 13px; color: var(--muted); }\n.pempty { padding: 12px 8px; }\n.pfoot { display: flex; align-items: center; gap: 8px; width: 100%; flex-wrap: wrap; }\n.pfoot .btn { flex: 0 0 auto; }\n@media (max-width: 640px) { .pfoot [data-test=\"pick-new\"] { flex: 1 0 100%; } .pfoot .btn { flex: 1 1 auto; } .pfoot .grow { display: none; } }\n\n/* thông báo ngắn */\n.toast {\n  position: fixed; left: 50%; bottom: 20px; transform: translate(-50%, 30px); opacity: 0; pointer-events: none;\n  display: flex; align-items: center; gap: 12px; max-width: calc(100vw - 24px);\n  background: #1D2433; color: #F5F6FA; padding: 8px 8px 8px 16px; border-radius: 14px; box-shadow: var(--shadow-2);\n  transition: transform .18s ease, opacity .18s ease; z-index: 50; font-size: 14px; min-height: 50px;\n}\n@media (prefers-color-scheme: dark) { .toast { background: #E7EAF1; color: #12151C; } }\n.toast.show { opacity: 1; transform: translate(-50%, 0); pointer-events: auto; }\n.toast.error { background: var(--ribbon); color: #fff; }\n.toast-act { border: 0; background: rgba(255, 255, 255, .14); color: inherit; font-weight: 700; min-height: 38px; padding: 0 12px; border-radius: 10px; cursor: pointer; }\n@media (prefers-reduced-motion: reduce) { .toast, .caret .ic { transition: none; } }\n/* Sổ Dấu Trang 2.0 — trình quản lý */\n.mgr { min-height: 100vh; }\n.layout { display: grid; grid-template-columns: 290px minmax(0, 1fr); min-height: 100vh; }\n\n/* ngăn thư mục */\n.side { background: var(--side); position: sticky; top: 0; height: 100vh; overflow: auto; padding: 0 10px 28px; }\n.side-head { display: flex; align-items: center; justify-content: space-between; padding: 18px 2px 14px 10px; }\n.brand { display: inline-flex; align-items: center; gap: 10px; font-weight: 600; font-size: 17px; }\n.brand-mark { display: inline-flex; width: 15px; height: 24px; }\n.brand-mark svg { width: 100%; height: 100%; fill: var(--ribbon); }\n.tree { display: grid; gap: 2px; }\n.trow { position: relative; display: flex; align-items: center; border-radius: 12px; min-height: 44px; }\n.trow.folder { padding-left: calc(var(--depth, 0) * 16px); }\n.trow:hover { background: var(--hover); }\n.trow.active { background: var(--accent-soft); }\n.trow.active .tname, .trow.active .tic { color: var(--accent); font-weight: 600; }\n.trow.drop-into { background: var(--accent-soft); box-shadow: inset 0 0 0 2px var(--accent); }\n.tbtn { flex: 1; min-width: 0; display: flex; align-items: center; gap: 10px; min-height: 44px; padding: 0 10px 0 12px; border: 0; background: none; color: inherit; text-align: left; cursor: pointer; font-size: 14.5px; }\n.trow.folder .tbtn { padding-left: 2px; }\n.tic { color: var(--muted); }\n.tic.fic { color: var(--folder); }\n.tname { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }\n.tcount { color: var(--muted); font-size: 12.5px; font-variant-numeric: tabular-nums; }\n.tmenu { opacity: 0; }\n.trow:hover .tmenu, .trow:focus-within .tmenu { opacity: 1; }\n@media (hover: none) { .tmenu { opacity: .7; } }\n.tsec { display: flex; align-items: center; justify-content: space-between; padding: 16px 4px 4px 12px; color: var(--muted); font-size: 12px; font-weight: 600; }\n.tempty { padding: 6px 12px; color: var(--muted); font-size: 14px; }\n\n/* phần chính */\n.main { min-width: 0; position: relative; padding-bottom: 110px; }\n.topbar { position: sticky; top: 0; z-index: 5; display: flex; align-items: center; gap: 4px; padding: 12px 18px 10px; background: var(--bg); }\n.search { flex: 1; min-width: 0; max-width: 640px; position: relative; display: flex; align-items: center; }\n.search-ic { position: absolute; left: 14px; color: var(--muted); display: inline-flex; pointer-events: none; }\n.search input { padding-left: 44px; border-radius: 23px; background: var(--surface); box-shadow: var(--shadow-1); }\n.badge { position: absolute; top: 5px; right: 4px; min-width: 18px; height: 18px; padding: 0 5px; border-radius: 9px; background: var(--accent); color: var(--accent-ink); font-size: 11px; font-weight: 700; display: inline-flex; align-items: center; justify-content: center; }\n\n.listhead { padding: 6px 22px 10px; display: grid; gap: 10px; max-width: 940px; }\n.crumbs { display: flex; align-items: center; flex-wrap: wrap; gap: 0 2px; font-size: 13px; color: var(--muted); }\n.crumb { border: 0; background: none; color: var(--muted); padding: 4px 4px; border-radius: 6px; cursor: pointer; font-size: 13px; min-height: 30px; }\n.crumb:hover { color: var(--accent); background: var(--hover); }\n.crumb-sep { width: 14px; height: 14px; color: var(--muted); }\n.lh-row { display: flex; align-items: baseline; gap: 10px; flex-wrap: wrap; }\n.lh-row.tools { align-items: center; gap: 8px; }\n.lh-title { font-size: 25px; font-weight: 600; line-height: 1.2; letter-spacing: -.01em; overflow-wrap: anywhere; }\n.lh-count { color: var(--muted); font-size: 13px; }\n.pill { display: inline-flex; align-items: center; gap: 6px; min-height: 38px; padding: 0 14px; border: 0; border-radius: 19px; background: var(--surface); box-shadow: var(--shadow-1); font-size: 13.5px; font-weight: 500; cursor: pointer; color: var(--ink); }\n.pill.on { background: var(--accent-soft); color: var(--accent); }\n.pill.accent { background: var(--accent); color: var(--accent-ink); }\n.pill .ic { width: 16px; height: 16px; }\n.sortpill { padding: 0 6px 0 12px; }\n.pill.dense-pill { margin-left: auto; align-self: center; flex: none; padding: 0; width: 38px; justify-content: center; color: var(--muted); }\n.pill.dense-pill.on { color: var(--accent); }\n.pill.dense-pill .ic { width: 20px; height: 20px; }\n.reorder-pill { display: none; }\n.sortpill select { min-height: 36px; padding: 0 24px 0 2px; border: 0; background: transparent; font-size: 13.5px; font-weight: 500; width: auto; border-radius: 8px; field-sizing: content; }\n.sortpill select:focus { background: transparent; }\n.cchips { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; }\n.cchip { display: inline-flex; align-items: center; gap: 2px; min-height: 32px; padding: 0 4px 0 12px; border-radius: 16px; background: var(--accent-soft); color: var(--accent); font-size: 13px; font-weight: 500; }\n.cchip.tag { background: var(--tbg); color: var(--tfg); }\n.cchip-x { border: 0; background: none; color: inherit; width: 26px; height: 26px; border-radius: 13px; display: inline-flex; align-items: center; justify-content: center; cursor: pointer; }\n.cchip-x .ic { width: 15px; height: 15px; }\n.cchip-x:hover { background: rgba(0, 0, 0, .06); }\n.lh-notice { font-size: 13.5px; color: var(--ribbon); }\n.scope-note { display: flex; flex-wrap: wrap; align-items: center; gap: 4px 10px; margin: 0; font-size: 13.5px; color: var(--muted); }\n.scope-note .link { min-height: 32px; }\n\n.banner { margin: 6px 22px 6px; border-radius: 16px; padding: 14px 18px; background: var(--ribbon-soft); display: grid; gap: 6px; max-width: 900px; font-size: 14px; }\n.banner-t { font-weight: 700; color: var(--ribbon); font-size: 15px; }\n.banner-acts { display: flex; gap: 8px; flex-wrap: wrap; margin-top: 6px; }\n.banner .btn { background: var(--surface); }\n.banner.info { background: var(--accent-soft); }\n.banner.info .banner-t { color: var(--accent); }\n\n/* danh sách */\n.list { max-width: 940px; padding: 0 14px; position: relative; }\n.group { background: var(--surface); border-radius: 16px; box-shadow: var(--shadow-1); margin-bottom: 12px; overflow: hidden; }\n.row { position: relative; display: flex; align-items: center; gap: 12px; padding: 10px 6px 10px 14px; min-height: 62px; outline: none; background: var(--surface); }\n.row + .row::before { content: ''; position: absolute; left: 62px; right: 0; top: 0; border-top: 1px solid var(--line); }\n.row:hover { background: var(--hover); }\n.row:focus-visible { box-shadow: inset 0 0 0 2px var(--focus); }\n.row.sel { background: var(--accent-soft); }\n.row.cut { opacity: .5; }\n.row.dragging { z-index: 4; box-shadow: var(--shadow-2); border-radius: 14px; background: var(--surface); }\n.row.drop-into { background: var(--accent-soft); box-shadow: inset 0 0 0 2px var(--accent); }\n.frow { cursor: pointer; }\n.ico { width: 38px; height: 38px; border-radius: 11px; display: inline-flex; align-items: center; justify-content: center; flex: none; position: relative; overflow: hidden; }\n.fico { background: var(--folder-soft); color: var(--folder); }\n.fav { background: var(--accent-soft); }\n.fav::before { content: attr(data-letter); font-weight: 700; font-size: 14px; color: var(--accent); }\n.fav img { position: absolute; inset: 9px; width: 20px; height: 20px; background: var(--accent-soft); border-radius: 4px; }\n.row-check { width: 22px; height: 22px; margin: 8px; accent-color: var(--accent); flex: none; }\n.rtext { flex: 1; min-width: 0; display: grid; gap: 1px; }\n.rtitle { color: var(--ink); font-weight: 600; font-size: 15px; line-height: 1.35; text-decoration: none; overflow: hidden; overflow-wrap: anywhere; display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: 2; }\nmark.hl { background: var(--hl); color: inherit; border-radius: 3px; padding: 0 1px; margin: 0 -1px; }\n.row.flash { animation: sdt-flash 2.2s ease-out; }\n@keyframes sdt-flash { 0%, 40% { background: var(--accent-soft); box-shadow: inset 3px 0 0 var(--accent); } 100% { background: var(--surface); box-shadow: inset 3px 0 0 transparent; } }\na.rtitle:hover { color: var(--accent); }\n.rmeta { display: flex; flex-wrap: wrap; gap: 0 12px; font-size: 12.5px; color: var(--muted); }\n.rmeta .dom { overflow-wrap: anywhere; }\n.rpath { display: inline-flex; align-items: center; gap: 4px; justify-self: start; border: 0; background: none; padding: 0; min-height: 22px; font-size: 12.5px; color: var(--accent); cursor: pointer; }\n.rpath .ic { width: 14px; height: 14px; }\n.rtags { display: flex; flex-wrap: wrap; gap: 5px; margin-top: 5px; }\n.rtags .tag { border: 0; border-radius: 10px; padding: 0 9px; min-height: 22px; font-size: 12px; font-weight: 500; cursor: pointer; }\n.racts { display: flex; flex: none; align-items: center; }\n.grip { color: var(--muted); cursor: grab; touch-action: none; }\n.grip:active { cursor: grabbing; }\n/* kiểu xem Gọn */\n.mgr.dense .row { min-height: 46px; padding-top: 4px; padding-bottom: 4px; }\n.mgr.dense .racts .icon-btn { margin: -4px 0; }\n.mgr.dense .row + .row::before { left: 52px; }\n.mgr.dense .ico { width: 28px; height: 28px; border-radius: 8px; }\n.mgr.dense .fav::before { font-size: 12px; }\n.mgr.dense .fav img { inset: 4px; }\n.mgr.dense .fico .ic { width: 18px; height: 18px; }\n.mgr.dense .rtext { display: flex; flex-wrap: wrap; align-items: center; gap: 0 10px; }\n.mgr.dense .rtitle { flex: 1 0 100%; -webkit-line-clamp: 1; font-size: 14.5px; }\n.mgr.dense .rtitle:has(mark) { -webkit-line-clamp: 2; }\n.mgr.dense .rmeta, .mgr.dense .rpath { font-size: 12px; min-height: 18px; }\n.mgr.dense .rmeta { min-width: 0; }\n.mgr.dense .rmeta .dom { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; overflow-wrap: normal; }\n.mgr.dense .rtags, .mgr.dense .rmeta .date { display: none; }\n.mgr.dense .row-check { margin: 3px 3px; }\n.drop-line { position: absolute; left: 14px; right: 14px; height: 3px; border-radius: 2px; background: var(--accent); pointer-events: none; display: none; z-index: 6; }\n.sentinel { text-align: center; color: var(--muted); font-size: 12.5px; padding: 14px 0 6px; }\n\n.empty { padding: 40px 12px; max-width: 460px; display: grid; gap: 10px; justify-items: start; color: var(--muted); }\n.empty-t { font-size: 18px; font-weight: 600; color: var(--ink); }\n.empty-acts { display: flex; gap: 8px; flex-wrap: wrap; }\n\n.fab {\n  position: fixed; right: 22px; bottom: 22px; width: 58px; height: 58px; border-radius: 18px; border: 0;\n  background: var(--accent); color: var(--accent-ink); box-shadow: 0 8px 22px rgba(61, 107, 224, .38); cursor: pointer; z-index: 6;\n  display: inline-flex; align-items: center; justify-content: center;\n}\n.fab .ic { width: 26px; height: 26px; }\n.fab:hover { background: var(--accent-strong); }\n.mgr.selecting .fab { display: none; }\n.bulkbar { position: fixed; left: 290px; right: 0; bottom: 0; z-index: 7; padding: 8px 14px 10px; background: var(--surface); box-shadow: 0 -6px 24px rgba(20, 30, 60, .12); border-radius: 18px 18px 0 0; }\n.bulk-top { display: flex; align-items: center; gap: 12px; padding: 0 4px; }\n.bulk-n { font-weight: 600; font-size: 14px; }\n.bulk-acts { display: flex; gap: 4px; justify-content: space-around; }\n.bbtn { display: flex; flex: 1 1 0; flex-direction: column; align-items: center; justify-content: center; gap: 2px; min-width: 0; padding: 0 2px; white-space: nowrap; min-height: 52px; border: 0; background: none; border-radius: 12px; font-size: 12px; font-weight: 500; color: var(--ink); cursor: pointer; }\n.bbtn:hover { background: var(--hover); }\n.bbtn:disabled { opacity: .35; cursor: default; }\n\n/* bảng lọc, nhãn, sao lưu */\n.filter, .backup { display: grid; gap: 16px; }\n.filter section { display: grid; gap: 8px; }\n.backup h3 { font-size: 15px; font-weight: 600; margin-bottom: 6px; }\n.backup section { display: grid; gap: 8px; }\n.backup .btnrow { display: flex; flex-wrap: wrap; gap: 8px; }\n.backup .btnrow .btn { flex: 1 1 140px; }\n.optrow { display: flex; align-items: flex-start; gap: 12px; min-height: 44px; padding: 8px 4px; border-radius: 12px; cursor: pointer; }\n.optrow input { width: 20px; height: 20px; margin-top: 2px; flex: none; accent-color: var(--accent); }\n.optrow span { display: grid; gap: 2px; min-width: 0; }\n.optrow b { font-weight: 600; font-size: 14.5px; white-space: pre; }\n.optrow small { color: var(--muted); font-size: 12.5px; overflow-wrap: anywhere; }\n.optrow.off { opacity: .45; }\n.lh-notice.err { color: var(--ribbon); font-weight: 600; }\n.rp-info { font-weight: 600; font-size: 14px; margin: 0 0 6px; }\n.rp-info.err { color: var(--ribbon); }\n.rp-samples { display: grid; gap: 6px; }\n.rp-row { display: grid; grid-template-columns: 1fr; gap: 2px; padding: 8px 10px; border-radius: 10px; background: var(--field); font-size: 12.5px; overflow-wrap: anywhere; }\n.rp-row s { color: var(--muted); }\n.rp-row b { font-weight: 600; }\n.rp-arrow { color: var(--muted); font-size: 11px; }\n.dups { display: grid; gap: 10px; }\n.dup-bar { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 8px; }\n.dup-sum { margin: 0; font-weight: 600; }\n.dup-list { display: grid; gap: 12px; }\n.dgroup { border: 1px solid var(--line); border-radius: 16px; padding: 10px; display: grid; gap: 8px; background: var(--surface); }\n.dg-head { display: flex; gap: 8px; align-items: baseline; min-width: 0; }\n.dg-key { color: var(--muted); font-size: 12.5px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; min-width: 0; }\n.dg-items { display: grid; gap: 8px; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); }\n.ditem { display: grid; grid-template-columns: auto 1fr; gap: 8px; padding: 8px; border-radius: 12px; background: var(--field); border: 2px solid transparent; min-width: 0; }\n.ditem.kept { border-color: var(--accent); background: var(--accent-soft); }\n.dkeep { display: flex; flex-direction: column; align-items: center; justify-content: flex-start; gap: 2px; min-width: 44px; min-height: 44px; font-size: 12px; font-weight: 600; cursor: pointer; }\n.dkeep input { width: 22px; height: 22px; accent-color: var(--accent); margin: 4px 0 0; }\n.ditem:not(.kept) .dkeep span { color: var(--ribbon); }\n.dbody { display: grid; gap: 3px; min-width: 0; }\n.df { font-size: 12.5px; color: var(--muted); overflow-wrap: anywhere; }\n.df.dt { font-size: 14.5px; color: var(--ink); font-weight: 600; text-decoration: none; }\n.df.diff { color: var(--ink); font-weight: 700; }\n.df.dt.diff { text-decoration: underline; text-decoration-color: var(--folder); text-decoration-thickness: 2px; }\n.df.dtags { display: flex; flex-wrap: wrap; gap: 4px; }\n.dg-acts { display: flex; flex-wrap: wrap; gap: 8px; justify-content: flex-end; }\n.dg-acts .btn, .dup-bar .btn, .dup-list > .btn { min-height: 44px; }\n.h3row { display: flex; justify-content: space-between; align-items: center; }\n.tagpick { display: flex; flex-wrap: wrap; gap: 7px; max-height: 210px; overflow: auto; }\n.tpick { position: relative; border-radius: 17px; }\n.tagpick .tpick input { position: absolute; opacity: 0; inset: 0; margin: 0; cursor: pointer; }\n.tagpick .tpick span { display: inline-flex; align-items: center; min-height: 34px; padding: 0 13px 0 11px; border-radius: 17px; font-size: 13.5px; background: var(--field); color: var(--ink); }\n.tagpick .tpick .dot { width: 8px; height: 8px; border-radius: 4px; background: var(--tfg); margin-right: 7px; }\n.tagpick .tpick small { color: var(--muted); margin-left: 4px; }\n.tagpick .tpick input:checked + span { background: var(--tfg); color: var(--surface); font-weight: 600; }\n.tagpick .tpick input:checked + span .dot { background: var(--surface); }\n.tagpick .tpick input:checked + span small { color: inherit; opacity: .8; }\n.tagpick .tpick input:focus-visible + span { outline: 2px solid var(--focus); outline-offset: 1px; }\n.range { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }\n.taglist { display: grid; }\n.tagrow { display: flex; align-items: center; gap: 4px; border-top: 1px solid var(--line); }\n.tagrow:first-child { border-top: 0; }\n.tagrow-name { flex: 1; min-width: 0; display: flex; align-items: center; gap: 10px; border: 0; background: none; min-height: 50px; text-align: left; cursor: pointer; padding: 0; }\n.tagrow-name .tag { border-radius: 12px; padding: 2px 10px; font-size: 13.5px; font-weight: 500; }\n.tagrow-name .tcount { color: var(--muted); font-size: 12.5px; }\n.cdot { width: 44px; height: 44px; border: 0; background: none; cursor: pointer; display: inline-flex; align-items: center; justify-content: center; border-radius: 12px; }\n.cdot::after { content: ''; width: 20px; height: 20px; border-radius: 10px; background: var(--tfg); box-shadow: 0 0 0 3px var(--tbg); }\n.cdot:hover { background: var(--hover); }\n.palette { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }\n.swatch { display: flex; align-items: center; gap: 10px; min-height: 46px; padding: 0 14px; border: 0; border-radius: 12px; cursor: pointer; font-weight: 600; font-size: 14px; }\n.swatch .dot { width: 14px; height: 14px; border-radius: 7px; background: var(--tfg); }\n.swatch.on { box-shadow: inset 0 0 0 2px var(--tfg); }\n.tsearch { margin-bottom: 4px; }\n.backup input[type=file] { width: 100%; padding: 8px 0; min-height: 44px; }\n.backup textarea.paste { min-height: 96px; font: 13px/1.4 var(--font); resize: vertical; }\n.result { font-size: 14px; }\n.result.err { color: var(--ribbon); font-weight: 600; }\n.meta { font-size: 12.5px; color: var(--muted); margin-top: 12px; }\n\n.only-mobile { display: none; }\n.scrim { display: none; }\n\n@media (max-width: 860px) {\n  .layout { display: block; }\n  .only-mobile { display: inline-flex; }\n  .side {\n    position: fixed; z-index: 20; left: 0; top: 0; bottom: 0; width: min(310px, 86vw); height: auto;\n    transform: translateX(-102%); transition: transform .2s ease, visibility .2s; visibility: hidden;\n  }\n  .mgr.drawer-open .side { transform: none; box-shadow: var(--shadow-2); visibility: visible; }\n  .scrim { display: block; position: fixed; inset: 0; z-index: 19; background: rgba(17, 24, 39, .32); opacity: 0; pointer-events: none; transition: opacity .2s; }\n  .mgr.drawer-open .scrim { opacity: 1; pointer-events: auto; }\n  .topbar { padding: 10px 8px 8px 4px; gap: 2px; }\n  .listhead { padding: 4px 16px 10px; }\n  .lh-title { font-size: 23px; }\n  .list { padding: 0 10px; }\n  .row { padding: 10px 2px 10px 12px; gap: 10px; }\n  .row + .row::before { left: 60px; }\n  .mgr.dense .row + .row::before { left: 50px; }\n  .lh-row.tools { gap: 6px; }\n  .pill { min-height: 44px; border-radius: 22px; padding: 0 13px; }\n  .sortpill { padding: 0 4px 0 12px; }\n  .sortpill select { min-height: 42px; }\n  .pill.dense-pill { width: 44px; padding: 0; }\n  .reorder-pill { display: inline-flex; }\n  .mgr:not(.reordering) .grip { display: none; }\n  .mgr.reordering .rmenu { display: none; }\n  .bulkbar { left: 0; }\n  .fab { right: 16px; bottom: 18px; }\n  .toast { bottom: 92px; }\n  dialog .toast { bottom: 16px; }\n}\n@media (max-width: 400px) {\n  .racts .icon-btn { width: 40px; }\n  .range { grid-template-columns: 1fr; }\n  .palette { grid-template-columns: 1fr; }\n}\n@media (prefers-reduced-motion: reduce) { .side, .scrim { transition: none; } .row.flash { animation: none; background: var(--accent-soft); } }\n/* Sổ Dấu Trang 2.0 — popup / bảng lưu nhanh */\n.pop { width: 380px; background: var(--surface); }\n@media (pointer: coarse), (max-width: 379px) { .pop { width: auto; } }\n.pop main, main.pop { padding: 0 18px 16px; }\n.loading { padding: 20px 0; color: var(--muted); }\n.p-head { display: flex; gap: 14px; align-items: flex-start; margin-bottom: 16px; }\n.ribbon { flex: none; width: 30px; height: 46px; margin-left: 2px; }\n.ribbon-svg { display: block; width: 30px; height: 46px; overflow: visible; }\n.ribbon-svg path { fill: none; stroke: var(--accent); }\n.ribbon-svg.on path { fill: var(--ribbon); stroke: var(--ribbon); }\n.ribbon.on { animation: drop .32s cubic-bezier(.2, .9, .3, 1.2); }\n@keyframes drop { from { transform: translateY(-12px); } to { transform: none; } }\n@media (prefers-reduced-motion: reduce) { .ribbon.on { animation: none; } }\n.p-status { padding-top: 8px; min-width: 0; }\n.p-state { font-size: 19px; font-weight: 600; line-height: 1.3; }\n.p-detail { color: var(--muted); font-size: 13px; overflow-wrap: anywhere; }\n.p-note { color: var(--muted); font-size: 14px; margin-bottom: 14px; }\n.p-form { display: grid; gap: 4px; }\n.p-actions { display: flex; align-items: center; gap: 10px; margin-top: 16px; }\n.p-actions .btn.primary { flex: 1; }\n.p-foot { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-top: 14px; }\n.p-meta { color: var(--muted); font-size: 12.5px; }\n.pop .toast { bottom: 12px; }\n/* Sổ Dấu Trang 2.0 — bản Soul (trong Shadow DOM) */\n:host { --font: system-ui, Roboto, 'Segoe UI', 'Noto Sans', sans-serif; }\n.sdt.soul { background: transparent; color: var(--ink); font: 400 15px/1.5 var(--font); }\n\n/* nút ruy băng nổi */\n.rib {\n  position: fixed; right: 0; top: 62vh; width: 44px; height: 58px; padding: 0; margin: 0;\n  border: 0; border-radius: 14px 0 0 14px;\n  background: var(--surface); box-shadow: -2px 3px 14px rgba(20, 30, 60, .22);\n  display: flex; align-items: center; justify-content: center; cursor: pointer;\n  touch-action: none; -webkit-tap-highlight-color: transparent; user-select: none; z-index: 1;\n  opacity: .38; transition: opacity .35s ease;\n}\n/* bám mép trái */\n.rib[data-side=\"left\"] { right: auto; left: 0; border-radius: 0 14px 14px 0; box-shadow: 2px 3px 14px rgba(20, 30, 60, .22); }\n/* mờ khi không chạm; rõ khi chạm, kéo, rê chuột */\n.rib.awake { opacity: .96; transition-duration: .12s; }\n.rib.dragging { opacity: 1; box-shadow: -4px 6px 20px rgba(20, 30, 60, .32); }\n.rib[data-side=\"left\"].dragging { box-shadow: 4px 6px 20px rgba(20, 30, 60, .32); }\n@media (prefers-reduced-motion: reduce) { .rib { transition: none; } }\n.rib-shape { display: block; width: 20px; height: 32px; }\n.rib-shape svg { display: block; width: 20px; height: 32px; overflow: visible; }\n.rib-shape path { fill: none; stroke: var(--accent); }\n.rib[data-state=\"on\"] .rib-shape path { fill: var(--ribbon); stroke: var(--ribbon); }\n.rib[data-state=\"err\"] .rib-shape path { stroke: var(--muted); stroke-dasharray: 3 2; }\n\n/* bảng lưu nhanh */\n.psheet {\n  margin: auto 0 0; padding: 0 0 8px; border: 0; width: 100vw; max-width: 100vw; max-height: 90vh;\n  border-radius: 22px 22px 0 0; background: var(--surface); color: var(--ink); box-shadow: var(--shadow-2); overflow: auto;\n  font: 400 15px/1.5 var(--font);\n}\n.psheet::backdrop { background: rgba(17, 24, 39, .42); }\n@media (min-width: 641px) { .psheet { margin: auto; width: 420px; border-radius: 20px; } }\n.psheet-bar { display: flex; align-items: center; justify-content: flex-end; position: relative; height: 44px; padding: 0 6px; }\n.psheet-grip { position: absolute; left: 50%; top: 10px; width: 40px; height: 4px; margin-left: -20px; border-radius: 2px; background: var(--line); }\n.psheet .pop { width: auto; background: transparent; }\n\n/* trình quản lý lớp phủ */\n.ovl {\n  position: fixed; inset: 0; z-index: 2; overflow: auto; overscroll-behavior: contain;\n  background: var(--bg); color: var(--ink); font: 400 15px/1.5 var(--font);\n}\n.ovl .layout { min-height: 100%; }\n\n/* Thanh công cụ dưới của Soul nằm đè lên trang → chừa khoảng trống ở đáy cho mọi thứ bám đáy màn hình */\n:host { --soul-gap: 64px; }\n@media (max-width: 640px) {\n  .psheet { padding-bottom: calc(8px + var(--soul-gap)); max-height: calc(100vh - 24px); box-sizing: border-box; }\n  .dlg.sheet, .dlg.cmenu:not(.at) { padding-bottom: var(--soul-gap); max-height: calc(100vh - 24px); box-sizing: border-box; }\n  .ovl .main { padding-bottom: calc(110px + var(--soul-gap)); }\n  .ovl .fab { bottom: calc(18px + var(--soul-gap)); }\n  .ovl .bulkbar { padding-bottom: calc(10px + var(--soul-gap)); }\n  :host .toast { bottom: calc(92px + var(--soul-gap)); }\n  :host dialog .toast { bottom: calc(16px + var(--soul-gap)); }\n}\n";
/* Sổ Dấu Trang — bản Soul: nút ruy băng nổi, bảng lưu nhanh, trình quản lý lớp phủ.
   Chạy trong userscript; dùng SDT, SDTUI, SDTNS.SDTPopup, SDTNS.SDTManager, SDT_CSS từ phần dựng. */
(function () {
  'use strict';
  if (window.__sdtSoulLoaded) return;
  window.__sdtSoulLoaded = true;
  const { h } = SDTUI;
  const UI_KEY = 'sdt_ui';

  /* ---------- kho GM (chia phần, giá trị lưu dạng chuỗi JSON) ---------- */
  function gmGet(k, d) {
    try { const v = GM_getValue(k, d); return v === undefined ? d : v; } catch (e) { return d; }
  }
  function gmSet(k, v) { GM_setValue(k, v); }
  const local = {
    async get(keys) {
      const o = {};
      for (const k of keys) {
        const v = gmGet(k, undefined);
        if (v === undefined || v === null) continue;
        o[k] = typeof v === 'string' ? (k === 'sdt_data' || k === 'sdt_data_backup_v1' ? v : JSON.parse(v)) : v;
      }
      return o;
    },
    async set(obj) { for (const [k, v] of Object.entries(obj)) gmSet(k, typeof v === 'string' ? v : JSON.stringify(v)); },
    async remove(keys) { for (const k of keys) { try { GM_deleteValue(k); } catch (e) { gmSet(k, null); } } },
    async getAll() {
      const o = {};
      try { for (const k of GM_listValues()) if (String(k).startsWith('sdt_')) o[k] = gmGet(k, null); } catch (e) { /* bỏ qua */ }
      return o;
    },
  };

  /* ---------- nơi cất dữ liệu: script "Sổ Dấu Trang – Kho" (bền qua cập nhật) hoặc kho GM riêng ---------- */
  const KHO_URL = 'https://raw.githubusercontent.com/Cungbonvotang/SoulBookmarks/main/so-dau-trang-kho.user.js';
  const MOVED = 'sdt_kho_moved';           // đánh dấu trong kho riêng: dữ liệu đã chuyển sang Kho
  function parseVal(k, v) {
    if (k === 'sdt_data' || k === 'sdt_data_backup_v1') return v;
    try { return JSON.parse(v); } catch (e) { return v; }
  }
  function findKho() {
    let pageWin = window;
    try { if (typeof unsafeWindow !== 'undefined' && unsafeWindow) pageWin = unsafeWindow; } catch (e) { /* bỏ qua */ }
    const g = window.__SDT_KHO_FORCE_EVENTS__ ? null : window.__sdtKho1;
    if (g && typeof g.call === 'function') {
      let visible = true;
      try { visible = pageWin === window || !!pageWin.__sdtKho1; } catch (e) { visible = true; }
      const call = q => JSON.parse(g.call(JSON.stringify(q)));
      try { const r = call({ op: 'hello' }); if (r.ok) return { call, channel: 'world', private: !visible, version: r.result.version }; } catch (e) { /* thử đường sự kiện */ }
    }
    // Đường sự kiện DOM: phát và nhận đều đồng bộ trong cùng lúc gọi.
    let want = null, got = null, seq = 0;
    const onRes = e => {
      if (typeof e.detail !== 'string') return;
      try { const r = JSON.parse(e.detail); if (r && r.id === want) got = r; } catch (err) { /* bỏ qua */ }
    };
    document.addEventListener('sdt-kho:res', onRes);
    const call = q => {
      want = 'm' + (++seq) + Math.random().toString(36).slice(2, 7);
      got = null;
      document.dispatchEvent(new CustomEvent('sdt-kho:req', { detail: JSON.stringify(Object.assign({ id: want }, q)) }));
      const r = got; got = null; want = null;
      if (!r) throw new Error('Script Kho không trả lời.');
      return r;
    };
    try { const r = call({ op: 'hello' }); if (r.ok) return { call, channel: 'events', private: false, version: r.result.version }; } catch (e) { /* không có Kho */ }
    document.removeEventListener('sdt-kho:res', onRes);
    return null;
  }
  function khoBackend(kho) {
    const run = q => { const r = kho.call(q); if (!r.ok) throw new Error(r.error || 'Script Kho báo lỗi.'); return r.result; };
    return {
      run,
      async get(keys) { const r = run({ op: 'get', keys }); const o = {}; for (const [k, v] of Object.entries(r)) o[k] = parseVal(k, v); return o; },
      async set(obj) { const d = {}; for (const [k, v] of Object.entries(obj)) d[k] = typeof v === 'string' ? v : JSON.stringify(v); run({ op: 'set', data: d }); },
      async remove(keys) { run({ op: 'remove', keys }); },
      async getAll() { const r = run({ op: 'get', keys: run({ op: 'list' }) }); const o = {}; for (const [k, v] of Object.entries(r)) o[k] = parseVal(k, v); return o; },
    };
  }
  const MISSING = 'Không thấy script “Sổ Dấu Trang – Kho”. Dấu trang của bạn đang nằm trong script Kho: hãy bật lại hoặc cài lại script Kho rồi tải lại trang. Trong lúc này app không ghi gì.';
  const missingBackend = {
    async get(keys) { return keys.includes('sdt_error') ? { sdt_error: MISSING } : {}; },
    async set() { throw new Error(MISSING); },
    async remove() { throw new Error(MISSING); },
    async getAll() { return {}; },
  };
  function localKeys() { try { return (GM_listValues() || []).filter(k => /^sdt_/.test(String(k))); } catch (e) { return []; } }
  // Soul không bảo đảm script Kho chạy trước script chính: chưa thấy Kho thì chờ thêm một lúc rồi mới quyết,
  // và sau đó vẫn dò tiếp — thấy Kho lúc nào thì chuyển sang Kho lúc đó (không bao giờ coi kho riêng trống là dữ liệu thật).
  const KHO_WAIT = 3000;                 // chờ lúc khởi động
  const KHO_LATE = 30000;                // còn dò tiếp thêm chừng này sau đó
  let kho = findKho();
  let active = local;
  let mode = 'local';
  let khoNote = '';
  async function moveToKho(kb, dataKeys) {
    const khoKeys = kb.run({ op: 'list' });
    const khoHas = khoKeys.includes('sdt_meta') || khoKeys.includes('sdt_data');
    if (!khoHas) {
      const d = {};
      for (const k of dataKeys) { const v = gmGet(k, null); if (v !== null && v !== undefined) d[k] = typeof v === 'string' ? v : JSON.stringify(v); }
      kb.run({ op: 'set', data: d });
      const back = kb.run({ op: 'get', keys: Object.keys(d) });
      for (const k of Object.keys(d)) if (back[k] !== d[k]) throw new Error('Kiểm lại sau khi chép không khớp ở ' + k + '.');
      return;
    }
    // Cả hai bên đều có dữ liệu: gộp vào Kho, không bỏ bên nào.
    const sL = SDTStorage.makeStore(local), sK = SDTStorage.makeStore(kb);
    const a = await sK.loadAll(), b = await sL.loadAll();
    if (!a.ok) throw new Error(a.error);
    if (!b.ok) throw new Error(b.error);
    await sK.replaceAll(SDT.mergeData(a.data, b.data).data, 'soul');
  }
  // Nối vào Kho vừa tìm thấy: chuyển dữ liệu kho riêng sang (nếu chưa chuyển) rồi dùng Kho.
  async function attachKho(k) {
    const lk = localKeys();
    const moved = lk.includes(MOVED);
    const kb = khoBackend(k);
    const dataKeys = lk.filter(x => x !== MOVED && x !== UI_KEY);
    if (!moved && (dataKeys.includes('sdt_meta') || dataKeys.includes('sdt_data'))) {
      try { await moveToKho(kb, dataKeys); } catch (e) { khoNote = 'Chưa chuyển được dấu trang sang script Kho (' + e.message + '). App tạm dùng kho riêng như cũ.'; return false; }
    }
    try { gmSet(MOVED, String(Date.now())); } catch (e) { /* bỏ qua */ }
    kho = k; khoNote = '';
    active = kb;
    mode = k.private ? 'kho' : 'kho-page';
    return true;
  }
  const pause = ms => new Promise(r => setTimeout(r, ms));
  let gate = (async () => {
    // Kho riêng đang có dữ liệu chưa chuyển → dùng ngay (Kho có tới muộn thì gộp sang). Trống hoặc đã chuyển → chờ Kho.
    const lk0 = localKeys();
    const localData = !lk0.includes(MOVED) && (lk0.includes('sdt_meta') || lk0.includes('sdt_data'));
    if (!kho && !localData) {
      const end = Date.now() + KHO_WAIT;
      while (!kho && Date.now() < end) { await pause(100); kho = findKho(); }
    }
    if (kho) { const k = kho; kho = null; await attachKho(k); return; }
    if (localKeys().includes(MOVED)) { active = missingBackend; mode = 'missing'; }
  })();
  const ready = gate;
  // Dò Kho muộn (sau lúc khởi động): khi thấy thì chuyển, rồi báo cho ruy băng, bảng, trình quản lý đọc lại.
  let lateUntil = Date.now() + KHO_WAIT + KHO_LATE;
  let lateBusy = false;
  async function lateKho(force) {
    await gate;
    if (lateBusy || kho || khoNote || (!force && Date.now() > lateUntil)) return false;
    const k = findKho();
    if (!k) return false;
    lateBusy = true;
    let done = false;
    gate = (async () => { done = await attachKho(k); })();
    try { await gate; } finally { lateBusy = false; }
    if (done) onKhoAttached();
    return done;
  }
  let onKhoAttached = () => {};
  const lateTimer = setInterval(() => { if (Date.now() > lateUntil || kho) clearInterval(lateTimer); else lateKho(); }, 500);
  const backend = {
    async get(keys) { await gate; return active.get(keys); },
    async set(obj) { await gate; return active.set(obj); },
    async remove(keys) { await gate; return active.remove(keys); },
    async getAll() { await gate; return active.getAll ? active.getAll() : {}; },
  };
  const store = SDTStorage.makeStore(backend);
  function notice() {
    if (khoNote) return { title: 'Chưa chuyển được sang script Kho', text: khoNote };
    if (mode !== 'local') return null;
    return {
      title: 'Chưa cài script Kho',
      text: 'Dấu trang đang nằm trong kho riêng của script này nên sẽ mất khi bấm cập nhật trong Soul. Cài thêm script “Sổ Dấu Trang – Kho” để giữ dấu trang qua mọi lần cập nhật; dữ liệu hiện có sẽ tự chuyển sang.',
      action: { label: 'Cài script Kho', fn: () => openUrl(KHO_URL) },
    };
  }
  function storageInfo() {
    if (mode === 'kho') return 'Nơi cất dữ liệu: script “Sổ Dấu Trang – Kho”. Cập nhật script chính không làm mất dấu trang. Trang web đang mở không đọc được dữ liệu này.';
    if (mode === 'kho-page') return 'Nơi cất dữ liệu: script “Sổ Dấu Trang – Kho”. Cập nhật script chính không làm mất dấu trang. Hai script trao đổi qua trang đang mở, nên về lý thuyết mã của trang có thể đọc được dấu trang.';
    if (mode === 'missing') return MISSING;
    return 'Nơi cất dữ liệu: kho riêng của script này — sẽ mất khi bấm cập nhật trong Soul. Hãy cài script “Sổ Dấu Trang – Kho”.';
  }
  // Soul không báo thay đổi giữa các tab: so rev khi tab hiện lại.
  function checkExternal() { return store.checkExternal(); }

  // Tùy chọn giao diện (vị trí nút): cất trong Kho nếu có, để cũng còn sau khi cập nhật.
  function uiPrefs() {
    try {
      if (kho) { const r = kho.call({ op: 'get', keys: [UI_KEY] }); if (r.ok && r.result[UI_KEY]) return JSON.parse(r.result[UI_KEY]); }
      const v = gmGet(UI_KEY, '{}'); return typeof v === 'string' ? JSON.parse(v || '{}') : (v || {});
    } catch (e) { return {}; }
  }
  function setUiPref(k, val) {
    const p = uiPrefs(); p[k] = val;
    try { if (kho) kho.call({ op: 'set', data: { [UI_KEY]: JSON.stringify(p) } }); else gmSet(UI_KEY, JSON.stringify(p)); } catch (e) { /* bỏ qua */ }
  }

  /* ---------- gốc giao diện trong Shadow DOM ---------- */
  const hostEl = document.createElement('sdt-so-dau-trang');
  // Đặt kiểu bằng CSSOM (trang có CSP chặt vẫn cho phép).
  for (const [k, v] of [['all', 'initial'], ['position', 'fixed'], ['top', '0'], ['left', '0'], ['width', '0'], ['height', '0'],
    ['z-index', '2147483647'], ['display', 'block']]) hostEl.style.setProperty(k, v, 'important');
  const shadow = hostEl.attachShadow({ mode: window.__SDT_TEST__ ? 'open' : 'closed' });
  try {
    const sheet = new CSSStyleSheet();
    sheet.replaceSync(SDT_CSS);
    shadow.adoptedStyleSheets = [sheet];
  } catch (e) {
    const st = document.createElement('style');
    st.textContent = SDT_CSS;
    shadow.append(st);
  }
  const wrap = h('div', { class: 'sdt soul' });
  shadow.append(wrap);
  SDTUI.config({
    host: wrap,
    favicon: false,
    copy: text => { if (typeof GM_setClipboard === 'function') { GM_setClipboard(text); return true; } return false; },
  });

  /* ---------- nút ruy băng ---------- */
  const rib = h('button', {
    type: 'button', class: 'rib', 'data-test': 'soul-ribbon', 'data-state': 'off',
    'aria-label': 'Sổ Dấu Trang: trang này chưa lưu', title: 'Sổ Dấu Trang',
  }, h('span', { class: 'rib-shape', 'aria-hidden': 'true',
    svg: ['0 0 20 32', '<path d="M2.5 2.5H17.5V29L10 22.5L2.5 29Z" stroke-width="2.4" stroke-linejoin="round"/>'] }));
  rib.setAttribute('data-state', 'off');
  wrap.append(rib);

  // Vị trí: bám mép trái hoặc phải (side), cao độ theo tỉ lệ màn hình (y). Cất trong Kho nên nhớ cho mọi trang.
  function clampTop(px) { return Math.max(8, Math.min(window.innerHeight - 64, px)); }
  function placeRibbon() {
    const p = uiPrefs();
    const y = Number(p.y);
    const frac = Number.isFinite(y) && y >= 0 && y <= 1 ? y : 0.62;
    rib.style.top = clampTop(Math.round(frac * window.innerHeight)) + 'px';
    rib.dataset.side = p.side === 'left' ? 'left' : 'right';
  }
  placeRibbon();
  ready.then(() => placeRibbon());          // vị trí cất trong Kho: đọc lại khi đã nối được Kho
  window.addEventListener('resize', placeRibbon);

  // Mờ khi không chạm: rõ lên khi chạm / kéo / rê chuột / bảng đang mở, mờ lại sau ~1,8 giây.
  let fadeTimer = 0;
  function wake(ms) {
    clearTimeout(fadeTimer);
    rib.classList.add('awake');
    if (ms !== 0) fadeTimer = setTimeout(sleep, ms || 1800);
  }
  function sleep() {
    clearTimeout(fadeTimer);
    if (drag || sheet.open || rib.matches(':focus-visible')) return;
    rib.classList.remove('awake');
  }

  let drag = null;
  let suppressClick = false;
  rib.addEventListener('pointerdown', e => {
    const r = rib.getBoundingClientRect();
    drag = { x0: e.clientX, y0: e.clientY, top0: r.top, left0: r.left, w: r.width, moved: false };
    wake(0);
    try { rib.setPointerCapture(e.pointerId); } catch (err) { /* bỏ qua */ }
  });
  rib.addEventListener('pointermove', e => {
    if (!drag) return;
    const dx = e.clientX - drag.x0, dy = e.clientY - drag.y0;
    if (!drag.moved && Math.hypot(dx, dy) < 8) return;
    drag.moved = true;
    rib.classList.add('dragging');
    rib.style.top = clampTop(drag.top0 + dy) + 'px';
    const left = Math.max(0, Math.min(window.innerWidth - drag.w, drag.left0 + dx));
    rib.style.transform = 'translateX(' + Math.round(left - drag.left0) + 'px)';
    e.preventDefault();
  });
  function endDrag() {
    if (!drag) return;
    if (drag.moved) {
      suppressClick = true;
      setTimeout(() => { suppressClick = false; }, 400);
      const r = rib.getBoundingClientRect();
      const side = r.left + r.width / 2 < window.innerWidth / 2 ? 'left' : 'right';
      rib.style.transform = '';
      rib.dataset.side = side;
      setUiPref('y', Math.round(r.top / window.innerHeight * 1000) / 1000);
      setUiPref('side', side);
    }
    rib.classList.remove('dragging');
    drag = null;
    wake();
  }
  rib.addEventListener('pointerup', endDrag);
  rib.addEventListener('pointercancel', endDrag);
  rib.addEventListener('pointerenter', e => { if (e.pointerType === 'mouse') wake(0); });
  rib.addEventListener('pointerleave', e => { if (e.pointerType === 'mouse' && !drag) wake(); });
  rib.addEventListener('focus', () => { if (rib.matches(':focus-visible')) wake(0); });
  rib.addEventListener('blur', () => wake());
  rib.addEventListener('click', () => { if (suppressClick) { suppressClick = false; return; } openSheet(); });

  const timing = { checks: [] };
  async function refreshRibbon() {
    const t0 = performance.now();
    let state = 'off';
    try {
      let r = await store.idsForUrl(location.href);
      if (r.ok === false) { state = 'err'; r = null; }
      else if (r.noMeta) {                       // kho trống hoặc còn dữ liệu v1: chuyển đổi một lần
        const e = await store.ensure();
        if (!e.ok) { state = 'err'; r = null; } else if (e.meta) r = await store.idsForUrl(location.href);
      }
      if (r && r.ids && r.ids.length) state = 'on';
    } catch (e) { state = 'err'; }
    timing.checks.push(performance.now() - t0);
    rib.dataset.state = state;
    rib.setAttribute('aria-label', state === 'on' ? 'Sổ Dấu Trang: trang này đã lưu' : 'Sổ Dấu Trang: trang này chưa lưu');
  }

  /* ---------- bảng lưu nhanh ---------- */
  const popApp = h('main', { class: 'sdt pop', 'aria-live': 'polite' });
  const sheet = h('dialog', { class: 'psheet', 'data-test': 'soul-sheet', 'aria-label': 'Sổ Dấu Trang' },
    h('div', { class: 'psheet-bar' },
      h('span', { class: 'psheet-grip', 'aria-hidden': 'true' }),
      h('button', { type: 'button', class: 'icon-btn', 'data-test': 'soul-sheet-close', 'aria-label': 'Đóng', onclick: closeSheet }, SDTUI.icon('close'))),
    popApp);
  sheet.addEventListener('click', e => { if (e.target === sheet) closeSheet(); });
  sheet.addEventListener('cancel', e => { e.preventDefault(); closeSheet(); });
  wrap.append(sheet);
  let popup = null;
  const popEnv = {
    store,
    notice,
    getTarget: async () => ({ url: location.href, title: document.title }),
    openManager: () => { closeSheet(); openManager(); },
    prefs: { get: k => uiPrefs()[k] || null, set: (k, v) => setUiPref(k, v) },
  };
  function openSheet() {
    if (!overlay.hidden) closeManager();
    if (!popup) popup = SDTNS.SDTPopup.mount(popApp, popEnv);
    else popup.refresh(false);
    if (!sheet.open) sheet.showModal();
  }
  function closeSheet() { if (sheet.open) sheet.close(); refreshRibbon(); }
  sheet.addEventListener('close', () => wake());

  /* ---------- trình quản lý lớp phủ ---------- */
  // Nhớ cách sắp xếp, chỗ đang xem, vị trí cuộn: cất trong Kho (chung mọi trang, còn sau khi cập nhật script).
  const mgrState = { load: () => uiPrefs().mgr || null, save: o => setUiPref('mgr', o) };
  const overlay = h('div', { class: 'ovl', 'data-test': 'soul-overlay', hidden: true });
  wrap.append(overlay);
  let manager = null;
  let pushed = false;
  let savedOverflow = null;
  function lockScroll() {
    const de = document.documentElement;
    savedOverflow = { html: de.style.getPropertyValue('overflow'), htmlP: de.style.getPropertyPriority('overflow'),
      body: document.body ? document.body.style.getPropertyValue('overflow') : '', bodyP: document.body ? document.body.style.getPropertyPriority('overflow') : '' };
    de.style.setProperty('overflow', 'hidden', 'important');
    if (document.body) document.body.style.setProperty('overflow', 'hidden', 'important');
  }
  function unlockScroll() {
    if (!savedOverflow) return;
    const de = document.documentElement;
    if (savedOverflow.html) de.style.setProperty('overflow', savedOverflow.html, savedOverflow.htmlP); else de.style.removeProperty('overflow');
    if (document.body) {
      if (savedOverflow.body) document.body.style.setProperty('overflow', savedOverflow.body, savedOverflow.bodyP); else document.body.style.removeProperty('overflow');
    }
    savedOverflow = null;
  }
  function openUrl(url) {
    if (!SDT.safeUrl(url)) return;
    try { if (typeof GM_openInTab === 'function') { GM_openInTab(url, false); return; } } catch (e) { /* thử cách khác */ }
    window.open(url, '_blank', 'noopener');
  }
  function openManager() {
    if (sheet.open) sheet.close();
    if (!overlay.hidden) return;
    overlay.hidden = false;
    if (!manager) manager = SDTNS.SDTManager.mount(overlay, { store, openUrl, notice, storageInfo, state: mgrState, onClose: () => closeManager(), pasteBackup: true, scroller: () => overlay, keyTarget: overlay });
    else manager.reopen();
    lockScroll();
    try { history.pushState(Object.assign({}, history.state, { sdtOverlay: true }), ''); pushed = true; } catch (e) { pushed = false; }
  }
  function closeManager(fromPop) {
    if (overlay.hidden) return;
    if (manager) manager.saveState();
    overlay.hidden = true;
    if (manager) manager.setDrawer(false);
    unlockScroll();
    if (pushed && !fromPop) { pushed = false; try { history.back(); } catch (e) { /* bỏ qua */ } }
    pushed = false;
    refreshRibbon();
  }
  window.addEventListener('popstate', () => { if (!overlay.hidden) closeManager(true); });

  /* ---------- theo dõi thay đổi ---------- */
  onKhoAttached = () => {
    placeRibbon();
    checkExternal();                         // rev khác → bảng / trình quản lý đọc lại
    refreshRibbon();
    if (popup && sheet.open) popup.refresh(false);
    if (manager && !overlay.hidden) manager.reopen();
  };
  store.onChange(() => refreshRibbon());
  document.addEventListener('visibilitychange', () => { if (!document.hidden) { lateKho(true); checkExternal(); refreshRibbon(); } });
  window.addEventListener('focus', () => { lateKho(true); checkExternal(); });
  window.addEventListener('pageshow', () => { lateKho(true); checkExternal(); refreshRibbon(); });
  let lastHref = location.href;
  setInterval(() => { if (location.href !== lastHref) { lastHref = location.href; refreshRibbon(); } }, 700);

  try {
    if (typeof GM_registerMenuCommand === 'function') {
      GM_registerMenuCommand('Lưu / sửa trang này', openSheet);
      GM_registerMenuCommand('Mở trình quản lý', openManager);
    }
  } catch (e) { /* Soul không hiện menu cũng không sao */ }

  (document.documentElement || document.body).append(hostEl);
  refreshRibbon();
  if (window.__SDT_TEST__) window.__SDT_SOUL__ = { shadow, openSheet, openManager, closeManager, store, timing, ready,
    storage: () => ({ mode, channel: kho ? kho.channel : null, private: kho ? kho.private : null, note: khoNote }) };
})();

})();
