// node tests/fix261.test.js — lỗi sửa ở 2.6.1 (hàm thuần + kho): thứ tự kéo thả, ghi chồng nhau, ghép thay đổi
const SDT = require('../ext/core.js');
global.SDT = SDT; require('../ext/storage.js');
const kq = {};
const ok = (name, cond, info) => { kq[name] = !!cond; if (!cond) console.log('TRƯỢT', name, info !== undefined ? JSON.stringify(info).slice(0, 500) : ''); };
const mk = (id, order, c) => ({ id, title: id, url: 'https://x.vn/' + id, urlKey: 'x.vn/' + id, folderId: null, tags: [], createdAt: c || 1, updatedAt: c || 1, order });
const now = 1794300000000;
const dropLoop = (list, times) => {
  let d = Object.assign(SDT.emptyData(), { bookmarks: list });
  for (let i = 1; i <= times; i++) {
    const mover = i % 2 ? 'm' : 'c';
    d = SDT.placeItems(d, [{ kind: 'b', id: mover }], null, { after: { kind: 'b', id: 'a' } }, now).data;
    const o = SDT.listFolder(d, null, 'manual').bookmarks.map(b => b.id).join('');
    const orders = d.bookmarks.map(b => b.order);
    if (o.slice(0, 2) !== 'a' + mover || new Set(orders).size !== orders.length) return { lan: i, o };
  }
  return null;
};
ok('CT-141 thứ tự cỡ Date.now(), khe 1: 200 lần thả vào cùng khe vẫn đúng chỗ, không trùng số', dropLoop([mk('a', now), mk('b', now + 1), mk('c', now + 2), mk('m', now + 3)], 200) === null);
ok('CT-141 thứ tự cỡ Date.now(), khe vài giây: 200 lần', dropLoop([mk('a', now, 4), mk('b', now + 4000, 3), mk('c', now + 9000, 2), mk('m', now + 15000, 1)], 200) === null);
ok('CT-141 thứ tự nhỏ: 200 lần', dropLoop([mk('a', 1), mk('b', 2), mk('c', 3), mk('m', 4)], 200) === null);

// ghép thay đổi
const base = Object.assign(SDT.emptyData(), { bookmarks: [mk('a', 1), mk('b', 2), mk('c', 3)] });
const delA = SDT.deleteBookmarks(base, ['a']).data;                     // thao tác 1 đã ghi xong
const editB = SDT.updateBookmark(base, 'b', { title: 'B mới', url: 'https://x.vn/b', tags: [] }, 9).data;   // thao tác 2 tính từ bản cũ
const merged = SDT.rebaseChanges(delA, base, editB);
ok('CT-142 ghép thay đổi: giữ việc xóa a và áp việc sửa b', merged.bookmarks.map(b => b.id).join() === 'b,c' && merged.bookmarks[0].title === 'B mới', merged.bookmarks);
ok('CT-142 dữ liệu chưa đổi → dùng thẳng bản mới', SDT.rebaseChanges(base, base, editB) === editB);

(async () => {
  const mem = {};
  const wait = ms => new Promise(r => setTimeout(r, ms));
  const backend = { async get(keys) { await wait(4); const o = {}; for (const k of keys) if (k in mem) o[k] = JSON.parse(JSON.stringify(mem[k])); return o; },
    async set(o) { await wait(4); for (const [k, v] of Object.entries(o)) mem[k] = JSON.parse(JSON.stringify(v)); }, async remove(keys) { for (const k of keys) delete mem[k]; } };
  const st = SDTStorage.makeStore(backend);
  const ids = []; for (let i = 0; ids.length < 4; i++) if (SDTStorage.shardOf('k' + i) === 7) ids.push('k' + i);
  await st.replaceAll(Object.assign(SDT.emptyData(), { bookmarks: ids.map((id, i) => mk(id, i)) }));
  const D0 = (await st.loadAll()).data;
  await Promise.all([st.save(D0, SDT.deleteBookmarks(D0, [ids[0]]).data), st.save(D0, SDT.deleteBookmarks(D0, [ids[1]]).data),
    st.save(D0, SDT.updateBookmark(D0, ids[2], { title: 'Sửa', url: 'https://x.vn/' + ids[2], tags: ['t'] }, 9).data)]);
  const fin = (await st.loadAll()).data.bookmarks;
  ok('CT-143 ba lần ghi cùng lúc vào một phần dữ liệu: không mất lần nào', fin.map(b => b.id).sort().join() === [ids[2], ids[3]].sort().join() && fin.find(b => b.id === ids[2]).title === 'Sửa' && mem.sdt_meta.rev === 4, [fin.map(b => b.id), mem.sdt_meta.rev]);
  // thay thế toàn bộ xếp hàng cùng các lần ghi
  const p1 = st.save(fin.length ? (await st.loadAll()).data : D0, SDT.emptyData());
  const p2 = st.replaceAll(Object.assign(SDT.emptyData(), { bookmarks: [mk('q', 1)] }));
  await Promise.all([p1, p2]);
  ok('CT-143 thay thế toàn bộ chạy sau lần ghi đang chờ', (await st.loadAll()).data.bookmarks.map(b => b.id).join() === 'q');
  // khóa chung của backend được dùng
  let locked = 0;
  const st2 = SDTStorage.makeStore(Object.assign({}, backend, { lock: async fn => { locked++; return fn(); } }));
  const L = (await st2.loadAll()).data;
  await st2.save(L, SDT.addBookmark(L, { title: 'x', url: 'https://moi.vn', tags: [] }, 5).data);
  ok('CT-143 dùng khóa chung của backend khi có', locked === 1, locked);
  const names = Object.keys(kq), pass = names.filter(n => kq[n]);
  console.log('Sửa lỗi 2.6.1: ' + pass.length + '/' + names.length + ' qua');
  process.exitCode = pass.length === names.length ? 0 : 1;
})();
