/* Sổ Dấu Trang — bảng lưu nhanh (popup của tiện ích, tấm trượt của bản Soul).
   SDTPopup.mount(phầnTử, env)
   env = {
     store: kho SDTStorage (loadLite, lookupUrl, save, onChange),
     getTarget(): Promise<{url, title}>,
     openManager(),
     prefs: { get(k), set(k, v) }
   }
   Popup chỉ đọc phần dữ liệu cần: thư mục, nhãn, và dấu trang của đúng địa chỉ này. */
(function (root) {
  'use strict';
  const { h, BookmarkForm, toast, activeIn, ribbonSvg } = root.SDTUI;
  const ORIGIN = 'popup';

  function mount(app, env) {
    const store = env.store;
    const S = { data: null, tags: [], tab: null, current: null, matches: [], form: null, forceDup: false, dupBox: null };

    function ribbon(saved) { return h('div', { class: 'ribbon' + (saved ? ' on' : ''), 'data-test': 'popup-ribbon', 'aria-hidden': 'true' }, ribbonSvg(saved, true)); }

    function renderMessage(title, text, test) {
      app.textContent = '';
      app.append(
        h('header', { class: 'p-head' }, ribbon(false), h('div', { class: 'p-status' }, h('p', { class: 'p-state', 'data-test': 'popup-status' }, title))),
        h('p', { class: 'p-note', 'data-test': test }, text),
        h('div', { class: 'p-actions' }, h('button', { type: 'button', class: 'btn quiet', 'data-test': 'popup-open-manager', onclick: () => env.openManager() }, 'Mở trình quản lý')));
    }
    function lastFolder() { try { const id = env.prefs.get('lastFolder'); return id && SDT.getFolder(S.data, id) ? id : null; } catch (e) { return null; } }
    function rememberFolder(id) { try { env.prefs.set('lastFolder', id || ''); } catch (e) { /* bỏ qua */ } }
    function clearDup() { S.forceDup = false; if (S.dupBox) S.dupBox.hidden = true; }

    async function createFolder(name, parentId) {
      const r = SDT.addFolder(S.data, name, parentId, Date.now());
      if (!r.ok) return r;
      try { await store.save(S.data, r.data, ORIGIN); } catch (e) { return { ok: false, error: 'Không lưu được: ' + e.message }; }
      S.data = r.data;
      return r;
    }

    function render() {
      S.current = S.matches[0] || null;
      const saved = !!S.current;
      app.textContent = '';
      const detail = saved ? 'Trong ' + SDT.folderLabel(S.data, S.current.folderId) + ', lưu ngày ' + SDT.formatDate(S.current.createdAt) : 'Điền thông tin rồi bấm Lưu.';
      const head = h('header', { class: 'p-head' }, ribbon(saved),
        h('div', { class: 'p-status' },
          h('p', { class: 'p-state', 'data-test': 'popup-status' }, saved ? 'Đã lưu' : 'Chưa lưu'),
          h('p', { class: 'p-detail', 'data-test': 'popup-status-detail' }, detail),
          S.matches.length > 1 ? h('p', { class: 'p-detail', 'data-test': 'popup-multi' }, 'Trang này có ' + S.matches.length + ' dấu trang; đang hiện bản sửa gần nhất.') : null));
      const values = saved
        ? { title: S.current.title, url: S.current.url, folderId: S.current.folderId, tags: S.current.tags }
        : { title: S.tab.title || '', url: S.tab.url, folderId: lastFolder(), tags: [] };
      S.form = BookmarkForm({ prefix: 'popup', getData: () => S.data, getTags: () => S.tags, values, onChange: clearDup, onCreateFolder: createFolder });
      S.form.fields.url.addEventListener('input', clearDup);
      S.dupBox = h('div', { class: 'dup', 'data-test': 'dup-warning', hidden: true });
      const saveBtn = h('button', { type: 'submit', class: 'btn primary', 'data-test': 'popup-save' }, saved ? 'Cập nhật' : 'Lưu dấu trang');
      const delBtn = saved ? h('button', { type: 'button', class: 'btn danger-soft', 'data-test': 'popup-delete', onclick: onDelete }, 'Xóa') : null;
      const form = h('form', { class: 'p-form', novalidate: true, onsubmit: e => { e.preventDefault(); onSave(); } },
        S.form.el, S.dupBox, h('div', { class: 'p-actions' }, delBtn, saveBtn));
      const foot = h('footer', { class: 'p-foot' },
        h('button', { type: 'button', class: 'link', 'data-test': 'popup-open-manager', onclick: () => env.openManager() }, 'Mở trình quản lý'),
        saved ? h('span', { class: 'p-meta', 'data-test': 'popup-meta' }, 'Cập nhật ' + SDT.formatDateTime(S.current.updatedAt)) : null);
      app.append(head, form, foot);
    }

    function showDup(others, values) {
      const b = others[0];
      S.dupBox.textContent = '';
      S.dupBox.append(
        h('p', {}, 'Địa chỉ này đã lưu ở ', h('strong', {}, SDT.folderLabel(S.data, b.folderId)), ' với tên “' + b.title + '”.'),
        h('div', { class: 'dup-actions' },
          h('button', { type: 'button', class: 'btn quiet small', 'data-test': 'dup-open', onclick: async () => { S.tab = Object.assign({}, S.tab, { url: b.url }); await loadMatches(); render(); } }, 'Mở bản cũ để sửa'),
          h('button', { type: 'button', class: 'btn quiet small', 'data-test': 'dup-force', onclick: () => { S.forceDup = true; onSave(values); } }, 'Vẫn lưu thêm')));
      S.dupBox.hidden = false;
    }

    async function loadMatches() {
      const r = await store.lookupUrl(S.tab.url);
      S.matches = r.ok ? r.bookmarks : [];
      S.data = Object.assign({}, S.data, { bookmarks: S.matches });
    }

    async function onSave(valuesOverride) {
      S.form.showError('');
      const values = valuesOverride || S.form.get();
      const fx = SDT.fixUrl(values.url);
      if (!fx.ok) { S.form.showError(fx.error); S.form.fields.url.focus(); return; }
      if (!S.forceDup && (!S.current || SDT.normalizeUrl(fx.url) !== S.current.urlKey)) {
        const lk = await store.lookupUrl(fx.url);
        const others = (lk.ok ? lk.bookmarks : []).filter(b => !S.current || b.id !== S.current.id);
        if (others.length) { showDup(others, values); return; }
      }
      const wasEdit = !!S.current;
      const now = Date.now();
      const r = wasEdit ? SDT.updateBookmark(S.data, S.current.id, values, now, { order: now }) : SDT.addBookmark(S.data, values, now, { order: now });
      if (!r.ok) { S.form.showError(r.error); return; }
      if (wasEdit && !r.changed) { toast('Không có gì thay đổi.'); return; }
      try { await store.save(S.data, r.data, ORIGIN); } catch (e) { S.form.showError('Không lưu được: ' + e.message); return; }
      rememberFolder(r.bookmark.folderId);
      S.tab = Object.assign({}, S.tab, { url: r.bookmark.url });
      S.forceDup = false;
      S.data = r.data;
      for (const t of r.bookmark.tags) if (!S.tags.some(x => x.toLowerCase() === t.toLowerCase())) S.tags.push(t);
      // Cập nhật ngay từ dữ liệu vừa lưu, không đọc lại kho.
      const key = SDT.normalizeUrl(S.tab.url);
      S.matches = S.data.bookmarks.filter(b => b.urlKey === key).sort((a, b) => b.updatedAt - a.updatedAt);
      render();
      toast(wasEdit ? 'Đã cập nhật.' : 'Đã lưu.');
    }

    async function onDelete() {
      const b = S.current;
      if (!b) return;
      const before = S.data;
      const r = SDT.deleteBookmarks(S.data, [b.id]);
      try { await store.save(before, r.data, ORIGIN); } catch (e) { toast('Không xóa được: ' + e.message, { error: true }); return; }
      await loadMatches();
      render();
      toast('Đã xóa dấu trang.', {
        action: 'Hoàn tác',
        onAction: async () => {
          const cur = S.data;
          const back = Object.assign({}, cur, { bookmarks: cur.bookmarks.concat([b]) });
          await store.save(cur, back, ORIGIN);
          await loadMatches();
          render();
          toast('Đã khôi phục.');
        },
      });
    }

    async function refresh(focusTitle) {
      try { S.tab = await env.getTarget(); } catch (e) { S.tab = null; }
      const lite = await store.loadLite();
      if (!lite.ok) { S.data = null; renderMessage('Không đọc được dữ liệu', lite.error + ' Mở trình quản lý để xem cách xử lý.', 'popup-data-error'); return; }
      S.data = { version: SDT.DATA_VERSION, folders: lite.folders, bookmarks: [], tagColors: lite.tagColors };
      S.tags = lite.tags.slice();
      if (!S.tab || !SDT.isSavableUrl(S.tab.url)) {
        renderMessage('Không lưu được trang này', 'Đây là trang nội bộ của trình duyệt. Chỉ lưu được trang web có địa chỉ http, https, ftp hoặc file.', 'popup-unsupported');
        return;
      }
      await loadMatches();
      render();
      if (!window.__sdtFirstRender) window.__sdtFirstRender = performance.now();
      const t = S.form && S.form.fields.title;
      if (focusTitle && t && !(window.matchMedia && matchMedia('(pointer:coarse)').matches)) t.focus();
    }

    store.onChange(async info => {
      if (!S.data || info.origin === ORIGIN || !S.tab) return;
      const active = activeIn(app);
      if (active && S.form && S.form.el.contains(active)) return;     // đang gõ: không vẽ lại
      await refresh(false);
    });

    const ready = refresh(true);
    return { refresh, ready };
  }

  root.SDTPopup = { mount };
})(typeof globalThis !== 'undefined' ? globalThis : this);
