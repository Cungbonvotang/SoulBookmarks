/* Sổ Dấu Trang — trình quản lý (bản 2.0).
   SDTManager.mount(phầnTửChứa, env)
   env = {
     store: kho SDTStorage (loadAll, save, replaceAll, onChange, raw),
     openUrl?(url)        // mở dấu trang (bản Soul: GM_openInTab); không có thì dùng liên kết thường
     onClose?()           // có thì hiện nút Đóng (bản Soul)
     pasteBackup?: bool   // thêm Chép / Dán dữ liệu ở màn Sao lưu
     keyTarget?           // nơi nghe phím tắt
     scroller?()          // phần tử cuộn danh sách (mặc định là trang)
   } */
(function (root) {
  'use strict';
  const UI = root.SDTUI;
  const { h, icon, BookmarkForm, openDialog, confirmDialog, promptDialog, contextMenu, pickFolder, toast, copyText, faviconUrl, tagClass } = UI;
  const ORIGIN = 'manager';
  const PAGE = 60;

  function buildLayout(withClose) {
    const ib = (id, test, label, extra) => h('button', Object.assign({ type: 'button', class: 'icon-btn', id, 'data-test': test, 'aria-label': label }, extra || {}));
    return h('div', { class: 'layout' },
      h('aside', { class: 'side', id: 'side', 'data-test': 'sidebar', 'aria-label': 'Thư mục' },
        h('div', { class: 'side-head' },
          h('span', { class: 'brand' }, h('span', { class: 'brand-mark', svg: ['0 0 20 32', '<path d="M2.5 2.5H17.5V29L10 22.5L2.5 29Z"/>'] }), 'Sổ Dấu Trang'),
          ib('side-close', 'btn-drawer-close', 'Đóng danh sách thư mục', { class: 'icon-btn only-mobile' })),
        h('nav', { class: 'tree', id: 'tree' })),
      h('div', { class: 'scrim', id: 'scrim', 'data-test': 'drawer-scrim' }),
      h('main', { class: 'main' },
        h('header', { class: 'topbar' },
          ib('btn-drawer', 'btn-drawer', 'Mở danh sách thư mục', { class: 'icon-btn only-mobile' }),
          h('label', { class: 'search' },
            h('span', { class: 'search-ic', id: 'search-ic' }),
            h('input', { type: 'search', id: 'search', 'data-test': 'search-input', placeholder: 'Tìm dấu trang', autocomplete: 'off', enterkeyhint: 'search', 'aria-label': 'Tìm dấu trang' })),
          ib('btn-filter', 'btn-filter', 'Lọc', { class: 'icon-btn badge-host' }),
          ib('btn-more', 'btn-more', 'Thêm'),
          withClose ? ib('btn-close-manager', 'btn-close-manager', 'Đóng trình quản lý') : null),
        h('div', { id: 'banner' }),
        h('section', { class: 'listhead', id: 'listhead' }),
        h('section', { class: 'list', id: 'list', 'data-test': 'list', 'aria-live': 'polite' }),
        h('div', { class: 'bulkbar', id: 'bulkbar', 'data-test': 'bulkbar', hidden: true }),
        h('button', { type: 'button', class: 'fab', id: 'fab', 'data-test': 'fab-add', 'aria-label': 'Thêm dấu trang' })));
  }

  function mount(container, env) {
    const store = env.store;
    container.classList.add('sdt', 'mgr');
    container.textContent = '';
    container.append(buildLayout(!!env.onClose));
    const $ = id => container.querySelector('#' + id);
    const rootNode = container.getRootNode();
    const scroller = () => (env.scroller ? env.scroller() : (document.scrollingElement || document.documentElement));

    const S = {
      data: SDT.emptyData(), readOnly: false, loadError: '', rawBad: undefined,
      view: 'root',                 // 'all' | 'root' | mã thư mục
      q: SDT.defaultQuery(),
      sortFolder: 'manual', sortFlat: 'created',
      selectMode: false, selected: new Map(),
      clip: null,                   // { mode: 'cut'|'copy', items: [{kind,id}] }
      expanded: new Set(),
      notice: '',
      entries: [], shown: 0, observer: null,
      drag: null,
    };
    const keyOf = it => it.kind + ':' + it.id;

    /* ---------- lưu ---------- */
    async function commit(newData, opts) {
      opts = opts || {};
      if (S.readOnly && !opts.force) { toast('Dữ liệu đang lỗi nên không ghi được. Xem thông báo ở đầu trang.', { error: true }); return false; }
      const prev = S.data;
      try {
        if (opts.replace) await store.replaceAll(newData, ORIGIN);
        else await store.save(prev, newData, ORIGIN);
      } catch (e) { toast('Không lưu được: ' + (e && e.message ? e.message : e), { error: true }); return false; }
      S.data = newData;
      if (opts.force) { S.readOnly = false; S.loadError = ''; S.rawBad = undefined; }
      for (const [k, it] of [...S.selected]) if (!exists(it)) S.selected.delete(k);
      if (!['all', 'root'].includes(S.view) && !SDT.getFolder(S.data, S.view)) S.view = 'root';
      renderAll(opts.keepScroll !== false);
      if (opts.undo) {
        toast(opts.undo, { action: 'Hoàn tác', onAction: async () => { if (await commit(prev, { keepScroll: true })) toast('Đã hoàn tác.'); } });
      }
      return true;
    }
    function exists(it) { return it.kind === 'f' ? !!SDT.getFolder(S.data, it.id) : S.data.bookmarks.some(b => b.id === it.id); }
    function bookmarkById(id) { return S.data.bookmarks.find(b => b.id === id) || null; }

    /* ---------- ngăn kéo ---------- */
    function setDrawer(open) { container.classList.toggle('drawer-open', open); }

    /* ---------- cây thư mục ---------- */
    function renderTree() {
      const tree = $('tree');
      tree.textContent = '';
      const stats = SDT.folderStats(S.data);
      const rootCount = S.data.bookmarks.filter(b => !b.folderId).length + S.data.folders.filter(f => !f.parentId).length;
      const fixed = (key, label, count, test, ic) => h('div', { class: 'trow' + (S.view === key ? ' active' : ''), 'data-drop': key === 'root' ? '' : null },
        h('button', { type: 'button', class: 'tbtn', 'data-test': test, 'aria-current': S.view === key ? 'true' : null, onclick: () => goView(key) },
          icon(ic, 'tic'), h('span', { class: 'tname' }, label), h('span', { class: 'tcount' }, String(count))));
      tree.append(fixed('all', 'Tất cả dấu trang', S.data.bookmarks.length, 'folder-all', 'all'));
      tree.append(fixed('root', SDT.ROOT_NAME, rootCount, 'folder-root', 'bm'));
      tree.append(h('div', { class: 'tsec' }, h('span', {}, 'Thư mục'),
        h('button', { type: 'button', class: 'icon-btn small', 'data-test': 'folder-add', 'aria-label': 'Thêm thư mục', onclick: () => newFolder(null) }, icon('plus'))));
      // Mở sẵn đường dẫn tới thư mục đang xem.
      if (!['all', 'root'].includes(S.view)) for (const f of SDT.folderChain(S.data, S.view)) if (f.id !== S.view) S.expanded.add(f.id);
      const cmap = SDT.childMap(S.data);
      for (const v of cmap.values()) v.sort((a, b) => SDT.byOrder(a, b));
      const list = h('div', { class: 'tfolders', role: 'tree' });
      const walk = (pid, depth) => {
        for (const f of (cmap.get(pid) || [])) {
          const kids = (cmap.get(f.id) || []).length;
          const open = S.expanded.has(f.id);
          list.append(h('div', { class: 'trow folder' + (S.view === f.id ? ' active' : ''), 'data-test': 'folder-item', 'data-id': f.id, 'data-drop': f.id, style: '--depth:' + depth, role: 'treeitem', 'aria-expanded': kids ? String(open) : null },
            kids ? h('button', { type: 'button', class: 'caret' + (open ? ' open' : ''), 'data-test': 'folder-caret', 'aria-label': open ? 'Thu gọn ' + f.name : 'Mở ' + f.name,
              onclick: () => { open ? S.expanded.delete(f.id) : S.expanded.add(f.id); renderTree(); } }, icon('chevron')) : h('span', { class: 'caret-sp' }),
            h('button', { type: 'button', class: 'tbtn', 'data-test': 'folder-open', 'aria-current': S.view === f.id ? 'true' : null, onclick: () => goView(f.id) },
              icon('folder', 'tic fic'), h('span', { class: 'tname', 'data-test': 'folder-name' }, f.name), h('span', { class: 'tcount' }, String(stats.get(f.id) || 0))),
            h('button', { type: 'button', class: 'icon-btn small tmenu', 'data-test': 'folder-menu', 'aria-label': 'Tùy chọn thư mục ' + f.name, onclick: e => folderMenu(f.id, null, e) }, icon('more'))));
          if (kids && open) walk(f.id, depth + 1);
        }
      };
      walk(null, 0);
      if (!S.data.folders.length) list.append(h('p', { class: 'tempty' }, 'Chưa có thư mục. Bấm + để tạo.'));
      tree.append(list);
    }

    function goView(key) {
      S.view = key;
      S.selected.clear();
      S.selectMode = false;
      if (SDT.isSearching(S.q) && key !== 'all') S.q.scope = 'folder';
      setDrawer(false);
      renderAll(false);
    }

    /* ---------- trạng thái xem ---------- */
    const searching = () => SDT.isSearching(S.q);
    const folderView = () => S.view !== 'all' && !searching();
    const curFolderId = () => (S.view === 'all' || S.view === 'root' ? null : S.view);
    const curSort = () => (folderView() ? S.sortFolder : S.sortFlat);
    const canPasteHere = () => folderView();
    function filterCount() {
      const q = S.q;
      let n = 0;
      if (q.title.trim()) n++;
      if (q.urlText.trim()) n++;
      n += q.tags.length;
      if (SDT.hasDate(q)) n++;
      if (q.scope === 'all' && S.view !== 'all' && S.view !== 'root') n++;
      n += SDT.textModeCount(q);
      return n;
    }

    /* ---------- tiêu đề, thẻ điều kiện ---------- */
    function dateChipText() {
      const q = S.q;
      const df = q.dateField === 'updatedAt' ? 'Cập nhật' : 'Tạo';
      if (q.dateMode === 'exact' && SDT.isDay(q.date)) return df + ' ngày ' + SDT.dayToVN(q.date);
      if (q.dateMode === 'month' && SDT.isMonth(q.month)) return df + ' trong tháng ' + SDT.monthToVN(q.month);
      if (q.dateMode === 'range') {
        if (SDT.isDay(q.from) && SDT.isDay(q.to)) return df + ' từ ' + SDT.dayToVN(q.from) + ' đến ' + SDT.dayToVN(q.to);
        if (SDT.isDay(q.from)) return df + ' từ ' + SDT.dayToVN(q.from) + ' tới nay';
        if (SDT.isDay(q.to)) return df + ' tới hết ' + SDT.dayToVN(q.to);
      }
      return '';
    }
    function conditionChips() {
      const q = S.q;
      const chips = [];
      const chip = (key, label, onX, cls) => h('span', { class: 'cchip' + (cls ? ' tag ' + cls : ''), 'data-test': 'cond-chip', 'data-key': key },
        h('span', {}, label), h('button', { type: 'button', class: 'cchip-x', 'data-test': 'cond-x', 'aria-label': 'Bỏ điều kiện ' + label, onclick: () => { onX(); S.notice = ''; renderAll(false); } }, icon('close')));
      const dt = dateChipText();
      if (dt) chips.push(chip('date', dt, () => { q.date = ''; q.month = ''; q.from = ''; q.to = ''; }));
      for (const t of q.tags) chips.push(chip('tag:' + t, 'Nhãn: ' + t, () => { q.tags = q.tags.filter(x => x !== t); }, tagClass(S.data, t)));
      if (q.urlText.trim()) chips.push(chip('url', 'Địa chỉ: ' + q.urlText.trim(), () => { q.urlText = ''; }));
      if (q.title.trim()) chips.push(chip('title', 'Tên: ' + q.title.trim(), () => { q.title = ''; }));
      if (q.scope === 'all' && S.view !== 'all' && S.view !== 'root') chips.push(chip('scope', 'Trong toàn bộ thư mục', () => { q.scope = 'folder'; }));
      if (q.regex) chips.push(chip('regex', '.* Regex', () => { q.regex = false; }));
      else if (q.phrase) chips.push(chip('phrase', '“…” Đúng cụm', () => { q.phrase = false; }));
      if (q.caseSensitive) chips.push(chip('case', 'Aa Phân biệt hoa thường', () => { q.caseSensitive = false; }));
      return chips;
    }

    function renderHead(counts) {
      const head = $('listhead');
      head.textContent = '';
      const fid = curFolderId();
      // Đường dẫn
      if (S.view !== 'all' && S.view !== 'root') {
        const chain = SDT.folderChain(S.data, S.view);
        const crumbs = h('nav', { class: 'crumbs', 'aria-label': 'Đường dẫn' },
          h('button', { type: 'button', class: 'crumb', 'data-test': 'crumb', 'data-id': '', onclick: () => goView('root') }, SDT.ROOT_NAME));
        for (const f of chain.slice(0, -1)) {
          crumbs.append(icon('chevron', 'crumb-sep'), h('button', { type: 'button', class: 'crumb', 'data-test': 'crumb', 'data-id': f.id, onclick: () => goView(f.id) }, f.name));
        }
        crumbs.append(icon('chevron', 'crumb-sep'));
        head.append(crumbs);
      }
      const title = searching() ? 'Kết quả' : S.view === 'all' ? 'Tất cả dấu trang' : S.view === 'root' ? SDT.ROOT_NAME : (SDT.getFolder(S.data, fid) || {}).name;
      const countText = searching() ? counts.b + ' kết quả' : folderView() ? (counts.f ? counts.f + ' thư mục · ' : '') + counts.b + ' dấu trang' : counts.b + ' dấu trang';
      head.append(h('div', { class: 'lh-row' }, h('h1', { class: 'lh-title', 'data-test': 'view-title' }, title), h('span', { class: 'lh-count', 'data-test': 'list-count' }, countText)));
      const sort = h('select', { 'data-test': 'sort-select', 'aria-label': 'Sắp xếp', class: 'sort' },
        folderView() ? h('option', { value: 'manual' }, 'Tự xếp') : null,
        h('option', { value: 'created' }, 'Mới lưu trước'), h('option', { value: 'updated' }, 'Mới cập nhật trước'),
        h('option', { value: 'az' }, 'Tên A–Z'), h('option', { value: 'za' }, 'Tên Z–A'));
      sort.value = curSort();
      sort.addEventListener('change', () => { if (folderView()) S.sortFolder = sort.value; else S.sortFlat = sort.value; renderList(); });
      head.append(h('div', { class: 'lh-row tools' },
        h('label', { class: 'pill sortpill' }, icon('sort'), sort),
        h('button', { type: 'button', class: 'pill' + (S.selectMode ? ' on' : ''), 'data-test': 'btn-select-mode', 'aria-pressed': String(S.selectMode),
          onclick: () => { S.selectMode = !S.selectMode; S.selected.clear(); renderList(); } }, S.selectMode ? 'Xong' : 'Chọn nhiều'),
        S.clip && canPasteHere() ? h('button', { type: 'button', class: 'pill accent', 'data-test': 'btn-paste-here', onclick: () => pasteInto(fid, 'end') },
          icon('paste'), 'Dán ' + S.clip.items.length + ' mục vào đây') : null));
      const chips = conditionChips();
      if (chips.length) {
        head.append(h('div', { class: 'cchips', 'data-test': 'filter-summary' }, chips,
          h('button', { type: 'button', class: 'link small', 'data-test': 'btn-clear-filter-inline', onclick: clearFilters }, 'Bỏ lọc')));
      }
      if (S.searchError) head.append(h('p', { class: 'lh-notice err', role: 'alert', 'data-test': 'search-error' }, S.searchError));
      if (S.notice) head.append(h('p', { class: 'lh-notice', 'data-test': 'notice' }, S.notice));
      const se = $('search');
      if (se) se.placeholder = S.q.regex ? 'Tìm bằng regex' : S.q.phrase ? 'Tìm đúng cụm' : 'Tìm dấu trang';
    }

    /* ---------- dòng trong danh sách ---------- */
    function folderRow(f, stats) {
      const it = { kind: 'f', id: f.id };
      const sel = S.selected.has(keyOf(it));
      const lead = S.selectMode
        ? h('input', { type: 'checkbox', class: 'row-check', 'data-test': 'item-check', checked: sel, 'aria-label': 'Chọn ' + f.name, onchange: e => toggleSel(it, e.target.checked) })
        : h('span', { class: 'ico fico' }, icon('folder'));
      const row = h('div', { class: 'row frow' + (sel ? ' sel' : '') + (isCut(it) ? ' cut' : ''), 'data-test': 'list-folder', 'data-id': f.id, 'data-row': 'f', 'data-drop': f.id, tabindex: '0' },
        lead,
        h('div', { class: 'rtext' },
          h('div', { class: 'rtitle', 'data-test': 'folder-row-name' }, f.name),
          h('div', { class: 'rmeta' }, (stats.get(f.id) || 0) + ' mục')),
        h('div', { class: 'racts' },
          h('button', { type: 'button', class: 'icon-btn', 'data-test': 'row-menu', 'aria-label': 'Tùy chọn ' + f.name, onclick: e => { e.stopPropagation(); folderMenu(f.id, row, e); } }, icon('more')),
          handle(it)));
      row.addEventListener('click', e => {
        if (e.target.closest('button,input,a')) return;
        if (S.selectMode) toggleSel(it, !S.selected.has(keyOf(it))); else goView(f.id);
      });
      row.addEventListener('keydown', e => { if (e.key === 'Enter' && e.target === row) goView(f.id); });
      row.addEventListener('contextmenu', e => { e.preventDefault(); e.stopPropagation(); folderMenu(f.id, row, e); });
      return row;
    }
    function bookmarkRow(b) {
      const it = { kind: 'b', id: b.id };
      const sel = S.selected.has(keyOf(it));
      const dateText = (S.q.dateField === 'updatedAt' && SDT.hasDate(S.q)) || curSort() === 'updated' ? 'Sửa ' + SDT.formatDate(b.updatedAt) : 'Lưu ' + SDT.formatDate(b.createdAt);
      const fav = faviconUrl(b.url);
      const letter = (SDT.domainOf(b.url)[0] || '?').toUpperCase();
      const lead = S.selectMode
        ? h('input', { type: 'checkbox', class: 'row-check', 'data-test': 'item-check', checked: sel, 'aria-label': 'Chọn ' + b.title, onchange: e => toggleSel(it, e.target.checked) })
        : h('span', { class: 'ico fav', 'data-letter': letter }, fav ? h('img', { src: fav, alt: '', loading: 'lazy', width: '20', height: '20', onerror: e => e.target.remove() }) : null);
      const showPath = !folderView();
      const row = h('div', { class: 'row brow' + (sel ? ' sel' : '') + (isCut(it) ? ' cut' : ''), 'data-test': 'list-item', 'data-id': b.id, 'data-row': 'b', tabindex: '0' },
        lead,
        h('div', { class: 'rtext' },
          h('a', { class: 'rtitle item-title', 'data-test': 'item-title', href: b.url, target: '_blank', rel: 'noopener noreferrer', title: b.url, draggable: 'false',
            onclick: e => { if (S.selectMode) { e.preventDefault(); toggleSel(it, !sel); return; } if (env.openUrl) { e.preventDefault(); env.openUrl(b.url); } } }, b.title),
          h('div', { class: 'rmeta' },
            h('span', { class: 'dom', 'data-test': 'item-domain' }, SDT.domainOf(b.url)),
            h('span', { class: 'date', 'data-test': 'item-date' }, dateText)),
          showPath ? h('button', { type: 'button', class: 'rpath', 'data-test': 'item-path', onclick: () => { clearAllFilters(); goView(b.folderId || 'root'); } },
            icon('folder'), SDT.folderLabel(S.data, b.folderId)) : null,
          b.tags.length ? h('div', { class: 'rtags' }, b.tags.map(t => h('button', {
            type: 'button', class: 'tag ' + tagClass(S.data, t), 'data-test': 'item-tag', 'data-tag': t, title: 'Lọc theo nhãn ' + t,
            onclick: () => { if (!S.q.tags.some(x => x.toLowerCase() === t.toLowerCase())) S.q.tags = S.q.tags.concat([t]); S.notice = ''; renderAll(false); },
          }, t))) : null),
        h('div', { class: 'racts' },
          h('button', { type: 'button', class: 'icon-btn', 'data-test': 'row-menu', 'aria-label': 'Tùy chọn ' + b.title, onclick: e => { e.stopPropagation(); bookmarkMenu(b.id, row, e); } }, icon('more')),
          handle(it)));
      row.addEventListener('click', e => {
        if (!S.selectMode || e.target.closest('button,input,a')) return;
        toggleSel(it, !S.selected.has(keyOf(it)));
      });
      row.addEventListener('contextmenu', e => { e.preventDefault(); e.stopPropagation(); bookmarkMenu(b.id, row, e); });
      return row;
    }
    function handle(it) {
      if (!folderView() || curSort() !== 'manual' || S.selectMode || S.readOnly) return null;
      const el = h('button', { type: 'button', class: 'icon-btn grip', 'data-test': 'row-handle', 'aria-label': 'Kéo để đổi chỗ', tabindex: '-1' }, icon('grip'));
      el.addEventListener('pointerdown', e => startDrag(e, it, el));
      return el;
    }
    function isCut(it) { return !!(S.clip && S.clip.mode === 'cut' && S.clip.items.some(x => x.kind === it.kind && x.id === it.id)); }
    function toggleSel(it, on) {
      on ? S.selected.set(keyOf(it), it) : S.selected.delete(keyOf(it));
      const row = $('list').querySelector('[data-row="' + it.kind + '"][data-id="' + CSS.escape(it.id) + '"]');
      if (row) { row.classList.toggle('sel', on); const c = row.querySelector('.row-check'); if (c) c.checked = on; }
      renderBulk();
    }

    /* ---------- danh sách (vẽ dần) ---------- */
    function computeEntries() {
      if (folderView()) {
        S.searchError = '';
        const lf = SDT.listFolder(S.data, curFolderId(), curSort());
        return { entries: lf.folders.map(f => ({ kind: 'f', item: f })).concat(lf.bookmarks.map(b => ({ kind: 'b', item: b }))), f: lf.folders.length, b: lf.bookmarks.length };
      }
      const q = Object.assign({}, S.q, { folder: S.view === 'all' ? 'all' : S.view === 'root' ? 'root' : S.view, sort: curSort() });
      const res = SDT.search(S.data, q);
      S.searchError = res.error || '';
      return { entries: res.items.map(b => ({ kind: 'b', item: b })), f: 0, b: res.items.length };
    }
    function renderList(keepScroll) {
      const sc = scroller();
      const top = keepScroll ? sc.scrollTop : 0;
      const keepShown = keepScroll ? S.shown : 0;
      const c = computeEntries();
      S.entries = c.entries;
      renderHead(c);
      const list = $('list');
      list.textContent = '';
      if (S.observer) { S.observer.disconnect(); S.observer = null; }
      S.stats = folderView() ? SDT.folderStats(S.data) : new Map();
      if (!S.data.bookmarks.length && !S.data.folders.length) {
        list.append(h('div', { class: 'empty', 'data-test': 'empty-state' }, h('p', { class: 'empty-t' }, 'Chưa có dấu trang nào'),
          h('p', {}, 'Khi đang xem một trang web, bấm biểu tượng Sổ Dấu Trang để lưu trang đó. Hoặc bấm + để thêm bằng tay.')));
      } else if (!S.entries.length) {
        if (searching()) {
          list.append(h('div', { class: 'empty', 'data-test': 'empty-state' }, h('p', { class: 'empty-t' }, 'Không tìm thấy'),
            h('p', {}, 'Không có dấu trang nào thỏa mọi điều kiện đang đặt.'),
            h('button', { type: 'button', class: 'btn quiet', 'data-test': 'btn-clear-filter', onclick: clearAllFilters }, 'Xóa bộ lọc')));
        } else if (folderView()) {
          list.append(h('div', { class: 'empty', 'data-test': 'empty-state' }, h('p', { class: 'empty-t' }, 'Thư mục trống'),
            h('div', { class: 'empty-acts' },
              h('button', { type: 'button', class: 'btn quiet', 'data-test': 'empty-add-bm', onclick: () => openEditor(null) }, icon('plus'), 'Thêm dấu trang'),
              h('button', { type: 'button', class: 'btn quiet', 'data-test': 'empty-add-folder', onclick: () => newFolder(curFolderId()) }, icon('folderPlus'), 'Thêm thư mục'))));
        } else {
          list.append(h('div', { class: 'empty', 'data-test': 'empty-state' }, h('p', { class: 'empty-t' }, 'Chưa có dấu trang nào')));
        }
      } else {
        S.shown = 0;
        appendMore(Math.max(PAGE, keepShown));
      }
      renderBulk();
      updateFilterBadge();
      if (keepScroll) sc.scrollTop = top; else if (sc.scrollTop > 0 && !keepScroll) sc.scrollTop = 0;
    }
    function appendMore(n) {
      const list = $('list');
      const old = list.querySelector('.sentinel');
      if (old) old.remove();
      const end = Math.min(S.entries.length, S.shown + (n || PAGE));
      const fFrag = document.createDocumentFragment();
      let group = list.querySelector('.group:last-of-type');
      for (let i = S.shown; i < end; i++) {
        const e = S.entries[i];
        const wantGroup = e.kind === 'f' ? 'gf' : 'gb';
        if (!group || !group.classList.contains(wantGroup)) {
          group = h('div', { class: 'group ' + wantGroup });
          fFrag.append(group);
        }
        group.append(e.kind === 'f' ? folderRow(e.item, S.stats) : bookmarkRow(e.item));
      }
      list.append(fFrag);
      S.shown = end;
      if (S.shown < S.entries.length) {
        const sen = h('div', { class: 'sentinel', 'data-test': 'list-more' }, 'Đang hiện ' + S.shown + ' / ' + S.entries.length);
        list.append(sen);
        if (typeof IntersectionObserver !== 'undefined') {
          S.observer = new IntersectionObserver(es => { if (es.some(x => x.isIntersecting)) { S.observer.disconnect(); S.observer = null; appendMore(PAGE); } }, { rootMargin: '600px' });
          S.observer.observe(sen);
        }
      }
    }
    function renderBulk() {
      const bar = $('bulkbar');
      bar.textContent = '';
      bar.hidden = !S.selectMode;
      container.classList.toggle('selecting', S.selectMode);
      if (!S.selectMode) return;
      const items = [...S.selected.values()];
      const none = !items.length;
      const onlyB = items.every(i => i.kind === 'b');
      const bb = (test, label, ic, fn, extra) => h('button', Object.assign({ type: 'button', class: 'bbtn', 'data-test': test, disabled: none, onclick: fn }, extra || {}), icon(ic), h('span', {}, label));
      bar.append(
        h('div', { class: 'bulk-top' },
          h('span', { class: 'bulk-n', 'data-test': 'bulk-count' }, items.length + ' đã chọn'),
          h('button', { type: 'button', class: 'link small', 'data-test': 'bulk-all', onclick: () => { for (const e of S.entries) S.selected.set(keyOf({ kind: e.kind, id: e.item.id }), { kind: e.kind, id: e.item.id }); renderList(true); } }, 'Chọn hết'),
          h('span', { class: 'grow' }),
          h('button', { type: 'button', class: 'link small', 'data-test': 'bulk-cancel', onclick: () => { S.selectMode = false; S.selected.clear(); renderList(true); } }, 'Xong')),
        h('div', { class: 'bulk-acts' },
          bb('bulk-tag', 'Nhãn', 'tag', () => bulkTag(items), { disabled: none || !onlyB }),
          bb('bulk-move', 'Chuyển', 'move', () => moveItemsDlg(items)),
          bb('bulk-cut', 'Cắt', 'cut', () => setClip('cut', items)),
          bb('bulk-copy', 'Sao chép', 'copy', () => setClip('copy', items)),
          bb('bulk-replace', 'Đổi chữ', 'edit', () => openReplace(items.filter(i => i.kind === 'b').map(i => i.id)), { disabled: none || !items.some(i => i.kind === 'b') }),
          bb('bulk-delete', 'Xóa', 'trash', () => deleteItemsDlg(items), { class: 'bbtn danger-text' })));
    }
    function updateFilterBadge() {
      const n = filterCount();
      const fb = $('btn-filter');
      const old = fb.querySelector('.badge');
      if (old) old.remove();
      if (n) fb.append(h('span', { class: 'badge', 'data-test': 'filter-badge' }, String(n)));
      fb.classList.toggle('on', !!n);
      fb.setAttribute('aria-label', n ? 'Lọc (' + n + ' điều kiện)' : 'Lọc');
    }
    function renderBanner() {
      const el = $('banner');
      el.textContent = '';
      if (!S.readOnly) {
        // Lời nhắc của môi trường chạy (bản Soul: chưa cài script Kho…)
        const n = env.notice ? env.notice() : null;
        if (n) el.append(h('div', { class: 'banner info', role: 'status', 'data-test': 'env-banner' },
          h('p', { class: 'banner-t' }, n.title),
          h('p', {}, n.text),
          n.action ? h('div', { class: 'banner-acts' },
            h('button', { type: 'button', class: 'btn quiet small', 'data-test': 'env-banner-act', onclick: n.action.fn }, n.action.label)) : null));
        return;
      }
      el.append(h('div', { class: 'banner', role: 'alert', 'data-test': 'error-banner' },
        h('p', { class: 'banner-t' }, 'Không đọc được dữ liệu đã lưu'),
        h('p', {}, S.loadError + ' Để không làm mất dữ liệu, Sổ Dấu Trang sẽ không ghi đè lên dữ liệu cũ.'),
        h('p', {}, 'Hãy xuất dữ liệu thô để giữ lại, rồi nhập một tệp sao lưu bằng cách “Thay thế toàn bộ”.'),
        h('div', { class: 'banner-acts' },
          h('button', { type: 'button', class: 'btn quiet small', 'data-test': 'banner-export-raw', onclick: exportRaw }, 'Xuất dữ liệu thô'),
          h('button', { type: 'button', class: 'btn quiet small', 'data-test': 'banner-backup', onclick: openBackup }, 'Mở sao lưu'))));
    }
    function renderAll(keepScroll) { renderBanner(); renderTree(); renderList(keepScroll); }

    /* ---------- menu ---------- */
    const at = e => (e && e.clientX !== undefined && (e.clientX || e.clientY) ? { x: e.clientX, y: e.clientY } : null);
    function targetsFor(it) {
      // Bấm menu trên một dòng đang được chọn → áp dụng cho cả nhóm đang chọn.
      if (S.selectMode && S.selected.has(keyOf(it)) && S.selected.size > 1) return [...S.selected.values()];
      return [it];
    }
    function pasteItem(afterIt) {
      if (!S.clip || !canPasteHere()) return null;
      return { label: 'Dán ' + S.clip.items.length + ' mục vào sau', icon: 'paste', test: 'm-paste', onSelect: () => pasteInto(curFolderId(), { after: afterIt }) };
    }
    function bookmarkMenu(id, row, e) {
      const b = bookmarkById(id);
      if (!b) return;
      const it = { kind: 'b', id };
      contextMenu([
        { label: 'Mở trong tab mới', icon: 'open', test: 'm-open', onSelect: () => (env.openUrl ? env.openUrl(b.url) : window.open(b.url, '_blank', 'noopener')) },
        { label: 'Sửa', icon: 'edit', test: 'm-edit', onSelect: () => openEditor(id) },
        { label: 'Chép địa chỉ', icon: 'link', test: 'm-copyurl', onSelect: async () => toast((await copyText(b.url)) ? 'Đã chép địa chỉ.' : 'Không chép được.') },
        'sep',
        { label: 'Cắt', icon: 'cut', test: 'm-cut', hint: 'Ctrl+X', onSelect: () => setClip('cut', targetsFor(it)) },
        { label: 'Sao chép', icon: 'copy', test: 'm-copy', hint: 'Ctrl+C', onSelect: () => setClip('copy', targetsFor(it)) },
        pasteItem(it),
        { label: 'Chuyển vào…', icon: 'move', test: 'm-move', onSelect: () => moveItemsDlg(targetsFor(it)) },
        { label: 'Chọn', icon: 'select', test: 'm-select', onSelect: () => { S.selectMode = true; S.selected.set(keyOf(it), it); renderList(true); } },
        'sep',
        { label: 'Xóa', icon: 'trash', test: 'm-delete', danger: true, hint: 'Delete', onSelect: () => deleteItemsDlg(targetsFor(it)) },
      ], at(e), b.title);
    }
    function folderMenu(id, row, e) {
      const f = SDT.getFolder(S.data, id);
      if (!f) return;
      const it = { kind: 'f', id };
      contextMenu([
        { label: 'Mở', icon: 'folder', test: 'm-open', onSelect: () => goView(id) },
        { label: 'Thư mục con mới', icon: 'folderPlus', test: 'm-newsub', onSelect: () => newFolder(id) },
        { label: 'Đổi tên', icon: 'edit', test: 'm-rename', onSelect: () => renameFolderDlg(id) },
        'sep',
        { label: 'Cắt', icon: 'cut', test: 'm-cut', onSelect: () => setClip('cut', targetsFor(it)) },
        { label: 'Sao chép', icon: 'copy', test: 'm-copy', onSelect: () => setClip('copy', targetsFor(it)) },
        S.clip ? { label: 'Dán vào thư mục này', icon: 'paste', test: 'm-paste-into', onSelect: () => pasteInto(id, 'end') } : null,
        row && S.clip && canPasteHere() ? pasteItem(it) : null,
        { label: 'Chuyển vào…', icon: 'move', test: 'm-move', onSelect: () => moveItemsDlg(targetsFor(it)) },
        row ? { label: 'Chọn', icon: 'select', test: 'm-select', onSelect: () => { S.selectMode = true; S.selected.set(keyOf(it), it); renderList(true); } } : null,
        'sep',
        { label: 'Xóa thư mục', icon: 'trash', test: 'm-delete', danger: true, onSelect: () => (targetsFor(it).length > 1 ? deleteItemsDlg(targetsFor(it)) : deleteFolderDlg(id)) },
      ], at(e), f.name);
    }
    function backgroundMenu(e) {
      contextMenu([
        { label: 'Dấu trang mới', icon: 'plus', test: 'm-newbm', onSelect: () => openEditor(null) },
        { label: 'Thư mục mới', icon: 'folderPlus', test: 'm-newfolder', onSelect: () => newFolder(folderView() ? curFolderId() : null) },
        S.clip && canPasteHere() ? { label: 'Dán ' + S.clip.items.length + ' mục', icon: 'paste', test: 'm-paste', onSelect: () => pasteInto(curFolderId(), 'end') } : null,
      ], at(e));
    }

    /* ---------- cắt / chép / dán ---------- */
    function setClip(mode, items) {
      S.clip = { mode, items: items.map(i => ({ kind: i.kind, id: i.id })) };
      S.selectMode = false; S.selected.clear();
      renderList(true);
      toast((mode === 'cut' ? 'Đã cắt ' : 'Đã chép ') + items.length + ' mục. Mở thư mục cần đến rồi chọn Dán.');
    }
    async function pasteInto(folderId, pos) {
      if (!S.clip) return;
      const now = Date.now();
      const r = S.clip.mode === 'cut' ? SDT.placeItems(S.data, S.clip.items, folderId, pos, now) : SDT.copyItems(S.data, S.clip.items, folderId, pos, now);
      if (!r.ok) { toast(r.error, { error: true }); return; }
      const n = S.clip.mode === 'cut' ? r.moved : r.copied;
      const skipped = r.skipped || 0;
      if (S.clip.mode === 'cut') S.clip = null;
      if (!n) { toast('Không còn mục nào để dán.', { error: true }); renderList(true); return; }
      await commit(r.data, { undo: 'Đã dán ' + n + ' mục' + (skipped ? ' (bỏ qua ' + skipped + ' mục không còn)' : '') + '.' });
    }

    /* ---------- thư mục ---------- */
    async function newFolder(parentId) {
      const name = await promptDialog({
        title: parentId ? 'Thư mục con trong “' + SDT.getFolder(S.data, parentId).name + '”' : 'Thư mục mới', label: 'Tên thư mục', okText: 'Tạo thư mục', test: 'dlg-folder-name',
        validate: v => { const r = SDT.validateFolderName(S.data, v, parentId, null); return r.ok ? null : r.error; },
      });
      if (name === null) return;
      const r = SDT.addFolder(S.data, name, parentId, Date.now());
      if (!r.ok) { toast(r.error, { error: true }); return; }
      if (parentId) S.expanded.add(parentId);
      if (await commit(r.data)) toast('Đã tạo thư mục “' + r.folder.name + '”.');
    }
    async function createFolderFromPicker(name, parentId) {
      const r = SDT.addFolder(S.data, name, parentId, Date.now());
      if (!r.ok) return r;
      if (!(await commit(r.data, { keepScroll: true }))) return { ok: false, error: 'Không lưu được.' };
      return r;
    }
    async function renameFolderDlg(id) {
      const f = SDT.getFolder(S.data, id);
      const name = await promptDialog({
        title: 'Đổi tên thư mục', label: 'Tên mới', value: f.name, okText: 'Đổi tên', test: 'dlg-folder-rename',
        validate: v => { const r = SDT.validateFolderName(S.data, v, f.parentId, id); return r.ok ? null : r.error; },
      });
      if (name === null) return;
      const r = SDT.renameFolder(S.data, id, name);
      if (!r.ok) { toast(r.error, { error: true }); return; }
      if (await commit(r.data, { keepScroll: true })) toast('Đã đổi tên thành “' + SDT.getFolder(S.data, id).name + '”.');
    }
    async function moveItemsDlg(items) {
      const disabled = new Set();
      for (const it of items) if (it.kind === 'f') { disabled.add(it.id); for (const d of SDT.descendantIds(S.data, it.id)) disabled.add(d); }
      const r = await pickFolder({ data: S.data, selected: curFolderId(), disabled, title: 'Chuyển ' + items.length + ' mục vào', okText: 'Chuyển vào đây', onCreate: createFolderFromPicker });
      if (!r) return;
      const m = SDT.placeItems(S.data, items, r.id, 'end', Date.now());
      if (!m.ok) { toast(m.error, { error: true }); return; }
      S.selectMode = false; S.selected.clear();
      await commit(m.data, { keepScroll: true, undo: 'Đã chuyển ' + m.moved + ' mục vào ' + SDT.folderLabel(m.data, r.id) + '.' });
    }
    async function deleteFolderDlg(id) {
      const f = SDT.getFolder(S.data, id);
      const c = SDT.folderContent(S.data, id);
      const parentName = f.parentId ? '“' + SDT.getFolder(S.data, f.parentId).name + '”' : '“' + SDT.ROOT_NAME + '”';
      let r;
      if (!c.folders && !c.bookmarks) {
        const ok = await confirmDialog({ title: 'Xóa thư mục “' + f.name + '”?', message: 'Thư mục này đang trống.', okText: 'Xóa thư mục', danger: true, test: 'dlg-delete-folder' });
        if (!ok) return;
        r = SDT.deleteFolder(S.data, id, 'move', Date.now());
      } else {
        const parts = [];
        if (c.bookmarks) parts.push(c.bookmarks + ' dấu trang');
        if (c.folders) parts.push(c.folders + ' thư mục con');
        const moveR = h('input', { type: 'radio', name: 'delmode', value: 'move', checked: true, 'data-test': 'del-mode-move' });
        const allR = h('input', { type: 'radio', name: 'delmode', value: 'all', 'data-test': 'del-mode-all' });
        const body = h('div', { class: 'radios' },
          h('label', { class: 'radio' }, moveR, h('span', {}, 'Chuyển nội dung lên ' + parentName)),
          h('label', { class: 'radio' }, allR, h('span', {}, 'Xóa hết, kể cả dấu trang và thư mục con bên trong')));
        const v = await openDialog({
          title: 'Xóa thư mục “' + f.name + '”?', test: 'dlg-delete-folder', message: 'Thư mục này còn ' + parts.join(' và ') + '.', body,
          actions: [{ label: 'Hủy', value: null, test: 'dlg-cancel' }, { label: 'Xóa thư mục', value: 'ok', kind: 'danger', test: 'dlg-ok' }],
        });
        if (v !== 'ok') return;
        r = SDT.deleteFolder(S.data, id, allR.checked ? 'all' : 'move', Date.now());
      }
      if (!r.ok) { toast(r.error, { error: true }); return; }
      if (S.view === id || (!['all', 'root'].includes(S.view) && !SDT.getFolder(r.data, S.view))) S.view = f.parentId && SDT.getFolder(r.data, f.parentId) ? f.parentId : 'root';
      await commit(r.data, { keepScroll: true, undo: r.removedBookmarks ? 'Đã xóa thư mục và ' + r.removedBookmarks + ' dấu trang.' : 'Đã xóa thư mục “' + f.name + '”.' });
    }
    async function deleteItemsDlg(items) {
      const nf = items.filter(i => i.kind === 'f').length;
      if (nf === 1 && items.length === 1) return deleteFolderDlg(items[0].id);
      if (nf) {
        const ok = await confirmDialog({ title: 'Xóa ' + items.length + ' mục?', message: 'Gồm ' + nf + ' thư mục và mọi thứ bên trong chúng.', okText: 'Xóa', danger: true, test: 'dlg-delete-items' });
        if (!ok) return;
      }
      const r = SDT.deleteItems(S.data, items);
      S.selectMode = false; S.selected.clear();
      const label = items.length === 1 && items[0].kind === 'b' ? 'Đã xóa “' + ((bookmarkById(items[0].id) || {}).title || '') + '”.' : 'Đã xóa ' + items.length + ' mục.';
      await commit(r.data, { keepScroll: true, undo: label });
    }
    /* ---------- dấu trang trùng (2.5.0) ---------- */
    function openDuplicates() {
      const PAGE_G = 30;
      const st = { mode: 'url', keep: { url: new Map(), title: new Map() }, skip: { url: new Set(), title: new Set() }, shown: PAGE_G, groups: [] };
      const modeSeg = seg('dup-mode', [['url', 'Trùng địa chỉ'], ['title', 'Trùng tên']], 'url', 'dup-mode');
      const merge = h('input', { type: 'checkbox', 'data-test': 'dup-merge-tags', checked: true });
      const summary = h('p', { class: 'dup-sum', 'data-test': 'dup-summary', role: 'status' });
      const allBtn = h('button', { type: 'button', class: 'btn danger', 'data-test': 'dup-apply-all' }, 'Áp dụng tất cả');
      const list = h('div', { class: 'dup-list' });
      const body = h('div', { class: 'dups' },
        modeSeg,
        h('label', { class: 'optrow' }, merge, h('span', {}, h('b', {}, 'Gộp nhãn vào mục giữ lại'), h('small', {}, 'Nhãn của mục bị xóa được thêm vào mục giữ lại.'))),
        h('div', { class: 'dup-bar' }, summary, allBtn),
        list);
      const keepMap = () => st.keep[st.mode];
      const isKept = (g, b) => { const m = keepMap(); return m.has(b.id) ? m.get(b.id) : b === g.items[0]; };
      const visible = () => st.groups.filter(g => !st.skip[st.mode].has(g.key));
      const planOf = gs => gs.map(g => ({ keep: g.items.filter(b => isKept(g, b)).map(b => b.id), remove: g.items.filter(b => !isKept(g, b)).map(b => b.id) }));
      const extraCount = gs => planOf(gs).reduce((n, p) => n + p.remove.length, 0);
      function recompute() { st.groups = SDT.findDuplicates(S.data, st.mode); }
      function renderSummary() {
        const vg = visible();
        const extra = vg.reduce((n, g) => n + g.items.length - 1, 0);
        const rm = extraCount(vg);
        summary.textContent = vg.length ? 'Có ' + vg.length + ' nhóm trùng, ' + extra + ' dấu trang thừa.' : 'Không có dấu trang ' + (st.mode === 'url' ? 'trùng địa chỉ.' : 'trùng tên.');
        allBtn.textContent = 'Áp dụng tất cả (xóa ' + rm + ')';
        allBtn.disabled = !rm || S.readOnly;
      }
      function field(cls, test, text, differ) { return h('div', { class: 'df ' + cls + (differ ? ' diff' : ''), 'data-test': test }, text); }
      function renderGroup(g) {
        const differs = k => new Set(g.items.map(k)).size > 1;
        const dTitle = differs(b => b.title), dUrl = differs(b => b.url), dFolder = differs(b => b.folderId || ''),
          dTags = differs(b => b.tags.map(SDT.lower).sort().join(',')), dC = differs(b => b.createdAt), dU = differs(b => b.updatedAt);
        const rmN = g.items.filter(b => !isKept(g, b)).length;
        const el = h('section', { class: 'dgroup', 'data-test': 'dup-group', 'data-key': g.key },
          h('div', { class: 'dg-head' }, h('b', {}, g.items.length + ' mục'), h('span', { class: 'dg-key' }, g.key)),
          h('div', { class: 'dg-items' }, ...g.items.map(b => {
            const kept = isKept(g, b);
            const cb = h('input', { type: 'checkbox', 'data-test': 'dup-keep', checked: kept });
            cb.addEventListener('change', () => {
              const m = keepMap();
              m.set(b.id, cb.checked);
              if (!g.items.some(x => isKept(g, x))) { m.set(b.id, true); toast('Mỗi nhóm phải giữ lại ít nhất một mục.', { error: true }); }
              el.replaceWith(renderGroup(g)); renderSummary();
            });
            return h('article', { class: 'ditem' + (kept ? ' kept' : ''), 'data-test': 'dup-item', 'data-id': b.id },
              h('label', { class: 'dkeep' }, cb, h('span', {}, kept ? 'Giữ' : 'Xóa')),
              h('div', { class: 'dbody' },
                h('a', { class: 'df dt' + (dTitle ? ' diff' : ''), 'data-test': 'dup-open', href: b.url, target: '_blank', rel: 'noopener noreferrer',
                  onclick: e => { if (env.openUrl) { e.preventDefault(); env.openUrl(b.url); } } }, b.title),
                field('du', 'dup-url', b.url, dUrl),
                field('dp', 'dup-folder', '📁 ' + SDT.folderLabel(S.data, b.folderId), dFolder),
                h('div', { class: 'df dtags' + (dTags ? ' diff' : '') }, ...(b.tags.length ? b.tags.map(t => h('span', { class: 'tag ' + tagClass(S.data, t) }, t)) : [h('span', { class: 'muted' }, 'Không có nhãn')])),
                field('dd', 'dup-dates', 'Tạo ' + SDT.formatDateTime(b.createdAt) + ' · Sửa ' + SDT.formatDateTime(b.updatedAt), dC || dU)));
          })),
          h('div', { class: 'dg-acts' },
            h('button', { type: 'button', class: 'btn quiet small', 'data-test': 'dup-skip', onclick: () => { st.skip[st.mode].add(g.key); render(); } }, 'Bỏ qua nhóm này'),
            h('button', { type: 'button', class: 'btn danger small', 'data-test': 'dup-apply-group', disabled: !rmN || S.readOnly, onclick: () => apply([g]) }, rmN ? 'Xóa ' + rmN + ' mục không giữ' : 'Không có mục để xóa')));
        return el;
      }
      function render() {
        list.textContent = '';
        const vg = visible();
        for (const g of vg.slice(0, st.shown)) list.append(renderGroup(g));
        if (vg.length > st.shown) list.append(h('button', { type: 'button', class: 'btn quiet', 'data-test': 'dup-more', onclick: () => { st.shown += PAGE_G; render(); } }, 'Xem thêm ' + Math.min(PAGE_G, vg.length - st.shown) + ' nhóm'));
        renderSummary();
      }
      async function apply(gs) {
        const plan = planOf(gs);
        const n = plan.reduce((k, p) => k + p.remove.length, 0);
        if (!n) return;
        const r = SDT.resolveDuplicates(S.data, plan, merge.checked, Date.now());
        if (await commit(r.data, { keepScroll: true, undo: 'Đã xóa ' + r.removed + ' dấu trang trùng.' + (r.tagged ? ' Gộp nhãn vào ' + r.tagged + ' mục giữ lại.' : '') })) { recompute(); render(); }
      }
      allBtn.addEventListener('click', async () => {
        const vg = visible(); const n = extraCount(vg);
        if (!n) return;
        const ok = await confirmDialog({ title: 'Xóa dấu trang trùng?', message: 'Xóa ' + n + ' dấu trang không giữ trong ' + vg.length + ' nhóm. Có thể hoàn tác ngay sau đó.', okText: 'Xóa ' + n + ' mục', danger: true, test: 'dlg-dup-all' });
        if (ok) await apply(vg);
      });
      modeSeg.addEventListener('change', () => { st.mode = segValue(body, 'dup-mode') || 'url'; st.shown = PAGE_G; recompute(); render(); });
      // Hoàn tác từ thông báo: tính lại khi dữ liệu đổi.
      const unsub = store.onChange ? store.onChange(() => setTimeout(() => { recompute(); render(); }, 0)) : null;
      recompute(); render();
      openDialog({ title: 'Dấu trang trùng', test: 'dlg-dups', sheet: true, wide: true, cls: 'tall', body,
        actions: [{ label: 'Xong', value: null, test: 'dup-close', kind: 'quiet' }],
        onClose: () => { if (typeof unsub === 'function') unsub(); } });
    }

    /* ---------- đổi chữ hàng loạt (tên / địa chỉ) ---------- */
    async function openReplace(ids) {
      if (!ids.length) return;
      const q = S.q;
      const pre = q.urlText.trim() ? { field: 'url', find: q.urlText.trim() } : q.title.trim() ? { field: 'title', find: q.title.trim() } : { field: 'url', find: q.text.trim() };
      const find = h('input', { type: 'text', 'data-test': 'rp-find', value: pre.find, placeholder: 'Ví dụ: www.sangtacviet.com', autocomplete: 'off', spellcheck: 'false' });
      const withEl = h('input', { type: 'text', 'data-test': 'rp-with', value: '', placeholder: 'Ví dụ: www.sangtacviet.app', autocomplete: 'off', spellcheck: 'false' });
      const fieldSeg = seg('rp-field', [['url', 'Địa chỉ'], ['title', 'Tên'], ['both', 'Cả hai']], pre.field, 'rp-field');
      const opt = (test, label, hint, checked) => {
        const cb = h('input', { type: 'checkbox', 'data-test': test, checked });
        return { cb, el: h('label', { class: 'optrow' }, cb, h('span', {}, h('b', {}, label), h('small', {}, hint))) };
      };
      const oCase = opt('rp-case', 'Aa  Phân biệt hoa thường', 'Chỉ đổi chỗ viết đúng hoa thường.', !!q.caseSensitive);
      const oRegex = opt('rp-regex', '.*  Regex', 'Dùng $1, $2… trong “Thay bằng” để giữ phần đã bắt.', !!q.regex);
      const info = h('p', { class: 'rp-info', 'data-test': 'rp-preview', role: 'status' });
      const list = h('div', { class: 'rp-samples' });
      const body = h('div', { class: 'filter rp' },
        h('p', { class: 'muted' }, 'Áp dụng cho ' + ids.length + ' dấu trang. Mục không chứa chữ cần tìm giữ nguyên.'),
        h('section', {}, h('span', { class: 'lab' }, 'Đổi ở'), fieldSeg),
        h('section', {}, h('label', { class: 'field' }, h('span', { class: 'lab' }, 'Tìm'), find)),
        h('section', {}, h('label', { class: 'field' }, h('span', { class: 'lab' }, 'Thay bằng'), withEl)),
        h('section', {}, oCase.el, oRegex.el),
        h('section', {}, info, list));
      const opts = () => ({ field: segValue(body, 'rp-field') || 'url', find: find.value, replace: withEl.value, caseSensitive: oCase.cb.checked, regex: oRegex.cb.checked });
      let last = null, timer = 0, okBtn = null;
      const preview = () => {
        const r = last = SDT.bulkReplace(S.data, ids, opts(), Date.now());
        list.textContent = '';
        info.classList.toggle('err', !r.ok);
        if (!r.ok) { info.textContent = r.error; }
        else {
          const bits = [r.changed ? 'Sẽ đổi ' + r.changed + ' dấu trang.' : 'Không có dấu trang nào đổi.'];
          if (r.skipped.length) bits.push('Bỏ qua ' + r.skipped.length + ' mục (' + r.skipped[0].reason + (r.skipped.length > 1 ? '…' : '') + ').');
          if (r.dups) bits.push(r.dups + ' mục sẽ trùng địa chỉ với dấu trang khác.');
          info.textContent = bits.join(' ');
          const f = opts().field;
          for (const x of r.samples) {
            const lines = [];
            if (f !== 'title' && x.before.url !== x.after.url) lines.push([x.before.url, x.after.url]);
            if (f !== 'url' && x.before.title !== x.after.title) lines.push([x.before.title, x.after.title]);
            for (const [a, b2] of lines) list.append(h('div', { class: 'rp-row', 'data-test': 'rp-sample' }, h('s', {}, a), h('span', { class: 'rp-arrow' }, '→'), h('b', {}, b2)));
          }
        }
        if (okBtn) {
          const n = r.ok ? r.changed : 0;
          okBtn.disabled = !n;
          okBtn.textContent = n ? 'Đổi ' + n + ' dấu trang' : 'Đổi';
        }
      };
      const later = () => { clearTimeout(timer); timer = setTimeout(preview, 150); };
      for (const el of [find, withEl]) el.addEventListener('input', later);
      for (const el of [fieldSeg, oCase.cb, oRegex.cb]) el.addEventListener('change', preview);
      let ready = null;
      const v = await openDialog({
        title: 'Đổi chữ hàng loạt', test: 'dlg-replace-text', sheet: true, wide: true, body,
        actions: [{ label: 'Hủy', value: null, test: 'rp-cancel', kind: 'quiet' }, { label: 'Đổi', value: 'go', kind: 'primary', test: 'rp-ok', cls: 'grow' }],
        onOpen: api => { okBtn = api.el.querySelector('[data-test="rp-ok"]'); preview(); },
        onAction: async () => {
          clearTimeout(timer);
          const r = SDT.bulkReplace(S.data, ids, opts(), Date.now());
          if (!r.ok) return r.error;
          if (!r.changed) return 'Không có dấu trang nào đổi.';
          ready = r;
          return true;
        },
      });
      // Ghi sau khi hộp đã đóng để thông báo (kèm Hoàn tác) không mất theo hộp.
      if (v !== 'go' || !ready) return;
      const r = ready;
      const extra = (r.skipped.length ? ' Bỏ qua ' + r.skipped.length + ' mục.' : '') + (r.dups ? ' ' + r.dups + ' mục trùng địa chỉ với dấu trang khác.' : '');
      if (r.changed > 500) { toast('Đang đổi ' + r.changed + ' dấu trang…'); await new Promise(res => setTimeout(res, 30)); }
      await commit(r.data, { keepScroll: true, undo: 'Đã đổi ' + r.changed + ' dấu trang.' + extra });
    }

    async function bulkTag(items) {
      const val = await promptDialog({
        title: 'Thêm nhãn cho ' + items.length + ' dấu trang', label: 'Nhãn (cách nhau bằng dấu phẩy)', okText: 'Thêm nhãn', test: 'dlg-bulk-tag',
        validate: v => (SDT.parseTags(v).length ? null : 'Nhập ít nhất một nhãn.'),
      });
      if (val === null) return;
      const r = SDT.bulkAddTags(S.data, items.map(i => i.id), SDT.parseTags(val), Date.now());
      if (!r.ok) { toast(r.error, { error: true }); return; }
      await commit(r.data, { keepScroll: true, undo: 'Đã thêm nhãn.' });
    }

    /* ---------- kéo thả bằng tay nắm ---------- */
    function startDrag(e, it, handleEl) {
      if (e.button !== undefined && e.button !== 0) return;
      e.preventDefault();
      const row = handleEl.closest('[data-row]');
      const rect = row.getBoundingClientRect();
      const line = h('div', { class: 'drop-line', 'data-test': 'drop-line' });
      $('list').append(line);
      S.drag = { it, row, startY: e.clientY, offset: e.clientY - rect.top, target: null, y: e.clientY, x: e.clientX, raf: 0, line };
      row.classList.add('dragging');
      try { handleEl.setPointerCapture(e.pointerId); } catch (err) { /* bỏ qua */ }
      const move = ev => { S.drag.x = ev.clientX; S.drag.y = ev.clientY; dragUpdate(); ev.preventDefault(); };
      const up = () => { finish(true); };
      const cancel = () => { finish(false); };
      const key = ev => { if (ev.key === 'Escape') { ev.preventDefault(); finish(false); } };
      function finish(drop) {
        handleEl.removeEventListener('pointermove', move);
        handleEl.removeEventListener('pointerup', up);
        handleEl.removeEventListener('pointercancel', cancel);
        window.removeEventListener('keydown', key, true);
        cancelAnimationFrame(S.drag.raf);
        const d = S.drag;
        S.drag = null;
        d.row.classList.remove('dragging');
        d.row.style.transform = '';
        d.line.remove();
        container.querySelectorAll('.drop-into').forEach(x => x.classList.remove('drop-into'));
        if (drop && d.target) applyDrop(d.it, d.target);
      }
      handleEl.addEventListener('pointermove', move);
      handleEl.addEventListener('pointerup', up);
      handleEl.addEventListener('pointercancel', cancel);
      window.addEventListener('keydown', key, true);
      const tick = () => {
        if (!S.drag) return;
        const sc = scroller();
        const vh = window.innerHeight;
        let dy = 0;
        if (S.drag.y < 110) dy = -Math.ceil((110 - S.drag.y) / 6);
        else if (S.drag.y > vh - 70) dy = Math.ceil((S.drag.y - (vh - 70)) / 6);
        if (dy) { sc.scrollTop += dy; dragUpdate(); }
        S.drag.raf = requestAnimationFrame(tick);
      };
      S.drag.raf = requestAnimationFrame(tick);
      dragUpdate();
    }
    function dragUpdate() {
      const d = S.drag;
      if (!d) return;
      const r0 = d.row.getBoundingClientRect();
      d.row.style.transform = 'translateY(' + (d.y - d.offset - r0.top + (parseFloat((d.row.style.transform.match(/-?[\d.]+/) || [0])[0]) || 0)) + 'px)';
      container.querySelectorAll('.drop-into').forEach(x => x.classList.remove('drop-into'));
      d.line.style.display = 'none';
      d.target = null;
      const stack = (rootNode.elementsFromPoint ? rootNode.elementsFromPoint(d.x, d.y) : document.elementsFromPoint(d.x, d.y)) || [];
      const el = stack.find(x => !d.row.contains(x) && container.contains(x));
      if (!el) return;
      const rowEl = el.closest('[data-row]');
      const treeEl = el.closest('.trow[data-drop]');
      if (treeEl && !rowEl) {
        const fid = treeEl.getAttribute('data-drop') || null;
        if (d.it.kind === 'f' && fid && (fid === d.it.id || SDT.descendantIds(S.data, d.it.id).includes(fid))) { d.target = { invalid: true }; return; }
        treeEl.classList.add('drop-into');
        d.target = { into: fid };
        return;
      }
      if (!rowEl || rowEl === d.row) return;
      const kind = rowEl.getAttribute('data-row');
      const id = rowEl.getAttribute('data-id');
      const rr = rowEl.getBoundingClientRect();
      const rel = (d.y - rr.top) / rr.height;
      if (kind === 'f' && rel > 0.25 && rel < 0.75) {
        if (d.it.kind === 'f' && (id === d.it.id || SDT.descendantIds(S.data, d.it.id).includes(id))) { d.target = { invalid: true }; return; }
        rowEl.classList.add('drop-into');
        d.target = { into: id };
        return;
      }
      if (kind !== d.it.kind) return;
      const before = rel < 0.5;
      const lr = $('list').getBoundingClientRect();
      d.line.style.display = 'block';
      d.line.style.top = ((before ? rr.top : rr.bottom) - lr.top - 1) + 'px';
      d.target = before ? { before: id } : { after: id };
    }
    async function applyDrop(it, t) {
      if (t.invalid) { toast('Không thể chuyển thư mục vào chính nó hoặc vào thư mục con của nó.', { error: true }); return; }
      const now = Date.now();
      let r;
      if (t.into !== undefined) r = SDT.placeItems(S.data, [it], t.into, 'end', now);
      else if (t.before) r = SDT.placeItems(S.data, [it], curFolderId(), { before: t.before }, now);
      else r = SDT.placeItems(S.data, [it], curFolderId(), { after: { kind: it.kind, id: t.after } }, now);
      if (!r.ok) { toast(r.error, { error: true }); return; }
      const msg = t.into !== undefined ? 'Đã chuyển vào ' + SDT.folderLabel(r.data, t.into) + '.' : 'Đã đổi chỗ.';
      await commit(r.data, { keepScroll: true, undo: msg });
    }

    /* ---------- thêm / sửa ---------- */
    async function openEditor(id) {
      const old = id ? bookmarkById(id) : null;
      if (id && !old) { toast('Dấu trang này không còn nữa.', { error: true }); return; }
      let force = false;
      let openOld = null;
      const dup = h('div', { class: 'dup', 'data-test': 'dup-warning', hidden: true });
      const form = BookmarkForm({
        prefix: 'bm', getData: () => S.data,
        values: old ? { title: old.title, url: old.url, folderId: old.folderId, tags: old.tags } : { folderId: folderView() ? curFolderId() : null },
        onChange: () => { force = false; dup.hidden = true; }, onCreateFolder: createFolderFromPicker,
      });
      form.fields.url.addEventListener('input', () => { force = false; dup.hidden = true; });
      const meta = old ? h('p', { class: 'meta', 'data-test': 'bm-meta' }, 'Tạo ', h('span', { 'data-test': 'bm-created' }, SDT.formatDateTime(old.createdAt)), ' · Cập nhật ', h('span', { 'data-test': 'bm-updated' }, SDT.formatDateTime(old.updatedAt))) : null;
      let saved = null;
      const v = await openDialog({
        title: old ? 'Sửa dấu trang' : 'Thêm dấu trang', test: 'dlg-editor', wide: true, sheet: true, enterValue: 'save',
        body: h('div', {}, form.el, dup, meta),
        actions: [{ label: 'Hủy', value: null, test: 'bm-cancel' }, { label: 'Lưu', value: 'save', kind: 'primary', test: 'bm-save' }],
        onOpen: () => { if (!old && !UI.coarse()) form.fields.url.focus(); },
        onAction: async (value, api) => {
          form.showError('');
          const values = form.get();
          const fx = SDT.fixUrl(values.url);
          if (!fx.ok) { form.showError(fx.error); form.fields.url.focus(); return false; }
          // Chỉ cảnh báo trùng khi thêm mới hoặc khi đã đổi địa chỉ.
          const urlChanged = !old || SDT.normalizeUrl(fx.url) !== old.urlKey;
          const others = urlChanged ? SDT.findByUrl(S.data, fx.url, old ? old.id : null) : [];
          if (others.length && !force) {
            const o = others[0];
            dup.textContent = '';
            dup.append(
              h('p', {}, 'Trang này đã lưu ở ', h('strong', {}, SDT.folderLabel(S.data, o.folderId)), ' với tên “' + o.title + '”.'),
              h('div', { class: 'dup-actions' },
                h('button', { type: 'button', class: 'btn quiet small', 'data-test': 'dup-open', onclick: () => { openOld = o.id; api.close(null); } }, 'Mở bản cũ để sửa'),
                h('button', { type: 'button', class: 'btn quiet small', 'data-test': 'dup-force', onclick: () => { force = true; api.run('save'); } }, old ? 'Vẫn lưu' : 'Vẫn lưu thêm')));
            dup.hidden = false;
            return false;
          }
          const now = Date.now();
          const r = old ? SDT.updateBookmark(S.data, old.id, values, now) : SDT.addBookmark(S.data, values, now);
          if (!r.ok) { form.showError(r.error); return false; }
          saved = r;
          return true;
        },
      });
      if (openOld) { openEditor(openOld); return; }
      if (v !== 'save' || !saved) return;
      if (old && !saved.changed) { toast('Không có gì thay đổi.'); return; }
      if (await commit(saved.data, { keepScroll: true })) toast(old ? 'Đã cập nhật dấu trang.' : 'Đã thêm dấu trang.');
    }

    /* ---------- lọc ---------- */
    function clearFilters() {
      S.q = Object.assign(SDT.defaultQuery(), { text: S.q.text });
      S.notice = '';
      renderAll(false);
    }
    function clearAllFilters() {
      S.q = SDT.defaultQuery();
      $('search').value = '';
      S.notice = '';
      renderAll(false);
    }
    function seg(name, options, value, test) {
      return h('div', { class: 'seg', role: 'radiogroup' }, options.map(([v, label]) => h('label', { class: 'seg-o' },
        h('input', { type: 'radio', name, value: v, checked: v === value, 'data-test': test + '-' + v }), h('span', {}, label))));
    }
    function segValue(rootEl, name) { const r = rootEl.querySelector('input[name="' + name + '"]:checked'); return r ? r.value : ''; }
    function openFilter() {
      const q = S.q;
      const title = h('input', { type: 'text', 'data-test': 'filter-title', value: q.title, placeholder: 'Ví dụ: Conan', autocomplete: 'off' });
      const url = h('input', { type: 'text', 'data-test': 'filter-url', value: q.urlText, placeholder: 'Ví dụ: vidu.vn', autocomplete: 'off', spellcheck: 'false' });
      const tags = SDT.tagCounts(S.data);
      const chosen = new Set(q.tags.map(t => t.toLowerCase()));
      const tagBox = h('div', { class: 'tagpick' });
      const tagSearch = tags.length > 20 ? h('input', { type: 'search', class: 'tsearch', 'data-test': 'filter-tag-search', placeholder: 'Tìm nhãn', autocomplete: 'off' }) : null;
      const drawTags = () => {
        tagBox.textContent = '';
        const f = tagSearch ? SDT.fold(tagSearch.value.trim()) : '';
        const shown = tags.filter(t => !f || SDT.fold(t.tag).includes(f) || chosen.has(t.tag.toLowerCase()));
        if (!tags.length) { tagBox.append(h('p', { class: 'muted' }, 'Chưa có nhãn nào.')); return; }
        for (const t of shown.slice(0, 200)) {
          const cb = h('input', { type: 'checkbox', value: t.tag, checked: chosen.has(t.tag.toLowerCase()), 'data-test': 'filter-tag', 'data-tag': t.tag,
            onchange: e => { e.target.checked ? chosen.add(t.tag.toLowerCase()) : chosen.delete(t.tag.toLowerCase()); } });
          tagBox.append(h('label', { class: 'tpick tag ' + tagClass(S.data, t.tag) }, cb, h('span', {}, h('i', { class: 'dot' }), t.tag, h('small', {}, ' ' + t.count))));
        }
      };
      if (tagSearch) tagSearch.addEventListener('input', drawTags);
      drawTags();
      const dateField = h('select', { 'data-test': 'filter-datefield', 'aria-label': 'Loại ngày' }, h('option', { value: 'createdAt' }, 'Ngày tạo'), h('option', { value: 'updatedAt' }, 'Ngày cập nhật'));
      dateField.value = q.dateField;
      const date = h('input', { type: 'date', 'data-test': 'filter-date', value: q.date, 'aria-label': 'Ngày' });
      const month = h('input', { type: 'month', 'data-test': 'filter-month', value: q.month, 'aria-label': 'Tháng' });
      const from = h('input', { type: 'date', 'data-test': 'filter-from', value: q.from, 'aria-label': 'Từ ngày' });
      const to = h('input', { type: 'date', 'data-test': 'filter-to', value: q.to, 'aria-label': 'Đến ngày' });
      const exactBox = h('label', { class: 'field' }, h('span', { class: 'lab' }, 'Ngày'), date);
      const monthBox = h('label', { class: 'field' }, h('span', { class: 'lab' }, 'Tháng'), month);
      const rangeBox = h('div', { class: 'range' }, h('label', { class: 'field' }, h('span', { class: 'lab' }, 'Từ ngày'), from), h('label', { class: 'field' }, h('span', { class: 'lab' }, 'Đến ngày'), to));
      const mode = seg('f-datemode', [['exact', 'Đúng ngày'], ['month', 'Trong tháng'], ['range', 'Khoảng ngày']], q.dateMode, 'filter-datemode');
      const syncMode = () => { const m = segValue(body, 'f-datemode'); exactBox.hidden = m !== 'exact'; monthBox.hidden = m !== 'month'; rangeBox.hidden = m !== 'range'; };
      mode.addEventListener('change', syncMode);
      const inFolder = S.view !== 'all' && S.view !== 'root';
      const opt = (test, label, hint, checked) => {
        const cb = h('input', { type: 'checkbox', 'data-test': test, checked });
        return { cb, el: h('label', { class: 'optrow' }, cb, h('span', {}, h('b', {}, label), h('small', {}, hint))) };
      };
      const oCase = opt('filter-case', 'Aa  Phân biệt hoa thường', '“Conan” không khớp “conan”.', !!q.caseSensitive);
      const oPhrase = opt('filter-phrase', '“…”  Đúng cụm', 'Khớp nguyên cụm đã gõ, liền nhau, kể cả dấu.', !!q.phrase);
      const oRegex = opt('filter-regex', '.*  Regex', 'Biểu thức chính quy, ví dụ: tập \\d+  ·  ^https://vidu\\.vn/  ·  conan|kid', !!q.regex);
      const syncOpts = () => { oPhrase.cb.disabled = oRegex.cb.checked; oPhrase.el.classList.toggle('off', oRegex.cb.checked); };
      oRegex.cb.addEventListener('change', syncOpts);
      syncOpts();
      const body = h('div', { class: 'filter' },
        h('section', {}, h('label', { class: 'field' }, h('span', { class: 'lab' }, 'Tên có chữ'), title)),
        h('section', {}, h('label', { class: 'field' }, h('span', { class: 'lab' }, 'Địa chỉ có chữ'), url)),
        h('section', { 'data-test': 'filter-textmode' }, h('div', { class: 'lab' }, 'Cách so chữ ', h('small', {}, '(cho ô tìm, Tên, Địa chỉ)')), oCase.el, oPhrase.el, oRegex.el),
        h('section', {}, h('div', { class: 'lab' }, 'Nhãn ', h('small', {}, '(có đủ các nhãn chọn)')), tagSearch, tagBox),
        h('section', {}, h('div', { class: 'h3row' }, h('span', { class: 'lab' }, 'Thời gian'),
          h('button', { type: 'button', class: 'link small', 'data-test': 'filter-clear-dates', onclick: () => { date.value = ''; month.value = ''; from.value = ''; to.value = ''; } }, 'Bỏ ngày')),
          dateField, mode, exactBox, monthBox, rangeBox),
        inFolder ? h('section', {}, h('span', { class: 'lab' }, 'Phạm vi'), seg('f-scope', [['folder', 'Thư mục đang xem'], ['all', 'Toàn bộ']], q.scope, 'filter-scope')) : null);
      syncMode();
      openDialog({
        title: 'Lọc dấu trang', test: 'dlg-filter', sheet: true, wide: true, body, noFocus: true,
        actions: [{ label: 'Xóa bộ lọc', value: 'reset', test: 'filter-reset', kind: 'quiet' }, { label: 'Áp dụng', value: 'apply', kind: 'primary', test: 'filter-apply', cls: 'grow' }],
        onAction: value => {
          if (value === 'reset') { clearFilters(); return true; }
          const m = segValue(body, 'f-datemode') || 'exact';
          const r = SDT.normalizeRange(from.value, to.value);
          Object.assign(S.q, {
            title: title.value, urlText: url.value,
            tags: tags.filter(t => chosen.has(t.tag.toLowerCase())).map(t => t.tag),
            dateField: dateField.value, dateMode: m, date: date.value, month: month.value, from: r.from, to: r.to,
            scope: inFolder ? (segValue(body, 'f-scope') || 'folder') : 'folder',
            caseSensitive: oCase.cb.checked, regex: oRegex.cb.checked, phrase: oPhrase.cb.checked && !oRegex.cb.checked,
          });
          S.notice = (m === 'range' && r.swapped) ? 'Ngày “Từ” sau ngày “Đến” nên đã đổi chỗ hai ngày.' : '';
          renderAll(false);
          if (S.notice) toast(S.notice);
          return true;
        },
      });
    }

    /* ---------- nhãn ---------- */
    function openTags() {
      openDialog({
        title: 'Nhãn', test: 'dlg-tags', sheet: true, noFocus: true,
        onOpen: api => {
          const search = h('input', { type: 'search', class: 'tsearch', 'data-test': 'tags-search', placeholder: 'Tìm nhãn', autocomplete: 'off' });
          const box = h('div', { class: 'taglist' });
          const draw = () => {
            box.textContent = '';
            const all = SDT.tagCounts(S.data);
            const f = SDT.fold(search.value.trim());
            const tags = all.filter(t => !f || SDT.fold(t.tag).includes(f));
            if (!all.length) { box.append(h('p', { class: 'muted', 'data-test': 'tags-empty' }, 'Chưa có nhãn nào. Thêm nhãn khi lưu hoặc sửa dấu trang.')); return; }
            for (const t of tags.slice(0, 300)) {
              box.append(h('div', { class: 'tagrow', 'data-test': 'tags-row', 'data-tag': t.tag },
                h('button', { type: 'button', class: 'cdot ' + tagClass(S.data, t.tag), 'data-test': 'tag-color', 'aria-label': 'Đổi màu nhãn ' + t.tag, onclick: async () => { await colorDlg(t.tag); draw(); } }),
                h('button', { type: 'button', class: 'tagrow-name', 'data-test': 'tag-open', onclick: () => { api.close(null); S.q = Object.assign(SDT.defaultQuery(), { tags: [t.tag] }); S.view = 'all'; $('search').value = ''; renderAll(false); } },
                  h('span', { class: 'tag ' + tagClass(S.data, t.tag) }, t.tag), h('span', { class: 'tcount', 'data-test': 'tag-count' }, t.count + ' dấu trang')),
                h('button', { type: 'button', class: 'icon-btn', 'data-test': 'tag-rename', 'aria-label': 'Đổi tên nhãn ' + t.tag, onclick: async () => { await renameTagDlg(t.tag); draw(); } }, icon('edit')),
                h('button', { type: 'button', class: 'icon-btn', 'data-test': 'tag-delete', 'aria-label': 'Xóa nhãn ' + t.tag, onclick: async () => { await deleteTagDlg(t.tag); draw(); } }, icon('trash'))));
            }
          };
          search.addEventListener('input', draw);
          if (SDT.tagCounts(S.data).length > 20) api.body.append(search);
          api.body.append(box);
          draw();
        },
      });
    }
    async function colorDlg(tag) {
      let chosen = null;
      const cur = SDT.tagColor(S.data, tag);
      await openDialog({
        title: 'Màu cho nhãn “' + tag + '”', test: 'dlg-color', noFocus: true,
        onOpen: api => {
          api.body.append(h('div', { class: 'palette' }, SDT.TAG_COLORS.map(c => h('button', {
            type: 'button', class: 'swatch tag tc-' + c + (c === cur ? ' on' : ''), 'data-test': 'color-opt', 'data-color': c, 'aria-pressed': String(c === cur),
            onclick: () => { chosen = c; api.close('ok'); },
          }, h('i', { class: 'dot' }), SDT.TAG_COLOR_NAMES[c]))));
        },
      });
      if (!chosen || chosen === cur) return;
      const r = SDT.setTagColor(S.data, tag, chosen);
      if (r.ok && await commit(r.data, { keepScroll: true })) toast('Đã đổi màu nhãn “' + tag + '”.');
    }
    async function renameTagDlg(tag) {
      const val = await promptDialog({ title: 'Đổi tên nhãn “' + tag + '”', label: 'Tên mới', value: tag, okText: 'Đổi tên', maxlength: '50', test: 'dlg-tag-rename', validate: v => (SDT.cleanTag(v) ? null : 'Nhập tên nhãn mới.') });
      if (val === null) return;
      const r = SDT.renameTag(S.data, tag, val, Date.now());
      if (!r.ok) { toast(r.error, { error: true }); return; }
      S.q.tags = S.q.tags.map(t => (t.toLowerCase() === tag.toLowerCase() ? r.name : t)).filter((t, i, a) => a.findIndex(x => x.toLowerCase() === t.toLowerCase()) === i);
      if (await commit(r.data, { keepScroll: true })) toast(r.merged ? 'Đã gộp vào nhãn “' + r.name + '”.' : 'Đã đổi tên nhãn.');
    }
    async function deleteTagDlg(tag) {
      const ok = await confirmDialog({ title: 'Xóa nhãn “' + tag + '”?', message: 'Nhãn sẽ được gỡ khỏi mọi dấu trang. Dấu trang vẫn giữ nguyên.', okText: 'Xóa nhãn', danger: true, test: 'dlg-tag-delete' });
      if (!ok) return;
      const r = SDT.deleteTag(S.data, tag, Date.now());
      S.q.tags = S.q.tags.filter(t => t.toLowerCase() !== tag.toLowerCase());
      if (await commit(r.data, { keepScroll: true })) toast('Đã xóa nhãn.');
    }

    /* ---------- sao lưu ---------- */
    function download(name, text, type) {
      const blob = new Blob([text], { type: type || 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = h('a', { href: url, download: name, 'data-test': 'download-link' });
      container.append(a);
      a.click();
      setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 4000);
    }
    function exportData() {
      const now = Date.now();
      download(SDT.exportFileName(now), JSON.stringify(SDT.exportPayload(S.data, now)));
      toast('Đã xuất ' + S.data.bookmarks.length + ' dấu trang.');
    }
    function exportHtmlData() {
      const now = Date.now();
      download(SDT.exportHtmlFileName(now), SDT.exportHtml(S.data, now), 'text/html');
      toast('Đã xuất ' + S.data.bookmarks.length + ' dấu trang ra tệp HTML.');
    }
    async function exportRaw() {
      let raw = S.rawBad;
      try { raw = await store.raw(); } catch (e) { /* dùng bản đã có */ }
      download('so-dau-trang-du-lieu-loi-' + SDT.localDay(Date.now()) + '.json', JSON.stringify(raw === undefined ? null : raw));
    }
    function openBackup() {
      const file = h('input', { type: 'file', accept: '.json,.html,.htm,application/json,text/html', 'data-test': 'backup-file', 'aria-label': 'Chọn tệp sao lưu' });
      const result = h('p', { class: 'result', 'data-test': 'backup-result', role: 'status' });
      const pasteSection = () => {
        const ta = h('textarea', { class: 'paste', 'data-test': 'backup-paste', rows: '4', placeholder: 'Dán dữ liệu đã chép vào đây', 'aria-label': 'Dữ liệu dán' });
        return h('section', {},
          h('h3', {}, 'Chép / dán'),
          h('p', { class: 'muted' }, 'Dùng khi không tải hoặc chọn được tệp. “Chép dữ liệu” đưa toàn bộ dữ liệu vào bộ nhớ tạm; dán vào ô dưới ở máy khác rồi bấm Nhập (theo cách Gộp/Thay thế đã chọn ở trên).'),
          h('button', { type: 'button', class: 'btn quiet', 'data-test': 'backup-copy', disabled: S.readOnly, onclick: async () => {
            const ok = await copyText(JSON.stringify(SDT.exportPayload(S.data, Date.now())));
            toast(ok ? 'Đã chép dữ liệu ' + S.data.bookmarks.length + ' dấu trang.' : 'Không chép được.', { error: !ok });
          } }, 'Chép dữ liệu'),
          ta,
          h('button', { type: 'button', class: 'btn quiet', 'data-test': 'backup-import-paste', onclick: () => importText(ta.value, 'dữ liệu dán', segValue(body, 'b-mode'), result) }, 'Nhập dữ liệu đã dán'));
      };
      const body = h('div', { class: 'backup' },
        env.storageInfo ? h('p', { class: 'muted', 'data-test': 'backup-storage-info' }, env.storageInfo()) : null,
        h('section', {},
          h('h3', {}, 'Xuất'),
          h('p', { class: 'muted' }, 'Tệp JSON giữ đủ thư mục, dấu trang, nhãn và màu nhãn, dùng để sao lưu. Tệp HTML là dạng dấu trang chung của trình duyệt, dùng để chuyển sang Chrome, Edge, Soul… Nên sao lưu thường xuyên vì gỡ app hoặc xóa dữ liệu trình duyệt sẽ mất dấu trang.'),
          h('div', { class: 'btnrow' },
            h('button', { type: 'button', class: 'btn primary', 'data-test': 'backup-export', disabled: S.readOnly, onclick: exportData }, 'Xuất tệp JSON'),
            h('button', { type: 'button', class: 'btn quiet', 'data-test': 'backup-export-html', disabled: S.readOnly, onclick: exportHtmlData }, 'Xuất tệp HTML'))),
        h('section', {},
          h('h3', {}, 'Nhập'),
          h('p', { class: 'muted' }, 'Tệp JSON đã xuất từ Sổ Dấu Trang (bản 1.x, 2.x), hoặc tệp dấu trang HTML xuất từ trình duyệt (Chrome, Edge, Soul, Firefox…).'),
          file,
          seg('b-mode', [['merge', 'Gộp vào dữ liệu hiện có'], ['replace', 'Thay thế toàn bộ']], S.readOnly ? 'replace' : 'merge', 'backup-mode'),
          h('button', { type: 'button', class: 'btn quiet', 'data-test': 'backup-import', onclick: () => doImport(file, segValue(body, 'b-mode'), result) }, 'Nhập tệp'),
          result),
        env.pasteBackup ? pasteSection() : null);
      openDialog({ title: 'Sao lưu', test: 'dlg-backup', sheet: true, wide: true, body, noFocus: true });
    }
    async function doImport(fileInput, mode, result) {
      const f = fileInput.files && fileInput.files[0];
      if (!f) { result.textContent = 'Chọn một tệp .json hoặc .html trước.'; result.classList.add('err'); toast('Chọn một tệp .json hoặc .html trước.', { error: true }); return; }
      result.textContent = 'Đang đọc tệp…'; result.classList.remove('err');
      await new Promise(r => setTimeout(r, 30));
      let text;
      try { text = await f.text(); } catch (e) { result.textContent = 'Không đọc được tệp. Dữ liệu hiện tại giữ nguyên.'; result.classList.add('err'); return; }
      return importText(text, 'Tệp “' + f.name + '”', mode, result, { html: true, name: f.name });
    }
    async function importText(text, label, mode, result, opt) {
      const show = (msg, err) => { result.textContent = msg; result.classList.toggle('err', !!err); if (err) toast(msg, { error: true }); };
      const head = String(text || '').slice(0, 2048).trimStart();
      if (opt && opt.html && head[0] !== '{' && (SDT.isBookmarksHtml(text) || /\.html?$/i.test(opt.name || '') || /^<(!doctype|html)/i.test(head))) {
        return importHtml(text, label, mode, show);
      }
      let obj;
      try { obj = JSON.parse(String(text || '').trim()); } catch (e) { show(label.charAt(0).toUpperCase() + label.slice(1) + ' không phải JSON hợp lệ. Dữ liệu hiện tại giữ nguyên.', true); return; }
      const v = SDT.validateData(obj);
      if (!v.ok) { show(v.error + ' Dữ liệu hiện tại giữ nguyên.', true); return; }
      if (mode === 'replace') {
        const ok = await confirmDialog({
          title: 'Thay thế toàn bộ?', okText: 'Thay thế', danger: true, test: 'dlg-replace',
          message: 'Toàn bộ ' + S.data.bookmarks.length + ' dấu trang và ' + S.data.folders.length + ' thư mục hiện có sẽ bị thay bằng ' + v.data.bookmarks.length + ' dấu trang và ' + v.data.folders.length + ' thư mục trong tệp.',
        });
        if (!ok) { show('Đã hủy. Dữ liệu hiện tại giữ nguyên.'); return; }
        S.view = 'root';
        if (await commit(v.data, { force: true, replace: true })) show('Đã thay thế: ' + v.data.bookmarks.length + ' dấu trang, ' + v.data.folders.length + ' thư mục.');
        return;
      }
      if (S.readOnly) { show('Dữ liệu đang lỗi nên không gộp được. Hãy chọn “Thay thế toàn bộ”.', true); return; }
      const m = SDT.mergeData(S.data, v.data);
      if (await commit(m.data)) show('Đã gộp: thêm ' + m.added + ' dấu trang, cập nhật ' + m.updated + ', giữ nguyên ' + m.kept + '; thêm ' + m.foldersAdded + ' thư mục.');
    }
    async function importHtml(text, label, mode, show) {
      const r = SDT.parseBookmarksHtml(text, Date.now());
      if (!r.ok) { show(label + ': ' + r.error + ' Dữ liệu hiện tại giữ nguyên.', true); return; }
      const sk = r.skipped;
      const skipMsg = sk.length ? ' Bỏ ' + sk.length + ' mục không phải trang web: ' + sk.slice(0, 10).map(x => '“' + x.title + '”').join(', ') + (sk.length > 10 ? '…' : '') + '.' : '';
      if (mode === 'replace') {
        const ok = await confirmDialog({
          title: 'Thay thế toàn bộ?', okText: 'Thay thế', danger: true, test: 'dlg-replace',
          message: 'Toàn bộ ' + S.data.bookmarks.length + ' dấu trang và ' + S.data.folders.length + ' thư mục hiện có sẽ bị thay bằng ' + r.data.bookmarks.length + ' dấu trang và ' + r.data.folders.length + ' thư mục trong tệp.',
        });
        if (!ok) { show('Đã hủy. Dữ liệu hiện tại giữ nguyên.'); return; }
        S.view = 'root';
        if (await commit(r.data, { force: true, replace: true })) show('Đã thay thế: ' + r.data.bookmarks.length + ' dấu trang, ' + r.data.folders.length + ' thư mục.' + skipMsg);
        return;
      }
      if (S.readOnly) { show('Dữ liệu đang lỗi nên không gộp được. Hãy chọn “Thay thế toàn bộ”.', true); return; }
      const m = SDT.mergeImported(S.data, r.data);
      if (!m.added && !m.foldersAdded) { show('Đã gộp: thêm 0 dấu trang, bỏ qua ' + m.dup + ' đã có; thêm 0 thư mục.' + skipMsg); return; }
      if (await commit(m.data)) show('Đã gộp: thêm ' + m.added + ' dấu trang, bỏ qua ' + m.dup + ' đã có; thêm ' + m.foldersAdded + ' thư mục.' + skipMsg);
    }

    function openMore() {
      contextMenu([
        { label: 'Thêm dấu trang', icon: 'plus', test: 'menu-add', onSelect: () => openEditor(null) },
        { label: 'Thư mục mới', icon: 'folderPlus', test: 'menu-folder', onSelect: () => newFolder(folderView() ? curFolderId() : null) },
        'sep',
        searching() && S.entries.length ? { label: 'Đổi chữ các kết quả (' + S.entries.length + ')', icon: 'edit', test: 'menu-replace',
          onSelect: () => openReplace(S.entries.filter(e => e.kind === 'b').map(e => e.item.id)) } : null,
        { label: 'Tìm dấu trang trùng', icon: 'copy', test: 'menu-dups', onSelect: openDuplicates },
        { label: 'Nhãn và màu nhãn', icon: 'tag', test: 'menu-tags', onSelect: openTags },
        { label: 'Sao lưu: xuất / nhập', icon: 'paste', test: 'menu-backup', onSelect: openBackup },
      ], null, 'Sổ Dấu Trang');
    }

    /* ---------- phím tắt ---------- */
    function focusedItem() {
      const ae = rootNode.activeElement || document.activeElement;
      const row = ae && ae.closest ? ae.closest('[data-row]') : null;
      return row && container.contains(row) ? { kind: row.getAttribute('data-row'), id: row.getAttribute('data-id') } : null;
    }
    function onKey(e) {
      const ae = rootNode.activeElement || document.activeElement;
      if (rootNode.querySelector && rootNode.querySelector('dialog[open]')) return;
      if (ae && ae.closest && (ae.closest('textarea,select,[contenteditable]') || (ae.tagName === 'INPUT' && !['checkbox', 'radio', 'button'].includes(ae.type)))) return;
      if (e.key === '/' ) { e.preventDefault(); $('search').focus(); return; }
      const mod = e.ctrlKey || e.metaKey;
      const items = S.selectMode && S.selected.size ? [...S.selected.values()] : (focusedItem() ? [focusedItem()] : []);
      const k = e.key.toLowerCase();
      if (mod && k === 'x' && items.length) { e.preventDefault(); setClip('cut', items); }
      else if (mod && k === 'c' && items.length) { e.preventDefault(); setClip('copy', items); }
      else if (mod && k === 'v' && S.clip) { e.preventDefault(); if (canPasteHere()) pasteInto(curFolderId(), 'end'); else toast('Mở một thư mục để dán.', { error: true }); }
      else if ((e.key === 'Delete') && items.length) { e.preventDefault(); deleteItemsDlg(items); }
      else if (e.key === 'Escape' && S.selectMode) { S.selectMode = false; S.selected.clear(); renderList(true); }
    }

    /* ---------- khởi động ---------- */
    function wire() {
      $('btn-drawer').append(icon('menu'));
      $('side-close').append(icon('close'));
      $('search-ic').append(icon('search'));
      $('btn-filter').append(icon('filter'));
      $('btn-more').append(icon('more'));
      $('fab').append(icon('plus'));
      if ($('btn-close-manager')) { $('btn-close-manager').append(icon('close')); $('btn-close-manager').addEventListener('click', () => env.onClose()); }
      $('btn-drawer').addEventListener('click', () => setDrawer(true));
      $('side-close').addEventListener('click', () => setDrawer(false));
      $('scrim').addEventListener('click', () => setDrawer(false));
      $('btn-filter').addEventListener('click', openFilter);
      $('btn-more').addEventListener('click', openMore);
      $('fab').addEventListener('click', () => openEditor(null));
      let t = null;
      $('search').addEventListener('input', () => {
        clearTimeout(t);
        t = setTimeout(() => { S.q.text = $('search').value || ''; S.notice = ''; renderList(false); }, 70);
      });
      $('list').addEventListener('contextmenu', e => { if (e.target.closest('[data-row]')) return; e.preventDefault(); backgroundMenu(e); });
      (env.keyTarget || container).addEventListener('keydown', onKey);
      store.onChange(info => { if (info.origin === ORIGIN && info.own) return; reload(info); });
    }
    // Đổi từ nơi khác (popup, tab khác): nếu biết khóa nào đổi thì chỉ đọc lại các phần đó.
    async function reloadPartial(keys) {
      const shardKeys = keys.filter(k => /^sdt_b_\d+$/.test(k));
      const want = shardKeys.slice();
      if (keys.includes('sdt_folders')) want.push('sdt_folders');
      want.push('sdt_meta');
      const r = await store.readKeys(want);
      const meta = r.sdt_meta;
      if (!meta || meta.version !== SDT.DATA_VERSION) return false;
      for (const k of shardKeys) if (r[k] !== undefined && !Array.isArray(r[k])) return false;
      const changed = new Set(shardKeys.map(k => Number(k.slice(6))));
      const incoming = [];
      for (const k of shardKeys) for (const b of (r[k] || [])) incoming.push(b);
      // Kiểm cùng danh sách thư mục hiện có (nếu không, dấu trang sẽ bị coi là mất thư mục).
      const v = SDT.validateData({ version: SDT.DATA_VERSION, folders: keys.includes('sdt_folders') ? (r.sdt_folders || []) : S.data.folders, bookmarks: incoming, tagColors: meta.tagColors }, { trusted: true });
      if (!v.ok) return false;
      const kept = changed.size ? S.data.bookmarks.filter(b => !changed.has(SDTStorage.shardOf(b.id))) : S.data.bookmarks;
      S.data = { version: SDT.DATA_VERSION, folders: keys.includes('sdt_folders') ? v.data.folders : S.data.folders, bookmarks: kept.concat(v.data.bookmarks), tagColors: v.data.tagColors };
      return true;
    }
    async function reload(info) {
      if (info && info.keys && !S.readOnly && root.SDTStorage) {
        try {
          if (await reloadPartial(info.keys)) {
            if (!['all', 'root'].includes(S.view) && !SDT.getFolder(S.data, S.view)) S.view = 'root';
            renderAll(true);
            return;
          }
        } catch (e) { /* rơi xuống đọc lại toàn bộ */ }
      }
      const fresh = await store.loadAll();
      if (!fresh.ok) { S.readOnly = true; S.loadError = fresh.error; S.rawBad = fresh.raw; renderAll(true); return; }
      S.data = fresh.data; S.readOnly = false; S.loadError = ''; S.rawBad = undefined;
      if (!['all', 'root'].includes(S.view) && !SDT.getFolder(S.data, S.view)) S.view = 'root';
      renderAll(true);
      warmSearch();
    }
    async function start() {
      wire();
      const res = await store.loadAll();
      if (res.ok) S.data = res.data;
      else { S.readOnly = true; S.loadError = res.error; S.rawBad = res.raw; S.data = SDT.emptyData(); }
      renderAll(false);
      container.classList.add('ready');
      if (!window.__sdtReady) window.__sdtReady = performance.now();
      warmSearch();
    }
    // Chuẩn bị sẵn chữ bỏ dấu cho ô tìm khi rảnh, từng phần nhỏ để không làm giật.
    function warmSearch() {
      const list = S.data.bookmarks;
      let i = 0;
      const idle = window.requestIdleCallback || (cb => setTimeout(() => cb({ timeRemaining: () => 8 }), 30));
      const step = dl => {
        const until = performance.now() + Math.max(4, Math.min(12, dl.timeRemaining()));
        while (i < list.length && performance.now() < until) SDT.foldedOf(list[i++]);
        if (i < list.length && list === S.data.bookmarks) idle(step);
      };
      idle(step);
    }
    const ready = start();
    return { reload, setDrawer, ready };
  }

  root.SDTManager = { mount };
})(typeof globalThis !== 'undefined' ? globalThis : this);
