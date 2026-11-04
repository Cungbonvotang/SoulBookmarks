// ==UserScript==
// @name         Kiểm tra Soul cho Sổ Dấu Trang
// @namespace    so-dau-trang
// @version      1.0
// @description  Kiểm tra trình duyệt hỗ trợ những gì cho userscript. Chỉ đọc/ghi một khóa thử, không gửi gì ra ngoài.
// @match        *://*/*
// @include      *
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_deleteValue
// @grant        GM_listValues
// @grant        GM_addValueChangeListener
// @grant        GM_addStyle
// @grant        GM_openInTab
// @grant        GM_setClipboard
// @grant        GM_registerMenuCommand
// @grant        GM_info
// @grant        GM.getValue
// @grant        GM.setValue
// @grant        unsafeWindow
// @run-at       document-idle
// @noframes
// ==/UserScript==

(async function () {
  'use strict';
  if (window.top !== window.self) return;
  if (document.getElementById('sdt-kiem-tra')) return;

  // typeof trực tiếp (không dùng eval vì nhiều trang chặn eval).
  const T = {
    GM_getValue: typeof GM_getValue, GM_setValue: typeof GM_setValue, GM_deleteValue: typeof GM_deleteValue,
    GM_listValues: typeof GM_listValues, GM_addValueChangeListener: typeof GM_addValueChangeListener,
    GM_addStyle: typeof GM_addStyle, GM_openInTab: typeof GM_openInTab, GM_setClipboard: typeof GM_setClipboard,
    GM_registerMenuCommand: typeof GM_registerMenuCommand, GM_info: typeof GM_info, GM: typeof GM, unsafeWindow: typeof unsafeWindow,
  };
  const has = name => T[name] !== undefined && T[name] !== 'undefined';
  const kieu = name => T[name];
  const lines = [];
  const add = (label, ok, extra) => lines.push((ok ? '✓ ' : '✗ ') + label + (extra ? ' — ' + extra : ''));

  // 1. Hàm GM có hay không
  const names = ['GM_getValue', 'GM_setValue', 'GM_deleteValue', 'GM_listValues', 'GM_addValueChangeListener',
    'GM_addStyle', 'GM_openInTab', 'GM_setClipboard', 'GM_registerMenuCommand', 'GM_info', 'GM', 'unsafeWindow'];
  for (const n of names) add(n, has(n), kieu(n));
  try { if (typeof GM !== 'undefined') add('GM.getValue / GM.setValue', !!(GM.getValue && GM.setValue)); } catch (e) { add('GM.getValue', false, String(e)); }

  // 2. Lưu chung giữa các trang web (quan trọng nhất)
  const host = location.hostname;
  let store = '';
  let visited = [];
  try {
    if (has('GM_getValue') && has('GM_setValue')) {
      store = 'GM_getValue/GM_setValue';
      let v = GM_getValue('sdt_kiem_tra', '[]');
      if (v && typeof v.then === 'function') { store += ' (bất đồng bộ)'; v = await v; }
      visited = JSON.parse(typeof v === 'string' ? v : JSON.stringify(v || []));
      if (!visited.includes(host)) visited.push(host);
      const r = GM_setValue('sdt_kiem_tra', JSON.stringify(visited.slice(-10)));
      if (r && typeof r.then === 'function') await r;
    } else if (typeof GM !== 'undefined' && GM.getValue) {
      store = 'GM.getValue/GM.setValue';
      visited = JSON.parse(await GM.getValue('sdt_kiem_tra', '[]'));
      if (!visited.includes(host)) visited.push(host);
      await GM.setValue('sdt_kiem_tra', JSON.stringify(visited.slice(-10)));
    } else {
      store = 'không có, thử localStorage (chỉ riêng từng trang)';
      visited = JSON.parse(localStorage.getItem('sdt_kiem_tra') || '[]');
      if (!visited.includes(host)) visited.push(host);
      localStorage.setItem('sdt_kiem_tra', JSON.stringify(visited.slice(-10)));
    }
  } catch (e) { store += ' — LỖI: ' + e; }
  lines.push('Kho lưu: ' + store);
  lines.push('Các trang đã ghi vào kho: ' + visited.join(', '));

  // 3. Khả năng trình duyệt
  add('Shadow DOM', !!document.body.attachShadow);
  add('<dialog>', typeof HTMLDialogElement !== 'undefined');
  add('Clipboard', !!(navigator.clipboard && navigator.clipboard.writeText));
  add('Tải tệp (a[download])', 'download' in document.createElement('a'));
  try { const g = Object.getOwnPropertyNames(window).filter(n => /soul|^gm/i.test(n)); lines.push('Biến toàn cục liên quan: ' + (g.join(', ') || 'không')); } catch (e) { /* bỏ qua */ }
  lines.push('Trình duyệt: ' + navigator.userAgent);
  try { if (has('GM_info')) lines.push('Trình quản lý script: ' + (GM_info.scriptHandler || '?') + ' ' + (GM_info.version || '')); } catch (e) { /* bỏ qua */ }

  // Hiện kết quả
  const text = 'KẾT QUẢ KIỂM TRA SOUL\nTrang: ' + host + '\n' + lines.join('\n');
  const box = document.createElement('div');
  box.id = 'sdt-kiem-tra';
  box.setAttribute('style', 'position:fixed;left:8px;right:8px;bottom:8px;z-index:2147483647;max-height:70vh;overflow:auto;' +
    'background:#173F4D;color:#F3F8F9;font:14px/1.45 system-ui,sans-serif;padding:12px 14px;border-radius:12px;box-shadow:0 8px 24px rgba(0,0,0,.4);white-space:pre-wrap;');
  box.textContent = text;
  const row = document.createElement('div');
  row.setAttribute('style', 'display:flex;gap:8px;margin-top:10px;');
  const mk = (label, fn) => {
    const b = document.createElement('button');
    b.textContent = label;
    b.setAttribute('style', 'flex:1;min-height:44px;border:0;border-radius:8px;font:600 15px system-ui;background:#F3F8F9;color:#173F4D;');
    b.addEventListener('click', fn);
    return b;
  };
  row.append(
    mk('Chép kết quả', async () => {
      let ok = false;
      try { if (has('GM_setClipboard')) { GM_setClipboard(text); ok = true; } } catch (e) { /* thử cách khác */ }
      if (!ok) { try { await navigator.clipboard.writeText(text); ok = true; } catch (e) { /* bỏ qua */ } }
      if (!ok) {
        const ta = document.createElement('textarea'); ta.value = text; document.body.append(ta); ta.select();
        try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
        ta.remove();
      }
      row.firstChild.textContent = ok ? 'Đã chép ✓' : 'Không chép được';
    }),
    mk('Đóng', () => box.remove()));
  box.append(row);
  document.body.append(box);
})();
