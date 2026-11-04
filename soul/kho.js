/* Sổ Dấu Trang – Kho: chỉ cất và trả dữ liệu cho script chính "Sổ Dấu Trang".
   Script chính được cập nhật thoải mái; kho dữ liệu nằm ở đây nên không bị Soul xóa khi cập nhật script chính.
   Giao thức v1 (chuỗi JSON vào / ra):
     { id, op: 'hello' }                    → { id, ok, result: { v: 1, version } }
     { id, op: 'get', keys: [khóa] }        → { id, ok, result: { khóa: chuỗi } }
     { id, op: 'set', data: { khóa: chuỗi } } (kiểm hết rồi mới ghi)
     { id, op: 'remove', keys: [khóa] }     (từng khóa có tên; không có lệnh xóa toàn bộ)
     { id, op: 'list' }                     → { id, ok, result: [khóa] }
   Hai đường gọi: window.__sdtKho1.call(chuỗi) khi các userscript dùng chung một vùng chạy,
   hoặc sự kiện DOM "sdt-kho:req" → "sdt-kho:res" (đồng bộ). Chỉ nhận khóa dạng sdt_… */
(function () {
  'use strict';
  if (window.top !== window.self) return;
  const VERSION = '1.0.0';
  const NAME = '__sdtKho1';
  const KEY = /^sdt_[a-z0-9_]{1,40}$/;
  const MAX = 16 * 1024 * 1024;

  function handle(reqText) {
    let q;
    try { q = JSON.parse(reqText); } catch (e) { return JSON.stringify({ ok: false, error: 'Yêu cầu không phải JSON.' }); }
    const out = { id: q && q.id, ok: true };
    try {
      switch (q && q.op) {
        case 'hello':
          out.result = { v: 1, version: VERSION };
          break;
        case 'get': {
          const r = {};
          for (const k of Array.isArray(q.keys) ? q.keys : []) {
            if (!KEY.test(k)) continue;
            const v = GM_getValue(k, null);
            if (typeof v === 'string') r[k] = v;
          }
          out.result = r;
          break;
        }
        case 'set': {
          const d = q.data && typeof q.data === 'object' ? q.data : {};
          const ents = Object.entries(d);
          for (const [k, v] of ents) {
            if (!KEY.test(k)) throw new Error('Khóa không hợp lệ: ' + k);
            if (typeof v !== 'string' || v.length > MAX) throw new Error('Giá trị không hợp lệ ở khóa ' + k);
          }
          for (const [k, v] of ents) GM_setValue(k, v);
          out.result = ents.length;
          break;
        }
        case 'remove':
          for (const k of Array.isArray(q.keys) ? q.keys : []) {
            if (!KEY.test(k)) continue;
            try { GM_deleteValue(k); } catch (e) { GM_setValue(k, null); }
          }
          out.result = true;
          break;
        case 'list':
          out.result = (GM_listValues() || []).filter(k => KEY.test(k) && typeof GM_getValue(k, null) === 'string');
          break;
        default:
          throw new Error('Lệnh không hỗ trợ.');
      }
    } catch (e) { out.ok = false; out.error = String((e && e.message) || e); }
    return JSON.stringify(out);
  }

  try {
    if (!(NAME in window)) Object.defineProperty(window, NAME, { value: Object.freeze({ call: handle }), configurable: false, writable: false, enumerable: false });
  } catch (e) { /* vùng chạy không cho gắn: dùng đường sự kiện */ }
  document.addEventListener('sdt-kho:req', e => {
    if (typeof e.detail !== 'string') return;
    const res = handle(e.detail);
    document.dispatchEvent(new CustomEvent('sdt-kho:res', { detail: res }));
  });
})();
