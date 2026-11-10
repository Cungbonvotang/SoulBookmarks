// node tests/ui27.test.js — hàm thuần của bản 2.7.0 (CN-23): số đếm thư mục, vùng tô chữ khớp
const SDT = require('../ext/core.js');
const kq = {};
const ok = (name, cond, info) => { kq[name] = !!cond; if (!cond) console.log('TRƯỢT', name, info !== undefined ? JSON.stringify(info).slice(0, 500) : ''); };
const F = (id, parentId) => ({ id, name: id, parentId: parentId || null, createdAt: 1, order: 1 });
const B = (id, folderId) => ({ id, title: id, url: 'https://x.vn/' + id, urlKey: 'x.vn/' + id, folderId: folderId || null, tags: [], createdAt: 1, updatedAt: 1, order: 1 });

// CT-151
const d = Object.assign(SDT.emptyData(), {
  folders: [F('a'), F('b', 'a'), F('c', 'b'), F('d', 'a'), F('e')],
  bookmarks: [B('1', 'a'), B('2', 'b'), B('3', 'b'), B('4', 'c'), B('5', 'c'), B('6', 'c'), B('7', 'd'), B('8', null)],
});
const t = SDT.folderTotals(d);
ok('CT-151 tổng tính cả thư mục con, nhiều tầng', t.get('a') === 7 && t.get('b') === 5 && t.get('c') === 3 && t.get('d') === 1, [...t]);
ok('CT-151 thư mục trống = 0; số trực tiếp cũ không đổi', t.get('e') === 0 && SDT.folderStats(d).get('a') === 3, [t.get('e'), SDT.folderStats(d).get('a')]);

// CT-152
const q = o => Object.assign(SDT.defaultQuery(), o);
const hit = (s, f, o) => SDT.highlightRanges(s, f, q(o)).map(r => s.slice(r[0], r[1]));
ok('CT-152 không dấu: "sang tac" tô "Sáng" và "tác"', hit('Sáng tác Việt', 't', { text: 'sang tac' }).join('|') === 'Sáng|tác', hit('Sáng tác Việt', 't', { text: 'sang tac' }));
const nfd = 'Sáng tác Việt'.normalize('NFD');
ok('CT-152 chữ có dấu rời (NFD) vẫn tô nguyên chữ', hit(nfd, 't', { text: 'sang tac' }).map(x => x.normalize('NFC')).join('|') === 'Sáng|tác', hit(nfd, 't', { text: 'sang tac' }));
ok('CT-152 đ/Đ và emoji không làm lệch vị trí', hit('Đường 😀 đi', 't', { text: 'duong di' }).join('|') === 'Đường|đi', hit('Đường 😀 đi', 't', { text: 'duong di' }));
ok('CT-152 phân biệt hoa thường: "Sang" không tô "sang"', hit('Sang sang', 't', { text: 'Sang', caseSensitive: true }).join('|') === 'Sang');
ok('CT-152 đúng cụm: chỉ tô cụm liền', hit('đọc sáng tác việt, tác sáng', 't', { text: 'sáng tác', phrase: true }).join('|') === 'sáng tác');
ok('CT-152 đúng cụm không phân biệt hoa thường', hit('Sáng Tác hay', 't', { text: 'sáng tác', phrase: true }).join('|') === 'Sáng Tác');
ok('CT-152 đúng cụm + hoa thường: sai hoa thường → không tô', hit('Sáng Tác hay', 't', { text: 'sáng tác', phrase: true, caseSensitive: true }).length === 0);
ok('CT-152 regex tô từng chỗ khớp', hit('abc123 x45', 't', { text: '\\d+', regex: true }).join('|') === '123|45');
ok('CT-152 regex khớp rỗng không treo', hit('abc', 't', { text: 'x*', regex: true }).length === 0);
ok('CT-152 regex sai / ô trống → không có vùng nào', hit('abc', 't', { text: '(', regex: true }).length === 0 && hit('abc', 't', {}).length === 0 && hit('', 't', { text: 'a' }).length === 0);
ok('CT-152 vùng chồng nhau gộp làm một', hit('aaaa', 't', { text: 'aa aaa' }).join('|') === 'aaaa', hit('aaaa', 't', { text: 'aa aaa' }));
ok('CT-152 "Địa chỉ có chữ" chỉ tô ở tên miền', hit('www.sangtacviet.com', 'u', { urlText: 'sangtac' }).join('|') === 'sangtac' && hit('sangtacviet', 't', { urlText: 'sangtac' }).length === 0);
ok('CT-152 "Tên có chữ" chỉ tô ở tên', hit('Sáng tác', 't', { title: 'tac' }).join('|') === 'tác' && hit('tac.vn', 'u', { title: 'tac' }).length === 0);
ok('CT-152 ô tìm chung tô ở cả tên và tên miền', hit('vidu.vn', 'u', { text: 'vidu' }).join('|') === 'vidu' && hit('Ví dụ', 't', { text: 'vi du' }).join('|') === 'Ví|dụ');
const long = 'x'.repeat(5000) + ' sang';
ok('CT-152 chuỗi quá dài → bỏ qua, không lỗi', Array.isArray(SDT.highlightRanges(long, 't', q({ text: 'sang' }))));

const names = Object.keys(kq), pass = names.filter(n => kq[n]);
console.log('Bản 2.7.0 (hàm): ' + pass.length + '/' + names.length + ' qua');
process.exitCode = pass.length === names.length ? 0 : 1;
