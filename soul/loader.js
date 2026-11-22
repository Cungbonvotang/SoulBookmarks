// ==UserScript==
// @name         Sổ Dấu Trang
// @namespace    so-dau-trang
// @version      __LOADER_VERSION__
// @description  Lưu dấu trang theo thư mục và nhãn; nút ruy băng cho biết trang đang mở đã lưu chưa. Dữ liệu chỉ nằm trong trình duyệt. Cài một lần, app tự cập nhật: đừng bấm Cập nhật script này trong Soul (Soul sẽ xóa dấu trang).
// @homepageURL  https://github.com/Cungbonvotang/SoulBookmarks
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
/* Bộ nạp Sổ Dấu Trang (bản Soul). TỆP NÀY GIỮ NGUYÊN MÃI (cả @version): Soul xóa kho GM của script mỗi lần cập nhật,
   nên script chỉ được cài một lần. Mã app mới nằm ở so-dau-trang-app.js; bộ nạp tự tải (6 giờ một lần), cất trong kho GM
   và chạy từ lần mở trang sau. Trang chặn chạy mã tải về (CSP, Trusted Types) hoặc mã mới lỗi → chạy bản có sẵn bên dưới. */
(function () {
  'use strict';
  if (window.top !== window.self) return;
  if (!document.documentElement) return;
  if (window.__sdtLoader) return;
  var CODE_URL = 'https://raw.githubusercontent.com/Cungbonvotang/SoulBookmarks/main/so-dau-trang-app.js';
  var BUNDLED = '__BUNDLED_VERSION__';
  var K_CODE = 'sdtl_code', K_CHECKED = 'sdtl_checked', K_BAD = 'sdtl_bad';
  var EVERY = 6 * 3600 * 1000;
  var NAMES = ['GM_getValue', 'GM_setValue', 'GM_deleteValue', 'GM_listValues', 'GM_openInTab', 'GM_setClipboard',
    'GM_registerMenuCommand', 'GM_xmlhttpRequest', 'GM_addStyle', 'GM_download', 'GM_notification', 'GM_info', 'GM',
    'unsafeWindow', 'SDT_LOADER'];
  var T = window.__SDT_TEST__ ? (window.__SDT_LOADER_TEST__ || {}) : null;   // chỉ máy thử đặt
  if (T && T.url) CODE_URL = T.url;

  function get(k, d) { try { var v = GM_getValue(k, d); return v === undefined || v === null ? d : v; } catch (e) { return d; } }
  function set(k, v) { try { GM_setValue(k, v); } catch (e) { /* bỏ qua */ } }
  function cmp(a, b) {
    var x = String(a).split('.'), y = String(b).split('.');
    for (var i = 0; i < Math.max(x.length, y.length); i++) {
      var d = (parseInt(x[i], 10) || 0) - (parseInt(y[i], 10) || 0);
      if (d) return d > 0 ? 1 : -1;
    }
    return 0;
  }
  function head(code) { var m = typeof code === 'string' ? /^\/\/ SDT_APP (\d+\.\d+\.\d+)\r?\n/.exec(code) : null; return m ? m[1] : null; }
  function compile(code) { return new Function(NAMES.join(','), code); }

  var L = { loader: '__LOADER_VERSION__', bundled: BUNDLED, running: null, source: null, error: null, evalBlocked: false, url: CODE_URL };
  window.__sdtLoader = L;
  L.lastCheck = function () { return Number(get(K_CHECKED, 0)) || 0; };
  function cachedVersion() {
    var v = head(get(K_CODE, null));
    return v && cmp(v, BUNDLED) > 0 && get(K_BAD, '') !== v ? v : null;
  }
  function fetchText(url) {
    function viaGM() {
      return new Promise(function (ok, no) {
        if (typeof GM_xmlhttpRequest !== 'function') { no(new Error('không tải được mã mới')); return; }
        try {
          GM_xmlhttpRequest({ method: 'GET', url: url, timeout: 30000,
            onload: function (r) { if (r.status === 200) ok(r.responseText); else no(new Error('HTTP ' + r.status)); },
            onerror: function () { no(new Error('không tải được mã mới')); }, ontimeout: function () { no(new Error('hết thời gian chờ')); } });
        } catch (e) { no(e); }
      });
    }
    var p;
    try {
      p = fetch(url, { cache: 'no-store', credentials: 'omit' }).then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.text(); });
    } catch (e) { p = Promise.reject(e); }
    return p.catch(viaGM);
  }
  var busy = null;
  // Tải mã mới nếu đã quá 6 giờ từ lần kiểm tra được gần nhất (force: kiểm ngay). Không bao giờ ném lỗi.
  L.check = function (force) {
    if (busy) return busy;
    if (!force && Date.now() - L.lastCheck() < EVERY) return Promise.resolve({ status: 'skip' });
    busy = fetchText(CODE_URL + (CODE_URL.indexOf('?') < 0 ? '?' : '&') + 't=' + Date.now()).then(function (text) {
      var v = head(text);
      if (!v) throw new Error('tệp mã không đúng dạng');
      set(K_CHECKED, String(Date.now()));
      var have = cachedVersion() || BUNDLED;
      if (cmp(v, have) <= 0) return { status: 'latest', version: have };
      if (get(K_BAD, '') === v) return { status: 'bad', version: v };
      try { compile(text); } catch (e) {
        if (e instanceof SyntaxError) { set(K_BAD, v); throw new Error('mã bản ' + v + ' bị lỗi'); }
        // trang này chặn chạy mã: không kiểm được ở đây, trang khác sẽ kiểm khi chạy
      }
      set(K_CODE, text);
      return { status: 'new', version: v };
    }).then(function (r) { busy = null; return r; }, function (e) { busy = null; return { status: 'error', error: String((e && e.message) || e) }; });
    return busy;
  };

  var api = [
    typeof GM_getValue !== 'undefined' ? GM_getValue : undefined,
    typeof GM_setValue !== 'undefined' ? GM_setValue : undefined,
    typeof GM_deleteValue !== 'undefined' ? GM_deleteValue : undefined,
    typeof GM_listValues !== 'undefined' ? GM_listValues : undefined,
    typeof GM_openInTab !== 'undefined' ? GM_openInTab : undefined,
    typeof GM_setClipboard !== 'undefined' ? GM_setClipboard : undefined,
    typeof GM_registerMenuCommand !== 'undefined' ? GM_registerMenuCommand : undefined,
    typeof GM_xmlhttpRequest !== 'undefined' ? GM_xmlhttpRequest : undefined,
    typeof GM_addStyle !== 'undefined' ? GM_addStyle : undefined,
    typeof GM_download !== 'undefined' ? GM_download : undefined,
    typeof GM_notification !== 'undefined' ? GM_notification : undefined,
    typeof GM_info !== 'undefined' ? GM_info : undefined,
    typeof GM !== 'undefined' ? GM : undefined,
    typeof unsafeWindow !== 'undefined' ? unsafeWindow : undefined,
    L,
  ];

  var ran = false;
  var cv = cachedVersion();
  if (cv) {
    var fn = null;
    try { fn = compile(get(K_CODE, '')); } catch (e) {
      if (e instanceof SyntaxError) set(K_BAD, cv); else L.evalBlocked = true;
      L.error = String(e);
    }
    if (fn) {
      L.running = cv; L.source = 'update';
      try { fn.apply(null, api); ran = true; } catch (e) {
        set(K_BAD, cv); L.error = String(e);
        try { var o = document.querySelectorAll('sdt-so-dau-trang'); for (var i = 0; i < o.length; i++) o[i].remove(); } catch (x) { /* bỏ qua */ }
        window.__sdtSoulLoaded = false;
      }
    }
  }
  if (!ran) {
    L.running = BUNDLED; L.source = 'bundled';
    try { SDT_APP.apply(null, api); } catch (e) { L.error = String(e); }
  }
  if (!T || T.autoCheck) setTimeout(function () { L.check(false); }, T && T.delay != null ? T.delay : 5000);

  /* ---------- bản app có sẵn lúc cài ---------- */
  function SDT_APP(GM_getValue, GM_setValue, GM_deleteValue, GM_listValues, GM_openInTab, GM_setClipboard,
    GM_registerMenuCommand, GM_xmlhttpRequest, GM_addStyle, GM_download, GM_notification, GM_info, GM,
    unsafeWindow, SDT_LOADER) {
__BUNDLED_APP__
  }
})();
