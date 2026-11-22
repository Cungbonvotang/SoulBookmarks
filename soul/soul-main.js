/* Sổ Dấu Trang — bản Soul: nút ruy băng nổi, bảng lưu nhanh, trình quản lý lớp phủ.
   Chạy trong userscript; dùng SDT, SDTUI, SDTNS.SDTPopup, SDTNS.SDTManager, SDT_CSS từ phần dựng. */
(function () {
  'use strict';
  if (window.__sdtSoulLoaded) return;
  window.__sdtSoulLoaded = true;
  const { h } = SDTUI;
  const UI_KEY = 'sdt_ui';

  /* ---------- kho GM (chia phần, giá trị lưu dạng chuỗi JSON) ---------- */
  function gmGet(k, d) {
    try { const v = GM_getValue(k, d); return v === undefined ? d : v; } catch (e) { return d; }
  }
  function gmSet(k, v) { GM_setValue(k, v); }
  const local = {
    async get(keys) {
      const o = {};
      for (const k of keys) {
        const v = gmGet(k, undefined);
        if (v === undefined || v === null) continue;
        o[k] = typeof v === 'string' ? (k === 'sdt_data' || k === 'sdt_data_backup_v1' ? v : JSON.parse(v)) : v;
      }
      return o;
    },
    async set(obj) { for (const [k, v] of Object.entries(obj)) gmSet(k, typeof v === 'string' ? v : JSON.stringify(v)); },
    async remove(keys) { for (const k of keys) { try { GM_deleteValue(k); } catch (e) { gmSet(k, null); } } },
    async getAll() {
      const o = {};
      try { for (const k of GM_listValues()) if (String(k).startsWith('sdt_')) o[k] = gmGet(k, null); } catch (e) { /* bỏ qua */ }
      return o;
    },
  };

  /* ---------- nơi cất dữ liệu: kho GM của chính script này ---------- */
  // Từ 3.0.0 chỉ còn một script. Script được cài một lần và KHÔNG cập nhật qua Soul (nút Cập nhật của Soul xóa kho GM);
  // mã app mới do bộ nạp (so-dau-trang.user.js) tự tải. Chuyển từ bản 2.x: dấu trang đang nằm trong script
  // "Sổ Dấu Trang – Kho" → chép một lần sang đây. Kho có thể chạy trễ hoặc lần mở trang đó Soul không chạy nó: chờ, dò tiếp.
  const LOADER = typeof SDT_LOADER !== 'undefined' && SDT_LOADER ? SDT_LOADER : null;
  const MOVED = 'sdt_kho_moved';              // (2.x) dữ liệu ở đây đã chuyển sang Kho → bản ở đây đã cũ
  const IMPORTED = 'sdt_kho_imported';        // (3.0.0) đã chép dữ liệu từ Kho về: không cần Kho nữa
  const IMPORT_SEEN = 'sdt_kho_import_seen';  // người dùng đã đọc lời báo "đã chép"
  const MISSES = 'sdt_kho_misses';            // số lần mở trang chờ Kho mà không thấy
  const FLAGS = new Set([MOVED, IMPORTED, IMPORT_SEEN, MISSES]);
  const isData = k => /^sdt_/.test(String(k)) && !FLAGS.has(k);
  function parseVal(k, v) {
    if (k === 'sdt_data' || k === 'sdt_data_backup_v1') return v;
    try { return JSON.parse(v); } catch (e) { return v; }
  }
  function findKho() {
    let pageWin = window;
    try { if (typeof unsafeWindow !== 'undefined' && unsafeWindow) pageWin = unsafeWindow; } catch (e) { /* bỏ qua */ }
    const g = window.__SDT_KHO_FORCE_EVENTS__ ? null : window.__sdtKho1 || (pageWin !== window ? pageWin.__sdtKho1 : null);
    if (g && typeof g.call === 'function') {
      const call = q => JSON.parse(g.call(JSON.stringify(q)));
      try { const r = call({ op: 'hello' }); if (r.ok) return { call }; } catch (e) { /* thử đường sự kiện */ }
    }
    // Đường sự kiện DOM: phát và nhận đều đồng bộ trong cùng lúc gọi.
    let want = null, got = null, seq = 0;
    const onRes = e => {
      if (typeof e.detail !== 'string') return;
      try { const r = JSON.parse(e.detail); if (r && r.id === want) got = r; } catch (err) { /* bỏ qua */ }
    };
    document.addEventListener('sdt-kho:res', onRes);
    const call = q => {
      want = 'm' + (++seq) + Math.random().toString(36).slice(2, 7);
      got = null;
      document.dispatchEvent(new CustomEvent('sdt-kho:req', { detail: JSON.stringify(Object.assign({ id: want }, q)) }));
      const r = got; got = null; want = null;
      if (!r) throw new Error('Script Kho không trả lời.');
      return r;
    };
    try { const r = call({ op: 'hello' }); if (r.ok) return { call, done: () => document.removeEventListener('sdt-kho:res', onRes) }; } catch (e) { /* không có Kho */ }
    document.removeEventListener('sdt-kho:res', onRes);
    return null;
  }
  function khoRead(kho) {
    const run = q => { const r = kho.call(q); if (!r.ok) throw new Error(r.error || 'Script Kho báo lỗi.'); return r.result; };
    const keys = run({ op: 'list' }).filter(isData);
    const out = keys.length ? run({ op: 'get', keys }) : {};
    if (kho.done) kho.done();
    return out;
  }
  function localKeys() { try { return (GM_listValues() || []).filter(k => /^sdt_/.test(String(k))); } catch (e) { return []; } }
  const hasData = keys => keys.includes('sdt_meta') || keys.includes('sdt_data');
  function delKey(k) { try { GM_deleteValue(k); } catch (e) { gmSet(k, null); } }
  // Kho chỉ để đọc, dùng khi gộp.
  const roBackend = src => ({
    async get(keys) { const o = {}; for (const k of keys) if (k in src) o[k] = parseVal(k, src[k]); return o; },
    async set() { throw new Error('chỉ đọc'); }, async remove() { throw new Error('chỉ đọc'); },
    async getAll() { const o = {}; for (const [k, v] of Object.entries(src)) o[k] = parseVal(k, v); return o; },
  });
  const MISSING = 'Dấu trang của bạn đang nằm trong script “Sổ Dấu Trang – Kho”, mà lần mở trang này app chưa đọc được nó. Hãy để script Kho bật rồi tải lại trang: app sẽ tự chép dấu trang sang và từ đó không cần script Kho nữa. Trong lúc này app không ghi gì.';
  const missingBackend = {
    async get(keys) { return keys.includes('sdt_error') ? { sdt_error: MISSING } : {}; },
    async set() { throw new Error(MISSING); },
    async remove() { throw new Error(MISSING); },
    async getAll() { return {}; },
  };
  const KHO_WAIT = 3000;      // lúc khởi động: chờ Kho tối đa chừng này (khi chưa có dấu trang ở đây)
  const KHO_LATE = 30000;     // sau đó còn dò tiếp chừng này (và mỗi khi tab hiện lại)
  let active = local;
  let mode = 'local';
  let khoNote = '';
  // Chép dữ liệu từ Kho sang đây (một lần). Ở đây có dữ liệu mới lưu trong lúc chờ Kho → gộp, không bỏ bên nào.
  // Ở đây chỉ có bản cũ từ thời 2.x (có dấu MOVED) → thay bằng dữ liệu Kho.
  async function importFromKho(k) {
    const src = khoRead(k);
    const lk = localKeys();
    const stale = lk.includes(MOVED);
    const mine = lk.filter(isData);
    if (hasData(Object.keys(src)) && hasData(mine) && !stale) {
      const sK = SDTStorage.makeStore(roBackend(src)), sL = SDTStorage.makeStore(local);
      const a = await sK.loadAll(), b = await sL.loadAll();
      if (!a.ok) throw new Error(a.error);
      if (!b.ok) throw new Error(b.error);
      await sL.replaceAll(SDT.mergeData(a.data, b.data).data, 'soul');
      if (src.sdt_ui && !mine.includes('sdt_ui')) gmSet('sdt_ui', src.sdt_ui);
    } else if (hasData(Object.keys(src))) {
      for (const x of mine) if (!(x in src)) delKey(x);
      for (const [x, v] of Object.entries(src)) gmSet(x, v);
      for (const [x, v] of Object.entries(src)) if (gmGet(x, null) !== v) throw new Error('Kiểm lại sau khi chép không khớp ở ' + x + '.');
    } else if (src.sdt_ui && !mine.includes('sdt_ui')) gmSet('sdt_ui', src.sdt_ui);
    const r = await SDTStorage.makeStore(local).loadAll();
    delKey(MOVED); delKey(MISSES);
    gmSet(IMPORTED, JSON.stringify({ at: Date.now(), n: r.ok ? r.data.bookmarks.length : 0 }));
  }
  async function tryImport(k) {
    try { await importFromKho(k); khoNote = ''; active = local; mode = 'local'; return true; }
    catch (e) {
      khoNote = 'Chưa chép được dấu trang từ script Kho (' + e.message + '). Thử lại khi tải lại trang; dữ liệu trong Kho không bị đổi.';
      if (localKeys().includes(MOVED)) { active = missingBackend; mode = 'missing'; }
      return false;
    }
  }
  const imported = () => localKeys().includes(IMPORTED);
  const pause = ms => new Promise(r => setTimeout(r, ms));
  let gate = (async () => {
    const lk = localKeys();
    if (lk.includes(IMPORTED)) return;                         // đã chép xong: chỉ dùng kho này
    let k = findKho();
    const stale = lk.includes(MOVED);
    // Chờ Kho khi ở đây chưa có dấu trang dùng được. Người chưa từng cài Kho: thôi chờ sau 3 lần không thấy.
    const misses = Number(gmGet(MISSES, 0)) || 0;
    if (!k && (stale || (!hasData(lk) && misses < 3))) {
      const end = Date.now() + KHO_WAIT;
      while (!k && Date.now() < end) { await pause(100); k = findKho(); }
      if (!k && !stale) gmSet(MISSES, String(misses + 1));
    }
    if (k) { await tryImport(k); return; }
    if (stale) { active = missingBackend; mode = 'missing'; }
  })();
  const ready = gate;
  // Dò Kho muộn: thấy thì chép, rồi báo cho ruy băng, bảng, trình quản lý đọc lại.
  const lateUntil = Date.now() + KHO_WAIT + KHO_LATE;
  let lateBusy = false;
  let onImported = () => {};
  async function lateKho(force) {
    await gate;
    if (lateBusy || imported() || (!force && Date.now() > lateUntil)) return false;
    const k = findKho();
    if (!k) return false;
    lateBusy = true;
    let done = false;
    gate = (async () => { done = await tryImport(k); })();
    try { await gate; } finally { lateBusy = false; }
    if (done) onImported();
    return done;
  }
  const lateTimer = setInterval(() => { if (Date.now() > lateUntil || imported()) clearInterval(lateTimer); else lateKho(); }, 500);
  const backend = {
    async get(keys) { await gate; return active.get(keys); },
    async set(obj) { await gate; return active.set(obj); },
    async remove(keys) { await gate; return active.remove(keys); },
    async getAll() { await gate; return active.getAll ? active.getAll() : {}; },
  };
  const store = SDTStorage.makeStore(backend);
  function importInfo() { try { const v = gmGet(IMPORTED, null); return v ? JSON.parse(v) : null; } catch (e) { return null; } }
  function notice() {
    if (khoNote) return { title: 'Chưa chép được dấu trang từ script Kho', text: khoNote };
    const inf = importInfo();
    if (inf && !gmGet(IMPORT_SEEN, null)) return {
      title: 'Đã chép dấu trang từ script Kho',
      text: 'Đã chép ' + inf.n + ' dấu trang sang script “Sổ Dấu Trang”. Từ bản 3.0.0 chỉ cần một script này: bạn có thể gỡ script “Sổ Dấu Trang – Kho”. Đừng bấm Cập nhật hay gỡ script “Sổ Dấu Trang” trong Soul (Soul sẽ xóa dấu trang); app tự cập nhật.',
      action: { label: 'Đã hiểu', fn: () => { gmSet(IMPORT_SEEN, String(Date.now())); if (manager) manager.reopen(); } },
    };
    return null;
  }
  function fmtTime(t) { try { return new Date(t).toLocaleString('vi-VN'); } catch (e) { return String(t); } }
  function versionInfo() {
    if (!LOADER) return '';
    const last = LOADER.lastCheck ? LOADER.lastCheck() : 0;
    return ' Bản app: ' + (LOADER.running || '?') + (LOADER.source === 'update' ? ' (đã tự cập nhật)' : ' (có sẵn lúc cài)') +
      (LOADER.evalBlocked ? '; trang này chặn chạy mã tải về nên dùng bản có sẵn' : '') +
      '. Kiểm tra bản mới lần cuối: ' + (last ? fmtTime(last) : 'chưa') + '.';
  }
  function storageInfo() {
    if (mode === 'missing') return MISSING;
    return 'Nơi cất dữ liệu: ngay trong script “Sổ Dấu Trang” (chung mọi trang). App tự cập nhật: đừng bấm Cập nhật hay gỡ script này trong Soul, vì Soul sẽ xóa dấu trang. Nên thỉnh thoảng sao lưu.' + versionInfo();
  }
  // Soul không báo thay đổi giữa các tab: so rev khi tab hiện lại.
  function checkExternal() { return store.checkExternal(); }

  // Tùy chọn giao diện (vị trí nút, trạng thái trình quản lý).
  function uiPrefs() {
    try { const v = gmGet(UI_KEY, '{}'); return typeof v === 'string' ? JSON.parse(v || '{}') : (v || {}); } catch (e) { return {}; }
  }
  function setUiPref(k, val) {
    const p = uiPrefs(); p[k] = val;
    try { gmSet(UI_KEY, JSON.stringify(p)); } catch (e) { /* bỏ qua */ }
  }

  /* ---------- gốc giao diện trong Shadow DOM ---------- */
  const hostEl = document.createElement('sdt-so-dau-trang');
  // Đặt kiểu bằng CSSOM (trang có CSP chặt vẫn cho phép).
  for (const [k, v] of [['all', 'initial'], ['position', 'fixed'], ['top', '0'], ['left', '0'], ['width', '0'], ['height', '0'],
    ['z-index', '2147483647'], ['display', 'block']]) hostEl.style.setProperty(k, v, 'important');
  const shadow = hostEl.attachShadow({ mode: window.__SDT_TEST__ ? 'open' : 'closed' });
  try {
    const sheet = new CSSStyleSheet();
    sheet.replaceSync(SDT_CSS);
    shadow.adoptedStyleSheets = [sheet];
  } catch (e) {
    const st = document.createElement('style');
    st.textContent = SDT_CSS;
    shadow.append(st);
  }
  const wrap = h('div', { class: 'sdt soul' });
  shadow.append(wrap);
  SDTUI.config({
    host: wrap,
    favicon: false,
    copy: text => { if (typeof GM_setClipboard === 'function') { GM_setClipboard(text); return true; } return false; },
  });

  /* ---------- nút ruy băng ---------- */
  const rib = h('button', {
    type: 'button', class: 'rib', 'data-test': 'soul-ribbon', 'data-state': 'off',
    'aria-label': 'Sổ Dấu Trang: trang này chưa lưu', title: 'Sổ Dấu Trang',
  }, h('span', { class: 'rib-shape', 'aria-hidden': 'true',
    svg: ['0 0 20 32', '<path d="M2.5 2.5H17.5V29L10 22.5L2.5 29Z" stroke-width="2.4" stroke-linejoin="round"/>'] }));
  rib.setAttribute('data-state', 'off');
  wrap.append(rib);

  // Vị trí: bám mép trái hoặc phải (side), cao độ theo tỉ lệ màn hình (y). Cất trong Kho nên nhớ cho mọi trang.
  function clampTop(px) { return Math.max(8, Math.min(window.innerHeight - 64, px)); }
  function placeRibbon() {
    const p = uiPrefs();
    const y = Number(p.y);
    const frac = Number.isFinite(y) && y >= 0 && y <= 1 ? y : 0.62;
    rib.style.top = clampTop(Math.round(frac * window.innerHeight)) + 'px';
    rib.dataset.side = p.side === 'left' ? 'left' : 'right';
  }
  placeRibbon();
  ready.then(() => placeRibbon());          // vị trí cất trong Kho: đọc lại khi đã nối được Kho
  window.addEventListener('resize', placeRibbon);

  // Mờ khi không chạm: rõ lên khi chạm / kéo / rê chuột / bảng đang mở, mờ lại sau ~1,8 giây.
  let fadeTimer = 0;
  function wake(ms) {
    clearTimeout(fadeTimer);
    rib.classList.add('awake');
    if (ms !== 0) fadeTimer = setTimeout(sleep, ms || 1800);
  }
  function sleep() {
    clearTimeout(fadeTimer);
    if (drag || sheet.open || rib.matches(':focus-visible')) return;
    rib.classList.remove('awake');
  }

  let drag = null;
  let suppressClick = false;
  rib.addEventListener('pointerdown', e => {
    const r = rib.getBoundingClientRect();
    drag = { x0: e.clientX, y0: e.clientY, top0: r.top, left0: r.left, w: r.width, moved: false };
    wake(0);
    try { rib.setPointerCapture(e.pointerId); } catch (err) { /* bỏ qua */ }
  });
  rib.addEventListener('pointermove', e => {
    if (!drag) return;
    const dx = e.clientX - drag.x0, dy = e.clientY - drag.y0;
    if (!drag.moved && Math.hypot(dx, dy) < 8) return;
    drag.moved = true;
    rib.classList.add('dragging');
    rib.style.top = clampTop(drag.top0 + dy) + 'px';
    const left = Math.max(0, Math.min(window.innerWidth - drag.w, drag.left0 + dx));
    rib.style.transform = 'translateX(' + Math.round(left - drag.left0) + 'px)';
    e.preventDefault();
  });
  function endDrag() {
    if (!drag) return;
    if (drag.moved) {
      suppressClick = true;
      setTimeout(() => { suppressClick = false; }, 400);
      const r = rib.getBoundingClientRect();
      const side = r.left + r.width / 2 < window.innerWidth / 2 ? 'left' : 'right';
      rib.style.transform = '';
      rib.dataset.side = side;
      setUiPref('y', Math.round(r.top / window.innerHeight * 1000) / 1000);
      setUiPref('side', side);
    }
    rib.classList.remove('dragging');
    drag = null;
    wake();
  }
  rib.addEventListener('pointerup', endDrag);
  rib.addEventListener('pointercancel', endDrag);
  rib.addEventListener('pointerenter', e => { if (e.pointerType === 'mouse') wake(0); });
  rib.addEventListener('pointerleave', e => { if (e.pointerType === 'mouse' && !drag) wake(); });
  rib.addEventListener('focus', () => { if (rib.matches(':focus-visible')) wake(0); });
  rib.addEventListener('blur', () => wake());
  rib.addEventListener('click', () => { if (suppressClick) { suppressClick = false; return; } openSheet(); });

  const timing = { checks: [] };
  async function refreshRibbon() {
    const t0 = performance.now();
    let state = 'off';
    try {
      let r = await store.idsForUrl(location.href);
      if (r.ok === false) { state = 'err'; r = null; }
      else if (r.noMeta) {                       // kho trống hoặc còn dữ liệu v1: chuyển đổi một lần
        const e = await store.ensure();
        if (!e.ok) { state = 'err'; r = null; } else if (e.meta) r = await store.idsForUrl(location.href);
      }
      if (r && r.ids && r.ids.length) state = 'on';
    } catch (e) { state = 'err'; }
    timing.checks.push(performance.now() - t0);
    rib.dataset.state = state;
    rib.setAttribute('aria-label', state === 'on' ? 'Sổ Dấu Trang: trang này đã lưu' : 'Sổ Dấu Trang: trang này chưa lưu');
  }

  /* ---------- bảng lưu nhanh ---------- */
  const popApp = h('main', { class: 'sdt pop', 'aria-live': 'polite' });
  const sheet = h('dialog', { class: 'psheet', 'data-test': 'soul-sheet', 'aria-label': 'Sổ Dấu Trang' },
    h('div', { class: 'psheet-bar' },
      h('span', { class: 'psheet-grip', 'aria-hidden': 'true' }),
      h('button', { type: 'button', class: 'icon-btn', 'data-test': 'soul-sheet-close', 'aria-label': 'Đóng', onclick: closeSheet }, SDTUI.icon('close'))),
    popApp);
  sheet.addEventListener('click', e => { if (e.target === sheet) closeSheet(); });
  sheet.addEventListener('cancel', e => { e.preventDefault(); closeSheet(); });
  wrap.append(sheet);
  let popup = null;
  const popEnv = {
    store,
    notice,
    getTarget: async () => ({ url: location.href, title: document.title }),
    openManager: () => { closeSheet(); openManager(); },
    prefs: { get: k => uiPrefs()[k] || null, set: (k, v) => setUiPref(k, v) },
  };
  function openSheet() {
    if (!overlay.hidden) closeManager();
    if (!popup) popup = SDTNS.SDTPopup.mount(popApp, popEnv);
    else popup.refresh(false);
    if (!sheet.open) sheet.showModal();
  }
  function closeSheet() { if (sheet.open) sheet.close(); refreshRibbon(); }
  sheet.addEventListener('close', () => wake());

  /* ---------- trình quản lý lớp phủ ---------- */
  // Nhớ cách sắp xếp, chỗ đang xem, vị trí cuộn: cất trong Kho (chung mọi trang, còn sau khi cập nhật script).
  const mgrState = { load: () => uiPrefs().mgr || null, save: o => setUiPref('mgr', o) };
  const overlay = h('div', { class: 'ovl', 'data-test': 'soul-overlay', hidden: true });
  wrap.append(overlay);
  let manager = null;
  let pushed = false;
  let savedOverflow = null;
  function lockScroll() {
    const de = document.documentElement;
    savedOverflow = { html: de.style.getPropertyValue('overflow'), htmlP: de.style.getPropertyPriority('overflow'),
      body: document.body ? document.body.style.getPropertyValue('overflow') : '', bodyP: document.body ? document.body.style.getPropertyPriority('overflow') : '' };
    de.style.setProperty('overflow', 'hidden', 'important');
    if (document.body) document.body.style.setProperty('overflow', 'hidden', 'important');
  }
  function unlockScroll() {
    if (!savedOverflow) return;
    const de = document.documentElement;
    if (savedOverflow.html) de.style.setProperty('overflow', savedOverflow.html, savedOverflow.htmlP); else de.style.removeProperty('overflow');
    if (document.body) {
      if (savedOverflow.body) document.body.style.setProperty('overflow', savedOverflow.body, savedOverflow.bodyP); else document.body.style.removeProperty('overflow');
    }
    savedOverflow = null;
  }
  function openUrl(url) {
    if (!SDT.safeUrl(url)) return;
    try { if (typeof GM_openInTab === 'function') { GM_openInTab(url, false); return; } } catch (e) { /* thử cách khác */ }
    window.open(url, '_blank', 'noopener');
  }
  function openManager() {
    if (sheet.open) sheet.close();
    if (!overlay.hidden) return;
    overlay.hidden = false;
    if (!manager) manager = SDTNS.SDTManager.mount(overlay, { store, openUrl, notice, storageInfo, state: mgrState, onClose: () => closeManager(), pasteBackup: true, scroller: () => overlay, keyTarget: overlay });
    else manager.reopen();
    lockScroll();
    try { history.pushState(Object.assign({}, history.state, { sdtOverlay: true }), ''); pushed = true; } catch (e) { pushed = false; }
  }
  function closeManager(fromPop) {
    if (overlay.hidden) return;
    if (manager) manager.saveState();
    overlay.hidden = true;
    if (manager) manager.setDrawer(false);
    unlockScroll();
    if (pushed && !fromPop) { pushed = false; try { history.back(); } catch (e) { /* bỏ qua */ } }
    pushed = false;
    refreshRibbon();
  }
  window.addEventListener('popstate', () => { if (!overlay.hidden) closeManager(true); });

  /* ---------- theo dõi thay đổi ---------- */
  onImported = () => {
    placeRibbon();
    checkExternal();                         // rev khác → bảng / trình quản lý đọc lại
    refreshRibbon();
    if (popup && sheet.open) popup.refresh(false);
    if (manager && !overlay.hidden) manager.reopen();
  };
  store.onChange(() => refreshRibbon());
  document.addEventListener('visibilitychange', () => { if (!document.hidden) { lateKho(true); checkExternal(); refreshRibbon(); } });
  window.addEventListener('focus', () => { lateKho(true); checkExternal(); });
  window.addEventListener('pageshow', () => { lateKho(true); checkExternal(); refreshRibbon(); });
  let lastHref = location.href;
  setInterval(() => { if (location.href !== lastHref) { lastHref = location.href; refreshRibbon(); } }, 700);

  try {
    if (typeof GM_registerMenuCommand === 'function') {
      GM_registerMenuCommand('Lưu / sửa trang này', openSheet);
      GM_registerMenuCommand('Mở trình quản lý', openManager);
      if (LOADER && LOADER.check) GM_registerMenuCommand('Kiểm tra bản mới', async () => {
        const r = await LOADER.check(true);
        const t = r.status === 'new' ? 'Đã tải bản ' + r.version + ': tải lại trang để dùng.'
          : r.status === 'latest' ? 'Đang dùng bản mới nhất (' + (LOADER.running || r.version) + ').'
          : 'Chưa kiểm tra được bản mới' + (r.error ? ' (' + r.error + ')' : '') + '.';
        SDTUI.toast(t, { error: r.status === 'error' });
      });
    }
  } catch (e) { /* Soul không hiện menu cũng không sao */ }

  (document.documentElement || document.body).append(hostEl);
  refreshRibbon();
  if (window.__SDT_TEST__) window.__SDT_SOUL__ = { shadow, openSheet, openManager, closeManager, store, timing, ready,
    storage: () => ({ mode, imported: importInfo(), note: khoNote, loader: LOADER ? { running: LOADER.running, source: LOADER.source, evalBlocked: LOADER.evalBlocked } : null }) };
})();
