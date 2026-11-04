// node tests/html.test.js — hàm thuần nhập/xuất tệp dấu trang HTML (CN-18). Chạy python3 tests/html_mau.py trước.
const fs = require('fs'), path = require('path');
const SDT = require('../ext/core.js');
const DIR = path.join(__dirname, 'out', 'html');
const rd = f => fs.readFileSync(path.join(DIR, f), 'utf8');
const kq = {};
const ok = (name, cond, info) => { kq[name] = !!cond; if (!cond) console.log('TRƯỢT', name, info !== undefined ? JSON.stringify(info).slice(0, 600) : ''); };
const NOW = Date.UTC(2026, 10, 4, 1, 0);
const pathOf = (d, id) => { const F = new Map(d.folders.map(f => [f.id, f])); const o = []; while (id) { const f = F.get(id); o.push(f.name); id = f.parentId; } return o.reverse().join(' › '); };
const list = (d, p) => d.bookmarks.filter(b => pathOf(d, b.folderId) === p).sort((a, b) => a.order - b.order).map(b => b.title);
const subs = (d, p) => d.folders.filter(f => pathOf(d, f.parentId) === p).sort((a, b) => a.order - b.order).map(f => f.name);

// CT-76 kiểu Chrome
let r = SDT.parseBookmarksHtml(rd('chrome.html'), NOW);
ok('CT-76 đọc được', r.ok && r.data.folders.length === 4 && r.data.bookmarks.length === 4 && !r.skipped.length, r);
if (r.ok) {
  const d = r.data;
  ok('CT-76 cây', subs(d, '').join() === 'Bookmarks bar,Other bookmarks' && subs(d, 'Bookmarks bar').join() === 'Công việc,Trống', subs(d, 'Bookmarks bar'));
  ok('CT-76 thứ tự + giải mã', list(d, 'Bookmarks bar').join('|') === 'Tom & Jerry <3|VnExpress' && list(d, 'Other bookmarks')[0] === 'Wiki "VN"', list(d, 'Bookmarks bar'));
  const tj = d.bookmarks.find(b => b.title.startsWith('Tom'));
  ok('CT-76 địa chỉ & ngày theo giây', tj.url === 'https://vidu.vn/a?x=1&y=2' && tj.createdAt === 1785000010000 && tj.updatedAt === tj.createdAt, tj);
  ok('CT-76 dữ liệu hợp lệ', SDT.validateData(SDT.exportPayload(d, NOW)).ok);
}

// CT-77 kiểu Soul
r = SDT.parseBookmarksHtml(rd('soul.html'), NOW);
ok('CT-77 đọc được', r.ok, r.error);
if (r.ok) {
  const d = r.data;
  ok('CT-77 thư mục trống không có khối con', subs(d, 'Favorites bar').join() === 'Trống,Phim,phim (2)' && !list(d, 'Favorites bar › Trống').length, subs(d, 'Favorites bar'));
  ok('CT-77 dấu trang đúng chỗ, đúng thứ tự', list(d, 'Favorites bar').join('|') === 'Một|Đổi (GB) <> (Big5) & "x"|Ba' && list(d, 'Favorites bar › Phim').join() === 'P1' && list(d, 'Favorites bar › phim (2)').join() === 'P2' && list(d, '').join() === 'Gốc', [list(d, 'Favorites bar'), list(d, '')]);
  ok('CT-77 bỏ 2 mục kèm tên', r.skipped.map(x => x.title).join('|') === 'Ứng dụng|↔ Công cụ' && r.renamed === 1, r.skipped);
  ok('CT-77 ngày mili giây', d.bookmarks.find(b => b.title === 'Một').createdAt === 1785000002000);
}

// CT-79 kiểu Firefox
r = SDT.parseBookmarksHtml(rd('firefox.html'), NOW);
ok('CT-79 đọc được', r.ok && r.data.bookmarks.length === 3 && r.data.folders.length === 1, r);
if (r.ok) {
  const by = t => r.data.bookmarks.find(b => b.title === t);
  ok('CT-79 nhãn TAGS', JSON.stringify(by('Conan').tags) === '["anime","Hay"]', by('Conan').tags);
  ok('CT-79 LAST_MODIFIED → ngày cập nhật', by('Conan').createdAt === 1785000000000 && by('Conan').updatedAt === 1785090000000);
  ok('CT-79 micro giây', by('Micro').createdAt === 1785000000123, by('Micro').createdAt);
  ok('CT-79 thiếu ngày → lúc nhập', by('Không ngày').createdAt === NOW && by('Không ngày').updatedAt === NOW);
}

// CT-78 gộp vào dữ liệu mẫu
const seed = SDT.validateData(rd('seed.json')).data;
r = SDT.parseBookmarksHtml(rd('gop.html'), NOW);
let m = SDT.mergeImported(seed, r.data);
ok('CT-78 số đếm', m.added === 4 && m.dup === 3 && m.foldersAdded === 1, { added: m.added, dup: m.dup, f: m.foldersAdded });
const md = m.data;
ok('CT-78 ghép thư mục trùng tên', md.folders.filter(f => SDT.lower(f.name) === 'công việc').length === 1 && md.folders.filter(f => f.name === 'Dự án').length === 1 && subs(md, 'Công việc').join() === 'Dự án,Hợp đồng', subs(md, 'Công việc'));
ok('CT-78 dấu trang mới ở cuối', list(md, 'Công việc').join('|') === 'Ghi chú họp|Mới 1' && list(md, '').slice(-2).join('|') === 'Tin khác|Conan ở gốc' && list(md, 'Công việc › Hợp đồng').join() === 'Hợp đồng mẫu', [list(md, 'Công việc'), list(md, '')]);
ok('CT-78 dấu trang cũ giữ nguyên đối tượng', seed.bookmarks.every(b => md.bookmarks.includes(b)));
const m2 = SDT.mergeImported(md, SDT.parseBookmarksHtml(rd('gop.html'), NOW + 1).data);
ok('CT-78 gộp lần hai không thêm', m2.added === 0 && m2.foldersAdded === 0 && m2.dup === 7, { a: m2.added, f: m2.foldersAdded, d: m2.dup });
ok('CT-78 hợp lệ sau gộp', SDT.validateData(SDT.exportPayload(md, NOW)).ok);

// CT-75 / CT-80 xuất rồi đọc lại
const tricky = SDT.addBookmark(seed, { title: 'A & B <c> "d"', url: 'https://vidu.vn/q?a=1&b="2"', folderId: 'cv', tags: ['x&y', 'Hay'] }, NOW).data;
const html = SDT.exportHtml(tricky, NOW);
ok('CT-75 tên tệp', SDT.exportHtmlFileName(NOW) === 'so-dau-trang-2026-11-04.html');
ok('CT-75 mở đầu chuẩn', html.startsWith('<!DOCTYPE NETSCAPE-Bookmark-file-1>'));
ok('CT-75 mã hóa ký tự', html.includes('>A &amp; B &lt;c&gt; &quot;d&quot;</A>') && html.includes('TAGS="x&amp;y,Hay"'), html.split('\n').find(l => l.includes('A &amp;')));
ok('CT-75 ngày theo giây', html.includes('ADD_DATE="' + Math.floor(tricky.bookmarks[0].createdAt / 1000) + '"'));
const back = SDT.parseBookmarksHtml(html, NOW + 5);
const sig = (d, sec) => d.bookmarks.map(b => [pathOf(d, b.folderId), b.title, b.url, b.tags.join(','), sec ? Math.floor(b.createdAt / 1000) : b.createdAt, sec ? Math.floor(b.updatedAt / 1000) : b.updatedAt].join('|')).sort().join('\n');
const fsig = d => d.folders.map(f => pathOf(d, f.id)).sort().join('\n');
const ord = d => d.folders.map(f => pathOf(d, f.id) + ':' + subs(d, pathOf(d, f.id)).join(',') + ':' + list(d, pathOf(d, f.id)).join(',')).sort().join('\n') + list(d, '').join(',');
ok('CT-80 xuất → đọc lại khớp', back.ok && sig(back.data, true) === sig(tricky, true) && fsig(back.data) === fsig(tricky), back.error);
ok('CT-80 thứ tự giữ nguyên', back.ok && ord(back.data) === ord(tricky));

// CT-81 tệp không đúng
for (const f of ['trang-thuong.html', 'rong.html', 'chi-js.html', 'rac.html']) {
  const x = SDT.parseBookmarksHtml(rd(f), NOW);
  ok('CT-81 ' + f, !x.ok && x.error, x);
}

// CT-82 tệp lớn (nếu có)
if (fs.existsSync(path.join(DIR, 'lon.html'))) {
  const t = rd('lon.html');
  const t0 = Date.now(); const big = SDT.parseBookmarksHtml(t, NOW); const ms = Date.now() - t0;
  ok('CT-82 tệp ' + (t.length / 1e6).toFixed(0) + ' MB phân tích ' + ms + ' ms', big.ok && big.data.bookmarks.length === 11000 && big.data.folders.length === 160 && ms < 3000, ms);
}

const names = Object.keys(kq), pass = names.filter(n => kq[n]);
console.log('Nhập/xuất HTML: ' + pass.length + '/' + names.length + ' qua');
for (const n of names) console.log((kq[n] ? 'QUA   ' : 'TRƯỢT ') + n);
process.exitCode = pass.length === names.length ? 0 : 1;
