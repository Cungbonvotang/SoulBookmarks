// ==UserScript==
// @name         Sổ Dấu Trang – Kiểm tra GM
// @namespace    so-dau-trang-kiem-tra-gm
// @version      1.0.0
// @description  Chỉ để chẩn đoán lỗi "android.onUsSetValue is not a function". Dùng xong thì gỡ. Không đụng tới dấu trang.
// @match        *://*/*
// @include      *
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_deleteValue
// @grant        GM_listValues
// @grant        GM_openInTab
// @grant        GM_setClipboard
// @grant        GM_registerMenuCommand
// @grant        GM_xmlhttpRequest
// @grant        GM_addStyle
// @grant        GM_download
// @grant        GM_notification
// @grant        GM_info
// @grant        unsafeWindow
// @connect      raw.githubusercontent.com
// @run-at       document-idle
// @noframes
// ==/UserScript==
(function () {
  'use strict';
  if (window.top !== window.self || window.__sdtGmTest) return;
  window.__sdtGmTest = true;
  const out = [];
  const log = s => { out.push(s); if (pre) pre.textContent = out.join('\n'); };
  const short = v => { try { return String(v).replace(/\s+/g, ' ').slice(0, 400); } catch (e) { return '(không đọc được)'; } };
  let pre = null;

  function typeOf(name, get) { try { const v = get(); log(name + ': ' + typeof v); return v; } catch (e) { log(name + ': LỖI ' + e.message); return undefined; } }
  function attempt(label, fn) {
    const key = 'sdtk_' + label.replace(/[^a-z0-9]/gi, '').toLowerCase();
    const val = 'v' + Date.now();
    try {
      const r = fn(key, val);
      let back;
      try { back = GM_getValue(key, null); } catch (e) { back = 'LỖI đọc: ' + e.message; }
      log('  ' + label + ': ghi OK' + (r && typeof r.then === 'function' ? ' (promise)' : '') + ', đọc lại ' + (back === val ? 'KHỚP' : 'KHÁC: ' + short(back)));
    } catch (e) { log('  ' + label + ': LỖI ' + (e && e.message)); }
  }
  function round(when) {
    log('--- ' + when + ' (' + new Date().toLocaleTimeString('vi-VN') + ') ---');
    const ref = typeof GM_setValue !== 'undefined' ? GM_setValue : undefined;
    attempt('goi thang', (k, v) => GM_setValue(k, v));
    attempt('qua bien', (k, v) => ref(k, v));
    attempt('apply null', (k, v) => ref.apply(null, [k, v]));
    attempt('new Function', (k, v) => new Function('f', 'k', 'v', 'return f(k, v);')(ref, k, v));
    attempt('ham long', (k, v) => (function (GM_setValue) { return GM_setValue(k, v); })(ref));
    try {
      if (typeof GM !== 'undefined' && GM && GM.setValue) {
        const k = 'sdtk_gm' + when.length, v = 'g' + Date.now();
        Promise.resolve(GM.setValue(k, v)).then(() => log('  GM.setValue (' + when + '): OK, đọc lại ' + (GM_getValue(k, null) === v ? 'KHỚP' : 'KHÁC')),
          e => log('  GM.setValue (' + when + '): LỖI ' + (e && e.message)));
      } else log('  GM.setValue: không có');
    } catch (e) { log('  GM.setValue: LỖI ' + e.message); }
    try { log('  GM_listValues: ' + short(JSON.stringify(GM_listValues()))); } catch (e) { log('  GM_listValues: LỖI ' + e.message); }
  }

  log('Sổ Dấu Trang – Kiểm tra GM 1.0.0 · ' + location.host);
  try { log('Trình duyệt: ' + navigator.userAgent); } catch (e) { /* bỏ qua */ }
  typeOf('GM_setValue', () => GM_setValue);
  typeOf('GM_getValue', () => GM_getValue);
  typeOf('GM', () => GM);
  typeOf('GM_xmlhttpRequest', () => GM_xmlhttpRequest);
  typeOf('unsafeWindow', () => unsafeWindow);
  typeOf('window.android', () => window.android);
  typeOf('window.android.onUsSetValue', () => window.android && window.android.onUsSetValue);
  try { typeOf('unsafeWindow.android.onUsSetValue', () => unsafeWindow.android && unsafeWindow.android.onUsSetValue); } catch (e) { /* bỏ qua */ }
  try { log('this === window: ' + (this === window) + ' · window === unsafeWindow: ' + (typeof unsafeWindow !== 'undefined' && window === unsafeWindow)); } catch (e) { /* bỏ qua */ }
  try { log('Mã GM_setValue: ' + short(GM_setValue)); } catch (e) { log('Mã GM_setValue: LỖI ' + e.message); }
  try { log('Mã GM_getValue: ' + short(GM_getValue)); } catch (e) { /* bỏ qua */ }
  try { if (window.android) log('Khóa của window.android: ' + short(Object.keys(window.android).concat(Object.getOwnPropertyNames(Object.getPrototypeOf(window.android) || {})).join(', '))); } catch (e) { log('Khóa android: LỖI ' + e.message); }
  round('lúc tải trang');
  setTimeout(() => round('sau 3 giây'), 3000);

  // Khung kết quả: chạm "Thử lại" để thử lúc bấm, "Chép" để chép toàn bộ gửi cho người sửa mã.
  const box = document.createElement('div');
  for (const [k, v] of [['position', 'fixed'], ['left', '6px'], ['right', '6px'], ['bottom', '70px'], ['max-height', '55vh'], ['overflow', 'auto'],
    ['z-index', '2147483647'], ['background', '#fff'], ['color', '#111'], ['border', '2px solid #3D6BE0'], ['border-radius', '12px'], ['padding', '8px'],
    ['font', '12px/1.4 monospace']]) box.style.setProperty(k, v, 'important');
  const bar = document.createElement('div');
  const mk = (t, f) => { const b = document.createElement('button'); b.textContent = t; b.style.setProperty('margin', '0 8px 6px 0', 'important'); b.style.setProperty('font', '14px sans-serif', 'important'); b.style.setProperty('padding', '8px 12px', 'important'); b.addEventListener('click', f); bar.append(b); };
  mk('Thử lại', () => round('lúc bấm'));
  mk('Chép', () => {
    const t = out.join('\n');
    let done = false;
    try { if (typeof GM_setClipboard === 'function') { GM_setClipboard(t); done = true; } } catch (e) { /* thử cách khác */ }
    if (!done) try { navigator.clipboard.writeText(t); done = true; } catch (e) { /* bỏ qua */ }
    log(done ? '(đã chép)' : '(không chép được, hãy chụp màn hình)');
  });
  mk('Đóng', () => box.remove());
  pre = document.createElement('pre');
  pre.style.setProperty('white-space', 'pre-wrap', 'important'); pre.style.setProperty('margin', '0', 'important');
  pre.textContent = out.join('\n');
  box.append(bar, pre);
  (document.body || document.documentElement).append(box);
})();
