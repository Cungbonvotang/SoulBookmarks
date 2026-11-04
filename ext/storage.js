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
        if (!m) return;
        const nv = m.newValue;
        if (nv && nv.writer === writer) return;          // chính mình ghi: đã báo qua kênh trong trang
        lastRev = nv ? nv.rev : null;
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
      return { ok: true, data: v.data, rev: e.meta.rev, meta: e.meta };
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

    // Ghi phần thay đổi: chỉ đọc/ghi các phần bị chạm.
    async function apply(diff, origin) {
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
      if (diff.folders) out[K.folders] = diff.folders;
      if (diff.tagColors) meta.tagColors = diff.tagColors;
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
      if (!d.upserts.length && !d.deletes.length && !d.folders && !d.tagColors) return { rev: lastRev, keys: [] };
      return apply(d, origin);
    }

    async function replaceAll(data, origin) {
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
})(typeof globalThis !== 'undefined' ? globalThis : this);
