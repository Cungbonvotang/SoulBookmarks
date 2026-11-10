/* Sổ Dấu Trang — mảnh giao diện dùng chung cho popup, trình quản lý và bản Soul. */
(function (root) {
  'use strict';
  const SDT = root.SDT;

  // Nơi gắn giao diện: document.body (tiện ích) hoặc phần tử trong Shadow DOM (bản Soul).
  const CFG = { host: null, copy: null, favicon: true };
  function config(o) { Object.assign(CFG, o || {}); }
  function hostEl() { return CFG.host || document.body; }
  function rootNode() { return hostEl().getRootNode(); }
  function activeIn(node) { const r = node.getRootNode(); return r.activeElement || document.activeElement; }
  function coarse() { return !!(window.matchMedia && matchMedia('(pointer:coarse)').matches); }

  function h(tag, attrs, ...kids) {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (v === undefined || v === null || v === false) continue;
      if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
      else if (k === 'class') el.className = v;
      else if (k === 'text') el.textContent = v;
      else if (k === 'style') el.style.cssText = v; // CSSOM: không bị CSP chặn như thuộc tính style
      else if (k === 'svg') el.append(svg(v[0], v[1], v[2]));
      else if (k in el && typeof v !== 'string') el[k] = v;
      else el.setAttribute(k, v === true ? '' : v);
    }
    for (const kid of kids.flat()) {
      if (kid === null || kid === undefined || kid === false) continue;
      el.append(kid instanceof Node ? kid : document.createTextNode(String(kid)));
    }
    return el;
  }

  const ICONS = {
    edit: '<path d="M4 20h4l10.5-10.5a2.8 2.8 0 0 0-4-4L4 16v4z"/><path d="M13.5 6.5l4 4"/>',
    copy: '<rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V5a1 1 0 0 1 1-1h10"/>',
    trash: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    menu: '<path d="M4 7h16M4 12h16M4 17h10"/>',
    filter: '<path d="M4 6h16M7 12h10M10 18h4"/>',
    more: '<circle cx="12" cy="5.5" r="1.4"/><circle cx="12" cy="12" r="1.4"/><circle cx="12" cy="18.5" r="1.4"/>',
    close: '<path d="M7 7l10 10M17 7L7 17"/>',
    folder: '<path d="M3 7.5A2.5 2.5 0 0 1 5.5 5H9l2 2h7.5A2.5 2.5 0 0 1 21 9.5v7a2.5 2.5 0 0 1-2.5 2.5h-13A2.5 2.5 0 0 1 3 16.5z"/>',
    folderPlus: '<path d="M3 7.5A2.5 2.5 0 0 1 5.5 5H9l2 2h7.5A2.5 2.5 0 0 1 21 9.5v7a2.5 2.5 0 0 1-2.5 2.5h-13A2.5 2.5 0 0 1 3 16.5z"/><path d="M12 10.5v5M9.5 13h5"/>',
    chevron: '<path d="M9 6l6 6-6 6"/>',
    down: '<path d="M6 9l6 6 6-6"/>',
    check: '<path d="M5 12l5 5 9-10"/>',
    search: '<circle cx="11" cy="11" r="6.5"/><path d="M20 20l-4.2-4.2"/>',
    grip: '<path d="M5 9h14M5 15h14"/>',
    sort: '<path d="M7 5v14M4 16l3 3 3-3M17 19V5M14 8l3-3 3 3"/>',
    all: '<path d="M5 5h14M5 12h14M5 19h14"/>',
    bm: '<path d="M7 4h10v16l-5-4-5 4z"/>',
    cut: '<circle cx="6" cy="17" r="2.5"/><circle cx="18" cy="17" r="2.5"/><path d="M8 15.5L17 4M16 15.5L7 4"/>',
    paste: '<rect x="6" y="5" width="12" height="15" rx="2"/><path d="M9 5V3.5h6V5M9 11h6M9 15h4"/>',
    open: '<path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/>',
    link: '<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>',
    select: '<rect x="4" y="4" width="16" height="16" rx="4"/><path d="M8.5 12l2.5 2.5 4.5-5"/>',
    move: '<path d="M3 7.5A2.5 2.5 0 0 1 5.5 5H9l2 2h7.5A2.5 2.5 0 0 1 21 9.5v7a2.5 2.5 0 0 1-2.5 2.5h-13A2.5 2.5 0 0 1 3 16.5z"/><path d="M10 13h5M13 10.5L15.5 13 13 15.5"/>',
    palette: '<path d="M12 3a9 9 0 1 0 0 18c1 0 1.5-.8 1.5-1.6 0-1-.8-1.4-.8-2.4 0-.9.7-1.5 1.6-1.5H17a4 4 0 0 0 4-4C21 6.6 17 3 12 3z"/><circle cx="7.5" cy="11" r="1"/><circle cx="10" cy="7.5" r="1"/><circle cx="14.5" cy="7.5" r="1"/>',
    tag: '<path d="M3 12V4h8l10 10-8 8z"/><circle cx="7.5" cy="8" r="1.3"/>',
  };
  const SVGNS = 'http://www.w3.org/2000/svg';
  // Dựng SVG bằng createElementNS (không dùng innerHTML: trang như YouTube bật Trusted Types sẽ chặn).
  function svg(viewBox, inner, attrs) {
    const el = document.createElementNS(SVGNS, 'svg');
    el.setAttribute('viewBox', viewBox);
    for (const [k, v] of Object.entries(attrs || {})) el.setAttribute(k, v);
    const re = /<(\w+)((?:\s+[\w-]+="[^"]*")*)\s*\/>/g;
    let m;
    while ((m = re.exec(inner || ''))) {
      const c = document.createElementNS(SVGNS, m[1]);
      const are = /([\w-]+)="([^"]*)"/g;
      let a;
      while ((a = are.exec(m[2]))) c.setAttribute(a[1], a[2]);
      el.append(c);
    }
    return el;
  }
  const iconCache = new Map();
  function icon(name, extraClass) {
    let tpl = iconCache.get(name);
    if (!tpl) {
      tpl = document.createElement('span');
      tpl.setAttribute('aria-hidden', 'true');
      tpl.append(svg('0 0 24 24', ICONS[name] || '', { fill: 'none', stroke: 'currentColor', 'stroke-width': '1.8', 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }));
      iconCache.set(name, tpl);
    }
    const span = tpl.cloneNode(true);
    span.className = 'ic' + (extraClass ? ' ' + extraClass : '');
    return span;
  }
  function ribbonSvg(saved, hanging) {
    const d = hanging ? 'M3 0V43L15 34L27 43V0' : 'M3 3H27V43L15 34L3 43Z';
    return svg('0 0 30 46', '<path d="' + d + '" stroke-width="3" stroke-linejoin="round"/>', { class: 'ribbon-svg' + (saved ? ' on' : '') });
  }

  /* ---------- nhãn có màu ---------- */
  function tagClass(colorSrc, tag) { return 'tc-' + SDT.tagColor(colorSrc, tag); }

  function TagInput(opts) {
    const prefix = opts.prefix || 'bm';
    const colorSrc = () => (opts.colorSrc ? opts.colorSrc() : null);
    let tags = SDT.normalizeTags(opts.tags || []);
    const chips = h('span', { class: 'chips' });
    const input = h('input', {
      type: 'text', class: 'tag-entry', 'data-test': prefix + '-tags-input',
      placeholder: 'Thêm nhãn…', autocomplete: 'off', enterkeyhint: 'enter', 'aria-label': 'Nhãn',
    });
    const box = h('div', { class: 'tagbox', onclick: e => { if (e.target === box || e.target === chips) input.focus(); } }, chips, input);
    const sugg = h('div', { class: 'suggest', 'data-test': prefix + '-tag-suggest', hidden: true });
    const wrap = h('div', { class: 'tag-input' }, box, sugg);
    function render() {
      chips.textContent = '';
      for (const t of tags) {
        chips.append(h('span', { class: 'chip tag ' + tagClass(colorSrc(), t), 'data-test': 'tag-chip', 'data-tag': t },
          h('span', { class: 'chip-t' }, t),
          h('button', {
            type: 'button', class: 'chip-x', 'aria-label': 'Bỏ nhãn ' + t, 'data-test': 'tag-chip-remove',
            onclick: () => { tags = tags.filter(x => x !== t); render(); renderSuggest(); opts.onChange && opts.onChange(); },
          }, '×')));
      }
      input.placeholder = tags.length ? 'Thêm nhãn…' : 'Thêm nhãn, cách nhau bằng dấu phẩy';
    }
    function commit(text) {
      const add = SDT.parseTags(text);
      if (!add.length) return false;
      const before = tags.length;
      tags = SDT.normalizeTags(tags.concat(add));
      render();
      if (tags.length !== before && opts.onChange) opts.onChange();
      return true;
    }
    function renderSuggest() {
      const q = SDT.fold(input.value.split(',').pop().trim());
      const have = new Set(tags.map(t => t.toLowerCase()));
      const all = (opts.getAll ? opts.getAll() : []).filter(t => !have.has(t.toLowerCase()));
      const list = q ? all.filter(t => SDT.fold(t).includes(q)).sort((a, b) => (SDT.fold(a).startsWith(q) ? 0 : 1) - (SDT.fold(b).startsWith(q) ? 0 : 1)) : [];
      sugg.textContent = '';
      for (const t of list.slice(0, 8)) {
        sugg.append(h('button', {
          type: 'button', class: 'sug tag ' + tagClass(colorSrc(), t), 'data-test': 'tag-suggestion', 'data-tag': t,
          onmousedown: e => e.preventDefault(),
          onclick: () => { const parts = input.value.split(','); parts.pop(); commit(parts.join(',')); commit(t); input.value = ''; renderSuggest(); input.focus(); },
        }, t));
      }
      sugg.hidden = !sugg.childElementCount;
    }
    input.addEventListener('keydown', e => {
      if (e.key === 'Enter') {
        if (input.value.trim()) { e.preventDefault(); commit(input.value); input.value = ''; renderSuggest(); }
      } else if (e.key === 'Backspace' && !input.value && tags.length) {
        tags = tags.slice(0, -1); render(); opts.onChange && opts.onChange();
      }
    });
    input.addEventListener('input', () => {
      if (input.value.includes(',')) {
        const parts = input.value.split(',');
        const last = parts.pop();
        commit(parts.join(','));
        input.value = last.replace(/^\s+/, '');
      }
      renderSuggest();
    });
    input.addEventListener('blur', () => { setTimeout(() => { if (activeIn(input) !== input) { if (input.value.trim()) { commit(input.value); input.value = ''; } sugg.hidden = true; } }, 120); });
    render();
    return {
      el: wrap, input,
      get() { return SDT.normalizeTags(tags.concat(SDT.parseTags(input.value))); },
      set(t) { tags = SDT.normalizeTags(t); input.value = ''; render(); renderSuggest(); },
      refresh: render,
    };
  }

  /* ---------- hộp thoại ---------- */
  function openDialog(opts) {
    return new Promise(resolve => {
      const errorEl = h('p', { class: 'form-error', 'data-test': 'dlg-error', role: 'alert', hidden: true });
      const actions = h('div', { class: 'dlg-actions' });
      const body = h('div', { class: 'dlg-body' });
      if (opts.message) body.append(h('p', { class: 'dlg-msg', 'data-test': 'dlg-message' }, opts.message));
      if (opts.body) body.append(opts.body);
      const closeBtn = h('button', { type: 'button', class: 'icon-btn dlg-close', 'aria-label': 'Đóng', 'data-test': 'dlg-close', onclick: () => finish(null) }, icon('close'));
      const dlg = h('dialog', {
        class: 'dlg' + (opts.sheet ? ' sheet' : '') + (opts.wide ? ' wide' : '') + (opts.cls ? ' ' + opts.cls : ''),
        'data-test': opts.test || 'dialog', 'aria-label': opts.title || '',
      },
        opts.sheet ? h('div', { class: 'grab', 'aria-hidden': 'true' }) : null,
        opts.title !== null ? h('div', { class: 'dlg-head' }, h('h2', { class: 'dlg-title' }, opts.title || ''), closeBtn) : null,
        body, errorEl, (opts.actions && opts.actions.length) || opts.footer ? actions : null);
      let done = false;
      function finish(v) {
        if (done) return;
        done = true;
        try { dlg.close(); } catch (e) { /* đã đóng */ }
        // Thông báo đang hiện trong hộp này (có thể kèm Hoàn tác): chuyển ra ngoài thay vì mất theo hộp.
        const t = dlg.querySelector('#toast');
        if (t) {
          const rest = [...rootNode().querySelectorAll('dialog[open]')].filter(d => d !== dlg);
          (rest.length ? rest[rest.length - 1] : hostEl()).append(t);
        }
        dlg.remove();
        if (opts.onClose) opts.onClose(v);
        resolve(v);
      }
      const api = { el: dlg, body, close: finish, error(msg) { errorEl.textContent = msg || ''; errorEl.hidden = !msg; } };
      async function run(value) {
        api.error('');
        if (opts.onAction) {
          const r = await opts.onAction(value, api);
          if (typeof r === 'string' && r) { api.error(r); return; }
          if (r === false) return;
        }
        finish(value);
      }
      api.run = run;
      if (opts.footer) actions.append(opts.footer(api));
      for (const a of (opts.actions || [])) {
        actions.append(h('button', {
          type: 'button', class: 'btn ' + (a.kind || 'quiet') + (a.cls ? ' ' + a.cls : ''), 'data-test': a.test || 'dlg-action', 'data-value': a.value,
          onclick: () => (a.value === null ? finish(null) : run(a.value)),
        }, a.label));
      }
      dlg.addEventListener('cancel', e => { e.preventDefault(); finish(null); });
      dlg.addEventListener('click', e => { if (e.target === dlg) finish(null); });
      dlg.addEventListener('keydown', e => {
        if (e.key === 'Enter' && opts.enterValue !== undefined && e.target.tagName === 'INPUT' && !e.target.classList.contains('tag-entry')) { e.preventDefault(); run(opts.enterValue); }
      });
      hostEl().append(dlg);
      dlg.showModal();
      if (opts.position) {
        // Menu cạnh con trỏ (máy tính).
        const r = dlg.getBoundingClientRect();
        const x = Math.min(opts.position.x, window.innerWidth - r.width - 8);
        const y = Math.min(opts.position.y, window.innerHeight - r.height - 8);
        dlg.style.cssText = 'margin:0;position:fixed;left:' + Math.max(8, x) + 'px;top:' + Math.max(8, y) + 'px;';
      }
      const f = dlg.querySelector('[autofocus]') || (opts.noFocus ? null : dlg.querySelector('.dlg-body input:not([type=checkbox]):not([type=radio]), .dlg-body textarea'));
      if (f && !coarse()) f.focus();
      else if (!opts.position) { const last = actions.lastElementChild; if (last && !coarse()) last.focus(); }
      if (opts.onOpen) opts.onOpen(api);
    });
  }
  function confirmDialog(o) {
    return openDialog({
      title: o.title, message: o.message, test: o.test || 'dlg-confirm', body: o.body,
      actions: [{ label: o.cancelText || 'Hủy', value: null, test: 'dlg-cancel' }, { label: o.okText || 'Đồng ý', value: 'ok', kind: o.danger ? 'danger' : 'primary', test: 'dlg-ok' }],
    }).then(v => v === 'ok');
  }
  function promptDialog(o) {
    const input = h('input', { type: 'text', 'data-test': 'dlg-input', value: o.value || '', maxlength: o.maxlength || '100', autocomplete: 'off', autofocus: true, 'aria-label': o.label || o.title });
    let result = null;
    return openDialog({
      title: o.title, test: o.test || 'dlg-prompt', enterValue: 'ok',
      body: h('label', { class: 'field' }, h('span', { class: 'lab' }, o.label || ''), input),
      actions: [{ label: 'Hủy', value: null, test: 'dlg-cancel' }, { label: o.okText || 'Lưu', value: 'ok', kind: 'primary', test: 'dlg-ok' }],
      onAction: async () => { const err = o.validate ? await o.validate(input.value) : null; if (err) return err; result = input.value; return true; },
      onOpen: () => { input.select(); },
    }).then(v => (v === 'ok' ? result : null));
  }

  /* ---------- menu ngữ cảnh ---------- */
  // items: [{label, icon, test, onSelect, danger, disabled} | 'sep']; at: {x, y} để hiện cạnh chuột (máy tính).
  function contextMenu(items, at, title) {
    const useAt = at && !coarse() && window.innerWidth > 640;
    let chosen = null;
    return openDialog({
      title: useAt ? null : (title || null), test: 'ctx-menu', cls: 'cmenu' + (useAt ? ' at' : ''), sheet: !useAt, position: useAt ? at : null, noFocus: true,
      onOpen: api => {
        const list = h('div', { class: 'menu', role: 'menu' });
        for (const it of items) {
          if (!it) continue;
          if (it === 'sep') { list.append(h('div', { class: 'menu-sep', role: 'separator' })); continue; }
          list.append(h('button', {
            type: 'button', role: 'menuitem', class: 'menu-item' + (it.danger ? ' danger-text' : ''), 'data-test': it.test, disabled: !!it.disabled,
            onclick: () => { chosen = it; api.close(null); },
          }, icon(it.icon || 'chevron'), h('span', {}, it.label), it.hint ? h('span', { class: 'menu-hint' }, it.hint) : null));
        }
        api.body.append(list);
        const first = list.querySelector('button:not([disabled])');
        if (first && useAt) first.focus();
      },
    }).then(() => { if (chosen && chosen.onSelect) chosen.onSelect(); });
  }

  /* ---------- chọn thư mục bằng cây ---------- */
  // opts: { data, selected, disabled:Set, title, okText, onCreate(name, parentId) → Promise<{ok, data, folder, error}> }
  // Kết quả: { id } (id null = gốc) hoặc null khi hủy.
  function pickFolder(opts) {
    let data = opts.data;
    let selected = opts.selected || null;
    const disabled = opts.disabled || new Set();
    const expanded = new Set(SDT.folderChain(data, selected).map(f => f.id));
    const tree = h('div', { class: 'ptree', role: 'tree' });
    const filter = h('input', { type: 'search', class: 'pfilter', 'data-test': 'pick-filter', placeholder: 'Lọc thư mục theo tên', 'aria-label': 'Lọc thư mục', autocomplete: 'off' });
    const pathEl = h('p', { class: 'ppath', 'data-test': 'pick-path' });
    function draw() {
      tree.textContent = '';
      pathEl.textContent = 'Đang chọn: ' + SDT.folderLabel(data, selected);
      const q = SDT.fold(filter.value.trim());
      const node = (id, name, depth, kids, isOpen) => {
        const off = id && disabled.has(id);
        return h('div', { class: 'pnode' + (selected === id ? ' sel' : '') + (off ? ' off' : ''), style: '--depth:' + depth, role: 'treeitem', 'aria-selected': String(selected === id) },
          kids ? h('button', { type: 'button', class: 'caret' + (isOpen ? ' open' : ''), 'data-test': 'pick-caret', 'data-id': id || '', 'aria-label': isOpen ? 'Thu gọn' : 'Mở',
            onclick: () => { isOpen ? expanded.delete(id) : expanded.add(id); draw(); } }, icon('chevron')) : h('span', { class: 'caret-sp' }),
          h('button', { type: 'button', class: 'pname', 'data-test': 'pick-node', 'data-id': id || '', disabled: !!off,
            onclick: () => { selected = id; draw(); } }, icon(id ? 'folder' : 'bm', 'pico'), h('span', {}, name)));
      };
      if (q) {
        const hits = data.folders.filter(f => SDT.fold(f.name).includes(q)).slice(0, 200);
        for (const f of hits) {
          const el = node(f.id, SDT.folderLabel(data, f.id), 0, false, false);
          tree.append(el);
        }
        if (!hits.length) tree.append(h('p', { class: 'muted pempty' }, 'Không có thư mục nào khớp.'));
        return;
      }
      const cmap = SDT.childMap(data);
      for (const v of cmap.values()) v.sort((a, b) => SDT.byOrder(a, b));
      tree.append(node(null, SDT.ROOT_NAME, 0, false, true));
      const walk = (pid, depth) => {
        for (const f of (cmap.get(pid) || [])) {
          const kids = (cmap.get(f.id) || []).length > 0;
          const open = expanded.has(f.id);
          tree.append(node(f.id, f.name, depth, kids, open));
          if (kids && open) walk(f.id, depth + 1);
        }
      };
      walk(null, 1);
    }
    filter.addEventListener('input', draw);
    const body = h('div', { class: 'pick' }, data.folders.length > 12 ? filter : null, tree, pathEl);
    let result = null;
    return openDialog({
      title: opts.title || 'Chọn thư mục', test: 'dlg-picker', sheet: true, body, noFocus: true,
      footer: api => h('div', { class: 'pfoot' },
        h('button', { type: 'button', class: 'btn quiet', 'data-test': 'pick-new', onclick: async () => {
          if (!opts.onCreate) return;
          const parent = selected && !disabled.has(selected) ? selected : null;
          const name = await promptDialog({
            title: 'Thư mục mới trong “' + SDT.folderLabel(data, parent) + '”', label: 'Tên thư mục', okText: 'Tạo thư mục', test: 'dlg-folder-name',
            validate: v => { const r = SDT.validateFolderName(data, v, parent, null); return r.ok ? null : r.error; },
          });
          if (name === null) return;
          const r = await opts.onCreate(name, parent);
          if (!r || !r.ok) { api.error(r && r.error ? r.error : 'Không tạo được thư mục.'); return; }
          data = r.data; selected = r.folder.id; if (parent) expanded.add(parent);
          filter.value = '';
          draw();
        } }, icon('folderPlus'), 'Thư mục mới'),
        h('span', { class: 'grow' }),
        h('button', { type: 'button', class: 'btn quiet', 'data-test': 'pick-cancel', onclick: () => api.close(null) }, 'Hủy'),
        h('button', { type: 'button', class: 'btn primary', 'data-test': 'pick-ok', onclick: () => {
          if (selected && disabled.has(selected)) { api.error('Không chuyển vào thư mục này được.'); return; }
          result = { id: selected, data }; api.close('ok');
        } }, opts.okText || 'Chọn')),
      onOpen: () => { draw(); const s = tree.querySelector('.pnode.sel'); if (s && s.scrollIntoView) s.scrollIntoView({ block: 'nearest' }); },
    }).then(() => result);
  }

  /* ---------- biểu mẫu dấu trang ---------- */
  // opts: { prefix, getData, values, onChange, onCreateFolder(name, parentId) → Promise<{ok,data,folder}> }
  function BookmarkForm(opts) {
    const p = opts.prefix || 'bm';
    const getData = opts.getData;
    let folderId = (opts.values && opts.values.folderId) || null;
    const title = h('input', { type: 'text', 'data-test': p + '-title', id: p + '-title', maxlength: '500', autocomplete: 'off', placeholder: 'Để trống thì dùng địa chỉ làm tên' });
    const url = h('input', { type: 'url', 'data-test': p + '-url', id: p + '-url', autocomplete: 'off', inputmode: 'url', placeholder: 'https://…', spellcheck: 'false' });
    const folderLabel = h('span', { class: 'fsel-t', 'data-test': p + '-folder-label' });
    const folderBtn = h('button', { type: 'button', class: 'fsel', 'data-test': p + '-folder', 'aria-haspopup': 'dialog',
      onclick: async () => {
        const r = await pickFolder({ data: getData(), selected: folderId, onCreate: opts.onCreateFolder });
        if (r) { folderId = r.id; drawFolder(); opts.onChange && opts.onChange(); }
      } }, icon('folder', 'fsel-ic'), folderLabel, icon('down', 'fsel-dn'));
    const tags = TagInput({ prefix: p, getAll: () => (opts.getTags ? opts.getTags() : SDT.tagCounts(getData()).map(t => t.tag)), colorSrc: getData, onChange: opts.onChange });
    const error = h('p', { class: 'form-error', 'data-test': p + '-error', role: 'alert', hidden: true });
    function drawFolder() { const d = getData(); if (folderId && !SDT.getFolder(d, folderId)) folderId = null; folderLabel.textContent = SDT.folderLabel(d, folderId); }
    const el = h('div', { class: 'form' },
      h('label', { class: 'field' }, h('span', { class: 'lab' }, 'Tên'), title),
      h('label', { class: 'field' }, h('span', { class: 'lab' }, 'Địa chỉ'), url),
      h('div', { class: 'field' }, h('span', { class: 'lab' }, 'Thư mục'), folderBtn),
      h('div', { class: 'field' }, h('span', { class: 'lab' }, 'Nhãn'), tags.el),
      error);
    function set(v) { title.value = v.title || ''; url.value = v.url || ''; folderId = v.folderId || null; drawFolder(); tags.set(v.tags || []); }
    set(opts.values || {});
    return {
      el, set, tags, fields: { title, url, folder: folderBtn },
      get() { return { title: title.value, url: url.value, folderId, tags: tags.get() }; },
      showError(msg) { error.textContent = msg || ''; error.hidden = !msg; },
      refreshFolders: drawFolder,
    };
  }

  /* ---------- thông báo ngắn ---------- */
  let toastTimer = null;
  function toast(msg, o) {
    o = o || {};
    let el = rootNode().getElementById('toast');
    if (!el) el = h('div', { id: 'toast', class: 'toast', role: 'status', 'aria-live': 'polite', 'data-test': 'toast' });
    const dlgs = rootNode().querySelectorAll('dialog[open]');
    const host = dlgs.length ? dlgs[dlgs.length - 1] : hostEl();
    if (el.parentNode !== host) host.append(el);
    el.textContent = '';
    el.append(h('span', { class: 'toast-msg', 'data-test': 'toast-msg' }, msg));
    if (o.action) el.append(h('button', { type: 'button', class: 'toast-act', 'data-test': 'toast-action', onclick: () => { hide(); o.onAction && o.onAction(); } }, o.action));
    el.classList.toggle('error', !!o.error);
    el.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(hide, o.duration || (o.action ? 6000 : 2600));
    function hide() { el.classList.remove('show'); clearTimeout(toastTimer); }
    return hide;
  }
  async function copyText(text) {
    if (CFG.copy) { try { if (CFG.copy(text) !== false) return true; } catch (e) { /* thử cách khác */ } }
    try { await navigator.clipboard.writeText(text); return true; } catch (e) {
      const ta = h('textarea', { style: 'position:fixed;opacity:0' }, text);
      hostEl().append(ta); ta.select();
      let ok = false;
      try { ok = document.execCommand('copy'); } catch (e2) { ok = false; }
      ta.remove();
      return ok;
    }
  }
  let favBase = null;
  function faviconUrl(pageUrl) {
    if (CFG.favicon === false) return '';
    if (favBase === null) {
      favBase = '';
      try {
        if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.getManifest && chrome.runtime.getManifest().permissions.includes('favicon')) favBase = chrome.runtime.getURL('/_favicon/?size=32&pageUrl=');
      } catch (e) { /* bỏ qua */ }
    }
    return favBase ? favBase + encodeURIComponent(pageUrl) : '';
  }

  root.SDTUI = { config, activeIn, coarse, h, svg, icon, ribbonSvg, tagClass, TagInput, BookmarkForm, pickFolder, openDialog, confirmDialog, promptDialog, contextMenu, toast, copyText, faviconUrl };
})(typeof globalThis !== 'undefined' ? globalThis : this);
