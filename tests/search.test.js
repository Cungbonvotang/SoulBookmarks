// node tests/search.test.js — cách so chữ khi tìm (bản 2.3.0): phân biệt hoa thường, đúng cụm, regex. Chạy python3 tests/html_mau.py trước (tạo seed.json).
const fs = require('fs'), path = require('path');
const SDT = require('../ext/core.js');
const kq = {};
const ok = (name, cond, info) => { kq[name] = !!cond; if (!cond) console.log('TRƯỢT', name, info !== undefined ? JSON.stringify(info).slice(0, 500) : ''); };
let d = SDT.validateData(fs.readFileSync(path.join(__dirname, 'out', 'html', 'seed.json'), 'utf8')).data;
d = SDT.addBookmark(d, { title: 'Hà Đông và Nội Bài', url: 'https://khac.vn/ha-dong', folderId: null, tags: [] }, 1).data;
const ids = q => SDT.search(d, Object.assign(SDT.defaultQuery(), q)).items.map(b => b.id).sort();
const S = q => SDT.search(d, Object.assign(SDT.defaultQuery(), q));

// mặc định giữ như cũ
ok('CT-94 mặc định không đổi', ids({ text: 'ha noi' }).length === 2 && ids({ text: 'HÀ NỘI' }).join() === ids({ text: 'ha noi' }).join(), ids({ text: 'ha noi' }));
// Phân biệt hoa thường
ok('CT-95 hoa thường: "Conan" ở tên', ids({ title: 'Conan', caseSensitive: true }).join() === 'b1,b2,b3,b4,b5', ids({ title: 'Conan', caseSensitive: true }));
ok('CT-95 hoa thường: "conan" ở tên → 0', ids({ title: 'conan', caseSensitive: true }).length === 0);
ok('CT-95 hoa thường vẫn bỏ qua dấu', ids({ title: 'Tham tu', caseSensitive: true }).join() === 'b1' && ids({ title: 'tham tu', caseSensitive: true }).length === 0);
// Đúng cụm
ok('CT-96 đúng cụm "Hà Nội"', ids({ text: 'Hà Nội', phrase: true }).join() === 'b9', ids({ text: 'Hà Nội', phrase: true }));
ok('CT-96 cụm khác thứ tự / thiếu dấu → 0', ids({ text: 'Nội Hà', phrase: true }).length === 0 && ids({ text: 'ha noi', phrase: true }).length === 0);
ok('CT-96 cụm + hoa thường', ids({ text: 'hà nội', phrase: true }).join() === 'b9' && ids({ text: 'hà nội', phrase: true, caseSensitive: true }).length === 0);
ok('CT-96 cụm ở địa chỉ', ids({ urlText: 'vidu.vn/conan-1', phrase: true }).join() === 'b1', ids({ urlText: 'vidu.vn/conan-1', phrase: true }));
// Regex
ok('CT-97 regex "tập \\d+" (không phân biệt hoa thường)', ids({ title: 'tập \\d+', regex: true }).join() === 'b1,b3,b4,b5,b6', ids({ title: 'tập \\d+', regex: true }));
ok('CT-97 regex + hoa thường', ids({ title: 'tập \\d+', regex: true, caseSensitive: true }).join() === 'b3,b4,b5,b6', ids({ title: 'tập \\d+', regex: true, caseSensitive: true }));
ok('CT-97 regex ^ theo từng ô', ids({ text: '^Du lịch', regex: true }).join() === 'b9' && ids({ urlText: '^https://vidu\\.vn/conan', regex: true }).join() === 'b1,b2,b4,b5');
ok('CT-97 regex "conan|github" ở ô chung', ids({ text: 'conan|github', regex: true }).length === 8, ids({ text: 'conan|github', regex: true }));
ok('CT-97 regex thắng đúng cụm', ids({ text: 'tập \\d+', regex: true, phrase: true }).join() === ids({ text: 'tập \\d+', regex: true }).join());
let r = S({ text: 'tập (', regex: true });
ok('CT-98 regex sai → báo lỗi, không có kết quả', r.error && r.error.startsWith('Biểu thức chưa đúng') && r.items.length === 0, r.error);
r = S({ text: 'a'.repeat(201), regex: true });
ok('CT-98 regex quá 200 ký tự → báo lỗi', r.error && r.error.includes('200'), r.error);
// Regex quá nặng → dừng
let slow = SDT.emptyData();
for (let i = 0; i < 400; i++) slow = SDT.addBookmark(slow, { title: 'a'.repeat(23) + 'b ' + i, url: 'https://x.vn/' + i, folderId: null, tags: [] }, i).data;
const t0 = Date.now();
r = SDT.search(slow, Object.assign(SDT.defaultQuery(), { title: '^(a+)+$', regex: true }));
const el = Date.now() - t0;
ok('CT-98 regex quá nặng → dừng, báo', r.error && r.error.startsWith('Tìm quá lâu') && el < 6000, [r.error, el]);
// Tốc độ 50.000
let big = SDT.emptyData();
const bs = [];
for (let i = 0; i < 50000; i++) { const u = 'https://trang' + i + '.vidu.vn/bai-viet/' + i; bs.push({ id: 'z' + i, title: 'Bài viết Số ' + i + ' về Conan và Hà Nội', url: u, urlKey: SDT.normalizeUrl(u), folderId: null, tags: ['tag' + (i % 500)], createdAt: i, updatedAt: i, order: i }); }
big = Object.assign(big, { bookmarks: bs });
const time = q => { SDT.search(big, Object.assign(SDT.defaultQuery(), q)); const t = Date.now(); const n = SDT.search(big, Object.assign(SDT.defaultQuery(), q)).items.length; return [Date.now() - t, n]; };
const tm = { 'hoa thường': time({ text: 'Conan 12', caseSensitive: true }), 'đúng cụm': time({ text: 'Số 123 về', phrase: true }), regex: time({ text: 'Số 1\\d{3} về', regex: true }), 'mặc định': time({ text: 'conan 12' }) };
ok('CT-99 50.000 dấu trang: mỗi cách ≤ 150 ms (hàm thuần)', Object.values(tm).every(([ms]) => ms <= 150) && tm.regex[1] === 1000 && tm['đúng cụm'][1] === 1, tm);
console.log('tốc độ (ms, số kết quả):', JSON.stringify(tm));

const names = Object.keys(kq), pass = names.filter(n => kq[n]);
console.log('Cách so chữ: ' + pass.length + '/' + names.length + ' qua');
process.exitCode = pass.length === names.length ? 0 : 1;
