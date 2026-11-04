// node tests/core.test.js — thử hàm thuần và kho chia phần (bản 2.0.0)
const SDT = require('../ext/core.js');
globalThis.SDT = SDT;
require('../ext/storage.js');
const { makeStore, layout, shardOf } = globalThis.SDTStorage;
const kq = {};
const ok = (name, cond, info) => { kq[name] = !!cond; if (!cond) console.log('TRƯỢT', name, info !== undefined ? JSON.stringify(info).slice(0, 400) : ''); };
const T = (y, m, d, hh = 12, mm = 0) => new Date(y, m - 1, d, hh, mm).getTime();

(async () => {
  // CT-23 so khớp địa chỉ
  const same = [['http://vidu.vn/a', 'https://vidu.vn/a'], ['https://www.vidu.vn/a', 'https://vidu.vn/a'], ['https://vidu.vn/a/', 'https://vidu.vn/a'],
    ['https://vidu.vn/a#abc', 'https://vidu.vn/a'], ['https://VIDU.vn/a', 'https://vidu.vn/a'], ['http://www.vidu.vn/a/', 'https://vidu.vn/a']];
  ok('CT-23 cùng trang', same.every(([a, b]) => SDT.normalizeUrl(a) === SDT.normalizeUrl(b)));
  ok('CT-23 khác trang', SDT.normalizeUrl('https://vidu.vn/a?a=1') !== SDT.normalizeUrl('https://vidu.vn/a?a=2') && SDT.normalizeUrl('https://vidu.vn/a') !== SDT.normalizeUrl('https://vidu.vn/b'));
  ok('CT-12 địa chỉ', !SDT.fixUrl('').ok && !SDT.fixUrl('không phải url').ok && SDT.fixUrl('vnexpress.net').url === 'https://vnexpress.net');
  ok('CT-14 nội bộ', !SDT.isSavableUrl('chrome://extensions') && !SDT.isSavableUrl('about:blank') && SDT.isSavableUrl('https://a.vn'));
  ok('CT-10 nhãn', JSON.stringify(SDT.parseTags('a, B ,b , a')) === '["a","B"]');

  // Thư mục, thứ tự
  let d = SDT.emptyData();
  let r = SDT.addFolder(d, 'Công việc', null, 1); d = r.data; const cv = r.folder.id;
  r = SDT.addFolder(d, 'Dự án', cv, 2); d = r.data; const da = r.folder.id;
  r = SDT.addFolder(d, 'Anime', null, 3); d = r.data; const an = r.folder.id;
  ok('CT-03/04 tên thư mục', !SDT.addFolder(d, '  ', null, 3).ok && !SDT.addFolder(d, 'công việc', null, 3).ok && SDT.addFolder(d, 'Công việc', da, 3).ok);
  ok('thứ tự thư mục mới ở cuối', SDT.childrenOf(d, null).map(f => f.name).join() === 'Công việc,Anime');
  ok('CT-05 chuyển vào con / chính nó', !SDT.moveFolder(d, cv, da).ok && !SDT.moveFolder(d, cv, cv).ok && SDT.moveFolder(d, da, null).ok);
  r = SDT.addBookmark(d, { title: 'A', url: 'https://a.vn', folderId: cv, tags: [] }, 10); d = r.data; const a = r.bookmark.id;
  r = SDT.addBookmark(d, { title: 'B', url: 'https://b.vn', folderId: cv, tags: [] }, 11); d = r.data; const b = r.bookmark.id;
  r = SDT.addBookmark(d, { title: 'C', url: 'https://c.vn', folderId: cv, tags: [] }, 12); d = r.data; const c = r.bookmark.id;
  r = SDT.addBookmark(d, { title: 'D', url: 'https://d.vn', folderId: da, tags: [] }, 13); d = r.data;
  const lf = SDT.listFolder(d, cv, 'manual');
  ok('CT-63 nội dung thư mục', lf.folders.map(f => f.name).join() === 'Dự án' && lf.bookmarks.map(x => x.title).join() === 'A,B,C');
  // CT-64 kéo C lên đầu
  r = SDT.placeItems(d, [{ kind: 'b', id: c }], cv, { before: a }, 99);
  const order1 = SDT.listFolder(r.data, cv, 'manual').bookmarks.map(x => x.title).join();
  const cAfter = r.data.bookmarks.find(x => x.id === c);
  ok('CT-64 đổi chỗ, không đổi thời gian', order1 === 'C,A,B' && cAfter.updatedAt === 12, order1);
  // nhiều lần chèn vào cùng khe → đánh số lại vẫn đúng
  let dd = d;
  for (let i = 0; i < 60; i++) dd = SDT.placeItems(dd, [{ kind: 'b', id: i % 2 ? b : c }], cv, { before: i % 2 ? c : b }, 99).data;
  ok('chèn nhiều lần không vỡ thứ tự', new Set(SDT.listFolder(dd, cv, 'manual').bookmarks.map(x => x.order)).size === 3);
  // CT-65 thả vào thư mục
  r = SDT.placeItems(d, [{ kind: 'b', id: a }], da, 'end', 100);
  const aMoved = r.data.bookmarks.find(x => x.id === a);
  ok('CT-65 thả vào thư mục', aMoved.folderId === da && aMoved.updatedAt === 100 && SDT.listFolder(r.data, da, 'manual').bookmarks.map(x => x.title).join() === 'D,A');
  ok('CT-65 thư mục vào con của nó', !SDT.placeItems(d, [{ kind: 'f', id: cv }], da, 'end', 100).ok);
  // CT-68 sao chép
  r = SDT.copyItems(d, [{ kind: 'b', id: a }], an, 'end', 200);
  const copies = r.data.bookmarks.filter(x => x.folderId === an);
  ok('CT-68 sao chép dấu trang', copies.length === 1 && copies[0].id !== a && copies[0].createdAt === 200 && r.data.bookmarks.some(x => x.id === a && x.folderId === cv));
  r = SDT.copyItems(d, [{ kind: 'f', id: cv }], an, 'end', 300);
  const cvCopy = SDT.childrenOf(r.data, an)[0];
  const sub = cvCopy && SDT.childrenOf(r.data, cvCopy.id)[0];
  ok('CT-68 sao chép thư mục cả cây', cvCopy && cvCopy.name === 'Công việc' && sub && sub.name === 'Dự án' &&
    r.data.bookmarks.filter(x => x.folderId === cvCopy.id).length === 3 && r.data.bookmarks.filter(x => x.folderId === sub.id).length === 1);
  r = SDT.copyItems(d, [{ kind: 'f', id: an }], null, 'end', 300);
  ok('CT-68 trùng tên khi dán → (2)', SDT.childrenOf(r.data, null).some(f => f.name === 'Anime (2)'));
  r = SDT.placeItems(d, [{ kind: 'b', id: c }], cv, { after: { kind: 'b', id: a } }, 99);
  ok('CT-68 dán ngay sau dòng', SDT.listFolder(r.data, cv, 'manual').bookmarks.map(x => x.title).join() === 'A,C,B');
  // xóa thư mục
  let m = SDT.deleteFolder(d, cv, 'move', 20).data;
  ok('CT-07 chuyển lên cha', !SDT.getFolder(m, cv) && m.bookmarks.filter(x => !x.folderId).length === 3 && SDT.getFolder(m, da).parentId === null);
  m = SDT.deleteFolder(d, cv, 'all', 20).data;
  ok('CT-07 xóa hết', m.bookmarks.length === 0 && m.folders.length === 1);
  m = SDT.deleteItems(d, [{ kind: 'f', id: cv }, { kind: 'b', id: a }]).data;
  ok('xóa nhiều mục', m.folders.length === 1 && m.bookmarks.length === 0);

  // CT-15, CT-16, CT-18
  let u = SDT.updateBookmark(d, a, { title: 'A', url: 'https://a.vn', folderId: cv, tags: ['moi'] }, 99);
  ok('CT-15 sửa', u.changed && u.bookmark.updatedAt === 99 && u.bookmark.createdAt === 10);
  u = SDT.updateBookmark(d, a, { title: 'A', url: 'https://a.vn', folderId: cv, tags: [] }, 99);
  ok('CT-16 không đổi', !u.changed && u.bookmark.updatedAt === 10);
  const del = SDT.deleteBookmarks(d, [a]);
  ok('CT-18 hoàn tác', JSON.stringify(SDT.restoreBookmarks(del.data, del.removed).bookmarks) === JSON.stringify(d.bookmarks));

  // Tìm kiếm nhiều điều kiện
  let s = SDT.emptyData();
  const add = (title, url, tags, cAt, upAt, folderId) => { const x = SDT.addBookmark(s, { title, url, tags, folderId }, cAt); s = x.data; if (upAt) s = SDT.updateBookmark(s, x.bookmark.id, { title, url, tags: tags.concat(['sửa']), folderId }, upAt).data; return x.bookmark.id; };
  add('Thám tử lừng danh Conan tập 1100', 'https://vidu.vn/conan-1100', ['anime', 'conan'], T(2026, 8, 12));
  add('Conan movie 29', 'https://vidu.vn/movie-29', ['anime'], T(2026, 8, 3));
  add('Conan tập 1', 'https://khac.vn/conan-1', ['anime'], T(2026, 8, 5));          // sai địa chỉ
  add('Conan tập 2', 'https://vidu.vn/conan-2', ['phim'], T(2026, 8, 6));            // thiếu nhãn
  add('Conan tập 3', 'https://vidu.vn/conan-3', ['anime'], T(2026, 9, 1, 0, 0));     // tháng 9
  add('One Piece', 'https://vidu.vn/one-piece', ['anime'], T(2026, 8, 7));           // sai tên
  add('Du lịch Hà Nội', 'https://dulich.vn/ha-noi', ['du lịch'], T(2026, 10, 15, 0, 0));
  add('GitHub repo', 'https://github.com/x', ['code', 'js'], T(2026, 10, 15, 23, 59));
  add('Bài viết', 'https://blog.vn/github-tips', ['code'], T(2026, 10, 5), T(2026, 10, 25));
  add('Ghi chú', 'https://note.vn', ['github'], T(2026, 9, 30));
  add('Nhuận cuối', 'https://n.vn/1', [], T(2028, 2, 29, 23, 59));
  add('Sau nhuận', 'https://n.vn/2', [], T(2028, 3, 1, 0, 0));
  add('Trước nhuận', 'https://n.vn/3', [], T(2028, 1, 31, 23, 59));
  const n = q => SDT.search(s, q).items.length;
  const titles = q => SDT.search(s, q).items.map(x => x.title).sort();
  ok('CT-58 bốn điều kiện', JSON.stringify(titles({ dateMode: 'month', month: '2026-08', tags: ['anime'], urlText: 'vidu.vn', title: 'Conan' })) ===
    JSON.stringify(['Conan movie 29', 'Thám tử lừng danh Conan tập 1100']), titles({ dateMode: 'month', month: '2026-08', tags: ['anime'], urlText: 'vidu.vn', title: 'Conan' }));
  ok('CT-59 tháng nhuận', JSON.stringify(titles({ dateMode: 'month', month: '2028-02' })) === '["Nhuận cuối"]');
  ok('CT-25 bỏ dấu', n({ text: 'ha noi' }) === 1 && n({ text: 'HÀ NỘI' }) === 1 && n({ text: 'noi ha' }) === 1);
  ok('CT-26 tên / địa chỉ riêng', n({ title: 'github' }) === 1 && n({ urlText: 'github' }) === 2 && n({ title: 'github', urlText: 'github' }) === 1 && n({ text: 'github' }) === 3);
  ok('CT-27 nhiều nhãn', JSON.stringify(titles({ tags: ['code', 'JS'] })) === '["GitHub repo"]');
  ok('CT-28 đúng ngày', n({ dateMode: 'exact', date: '2026-10-15' }) === 2 && JSON.stringify(titles({ dateMode: 'exact', date: '2026-10-25', dateField: 'updatedAt' })) === '["Bài viết"]');
  const sw = SDT.search(s, { dateMode: 'range', from: '2026-10-31', to: '2026-10-01' });
  ok('CT-31 đổi chỗ ngày', sw.swapped && sw.items.length === 3);
  ok('CT-30 chỉ Từ / Đến', n({ dateMode: 'range', from: '2028-01-01' }) === 3 && n({ dateMode: 'range', to: '2026-08-04' }) === 1);
  ok('CT-34 sắp xếp', SDT.sortBookmarks(s.bookmarks, 'az')[0].title === 'Bài viết' && SDT.sortBookmarks(s.bookmarks, 'created')[0].title === 'Sau nhuận');
  // CT-33 phạm vi thư mục gồm con
  ok('CT-33 phạm vi', SDT.search(d, { folder: cv }).items.length === 4 && SDT.search(d, { folder: da }).items.length === 1 && SDT.search(d, { folder: da, scope: 'all' }).items.length === 4);

  // Màu nhãn
  ok('CT-62 màu tự gán ổn định', SDT.autoTagColor('Anime') === SDT.autoTagColor('anime') && SDT.TAG_COLORS.includes(SDT.autoTagColor('x')));
  let tc = SDT.setTagColor(s, 'anime', 'purple').data;
  ok('CT-62 đổi màu', SDT.tagColor(tc, 'ANIME') === 'purple');
  let rn = SDT.renameTag(tc, 'anime', 'hoạt hình', 5);
  ok('CT-62 đổi tên giữ màu', SDT.tagColor(rn.data, 'hoạt hình') === 'purple');
  tc = SDT.setTagColor(tc, 'phim', 'green').data;
  rn = SDT.renameTag(tc, 'anime', 'phim', 5);
  ok('CT-62 gộp lấy màu đích', rn.merged && SDT.tagColor(rn.data, 'phim') === 'green');
  const dt = SDT.deleteTag(tc, 'anime', 6);
  ok('CT-62 xóa nhãn bỏ màu', SDT.tagColor(dt.data, 'anime') === SDT.autoTagColor('anime'));
  rn = SDT.renameTag(s, 'js', 'javascript', 7); rn = SDT.renameTag(rn.data, 'javascript', 'Code', 8);
  ok('CT-37 gộp nhãn', rn.merged && rn.data.bookmarks.every(x => new Set(x.tags.map(t => t.toLowerCase())).size === x.tags.length));

  // Chuyển đổi v1 → v2
  const v1 = { version: 1, folders: [{ id: 'f2', name: 'Zeta', parentId: null, createdAt: 1 }, { id: 'f1', name: 'Alpha', parentId: null, createdAt: 2 }],
    bookmarks: [{ id: 'b2', title: 'Sau', url: 'https://s.vn', folderId: 'f1', tags: ['x'], createdAt: 20, updatedAt: 20 },
      { id: 'b1', title: 'Trước', url: 'https://t.vn', folderId: 'f1', tags: [], createdAt: 10, updatedAt: 15 }] };
  const mv = SDT.validateData(v1);
  ok('CT-74 chuyển v1 → v2', mv.ok && mv.data.version === 2 && SDT.childrenOf(mv.data, null).map(f => f.name).join() === 'Alpha,Zeta' &&
    SDT.listFolder(mv.data, 'f1', 'manual').bookmarks.map(x => x.title).join() === 'Trước,Sau' && mv.data.bookmarks.find(x => x.id === 'b1').updatedAt === 15);
  const pl = JSON.parse(JSON.stringify(SDT.exportPayload(tc, T(2026, 11, 3))));
  const back = SDT.validateData(pl);
  ok('CT-38 khứ hồi giữ thứ tự và màu', back.ok && back.data.tagColors.anime === 'purple' && back.data.bookmarks.every((x, i) => x.order === tc.bookmarks[i].order));
  ok('CT-42 bản mới hơn', SDT.validateData({ version: 3, folders: [], bookmarks: [] }).code === 'newer');
  ok('CT-39 sai cấu trúc', !SDT.validateData({ a: 1 }).ok && !SDT.validateData('xin chào').ok && !SDT.validateData({ version: 2, folders: [], bookmarks: [{ id: 'x' }] }).ok);

  // Kho chia phần (giả lập nơi lưu trong bộ nhớ)
  const mem = (init) => {
    const S = new Map(Object.entries(init || {}).map(([k, v]) => [k, JSON.stringify(v)]));
    const log = { sets: [] };
    return {
      S, log,
      async get(keys) { const o = {}; for (const k of keys) if (S.has(k)) o[k] = JSON.parse(S.get(k)); return o; },
      async set(obj) { log.sets.push(Object.keys(obj)); for (const [k, v] of Object.entries(obj)) S.set(k, JSON.stringify(v)); },
      async remove(keys) { for (const k of keys) S.delete(k); },
      async getAll() { const o = {}; for (const [k, v] of S) o[k] = JSON.parse(v); return o; },
    };
  };
  let be = mem({ sdt_data: v1 });
  let st = makeStore(be);
  let all = await st.loadAll();
  ok('CT-74 kho chuyển v1 → v2 + dự phòng', all.ok && all.data.bookmarks.length === 2 && be.S.has('sdt_meta') && !be.S.has('sdt_data') &&
    JSON.stringify(JSON.parse(be.S.get('sdt_data_backup_v1'))) === JSON.stringify(v1));
  be = mem({ sdt_data: { version: 1, folders: 'x', bookmarks: [] } }); st = makeStore(be);
  all = await st.loadAll();
  ok('CT-74 v1 hỏng không ghi đè', !all.ok && be.log.sets.length === 0 && be.S.has('sdt_data'));
  be = mem({ sdt_meta: { version: 3, rev: 1 } }); st = makeStore(be);
  ok('kho bản mới hơn báo lỗi', !(await st.loadAll()).ok);
  // dữ liệu lớn: ghi một dấu trang chỉ chạm ít khóa
  let big = SDT.emptyData();
  const bms = [];
  for (let i = 0; i < 5000; i++) bms.push({ id: 'id' + i, title: 'Trang ' + i, url: 'https://site' + (i % 300) + '.vn/p/' + i, urlKey: SDT.normalizeUrl('https://site' + (i % 300) + '.vn/p/' + i), folderId: null, tags: ['t' + (i % 50)], createdAt: i, updatedAt: i, order: i });
  big = Object.assign(big, { bookmarks: bms });
  be = mem(); st = makeStore(be);
  await st.replaceAll(big);
  all = await st.loadAll();
  ok('replaceAll / loadAll khứ hồi', all.ok && all.data.bookmarks.length === 5000);
  const before = all.data;
  const ed = SDT.updateBookmark(before, 'id42', { title: 'Sửa', url: 'https://khac.vn/x', folderId: null, tags: ['moi'] }, 9e12);
  be.log.sets = [];
  const res = await st.save(before, ed.data);
  ok('CT-73 lưu một dấu trang ghi ≤ 6 khóa', res.keys.length <= 6 && be.log.sets.length === 1, res.keys);
  const lk = await st.lookupUrl('https://www.khac.vn/x/');
  const lkOld = await st.lookupUrl('https://site42.vn/p/42');
  const lite = await st.loadLite();
  ok('tra địa chỉ + thống kê nhãn', lk.bookmarks.length === 1 && lk.bookmarks[0].title === 'Sửa' && lkOld.bookmarks.length === 0 && lite.tags.includes('moi') && !lite.tags.includes('xyz'));
  const dl = SDT.deleteBookmarks(ed.data, ['id42']);
  await st.save(ed.data, dl.data);
  ok('xóa cập nhật bảng tra', (await st.lookupUrl('https://khac.vn/x')).bookmarks.length === 0 && (await st.loadAll()).data.bookmarks.length === 4999);
  // sự kiện trong trang
  let got = null; st.onChange(i => { got = i; });
  await st.save(dl.data, SDT.addFolder(dl.data, 'Mới', null, 1).data, 'mgr');
  ok('báo thay đổi kèm nguồn', got && got.own && got.origin === 'mgr');
  ok('phần chia đều', new Set(bms.slice(0, 200).map(x => shardOf(x.id))).size > 40);

  const pass = Object.values(kq).filter(Boolean).length;
  console.log(`Hàm thuần + kho: ${pass}/${Object.keys(kq).length} qua`);
  process.exit(pass === Object.keys(kq).length ? 0 : 1);
})();
