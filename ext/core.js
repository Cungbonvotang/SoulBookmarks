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
})(typeof globalThis !== 'undefined' ? globalThis : this);
