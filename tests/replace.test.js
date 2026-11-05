// node tests/replace.test.js — đổi chữ hàng loạt ở tên / địa chỉ (2.4.0), hàm thuần
const SDT = require('../ext/core.js');
const kq = {};
const ok = (name, cond, info) => { kq[name] = !!cond; if (!cond) console.log('TRƯỢT', name, info !== undefined ? JSON.stringify(info).slice(0, 500) : ''); };
let d = SDT.emptyData();
const add = (title, url, folderId) => { const r = SDT.addBookmark(d, { title, url, folderId: folderId || null, tags: ['x'] }, 1000); d = r.data; return r.bookmark ? r.bookmark.id : d.bookmarks[d.bookmarks.length - 1].id; };
const a = add('Truyện A – Sangtacviet', 'https://www.sangtacviet.com/truyen/qidian/1/100/');
const b = add('Truyện B', 'http://WWW.SANGTACVIET.COM/truyen/2?x=$1');
const c = add('Khác', 'https://khac.vn/');
const e = add('Đã có', 'https://www.sangtacviet.app/truyen/qidian/1/100/');
const all = d.bookmarks.map(x => x.id);
const NOW = 5000;
const get = (r, id) => r.data.bookmarks.find(x => x.id === id);

let r = SDT.bulkReplace(d, all, { field: 'url', find: 'www.sangtacviet.com', replace: 'www.sangtacviet.app' }, NOW);
ok('CT-105 đổi địa chỉ (không phân biệt hoa thường)', r.ok && r.changed === 2 && get(r, a).url === 'https://www.sangtacviet.app/truyen/qidian/1/100/' && get(r, b).url.includes('www.sangtacviet.app/truyen/2?x=$1'), r.data && r.data.bookmarks.map(x => x.url));
ok('CT-105 khóa địa chỉ, ngày cập nhật', get(r, a).urlKey === 'sangtacviet.app/truyen/qidian/1/100' && get(r, a).updatedAt === NOW && get(r, c).updatedAt === 1000 && get(r, c) === d.bookmarks.find(x => x.id === c), get(r, a));
ok('CT-105 báo trùng địa chỉ', r.dups === 1, r.dups);
ok('CT-105 mẫu xem trước', r.samples.length === 2 && r.samples[0].before.url.includes('.com') && r.samples[0].after.url.includes('.app'));
ok('CT-105 giữ tên, nhãn, thư mục, ngày tạo', get(r, a).title === 'Truyện A – Sangtacviet' && get(r, a).tags.join() === 'x' && get(r, a).createdAt === 1000);
r = SDT.bulkReplace(d, [a], { field: 'url', find: 'www.sangtacviet.com', replace: 'www.sangtacviet.app' }, NOW);
ok('CT-105 chỉ đổi mục được chọn', r.changed === 1 && get(r, b).url === d.bookmarks.find(x => x.id === b).url);
r = SDT.bulkReplace(d, all, { field: 'url', find: 'www.sangtacviet.com', replace: 'www.sangtacviet.app', caseSensitive: true }, NOW);
ok('CT-106 Aa: chỉ đúng hoa thường', r.changed === 1 && get(r, b).url.includes('WWW.SANGTACVIET.COM'), r.changed);
r = SDT.bulkReplace(d, all, { field: 'title', find: 'Truyện (\\w)', replace: 'Chương $1', regex: true }, NOW);
ok('CT-106 regex có $1 ở tên', r.changed === 2 && get(r, a).title === 'Chương A – Sangtacviet' && get(r, b).title === 'Chương B', r.data.bookmarks.map(x => x.title));
r = SDT.bulkReplace(d, all, { field: 'both', find: 'sangtacviet', replace: 'STV' }, NOW);
ok('CT-106 cả hai', r.changed === 3 && get(r, a).title === 'Truyện A – STV' && get(r, a).url.includes('www.STV.com') && get(r, e).url.includes('STV.app'), r.data.bookmarks.map(x => [x.title, x.url]));
r = SDT.bulkReplace(d, all, { field: 'url', find: 'https://', replace: '' }, NOW);
ok('CT-107 địa chỉ mới không hợp lệ → bỏ qua, báo', r.ok && r.changed === 0 && r.skipped.length === 3 && r.skipped[0].reason.startsWith('địa chỉ mới không hợp lệ'), r.skipped);
r = SDT.bulkReplace(d, all, { field: 'title', find: 'Khác', replace: '' }, NOW);
ok('CT-107 tên thành rỗng → bỏ qua', r.changed === 0 && r.skipped.length === 1 && r.skipped[0].reason === 'tên thành rỗng', r.skipped);
r = SDT.bulkReplace(d, all, { field: 'title', find: 'Truyện', replace: 'x'.repeat(600) }, NOW);
ok('CT-107 tên quá 500 ký tự → cắt', get(r, a).title.length === 500);
ok('CT-108 chưa nhập chữ cần tìm', SDT.bulkReplace(d, all, { field: 'url', find: '' }, NOW).ok === false);
r = SDT.bulkReplace(d, all, { field: 'url', find: 'truyen/(', regex: true }, NOW);
ok('CT-108 regex sai → báo', !r.ok && r.error.startsWith('Biểu thức chưa đúng'), r.error);
r = SDT.bulkReplace(d, all, { field: 'url', find: '.', replace: '!' }, NOW);
ok('CT-108 chữ thường không hiểu như regex ("." là dấu chấm)', r.changed === 0 && r.skipped.length === 4 && r.skipped.every(x => x.reason.includes('!')), r.skipped.map(x => x.reason));
ok('CT-108 dữ liệu sau đổi hợp lệ', SDT.validateData(SDT.exportPayload(SDT.bulkReplace(d, all, { field: 'url', find: 'www.sangtacviet.com', replace: 'www.sangtacviet.app' }, NOW).data, NOW)).ok);

// 10.000 dấu trang
const bs = [];
for (let i = 0; i < 20000; i++) { const u = 'https://www.sangtacviet.' + (i % 2 ? 'com' : 'vip') + '/truyen/qidian/1/' + i + '/'; bs.push({ id: 'z' + i, title: 'Truyện ' + i, url: u, urlKey: SDT.normalizeUrl(u), folderId: null, tags: [], createdAt: i, updatedAt: i, order: i }); }
const big = Object.assign(SDT.emptyData(), { bookmarks: bs });
const t0 = Date.now();
r = SDT.bulkReplace(big, bs.map(x => x.id), { field: 'url', find: 'www.sangtacviet.com', replace: 'www.sangtacviet.app' }, NOW);
const ms = Date.now() - t0;
ok('CT-109 10.000 mục đổi trong 20.000 chọn: hàm thuần ' + ms + ' ms', r.changed === 10000 && ms < 1000, [r.changed, ms]);

const names = Object.keys(kq), pass = names.filter(n => kq[n]);
console.log('Đổi chữ hàng loạt: ' + pass.length + '/' + names.length + ' qua');
process.exitCode = pass.length === names.length ? 0 : 1;
