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

  /* ---------- nơi cất dữ liệu: script "Sổ Dấu Trang – Kho" (bền qua cập nhật) hoặc kho GM riêng ---------- */
  const KHO_URL = 'https://raw.githubusercontent.com/Cungbonvotang/SoulBookmarks/main/so-dau-trang-kho.user.js';
  const MOVED = 'sdt_kho_moved';           // đánh dấu trong kho riêng: dữ liệu đã chuyển sang Kho
  function parseVal(k, v) {
    if (k === 'sdt_data' || k === 'sdt_data_backup_v1') return v;
    try { return JSON.parse(v); } catch (e) { return v; }
  }
  function findKho() {
    let pageWin = window;
    try { if (typeof unsafeWindow !== 'undefined' && unsafeWindow) pageWin = unsafeWindow; } catch (e) { /* bỏ qua */ }
    const g = window.__SDT_KHO_FORCE_EVENTS__ ? null : window.__sdtKho1;
    if (g && typeof g.call === 'function') {
      let visible = true;
      try { visible = pageWin === window || !!pageWin.__sdtKho1; } catch (e) { visible = true; }
      const call = q => JSON.parse(g.call(JSON.stringify(q)));
      try { const r = call({ op: 'hello' }); if (r.ok) return { call, channel: 'world', private: !visible, version: r.result.version }; } catch (e) { /* thử đường sự kiện */ }
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
    try { const r = call({ op: 'hello' }); if (r.ok) return { call, channel: 'events', private: false, version: r.result.version }; } catch (e) { /* không có Kho */ }
    document.removeEventListener('sdt-kho:res', onRes);
    return null;
  }
  function khoBackend(kho) {
    const run = q => { const r = kho.call(q); if (!r.ok) throw new Error(r.error || 'Script Kho báo lỗi.'); return r.result; };
    return {
      run,
      async get(keys) { const r = run({ op: 'get', keys }); const o = {}; for (const [k, v] of Object.entries(r)) o[k] = parseVal(k, v); return o; },
      async set(obj) { const d = {}; for (const [k, v] of Object.entries(obj)) d[k] = typeof v === 'string' ? v : JSON.stringify(v); run({ op: 'set', data: d }); },
      async remove(keys) { run({ op: 'remove', keys }); },
      async getAll() { const r = run({ op: 'get', keys: run({ op: 'list' }) }); const o = {}; for (const [k, v] of Object.entries(r)) o[k] = parseVal(k, v); return o; },
    };
  }
  const MISSING = 'Không thấy script “Sổ Dấu Trang – Kho”. Dấu trang của bạn đang nằm trong script Kho: hãy bật lại hoặc cài lại script Kho rồi tải lại trang. Trong lúc này app không ghi gì.';
  const missingBackend = {
    async get(keys) { return keys.includes('sdt_error') ? { sdt_error: MISSING } : {}; },
    async set() { throw new Error(MISSING); },
    async remove() { throw new Error(MISSING); },
    async getAll() { return {}; },
  };
  function localKeys() { try { return (GM_listValues() || []).filter(k => /^sdt_/.test(String(k))); } catch (e) { return []; } }
  const kho = findKho();
  let active = local;
  let mode = 'local';
  let khoNote = '';
  async function moveToKho(kb, dataKeys) {
    const khoKeys = kb.run({ op: 'list' });
    const khoHas = khoKeys.includes('sdt_meta') || khoKeys.includes('sdt_data');
    if (!khoHas) {
      const d = {};
      for (const k of dataKeys) { const v = gmGet(k, null); if (v !== null && v !== undefined) d[k] = typeof v === 'string' ? v : JSON.stringify(v); }
      kb.run({ op: 'set', data: d });
      const back = kb.run({ op: 'get', keys: Object.keys(d) });
      for (const k of Object.keys(d)) if (back[k] !== d[k]) throw new Error('Kiểm lại sau khi chép không khớp ở ' + k + '.');
      return;
    }
    // Cả hai bên đều có dữ liệu: gộp vào Kho, không bỏ bên nào.
    const sL = SDTStorage.makeStore(local), sK = SDTStorage.makeStore(kb);
    const a = await sK.loadAll(), b = await sL.loadAll();
    if (!a.ok) throw new Error(a.error);
    if (!b.ok) throw new Error(b.error);
    await sK.replaceAll(SDT.mergeData(a.data, b.data).data, 'soul');
  }
  const ready = (async () => {
    const lk = localKeys();
    const moved = lk.includes(MOVED);
    if (!kho) { if (moved) { active = missingBackend; mode = 'missing'; } return; }
    const kb = khoBackend(kho);
    const dataKeys = lk.filter(k => k !== MOVED && k !== UI_KEY);
    if (!moved && (dataKeys.includes('sdt_meta') || dataKeys.includes('sdt_data'))) {
      try { await moveToKho(kb, dataKeys); } catch (e) { khoNote = 'Chưa chuyển được dấu trang sang script Kho (' + e.message + '). App tạm dùng kho riêng như cũ.'; return; }
    }
    try { gmSet(MOVED, String(Date.now())); } catch (e) { /* bỏ qua */ }
    active = kb;
    mode = kho.private ? 'kho' : 'kho-page';
  })();
  const backend = {
    async get(keys) { await ready; return active.get(keys); },
    async set(obj) { await ready; return active.set(obj); },
    async remove(keys) { await ready; return active.remove(keys); },
    async getAll() { await ready; return active.getAll ? active.getAll() : {}; },
  };
  const store = SDTStorage.makeStore(backend);
  function notice() {
    if (khoNote) return { title: 'Chưa chuyển được sang script Kho', text: khoNote };
    if (mode !== 'local') return null;
    return {
      title: 'Chưa cài script Kho',
      text: 'Dấu trang đang nằm trong kho riêng của script này nên sẽ mất khi bấm cập nhật trong Soul. Cài thêm script “Sổ Dấu Trang – Kho” để giữ dấu trang qua mọi lần cập nhật; dữ liệu hiện có sẽ tự chuyển sang.',
      action: { label: 'Cài script Kho', fn: () => openUrl(KHO_URL) },
    };
  }
  function storageInfo() {
    if (mode === 'kho') return 'Nơi cất dữ liệu: script “Sổ Dấu Trang – Kho”. Cập nhật script chính không làm mất dấu trang. Trang web đang mở không đọc được dữ liệu này.';
    if (mode === 'kho-page') return 'Nơi cất dữ liệu: script “Sổ Dấu Trang – Kho”. Cập nhật script chính không làm mất dấu trang. Hai script trao đổi qua trang đang mở, nên về lý thuyết mã của trang có thể đọc được dấu trang.';
    if (mode === 'missing') return MISSING;
    return 'Nơi cất dữ liệu: kho riêng của script này — sẽ mất khi bấm cập nhật trong Soul. Hãy cài script “Sổ Dấu Trang – Kho”.';
  }
  // Soul không báo thay đổi giữa các tab: so rev khi tab hiện lại.
  function checkExternal() { return store.checkExternal(); }

  // Tùy chọn giao diện (vị trí nút): cất trong Kho nếu có, để cũng còn sau khi cập nhật.
  function uiPrefs() {
    try {
      if (kho) { const r = kho.call({ op: 'get', keys: [UI_KEY] }); if (r.ok && r.result[UI_KEY]) return JSON.parse(r.result[UI_KEY]); }
      const v = gmGet(UI_KEY, '{}'); return typeof v === 'string' ? JSON.parse(v || '{}') : (v || {});
    } catch (e) { return {}; }
  }
  function setUiPref(k, val) {
    const p = uiPrefs(); p[k] = val;
    try { if (kho) kho.call({ op: 'set', data: { [UI_KEY]: JSON.stringify(p) } }); else gmSet(UI_KEY, JSON.stringify(p)); } catch (e) { /* bỏ qua */ }
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

  function clampTop(px) { return Math.max(8, Math.min(window.innerHeight - 64, px)); }
  function placeRibbon() {
    const y = Number(uiPrefs().y);
    const frac = Number.isFinite(y) && y >= 0 && y <= 1 ? y : 0.62;
    rib.style.top = clampTop(Math.round(frac * window.innerHeight)) + 'px';
  }
  placeRibbon();
  window.addEventListener('resize', placeRibbon);

  let drag = null;
  let suppressClick = false;
  rib.addEventListener('pointerdown', e => {
    drag = { y0: e.clientY, top0: rib.getBoundingClientRect().top, moved: false };
    try { rib.setPointerCapture(e.pointerId); } catch (err) { /* bỏ qua */ }
  });
  rib.addEventListener('pointermove', e => {
    if (!drag) return;
    const dy = e.clientY - drag.y0;
    if (!drag.moved && Math.abs(dy) < 8) return;
    drag.moved = true;
    rib.classList.add('dragging');
    rib.style.top = clampTop(drag.top0 + dy) + 'px';
    e.preventDefault();
  });
  function endDrag() {
    if (!drag) return;
    if (drag.moved) {
      suppressClick = true;
      setTimeout(() => { suppressClick = false; }, 400);
      setUiPref('y', Math.round(rib.getBoundingClientRect().top / window.innerHeight * 1000) / 1000);
    }
    rib.classList.remove('dragging');
    drag = null;
  }
  rib.addEventListener('pointerup', endDrag);
  rib.addEventListener('pointercancel', endDrag);
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

  /* ---------- trình quản lý lớp phủ ---------- */
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
    try { if (typeof GM_openInTab === 'function') { GM_openInTab(url, false); return; } } catch (e) { /* thử cách khác */ }
    window.open(url, '_blank', 'noopener');
  }
  function openManager() {
    if (sheet.open) sheet.close();
    if (!overlay.hidden) return;
    overlay.hidden = false;
    if (!manager) manager = SDTNS.SDTManager.mount(overlay, { store, openUrl, notice, storageInfo, onClose: () => closeManager(), pasteBackup: true, scroller: () => overlay, keyTarget: overlay });
    else manager.reload();
    lockScroll();
    try { history.pushState(Object.assign({}, history.state, { sdtOverlay: true }), ''); pushed = true; } catch (e) { pushed = false; }
  }
  function closeManager(fromPop) {
    if (overlay.hidden) return;
    overlay.hidden = true;
    if (manager) manager.setDrawer(false);
    unlockScroll();
    if (pushed && !fromPop) { pushed = false; try { history.back(); } catch (e) { /* bỏ qua */ } }
    pushed = false;
    refreshRibbon();
  }
  window.addEventListener('popstate', () => { if (!overlay.hidden) closeManager(true); });

  /* ---------- theo dõi thay đổi ---------- */
  store.onChange(() => refreshRibbon());
  document.addEventListener('visibilitychange', () => { if (!document.hidden) { checkExternal(); refreshRibbon(); } });
  window.addEventListener('focus', () => { checkExternal(); });
  window.addEventListener('pageshow', () => { checkExternal(); refreshRibbon(); });
  let lastHref = location.href;
  setInterval(() => { if (location.href !== lastHref) { lastHref = location.href; refreshRibbon(); } }, 700);

  try {
    if (typeof GM_registerMenuCommand === 'function') {
      GM_registerMenuCommand('Lưu / sửa trang này', openSheet);
      GM_registerMenuCommand('Mở trình quản lý', openManager);
    }
  } catch (e) { /* Soul không hiện menu cũng không sao */ }

  (document.documentElement || document.body).append(hostEl);
  refreshRibbon();
  if (window.__SDT_TEST__) window.__SDT_SOUL__ = { shadow, openSheet, openManager, closeManager, store, timing, ready,
    storage: () => ({ mode, channel: kho ? kho.channel : null, private: kho ? kho.private : null, note: khoNote }) };
})();
