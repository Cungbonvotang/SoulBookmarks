// node tests/fix26.test.js — các lỗi sửa ở 2.6.0 (hàm thuần + kho chia phần trong bộ nhớ)
const SDT = require('../ext/core.js');
global.SDT = SDT; require('../ext/storage.js');
const kq = {};
const ok = (name, cond, info) => { kq[name] = !!cond; if (!cond) console.log('TRƯỢT', name, info !== undefined ? JSON.stringify(info).slice(0, 500) : ''); };
const mk = (id, title, url, folderId) => ({ id, title, url, urlKey: SDT.normalizeUrl(url), folderId: folderId || null, tags: [], createdAt: 1, updatedAt: 1, order: 1 });
const base = Object.assign(SDT.emptyData(), { folders: [{ id: 'f1', name: 'Một', parentId: null, createdAt: 1, order: 1 }], bookmarks: [mk('a', 'A', 'https://a.vn'), mk('b', 'B', 'https://b.vn', 'f1')], tagColors: { anime: 'purple' } });

// L1 Hoàn tác theo mục
const afterDel = SDT.deleteBookmarks(base, ['a']).data;
const external = Object.assign({}, afterDel, { bookmarks: afterDel.bookmarks.concat([mk('n', 'Lưu từ popup', 'https://moi.vn')]) });
let u = SDT.revertChanges(external, base, afterDel);
ok('CT-125 Hoàn tác giữ mục nơi khác vừa lưu', u.bookmarks.some(b => b.id === 'a') && u.bookmarks.some(b => b.id === 'n') && u.bookmarks.length === 3, u.bookmarks.map(b => b.id));
const edited = SDT.updateBookmark(base, 'b', { title: 'B sửa', url: 'https://b.vn', folderId: 'f1', tags: [] }, 5).data;
const ext2 = Object.assign({}, edited, { bookmarks: edited.bookmarks.map(b => (b.id === 'a' ? Object.assign({}, b, { title: 'A sửa ở tab khác' }) : b)) });
u = SDT.revertChanges(ext2, base, edited);
ok('CT-125 Hoàn tác sửa: chỉ trả mục đã sửa, giữ sửa của nơi khác', u.bookmarks.find(b => b.id === 'b').title === 'B' && u.bookmarks.find(b => b.id === 'a').title === 'A sửa ở tab khác');
const addF = SDT.addFolder(base, 'Hai', null, 9).data;
const ext3 = Object.assign({}, addF, { folders: addF.folders.concat([{ id: 'f9', name: 'Tab khác', parentId: null, createdAt: 2, order: 9 }]) });
u = SDT.revertChanges(ext3, base, addF);
ok('CT-125 Hoàn tác tạo thư mục: bỏ thư mục vừa tạo, giữ thư mục nơi khác', u.folders.map(f => f.name).sort().join() === 'Một,Tab khác', u.folders.map(f => f.name));
const col = SDT.setTagColor(base, 'anime', 'red').data;
const ext4 = Object.assign({}, col, { tagColors: Object.assign({}, col.tagColors, { phim: 'green' }) });
u = SDT.revertChanges(ext4, base, col);
ok('CT-125 Hoàn tác màu nhãn theo từng nhãn', u.tagColors.anime === 'purple' && u.tagColors.phim === 'green', u.tagColors);

// L1b ghi thư mục / màu theo mục trong kho
(async () => {
  const mem = {};
  const backend = { async get(keys) { const o = {}; for (const k of keys) if (k in mem) o[k] = JSON.parse(JSON.stringify(mem[k])); return o; }, async set(o) { for (const [k, v] of Object.entries(o)) mem[k] = JSON.parse(JSON.stringify(v)); }, async remove(keys) { for (const k of keys) delete mem[k]; } };
  const A = SDTStorage.makeStore(backend), B = SDTStorage.makeStore(backend);
  await A.replaceAll(base);
  const la = (await A.loadAll()).data, lb = (await B.loadAll()).data;
  await B.save(lb, SDT.addFolder(lb, 'Tạo ở tab B', null, 3).data);                 // nơi khác tạo thư mục
  await A.save(la, SDT.renameFolder(la, 'f1', 'Một (đổi tên ở A)').data);           // A chưa biết, đổi tên thư mục khác
  const fin = (await A.loadAll()).data;
  ok('CT-126 hai nơi sửa thư mục gần nhau: không mất thư mục nào', fin.folders.map(f => f.name).sort().join() === 'Một (đổi tên ở A),Tạo ở tab B', fin.folders.map(f => f.name));
  await B.save(fin, SDT.setTagColor(fin, 'phim', 'green').data);
  await A.save(fin, SDT.setTagColor(fin, 'anime', 'red').data);
  const fin2 = (await A.loadAll()).data;
  ok('CT-126 hai nơi đổi màu nhãn khác nhau: giữ cả hai', fin2.tagColors.anime === 'red' && fin2.tagColors.phim === 'green', fin2.tagColors);

  // L2 regex
  let d = SDT.addBookmark(SDT.emptyData(), { title: 'Conan 1 aa', url: 'https://vidu.vn/conan-1_x', tags: [] }, 1).data;
  const r = src => SDT.search(d, Object.assign(SDT.defaultQuery(), { text: src, regex: true }));
  ok('CT-127 regex "conan\\-1", "\\_x", "a{2", "Conan \\d" dùng được', r('conan\\-1').items.length === 1 && r('\\_x').items.length === 1 && r('a{2').items.length === 0 && !r('a{2').error && r('Conan \\d').items.length === 1, [r('conan\\-1').error, r('\\_x').error, r('a{2').error]);
  ok('CT-127 regex sai thật vẫn báo lỗi', !!r('tập (').error);
  const br = SDT.bulkReplace(d, d.bookmarks.map(b => b.id), { field: 'url', find: 'conan\\-(\\d)', replace: 'tap-$1', regex: true }, 9);
  ok('CT-127 đổi chữ hàng loạt nhận regex "\\-"', br.ok && br.data.bookmarks[0].url === 'https://vidu.vn/tap-1_x', br.error || br.data.bookmarks[0].url);

  // L5 địa chỉ lạ trong kho
  const v = SDT.validateData({ version: 2, folders: [], bookmarks: [mk('x', 'xấu', 'https://ok.vn'), Object.assign(mk('y', 'chèn', 'https://a.vn'), { url: 'javascript:alert(1)' })], tagColors: {} }, { trusted: true });
  ok('CT-128 kho có địa chỉ javascript: → bỏ qua mục đó, không khóa app', v.ok && v.data.bookmarks.length === 1 && v.dropped === 1);
  ok('CT-128 safeUrl', SDT.safeUrl('https://a.vn') && SDT.safeUrl('file:///c:/x') && !SDT.safeUrl('javascript:alert(1)') && !SDT.safeUrl(' data:text/html,x'));

  // L7 HTML gộp: trùng trong tệp
  const html = '<!DOCTYPE NETSCAPE-Bookmark-file-1><DL><p><DT><A HREF="https://a.vn/1" ADD_DATE="1">A</A><DT><A HREF="https://a.vn/1/" ADD_DATE="2">A lặp</A><DT><A HREF="https://a.vn" ADD_DATE="3">có sẵn</A></DL>';
  const m = SDT.mergeImported(base, SDT.parseBookmarksHtml(html, 1e12).data);
  ok('CT-129 gộp HTML: tách "đã có" và "trùng trong tệp"', m.added === 1 && m.dup === 1 && m.dupInFile === 1, [m.added, m.dup, m.dupInFile]);

  const names = Object.keys(kq), pass = names.filter(n => kq[n]);
  console.log('Sửa lỗi 2.6.0: ' + pass.length + '/' + names.length + ' qua');
  process.exitCode = pass.length === names.length ? 0 : 1;
})();
