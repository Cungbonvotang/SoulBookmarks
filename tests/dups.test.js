// node tests/dups.test.js — tìm dấu trang trùng (2.5.0), hàm thuần
const SDT = require('../ext/core.js');
const kq = {};
const ok = (name, cond, info) => { kq[name] = !!cond; if (!cond) console.log('TRƯỢT', name, info !== undefined ? JSON.stringify(info).slice(0, 500) : ''); };
const mk = (id, title, url, upd, tags, folderId) => ({ id, title, url, urlKey: SDT.normalizeUrl(url), folderId: folderId || null, tags: tags || [], createdAt: 1000, updatedAt: upd || 1000, order: 1 });
const d = Object.assign(SDT.emptyData(), {
  folders: [{ id: 'f1', name: 'Truyện', parentId: null, createdAt: 1, order: 1 }],
  bookmarks: [
    mk('a1', 'Conan tập 1', 'https://www.vidu.vn/conan/1/', 3000, ['anime']),
    mk('a2', 'Conan  tập 1 (bản cũ)', 'http://vidu.vn/conan/1#top', 2000, ['hay'], 'f1'),
    mk('a3', 'CONAN TẬP 1', 'https://VIDU.vn/conan/1', 1000, ['Anime']),
    mk('q1', 'Trang có query', 'https://vidu.vn/xem?id=1', 1000),
    mk('q2', 'Trang có query', 'https://vidu.vn/xem?id=2', 5000),
    mk('h1', 'Hà Nội', 'https://a.vn/1', 1000),
    mk('h2', 'Ha Noi', 'https://a.vn/2', 1000),
    mk('h3', 'hà  nội', 'https://a.vn/3', 2000),
    mk('s1', 'Một mình', 'https://mot.vn/', 1000),
  ],
});
let g = SDT.findDuplicates(d, 'url');
ok('CT-115 trùng địa chỉ theo CN-05 (http/https, www, /, #, hoa thường tên miền)', g.length === 1 && g[0].items.map(b => b.id).join() === 'a1,a2,a3', g.map(x => x.items.map(b => b.id)));
ok('CT-115 khác "?…" không tính trùng', !g.some(x => x.items.some(b => b.id === 'q1')));
g = SDT.findDuplicates(d, 'title');
const keys = g.map(x => x.items.map(b => b.id).join()).sort();
ok('CT-116 trùng tên: không phân biệt hoa thường, khoảng trắng; phân biệt dấu', JSON.stringify(keys) === JSON.stringify(['a1,a3', 'h3,h1', 'q2,q1']), keys);
ok('CT-116 mục cập nhật gần nhất đứng đầu nhóm', g.find(x => x.items[0].id === 'q2') && g.find(x => x.items[0].id === 'h3'));

const gu = SDT.findDuplicates(d, 'url')[0];
let r = SDT.resolveDuplicates(d, [{ keep: ['a1'], remove: ['a2', 'a3'] }], true, 9000);
let a1 = r.data.bookmarks.find(b => b.id === 'a1');
ok('CT-117 xóa mục không giữ, gộp nhãn vào mục giữ', r.removed === 2 && r.data.bookmarks.length === 7 && a1.tags.join() === 'anime,hay' && a1.updatedAt === 9000 && r.tagged === 1, [a1.tags, r.removed]);
r = SDT.resolveDuplicates(d, [{ keep: ['a1'], remove: ['a2', 'a3'] }], false, 9000);
a1 = r.data.bookmarks.find(b => b.id === 'a1');
ok('CT-117 tắt gộp nhãn: nhãn và ngày giữ nguyên', a1.tags.join() === 'anime' && a1.updatedAt === 3000 && r.tagged === 0);
r = SDT.resolveDuplicates(d, [{ keep: ['a1', 'a2'], remove: ['a3'] }], true, 9000);
ok('CT-117 giữ nhiều mục: chỉ xóa mục bỏ; nhãn đã có (Anime ~ anime) không lặp', r.removed === 1 && r.data.bookmarks.find(b => b.id === 'a2').tags.join() === 'hay,Anime' && r.data.bookmarks.find(b => b.id === 'a1').tags.join() === 'anime' && r.tagged === 1, r.data.bookmarks.filter(b => b.id[0] === 'a').map(b => b.tags));
r = SDT.resolveDuplicates(d, [{ keep: [], remove: ['a1', 'a2', 'a3'] }], true, 9000);
ok('CT-117 nhóm không còn mục giữ → không xóa gì', r.removed === 0 && r.skippedGroups === 1 && r.data.bookmarks.length === 9);
ok('CT-117 dữ liệu sau xử lý hợp lệ', SDT.validateData(SDT.exportPayload(SDT.resolveDuplicates(d, [{ keep: ['a1'], remove: ['a2', 'a3'] }], true, 9000).data, 9000)).ok);

// 50.000 dấu trang, 5.000 nhóm trùng
const bs = [];
for (let i = 0; i < 50000; i++) { const n = i < 10000 ? i % 5000 : i; const u = 'https://trang' + n + '.vidu.vn/bai/' + n + (i % 2 ? '/' : ''); bs.push(mk('z' + i, 'Bài ' + (i % 20000), u, i)); }
const big = Object.assign(SDT.emptyData(), { bookmarks: bs });
let t0 = Date.now(); const gb = SDT.findDuplicates(big, 'url'); const t1 = Date.now() - t0;
t0 = Date.now(); const gt = SDT.findDuplicates(big, 'title'); const t2 = Date.now() - t0;
t0 = Date.now(); const rb = SDT.resolveDuplicates(big, gb.map(x => ({ keep: [x.items[0].id], remove: x.items.slice(1).map(b => b.id) })), true, 1); const t3 = Date.now() - t0;
ok('CT-118 50.000 dấu trang: tìm trùng ≤ 300 ms, xử lý ≤ 300 ms', gb.length === 5000 && gt.length === 20000 && rb.removed === 5000 && t1 <= 300 && t2 <= 300 && t3 <= 300, [gb.length, gt.length, t1, t2, t3]);
console.log('tốc độ (ms): địa chỉ', t1, '· tên', t2, '· xử lý', t3);

const names = Object.keys(kq), pass = names.filter(n => kq[n]);
console.log('Dấu trang trùng: ' + pass.length + '/' + names.length + ' qua');
process.exitCode = pass.length === names.length ? 0 : 1;
