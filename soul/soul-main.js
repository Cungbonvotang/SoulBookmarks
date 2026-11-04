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
  const backend = {
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
  const store = SDTStorage.makeStore(backend);
  // Soul không báo thay đổi giữa các tab: so rev khi tab hiện lại.
  function checkExternal() { return store.checkExternal(); }

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
    if (!manager) manager = SDTNS.SDTManager.mount(overlay, { store, openUrl, onClose: () => closeManager(), pasteBackup: true, scroller: () => overlay, keyTarget: overlay });
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
  if (window.__SDT_TEST__) window.__SDT_SOUL__ = { shadow, openSheet, openManager, closeManager, store, timing };
})();
