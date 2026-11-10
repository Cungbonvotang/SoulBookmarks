# python3 tests/ui_test.py — nghiệm thu giao diện bản tiện ích 2.0 (Chromium nạp tiện ích)
import json, os, sys, tempfile, threading, time, datetime, functools, http.server, socketserver, copy
from playwright.sync_api import sync_playwright
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from seed import sample, ms

ROOT = os.path.dirname(os.path.abspath(__file__))
EXT = os.path.join(os.path.dirname(ROOT), 'ext')
SITE = os.path.join(ROOT, 'site')
OUT = os.path.join(ROOT, 'out'); os.makedirs(OUT, exist_ok=True)
PORT = 8765
BASE = f'http://localhost:{PORT}'
VN = datetime.timezone(datetime.timedelta(hours=7))

http.server.SimpleHTTPRequestHandler.log_message = lambda *a, **k: None
class Q(socketserver.ThreadingMixIn, socketserver.TCPServer): allow_reuse_address = True; daemon_threads = True
srv = Q(('127.0.0.1', PORT), functools.partial(http.server.SimpleHTTPRequestHandler, directory=SITE))
threading.Thread(target=srv.serve_forever, daemon=True).start()

kq, notes, errs = {}, {}, []
def ok(name, cond, info=''):
    kq[name] = bool(cond)
    if info != '' or not cond: notes[name] = str(info)[:400]
    print(('QUA   ' if cond else 'TRƯỢT ') + name + ('' if cond else '  ← ' + str(info)[:400]), flush=True)

def launch(p, profile, w=390):
    ctx = p.chromium.launch_persistent_context(profile, headless=True, channel='chromium',
        args=[f'--disable-extensions-except={EXT}', f'--load-extension={EXT}'],
        viewport={'width': w, 'height': 844}, has_touch=True, timezone_id='Asia/Ho_Chi_Minh', locale='vi-VN',
        accept_downloads=True, permissions=['clipboard-read', 'clipboard-write'])
    sw = ctx.service_workers[0] if ctx.service_workers else ctx.wait_for_event('serviceworker', timeout=15000)
    return ctx, sw.url.split('/')[2]

def watch(pg, tag):
    pg.on('pageerror', lambda e: errs.append(f'{tag}: {e}'))
    pg.on('console', lambda m: m.type == 'error' and 'Failed to load resource' not in m.text and errs.append(f'{tag}: {m.text}'))
    return pg

def T(pg, t): return pg.locator(f'[data-test="{t}"]')
def W(pg, n=250): pg.wait_for_timeout(n)

class Probe:
    def __init__(self, ctx, eid):
        self.pg = watch(ctx.new_page(), 'probe')
        self.pg.goto(f'chrome-extension://{eid}/popup.html?tabId=-5')
        self.pg.wait_for_function("typeof SDTStore !== 'undefined'")
    def data(self): return self.pg.evaluate("async () => { const r = await SDTStore.loadAll(); return r.ok ? r.data : { error: r.error }; }")
    def raw(self, keys=None): return self.pg.evaluate("async k => chrome.storage.local.get(k)", keys)
    def setraw(self, obj): self.pg.evaluate("async o => chrome.storage.local.set(o)", obj)
    def clear(self): self.pg.evaluate("async () => chrome.storage.local.clear()")
    def seed(self, d): self.pg.evaluate("async d => { const v = SDT.validateData(d); if (!v.ok) throw new Error(v.error); await SDTStore.replaceAll(v.data); }", d)
    def tab_id(self, url): return self.pg.evaluate("async u => { const t = (await chrome.tabs.query({})).find(t => t.url === u); return t ? t.id : null }", url)
    def badge(self, url, want=None, wait=4.0):
        end = time.time() + wait
        while True:
            tid = self.tab_id(url)
            b = self.pg.evaluate("async id => id == null ? null : chrome.action.getBadgeText({tabId: id})", tid)
            if want is None or b == want or time.time() > end: return b
            time.sleep(0.2)
    def auto_color(self, tag): return self.pg.evaluate("t => SDT.autoTagColor(t)", tag)

def bm(d, title): return next((b for b in (d or {}).get('bookmarks', []) if b['title'] == title), None)
def bid(d, i): return next((b for b in (d or {}).get('bookmarks', []) if b['id'] == i), None)
def fold(d, name): return next((f for f in (d or {}).get('folders', []) if f['name'] == name), None)

def open_manager(ctx, eid, w=390):
    pg = watch(ctx.new_page(), 'manager')
    pg.set_viewport_size({'width': w, 'height': 844})
    pg.goto(f'chrome-extension://{eid}/manager.html')
    pg.wait_for_selector('body.ready')
    return pg
def open_popup(ctx, eid, tid):
    pg = watch(ctx.new_page(), 'popup')
    pg.goto(f'chrome-extension://{eid}/popup.html?tabId={tid}')
    pg.wait_for_selector('[data-test="popup-status"]'); W(pg, 150)
    return pg
def ro(pg):
    """Điện thoại (2.7.0): bật "Sắp xếp lại" để tay nắm hiện ra."""
    b = pg.locator('[data-test="btn-reorder"]')
    if b.count() and b.is_visible() and b.get_attribute('aria-pressed') != 'true':
        b.click(); pg.wait_for_timeout(200)


def is_drawer_open(pg): return pg.evaluate("document.body.classList.contains('drawer-open')")
def drawer(pg):
    if T(pg, 'btn-drawer').is_visible() and not is_drawer_open(pg): T(pg, 'btn-drawer').click(); W(pg, 250)
def close_drawer(pg):
    if is_drawer_open(pg): T(pg, 'drawer-scrim').click(position={'x': 370, 'y': 400}); W(pg, 250)
def go_root(pg): drawer(pg); T(pg, 'folder-root').click(); W(pg, 200)
def go_all(pg): drawer(pg); T(pg, 'folder-all').click(); W(pg, 200)
def open_list_folder(pg, fid): pg.locator(f'[data-test="list-folder"][data-id="{fid}"] [data-test="folder-row-name"]').click(); W(pg, 200)
def go_path(pg, ids):
    go_root(pg)
    for i in ids: open_list_folder(pg, i)
def prompt(pg, v): T(pg, 'dlg-input').fill(v); T(pg, 'dlg-ok').click(); W(pg)
def item(pg, title): return pg.locator('[data-test="list-item"]', has=pg.locator('[data-test="item-title"]', has_text=title)).first
def item_id(pg, i): return pg.locator(f'[data-test="list-item"][data-id="{i}"]')
def row_menu(pg, row, action): row.locator('[data-test="row-menu"]').click(); W(pg, 150); T(pg, action).click(); W(pg)
def titles(pg): return T(pg, 'item-title').all_inner_texts()
def ids(pg, kind='list-item'): return [e.get_attribute('data-id') for e in T(pg, kind).all()]
def toast(pg): return T(pg, 'toast-msg').last.inner_text() if T(pg, 'toast-msg').count() else ''
def search(pg, t): T(pg, 'search-input').fill(t); W(pg, 350)
def filt(pg, **o):
    T(pg, 'btn-filter').click(); W(pg, 150)
    if o.get('reset'): T(pg, 'filter-reset').click(); W(pg); return
    if 'title' in o: T(pg, 'filter-title').fill(o['title'])
    if 'url' in o: T(pg, 'filter-url').fill(o['url'])
    if 'tags' in o:
        for el in T(pg, 'filter-tag').all():
            want = el.get_attribute('data-tag') in o['tags']
            if el.is_checked() != want: el.set_checked(want, force=True)
    if 'datefield' in o: T(pg, 'filter-datefield').select_option(o['datefield'])
    if 'mode' in o: T(pg, f'filter-datemode-{o["mode"]}').check(force=True)
    if 'date' in o: T(pg, 'filter-date').fill(o['date'])
    if 'month' in o: T(pg, 'filter-month').fill(o['month'])
    if 'from_' in o: T(pg, 'filter-from').fill(o['from_'])
    if 'to' in o: T(pg, 'filter-to').fill(o['to'])
    if 'scope' in o: T(pg, f'filter-scope-{o["scope"]}').check(force=True)
    T(pg, 'filter-apply').click(); W(pg, 300)
def clear_all(pg):
    if T(pg, 'btn-clear-filter-inline').count(): T(pg, 'btn-clear-filter-inline').click(); W(pg)
    search(pg, '')
def drag(pg, handle, x, y, steps=12, hold=0):
    b = handle.bounding_box()
    pg.mouse.move(b['x'] + b['width'] / 2, b['y'] + b['height'] / 2); pg.mouse.down()
    pg.mouse.move(x, y, steps=steps)
    if hold: W(pg, hold)
    pg.mouse.up(); W(pg, 350)
def pick_expand(pg):
    for _ in range(6):
        closed = [c for c in T(pg, 'pick-caret').all() if c.get_attribute('aria-label') == 'Mở']
        if not closed: break
        closed[0].click(); W(pg, 60)
def pick(pg, fid):
    if not pg.locator(f'[data-test="pick-node"][data-id="{fid}"]').count(): pick_expand(pg)
    pg.locator(f'[data-test="pick-node"][data-id="{fid}"]').click(); W(pg, 80)
def expand(pg, fid):
    drawer(pg)
    row = pg.locator(f'[data-test="folder-item"][data-id="{fid}"]')
    if row.get_attribute('aria-expanded') == 'false': row.locator('[data-test="folder-caret"]').click(); W(pg, 120)
def no_hscroll(pg): return pg.evaluate("document.documentElement.scrollWidth <= innerWidth")
def cls(loc): return loc.get_attribute('class') or ''

with sync_playwright() as p:
    prof = tempfile.mkdtemp()
    ctx, eid = launch(p, prof)
    pr = Probe(ctx, eid)
    M = open_manager(ctx, eid)

    # ================= Thư mục (kho trống) =================
    drawer(M); T(M, 'folder-add').click(); prompt(M, 'Công việc')
    d = pr.data(); cv = fold(d, 'Công việc')['id']
    go_root(M)
    in_list = M.locator(f'[data-test="list-folder"][data-id="{cv}"]').count() == 1
    open_list_folder(M, cv)
    ok('CT-01 tạo thư mục, vào thư mục', in_list and T(M, 'view-title').inner_text() == 'Công việc')
    n0 = len(pr.data()['folders'])
    drawer(M); T(M, 'folder-add').click(); T(M, 'dlg-input').fill(''); T(M, 'dlg-ok').click(); e1 = T(M, 'dlg-error').is_visible()
    T(M, 'dlg-input').fill('   '); T(M, 'dlg-ok').click(); e2 = T(M, 'dlg-error').is_visible(); T(M, 'dlg-cancel').click()
    ok('CT-03 tên rỗng', e1 and e2 and len(pr.data()['folders']) == n0)
    close_drawer(M)
    T(M, 'btn-more').click(); T(M, 'menu-folder').click(); prompt(M, 'Dự án')
    d = pr.data(); da = fold(d, 'Dự án')['id']
    first_row = T(M, 'list-folder').first.get_attribute('data-id')
    expand(M, cv)
    depth = M.locator(f'[data-test="folder-item"][data-id="{da}"]').get_attribute('style') or ''
    ok('CT-02 thư mục con đứng đầu danh sách, lồng trên cây', fold(d, 'Dự án')['parentId'] == cv and first_row == da and depth.replace(' ', '').startswith('--depth:1'), [first_row, depth])
    T(M, 'folder-add').click(); T(M, 'dlg-input').fill('công việc'); T(M, 'dlg-ok').click(); dup_err = T(M, 'dlg-error').inner_text() if T(M, 'dlg-error').is_visible() else ''; T(M, 'dlg-cancel').click()
    close_drawer(M)
    row_menu(M, M.locator(f'[data-test="list-folder"][data-id="{da}"]'), 'm-newsub'); prompt(M, 'Công việc')
    inner = next(f for f in pr.data()['folders'] if f['parentId'] == da)
    ok('CT-04 trùng cùng cha / khác cha', 'Đã có' in dup_err and inner['name'] == 'Công việc', dup_err)
    open_list_folder(M, da)
    row_menu(M, M.locator(f'[data-test="list-folder"][data-id="{inner["id"]}"]'), 'm-delete'); T(M, 'dlg-ok').click(); W(M)
    # CT-05
    go_root(M)
    row_menu(M, M.locator(f'[data-test="list-folder"][data-id="{cv}"]'), 'm-move')
    pick_expand(M)
    dis_self = M.locator(f'[data-test="pick-node"][data-id="{cv}"]').is_disabled()
    dis_child = M.locator(f'[data-test="pick-node"][data-id="{da}"]').is_disabled()
    T(M, 'pick-cancel').click(); W(M)
    open_list_folder(M, cv)
    row_menu(M, M.locator(f'[data-test="list-folder"][data-id="{da}"]'), 'm-move'); pick(M, ''); T(M, 'pick-ok').click(); W(M)
    to_root = pr.data()
    ok('CT-05 chuyển thư mục bằng cây', dis_self and dis_child and next(f for f in to_root['folders'] if f['id'] == da)['parentId'] is None, [dis_self, dis_child])
    go_root(M)
    row_menu(M, M.locator(f'[data-test="list-folder"][data-id="{da}"]'), 'm-move'); pick(M, cv); T(M, 'pick-ok').click(); W(M)
    T(M, 'toast-msg').count()
    # CT-06
    row_menu(M, M.locator(f'[data-test="list-folder"][data-id="{cv}"]'), 'm-rename'); prompt(M, 'Việc làm')
    renamed = fold(pr.data(), 'Việc làm') is not None and M.locator(f'[data-test="list-folder"][data-id="{cv}"] [data-test="folder-row-name"]').inner_text() == 'Việc làm'
    row_menu(M, M.locator(f'[data-test="list-folder"][data-id="{cv}"]'), 'm-rename'); prompt(M, 'Công việc')
    ok('CT-06 đổi tên', renamed and fold(pr.data(), 'Công việc') is not None)
    drawer(M)
    ok('CT-08 gốc không có nút xóa/đổi tên', T(M, 'folder-root').count() == 1 and M.locator('.trow:has([data-test="folder-root"]) [data-test="folder-menu"]').count() == 0
       and T(M, 'folder-menu').count() == T(M, 'folder-item').count())
    close_drawer(M)

    # ================= Popup =================
    A = ctx.new_page(); A.goto(f'{BASE}/trang-thu.html'); a_url = A.url; a_tid = pr.tab_id(a_url)
    P = open_popup(ctx, eid, a_tid)
    st0 = T(P, 'popup-status').inner_text(); pre = (T(P, 'popup-title').input_value(), T(P, 'popup-url').input_value())
    T(P, 'popup-folder').click(); W(P, 150); pick(P, cv); T(P, 'pick-ok').click(); W(P, 150)
    folder_label = T(P, 'popup-folder-label').inner_text()
    T(P, 'popup-tags-input').press_sequentially('a, B ,b , a, github')
    T(P, 'popup-save').click(); W(P, 400)
    d = pr.data(); b6 = bm(d, 'Trang Thử')
    ok('CT-09 lưu từ popup', st0 == 'Chưa lưu' and pre == ('Trang Thử', a_url) and folder_label == 'Công việc' and T(P, 'popup-status').inner_text() == 'Đã lưu'
       and b6 and b6['folderId'] == cv and b6['createdAt'] == b6['updatedAt'], [st0, pre, folder_label, b6])
    ok('CT-10 nhãn tách/gộp', b6 and b6['tags'] == ['a', 'B', 'github'], b6 and b6['tags'])
    ok('CT-09 huy hiệu sau lưu', pr.badge(a_url, '✓') == '✓')
    P.close()
    P = open_popup(ctx, eid, a_tid)
    today = datetime.datetime.now(VN).strftime('%d/%m/%Y')
    det = T(P, 'popup-status-detail').inner_text()
    ok('CT-22 popup trang đã lưu', T(P, 'popup-status').inner_text() == 'Đã lưu' and 'Công việc' in det and today in det and T(P, 'popup-delete').count() == 1 and T(P, 'popup-save').inner_text() == 'Cập nhật', det)
    T(P, 'popup-delete').click(); W(P, 400)
    gone = T(P, 'popup-status').inner_text() == 'Chưa lưu' and pr.badge(a_url, '') == ''
    T(P, 'toast-action').click(); W(P, 500)
    back = bm(pr.data(), 'Trang Thử')
    ok('CT-20 xóa trang đang mở → huy hiệu trống', gone)
    ok('CT-18 hoàn tác (popup)', back and back['id'] == b6['id'] and back['createdAt'] == b6['createdAt'] and pr.badge(a_url, '✓') == '✓', back)
    # CT-67 tạo thư mục trong hộp cây, không lưu dấu trang
    T(P, 'popup-folder').click(); W(P, 150); pick(P, cv)
    T(P, 'pick-new').click(); T(P, 'dlg-input').fill('Tạm'); T(P, 'dlg-ok').click(); W(P, 300)
    sel_new = P.locator('.pnode.sel [data-test="pick-node"]').inner_text()
    tam_id = P.locator('.pnode.sel [data-test="pick-node"]').get_attribute('data-id')
    pick(P, cv); T(P, 'pick-new').click(); T(P, 'dlg-input').fill('tạm'); T(P, 'dlg-ok').click(); dup_err2 = any(e.is_visible() for e in T(P, 'dlg-error').all()); T(P, 'dlg-cancel').click()
    pick(P, tam_id); T(P, 'pick-ok').click(); W(P, 150)
    lbl = T(P, 'popup-folder-label').inner_text()
    P.close(); W(M, 300)
    tam = fold(pr.data(), 'Tạm')
    ok('CT-67 cây thư mục: chọn, tạo mới bên trong, giữ dù không lưu', sel_new == 'Tạm' and lbl == 'Công việc › Tạm' and tam and tam['parentId'] == cv and dup_err2, [sel_new, lbl, tam, dup_err2])
    B = ctx.new_page(); B.goto(f'{BASE}/trang-hai.html'); b_tid = pr.tab_id(B.url)
    P = open_popup(ctx, eid, b_tid)
    T(P, 'popup-tags-input').press_sequentially('gi')
    sug = P.locator('[data-test="tag-suggestion"][data-tag="github"]'); had = sug.is_visible()
    if had: sug.click()
    ok('CT-10 gợi ý nhãn', had and P.locator('[data-test="tag-chip"][data-tag="github"]').count() == 1)
    P.close()
    nb = pr.badge(B.url, ''); B.goto(f'{BASE}/trang-thu.html#phan-2')
    ok('CT-21 huy hiệu theo tab', nb == '' and pr.badge(B.url, '✓') == '✓' and pr.badge(a_url) == '✓')
    C = ctx.new_page(); C.goto(f'{BASE}/spa.html'); c0 = pr.badge(C.url, ''); C.click('#go'); W(C, 300)
    ok('CT-24 đổi địa chỉ không tải lại', c0 == '' and pr.badge(C.url, '✓') == '✓')
    X = ctx.new_page(); X.goto('about:blank'); x_tid = pr.pg.evaluate("async () => (await chrome.tabs.query({})).find(t => t.url === 'about:blank').id")
    P = open_popup(ctx, eid, x_tid)
    ok('CT-14 trang nội bộ', T(P, 'popup-unsupported').is_visible() and T(P, 'popup-save').count() == 0)
    P.close(); X.close(); C.close(); B.close()

    # ================= Dữ liệu mẫu =================
    S0 = sample()
    S0['bookmarks'].append(dict(bid(pr.data(), b6['id']), folderId='cv', order=1, tags=[]))
    pr.seed(S0); M.bring_to_front(); W(M, 500)
    go_root(M)
    ok('CT-C2 trình quản lý tự đọc lại khi dữ liệu đổi', ids(M, 'list-folder') == ['cv', 'gt', 'ht'] and ids(M) == ['b9', 'b13'], [ids(M, 'list-folder'), ids(M)])
    # CT-63
    open_list_folder(M, 'gt')
    crumbs = [c.inner_text() for c in T(M, 'crumb').all()]
    t_gt = T(M, 'view-title').inner_text()
    M.locator('[data-test="crumb"][data-id=""]').click(); W(M)
    at_root = T(M, 'view-title').inner_text() == 'Dấu trang'
    T(M, 'btn-more').click(); T(M, 'menu-folder').click(); prompt(M, 'Trống')
    tr = fold(pr.data(), 'Trống')['id']; open_list_folder(M, tr)
    empty_ok = 'Thư mục trống' in T(M, 'empty-state').inner_text() and T(M, 'empty-add-bm').is_visible() and T(M, 'empty-add-folder').is_visible()
    go_all(M)
    flat = T(M, 'list-folder').count() == 0 and T(M, 'list-count').inner_text() == '17 dấu trang'
    ok('CT-63 thư mục như trình duyệt', t_gt == 'Giải trí' and crumbs == ['Dấu trang'] and at_root and empty_ok and flat, [crumbs, t_gt, at_root, empty_ok, T(M, 'list-count').inner_text()])
    # CT-61
    go_path(M, ['gt', 'an', 'co'])
    man = T(M, 'sort-select').input_value() == 'manual' and T(M, 'row-handle').count() > 0
    T(M, 'sort-select').select_option('az'); W(M)
    no_h = T(M, 'row-handle').count() == 0
    T(M, 'sort-select').select_option('manual'); W(M)
    go_all(M)
    flat_def = T(M, 'sort-select').input_value() == 'created' and T(M, 'row-handle').count() == 0
    go_path(M, ['gt', 'an'])
    T(M, 'sort-select').select_option('az'); W(M)
    folders_first = ids(M, 'list-folder') == ['co', 'op'] and M.locator('.group').first.locator('[data-test="list-folder"]').count() == 2
    T(M, 'sort-select').select_option('manual'); W(M)
    ok('CT-61 Tự xếp mặc định trong thư mục, Mới lưu ở Tất cả', man and no_h and flat_def and folders_first, [man, no_h, flat_def, folders_first])
    # CT-34
    open_list_folder(M, 'co')
    orders = {}
    for s in ('manual', 'az', 'za', 'created', 'updated'):
        T(M, 'sort-select').select_option(s); W(M, 150); orders[s] = ids(M)
    T(M, 'sort-select').select_option('manual'); W(M)
    ok('CT-34 sắp xếp', orders['manual'] == ['b1', 'b3', 'b4', 'b5'] and orders['az'] == ['b3', 'b4', 'b5', 'b1'] and orders['za'] == ['b1', 'b5', 'b4', 'b3'] and orders['created'] == ['b5', 'b1', 'b4', 'b3'], orders)
    # CT-64 kéo đổi chỗ
    up_before = bid(pr.data(), 'b4')['updatedAt']
    ro(M)
    first_box = item_id(M, 'b1').bounding_box()
    drag(M, item_id(M, 'b4').locator('[data-test="row-handle"]'), first_box['x'] + 100, first_box['y'] + 6)
    after = ids(M)
    M.reload(); M.wait_for_selector('body.ready'); go_path(M, ['gt', 'an', 'co'])
    after_reload = ids(M)
    keep_time = bid(pr.data(), 'b4')['updatedAt'] == up_before
    go_root(M); ro(M)
    ht_box = M.locator('[data-test="list-folder"][data-id="cv"]').bounding_box()
    drag(M, M.locator('[data-test="list-folder"][data-id="ht"] [data-test="row-handle"]'), ht_box['x'] + 100, ht_box['y'] + 4)
    f_after = ids(M, 'list-folder')
    T(M, 'toast-action').click(); W(M, 400)
    f_undo = ids(M, 'list-folder')
    ok('CT-64 kéo đổi chỗ, giữ sau tải lại, hoàn tác', after == ['b4', 'b1', 'b3', 'b5'] and after_reload == after and keep_time and f_after[:3] == ['ht', 'cv', 'gt'] and f_undo[:3] == ['cv', 'gt', 'ht'],
       [after, after_reload, keep_time, f_after, f_undo])
    # CT-65 thả vào thư mục, chặn thư mục vào con, Esc, tự cuộn
    go_path(M, ['gt', 'an']); ro(M)
    co_box = M.locator('[data-test="list-folder"][data-id="co"]').bounding_box()
    t0 = bid(pr.data(), 'b8')['updatedAt']
    drag(M, item_id(M, 'b8').locator('[data-test="row-handle"]'), co_box['x'] + 120, co_box['y'] + co_box['height'] / 2)
    b8 = bid(pr.data(), 'b8')
    into_ok = b8['folderId'] == 'co' and b8['updatedAt'] > t0
    open_list_folder(M, 'co'); last_is_b8 = ids(M)[-1] == 'b8'
    # Esc
    before = ids(M); ro(M)
    h = item_id(M, before[-1]).locator('[data-test="row-handle"]'); bb = h.bounding_box(); fb = item_id(M, before[0]).bounding_box()
    M.mouse.move(bb['x'] + 10, bb['y'] + 10); M.mouse.down(); M.mouse.move(fb['x'] + 100, fb['y'] + 5, steps=8); M.keyboard.press('Escape'); M.mouse.up(); W(M, 300)
    esc_ok = ids(M) == before
    # thư mục vào con: máy tính, kéo "Công việc" lên "Dự án" ở cây
    M.set_viewport_size({'width': 1280, 'height': 800}); go_root(M)
    expand(M, 'cv')
    da_tree = M.locator('[data-test="folder-item"][data-id="da"]').bounding_box()
    drag(M, M.locator('[data-test="list-folder"][data-id="cv"] [data-test="row-handle"]'), da_tree['x'] + 80, da_tree['y'] + da_tree['height'] / 2)
    blocked = next(f for f in pr.data()['folders'] if f['id'] == 'cv')['parentId'] is None and 'thư mục con' in toast(M)
    # CT-66 thả lên cây
    ht_tree = M.locator('[data-test="folder-item"][data-id="ht"]').bounding_box()
    drag(M, item_id(M, 'b9').locator('[data-test="row-handle"]'), ht_tree['x'] + 80, ht_tree['y'] + ht_tree['height'] / 2)
    ok('CT-66 máy tính: thả lên cây', bid(pr.data(), 'b9')['folderId'] == 'ht', bid(pr.data(), 'b9'))
    T(M, 'toast-action').click(); W(M, 400)
    M.set_viewport_size({'width': 390, 'height': 844}); W(M, 200)
    # tự cuộn
    long = copy.deepcopy(pr.data())
    for i in range(70):
        long['bookmarks'].append({'id': f'L{i}', 'title': f'Dòng dài {i}', 'url': f'https://dai.vn/{i}', 'folderId': 'tr' if False else fold(long, 'Trống')['id'], 'tags': [], 'createdAt': ms(2026, 7, 1) + i, 'updatedAt': ms(2026, 7, 1) + i, 'order': i})
    pr.seed(long); W(M, 600)
    go_root(M); open_list_folder(M, fold(long, 'Trống')['id']); ro(M)
    sc0 = M.evaluate("document.scrollingElement.scrollTop")
    hh = item_id(M, 'L1').locator('[data-test="row-handle"]'); hb = hh.bounding_box()
    M.mouse.move(hb['x'] + 10, hb['y'] + 10); M.mouse.down(); M.mouse.move(hb['x'] + 10, 835, steps=10); W(M, 1200)
    sc1 = M.evaluate("document.scrollingElement.scrollTop")
    M.keyboard.press('Escape'); M.mouse.up(); W(M, 300)
    ok('CT-65 thả vào thư mục, chặn vào con, Esc, tự cuộn', into_ok and last_is_b8 and esc_ok and blocked and sc1 > sc0 + 200, [into_ok, last_is_b8, esc_ok, blocked, sc0, sc1])
    pr.seed(S0); W(M, 600)

    # ================= Cắt / chép / dán =================
    go_root(M)
    row_menu(M, item_id(M, 'b13'), 'm-cut')
    cut_dim = 'cut' in cls(item_id(M, 'b13'))
    open_list_folder(M, 'ht'); T(M, 'btn-paste-here').click(); W(M, 400)
    d = pr.data(); b13 = bid(d, 'b13')
    cut_ok = b13['folderId'] == 'ht' and b13['createdAt'] == ms(2026, 10, 21) and T(M, 'btn-paste-here').count() == 0
    go_root(M); row_menu(M, item_id(M, 'b9'), 'm-copy')
    open_list_folder(M, 'ht'); T(M, 'btn-paste-here').click(); W(M, 400)
    d = pr.data(); copies = [b for b in d['bookmarks'] if b['title'] == 'Du lịch Hà Nội']
    new = [b for b in copies if b['id'] != 'b9']
    copy_ok = len(copies) == 2 and bid(d, 'b9')['folderId'] is None and new and new[0]['folderId'] == 'ht' and abs(new[0]['createdAt'] / 1000 - time.time()) < 60
    # dán sau một dòng
    row_menu(M, item_id(M, 'b16'), 'm-cut')
    row_menu(M, item_id(M, 'b14'), 'm-paste'); W(M)
    after_row = ids(M)[:2] == ['b14', 'b16']
    # chép thư mục cả cây
    go_path(M, ['gt'])
    row_menu(M, M.locator('[data-test="list-folder"][data-id="an"]'), 'm-copy')
    go_root(M); open_list_folder(M, 'ht'); T(M, 'btn-paste-here').click(); W(M, 400)
    d = pr.data()
    an2 = next((f for f in d['folders'] if f['name'] == 'Anime' and f['parentId'] == 'ht'), None)
    kids = [f['name'] for f in d['folders'] if an2 and f['parentId'] == an2['id']]
    deep = an2 and sorted(kids) == ['Conan', 'One Piece'] and len([b for b in d['bookmarks'] if b['folderId'] == an2['id']]) == 3
    # cắt thư mục rồi dán vào con của nó
    go_root(M); row_menu(M, M.locator('[data-test="list-folder"][data-id="cv"]'), 'm-cut')
    open_list_folder(M, 'cv'); open_list_folder(M, 'da'); T(M, 'btn-paste-here').click(); W(M, 300)
    self_err = next(f for f in pr.data()['folders'] if f['id'] == 'cv')['parentId'] is None and 'thư mục con' in toast(M)
    go_all(M)
    no_paste_all = T(M, 'btn-paste-here').count() == 0
    item_id(M, 'b1').locator('[data-test="row-menu"]').click(); W(M, 150); no_paste_menu = T(M, 'm-paste').count() == 0; M.keyboard.press('Escape'); W(M, 150)
    # trùng tên khi dán, hoàn tác
    go_root(M); row_menu(M, M.locator('[data-test="list-folder"][data-id="ht"]'), 'm-copy')
    T(M, 'btn-paste-here').click(); W(M, 400)
    dup_name = fold(pr.data(), 'Học tập (2)') is not None
    T(M, 'toast-action').click(); W(M, 400)
    undo_ok = fold(pr.data(), 'Học tập (2)') is None
    ok('CT-68 cắt / chép / dán', cut_dim and cut_ok and copy_ok and after_row and deep and self_err and no_paste_all and no_paste_menu and dup_name and undo_ok,
       [cut_dim, cut_ok, copy_ok, after_row, deep, self_err, no_paste_all, no_paste_menu, dup_name, undo_ok])
    pr.seed(S0); W(M, 600)

    # CT-69 menu: ⋮, chuột phải, nhấn giữ; chỗ trống; phím tắt
    go_root(M)
    item_id(M, 'b9').click(button='right'); W(M, 150); rc = T(M, 'ctx-menu').is_visible() and T(M, 'm-edit').count() == 1; M.keyboard.press('Escape'); W(M, 150)
    item_id(M, 'b9').dispatch_event('contextmenu', {'bubbles': True, 'cancelable': True, 'clientX': 0, 'clientY': 0}); W(M, 150)
    lp = T(M, 'ctx-menu').is_visible(); M.keyboard.press('Escape'); W(M, 150)
    M.evaluate("document.querySelector('[data-test=list]').dispatchEvent(new MouseEvent('contextmenu', {bubbles: true, cancelable: true, clientX: 10, clientY: 10}))"); W(M, 150)
    bgm = T(M, 'm-newbm').count() == 1 and T(M, 'm-newfolder').count() == 1; M.keyboard.press('Escape'); W(M, 150)
    M.set_viewport_size({'width': 1280, 'height': 800}); W(M, 200)
    T(M, 'btn-select-mode').click(); W(M, 150)
    item_id(M, 'b9').locator('[data-test="item-check"]').check(); item_id(M, 'b13').locator('[data-test="item-check"]').check()
    M.locator('body').press('Control+x'); W(M, 200)
    drawer(M); M.locator('[data-test="folder-item"][data-id="ht"] [data-test="folder-open"]').click(); W(M, 200)
    M.locator('body').press('Control+v'); W(M, 400)
    d = pr.data(); kb_move = bid(d, 'b9')['folderId'] == 'ht' and bid(d, 'b13')['folderId'] == 'ht'
    item_id(M, 'b14').focus(); M.keyboard.press('Delete'); W(M, 400)
    del_ok = bid(pr.data(), 'b14') is None
    T(M, 'toast-action').click(); W(M, 400)
    ok('CT-69 menu ngữ cảnh và phím tắt', rc and lp and bgm and kb_move and del_ok and bid(pr.data(), 'b14') is not None, [rc, lp, bgm, kb_move, del_ok])
    M.set_viewport_size({'width': 390, 'height': 844}); W(M, 200)
    pr.seed(S0); W(M, 600)
    # CT-70 chọn nhiều: thư mục + dấu trang
    go_path(M, ['gt', 'an'])
    T(M, 'btn-select-mode').click(); W(M, 150)
    M.locator('[data-test="list-folder"][data-id="op"] [data-test="item-check"]').check(); item_id(M, 'b2').locator('[data-test="item-check"]').check(); item_id(M, 'b7').locator('[data-test="item-check"]').check()
    T(M, 'bulk-copy').click(); W(M, 200)
    go_root(M); open_list_folder(M, 'ht'); T(M, 'btn-paste-here').click(); W(M, 400)
    d = pr.data()
    three = fold(d, 'One Piece') and len([f for f in d['folders'] if f['name'] == 'One Piece']) == 2 and len([b for b in d['bookmarks'] if b['folderId'] == 'ht' and b['title'] in ('Conan movie 29: lịch chiếu Việt Nam', 'Lịch phát sóng anime mùa thu 2026')]) == 2
    go_path(M, ['gt', 'an']); T(M, 'btn-select-mode').click(); W(M, 150)
    M.locator('[data-test="list-folder"][data-id="op"] [data-test="item-check"]').check(); item_id(M, 'b2').locator('[data-test="item-check"]').check()
    T(M, 'bulk-cut').click(); W(M, 200)
    go_root(M); open_list_folder(M, 'cv'); T(M, 'btn-paste-here').click(); W(M, 400)
    d = pr.data()
    moved = next(f for f in d['folders'] if f['id'] == 'op')['parentId'] == 'cv' and bid(d, 'b2')['folderId'] == 'cv'
    ok('CT-70 chọn nhiều: sao chép và cắt cả thư mục lẫn dấu trang', three and moved, [three, moved])
    pr.seed(S0); W(M, 600)

    # ================= Tìm kiếm =================
    go_root(M)
    search(M, 'ha noi'); r1 = titles(M); search(M, 'HÀ NỘI'); r2 = len(titles(M))
    ok('CT-25 tìm không dấu', r1 == ['Du lịch Hà Nội'] and r2 == 1, r1)
    search(M, '')
    filt(M, title='github'); a1 = sorted(ids(M))
    filt(M, title='', url='github'); a2 = sorted(ids(M))
    filt(M, title='github', url='github'); a3 = sorted(ids(M))
    clear_all(M); search(M, 'github'); a4 = sorted(ids(M))
    ok('CT-26 tên / địa chỉ riêng, ô chung', a1 == ['b10'] and a2 == ['b10', 'b11'] and a3 == ['b10'] and a4 == ['b10', 'b11', 'b12'], [a1, a2, a3, a4])
    clear_all(M)
    filt(M, tags=['code', 'js']); ok('CT-27 nhiều nhãn', ids(M) == ['b10'], ids(M))
    filt(M, tags=[], mode='exact', datefield='createdAt', date='2026-10-15'); c1 = sorted(ids(M))
    filt(M, datefield='updatedAt', date='2026-10-25'); c2 = ids(M)
    ok('CT-28 đúng ngày', c1 == ['b10', 'b9'] and c2 == ['b11'], [c1, c2])
    clear_all(M); search(M, 'github')
    filt(M, tags=['code'], mode='range', datefield='createdAt', from_='2026-10-01', to='2026-10-31')
    ok('CT-29 kết hợp + số kết quả', sorted(ids(M)) == ['b10', 'b11'] and T(M, 'list-count').inner_text() == '2 kết quả', [ids(M), T(M, 'list-count').inner_text()])
    clear_all(M)
    filt(M, mode='range', from_='2028-01-01', to=''); x1 = len(ids(M))
    filt(M, mode='range', from_='', to='2026-08-04'); x2 = ids(M)
    ok('CT-30 chỉ Từ / chỉ Đến', x1 == 3 and x2 == ['b2'], [x1, x2])
    filt(M, mode='range', from_='2026-10-31', to='2026-10-01')
    ok('CT-31 đổi chỗ ngày', len(ids(M)) == 5 and T(M, 'notice').is_visible() and 'đổi chỗ' in T(M, 'notice').inner_text(), ids(M))
    clear_all(M); search(M, 'zzzz')
    empty_ok = 'Không tìm thấy' in T(M, 'empty-state').inner_text()
    T(M, 'btn-clear-filter').click(); W(M)
    ok('CT-32 không kết quả + xóa bộ lọc', empty_ok and T(M, 'search-input').input_value() == '' and T(M, 'list-folder').count() == 3)
    open_list_folder(M, 'cv'); search(M, 'github'); in_cv = sorted(ids(M))
    search(M, 'ha noi'); in_cv2 = len(ids(M))
    filt(M, scope='all'); all2 = len(ids(M))
    ok('CT-33 phạm vi thư mục gồm con / toàn bộ', in_cv == ['b10', 'b11', 'b12'] and in_cv2 == 0 and all2 == 1, [in_cv, in_cv2, all2])
    clear_all(M); go_root(M)
    filt(M, title='Conan', url='vidu.vn', tags=['anime'], mode='month', month='2026-08')
    chips = T(M, 'cond-chip').count()
    ok('CT-58 bốn điều kiện cùng lúc', sorted(ids(M)) == ['b1', 'b2'] and T(M, 'list-count').inner_text() == '2 kết quả' and chips == 4, [ids(M), chips])
    no_folder_rows = T(M, 'list-folder').count() == 0
    path_txt = item_id(M, 'b1').locator('[data-test="item-path"]').inner_text()
    item_id(M, 'b1').locator('[data-test="item-path"]').click(); W(M)
    ok('CT-60 kết quả có đường dẫn, bấm mở thư mục', no_folder_rows and path_txt == 'Giải trí › Anime › Conan' and T(M, 'view-title').inner_text() == 'Conan' and T(M, 'cond-chip').count() == 0, [path_txt])
    go_root(M)
    filt(M, title='nhuận', mode='month', month='2028-02'); m1 = ids(M)
    M.locator('[data-test="cond-chip"][data-key="date"] [data-test="cond-x"]').click(); W(M)
    m2 = sorted(ids(M)); left = [c.get_attribute('data-key') for c in T(M, 'cond-chip').all()]
    T(M, 'btn-clear-filter-inline').click(); W(M)
    ok('CT-59 tháng nhuận, bỏ từng thẻ, bỏ lọc', m1 == ['b14'] and m2 == ['b14', 'b15', 'b16'] and left == ['title'] and T(M, 'cond-chip').count() == 0, [m1, m2, left])

    # ================= Nhãn và màu =================
    go_path(M, ['gt', 'an'])
    purple = 'tc-purple' in cls(item_id(M, 'b2').locator('[data-test="item-tag"][data-tag="anime"]'))
    T(M, 'btn-more').click(); T(M, 'menu-tags').click(); W(M, 200)
    cnt = M.locator('[data-test="tags-row"][data-tag="code"] [data-test="tag-count"]').inner_text()
    M.locator('[data-test="tags-row"][data-tag="phim"] [data-test="tag-color"]').click(); M.locator('[data-test="color-opt"][data-color="green"]').click(); W(M, 400)
    T(M, 'dlg-close').last.click(); W(M, 200)
    g_row = 'tc-green' in cls(item_id(M, 'b2').locator('[data-test="item-tag"][data-tag="phim"]'))
    row_menu(M, item_id(M, 'b2'), 'm-edit'); g_edit = 'tc-green' in cls(M.locator('[data-test="tag-chip"][data-tag="phim"]')); T(M, 'bm-cancel').click(); W(M, 150)
    T(M, 'btn-filter').click(); W(M, 150); g_filter = 'tc-green' in cls(M.locator('.tpick', has=M.locator('[data-test="filter-tag"][data-tag="phim"]')))
    M.locator('[data-test="filter-tag"][data-tag="phim"]').check(force=True); T(M, 'filter-apply').click(); W(M)
    g_chip = 'tc-green' in cls(M.locator('[data-test="cond-chip"][data-key="tag:phim"]'))
    T(M, 'btn-clear-filter-inline').click(); W(M)
    M.reload(); M.wait_for_selector('body.ready'); go_path(M, ['gt', 'an'])
    g_reload = 'tc-green' in cls(item_id(M, 'b2').locator('[data-test="item-tag"][data-tag="phim"]'))
    T(M, 'btn-more').click(); T(M, 'menu-tags').click(); W(M, 200)
    M.locator('[data-test="tags-row"][data-tag="phim"] [data-test="tag-rename"]').click(); prompt(M, 'điện ảnh')
    keep_after_rename = pr.data()['tagColors'].get('điện ảnh') == 'green'
    M.locator('[data-test="tags-row"][data-tag="conan"] [data-test="tag-rename"]').click(); prompt(M, 'anime')
    merged = pr.data()['tagColors'].get('anime') == 'purple' and all(len({t.lower() for t in b['tags']}) == len(b['tags']) for b in pr.data()['bookmarks'])
    M.locator('[data-test="tags-row"][data-tag="lịch"] [data-test="tag-delete"]').click(); T(M, 'dlg-ok').click(); W(M, 300)
    T(M, 'dlg-close').last.click(); W(M, 150)
    row_menu(M, item_id(M, 'b7'), 'm-edit'); T(M, 'bm-tags-input').press_sequentially('lịch'); T(M, 'bm-tags-input').press('Enter'); T(M, 'bm-save').click(); W(M, 300)
    auto_back = ('tc-' + pr.auto_color('lịch')) in cls(item_id(M, 'b7').locator('[data-test="item-tag"][data-tag="lịch"]'))
    ok('CT-62 màu nhãn', purple and g_row and g_edit and g_filter and g_chip and g_reload and keep_after_rename and merged and auto_back,
       [purple, g_row, g_edit, g_filter, g_chip, g_reload, keep_after_rename, merged, auto_back])
    ok('CT-36 danh sách nhãn + số đúng', cnt == '2 dấu trang', cnt)
    T(M, 'btn-more').click(); T(M, 'menu-tags').click(); W(M, 200)
    M.locator('[data-test="tags-row"][data-tag="js"] [data-test="tag-rename"]').click(); prompt(M, 'javascript')
    r_ok = M.locator('[data-test="tags-row"][data-tag="javascript"]').count() == 1
    M.locator('[data-test="tags-row"][data-tag="javascript"] [data-test="tag-rename"]').click(); prompt(M, 'Code')
    merged2 = bid(pr.data(), 'b10')['tags'] == ['code']
    n_before = len(pr.data()['bookmarks'])
    M.locator('[data-test="tags-row"][data-tag="code"] [data-test="tag-delete"]').click(); T(M, 'dlg-ok').click(); W(M, 300)
    d = pr.data(); deleted = len(d['bookmarks']) == n_before and not any('code' in [t.lower() for t in b['tags']] for b in d['bookmarks'])
    M.locator('[data-test="tags-row"][data-tag="anime"] [data-test="tag-open"]').click(); W(M, 300)
    opened = T(M, 'cond-chip').count() == 1 and len(ids(M)) == len([b for b in d['bookmarks'] if 'anime' in b['tags']])
    ok('CT-37 đổi tên / gộp / xóa nhãn; bấm nhãn để lọc', r_ok and merged2 and deleted and opened, [r_ok, merged2, deleted, opened])
    T(M, 'btn-clear-filter-inline').click(); W(M)
    pr.seed(S0); W(M, 600)

    # ================= Thêm / sửa / xóa =================
    go_root(M)
    T(M, 'fab-add').click(); T(M, 'bm-url').fill('https://x.vn/p'); T(M, 'bm-save').click(); W(M, 300)
    ok('CT-11 tên rỗng = địa chỉ', bm(pr.data(), 'https://x.vn/p') is not None)
    T(M, 'fab-add').click(); T(M, 'bm-save').click(); e_empty = T(M, 'bm-error').is_visible()
    T(M, 'bm-url').fill('không phải url'); T(M, 'bm-save').click(); e_bad = T(M, 'bm-error').is_visible()
    T(M, 'bm-url').fill('vnexpress.net'); T(M, 'bm-title').fill('VnExpress'); T(M, 'bm-save').click(); W(M, 300)
    vn = bm(pr.data(), 'VnExpress')
    ok('CT-12 kiểm địa chỉ', e_empty and e_bad and vn and vn['url'] == 'https://vnexpress.net', vn)
    T(M, 'fab-add').click(); T(M, 'bm-url').fill('http://www.dulich.vn/ha-noi/'); T(M, 'bm-save').click()
    warn = T(M, 'dup-warning').is_visible() and 'Dấu trang' in T(M, 'dup-warning').inner_text()
    T(M, 'dup-open').click(); W(M, 300)
    opened_old = T(M, 'bm-title').input_value() == 'Du lịch Hà Nội' and T(M, 'bm-meta').count() == 1
    T(M, 'bm-cancel').click(); W(M, 150)
    n_before = len(pr.data()['bookmarks'])
    T(M, 'fab-add').click(); T(M, 'bm-url').fill('http://www.dulich.vn/ha-noi/'); T(M, 'bm-save').click(); T(M, 'dup-force').click(); W(M, 300)
    d = pr.data(); twice = len([b for b in d['bookmarks'] if b['urlKey'] == 'dulich.vn/ha-noi']) == 2 and len(d['bookmarks']) == n_before + 1
    ok('CT-13 cảnh báo trùng', warn and opened_old and twice, [warn, opened_old, twice])
    old13 = bid(pr.data(), 'b13')
    row_menu(M, item_id(M, 'b13'), 'm-edit'); T(M, 'bm-tags-input').press_sequentially('moi'); T(M, 'bm-tags-input').press('Enter'); T(M, 'bm-save').click(); W(M, 300)
    n13 = bid(pr.data(), 'b13')
    ok('CT-15 sửa đổi thời gian cập nhật', n13['tags'] == ['moi'] and n13['updatedAt'] > old13['updatedAt'] and n13['createdAt'] == old13['createdAt'], n13)
    old9 = bid(pr.data(), 'b9')
    row_menu(M, item_id(M, 'b9'), 'm-edit'); T(M, 'bm-save').click(); W(M, 300)
    ok('CT-16 lưu không đổi', bid(pr.data(), 'b9') == old9 and 'Không có gì thay đổi' in toast(M))
    row_menu(M, item_id(M, 'b13'), 'm-edit'); T(M, 'bm-url').fill('https://vnexpress.net/'); T(M, 'bm-save').click()
    ok('CT-17 sửa địa chỉ trùng', T(M, 'dup-warning').is_visible())
    T(M, 'bm-cancel').click(); W(M, 150)
    n = T(M, 'list-item').count()
    row_menu(M, item_id(M, 'b9'), 'm-delete'); W(M, 300)
    gone = T(M, 'list-item').count() == n - 1 and T(M, 'toast-action').is_visible()
    T(M, 'toast-action').click(); W(M, 400)
    ok('CT-18 xóa + hoàn tác', gone and bid(pr.data(), 'b9') == old9 and T(M, 'list-item').count() == n)
    go_path(M, ['ht'])
    T(M, 'btn-select-mode').click(); W(M, 150)
    for i in ('b14', 'b15'): item_id(M, i).locator('[data-test="item-check"]').check()
    T(M, 'bulk-tag').click(); prompt(M, 'x')
    d = pr.data(); tag_ok = all('x' in bid(d, i)['tags'] for i in ('b14', 'b15'))
    T(M, 'btn-select-mode').click(); W(M, 100); T(M, 'btn-select-mode').click(); W(M, 100)
    for i in ('b14', 'b15'): item_id(M, i).locator('[data-test="item-check"]').check()
    T(M, 'bulk-move').click(); pick(M, 'cv'); T(M, 'pick-ok').click(); W(M, 300)
    d = pr.data(); move_ok = all(bid(d, i)['folderId'] == 'cv' for i in ('b14', 'b15'))
    go_root(M); open_list_folder(M, 'cv'); T(M, 'btn-select-mode').click(); W(M, 100)
    for i in ('b14', 'b15'): item_id(M, i).locator('[data-test="item-check"]').check()
    n = len(pr.data()['bookmarks']); T(M, 'bulk-delete').click(); W(M, 300)
    del_ok = len(pr.data()['bookmarks']) == n - 2
    T(M, 'toast-action').click(); W(M, 400)
    ok('CT-19 thao tác hàng loạt', tag_ok and move_ok and del_ok and len(pr.data()['bookmarks']) == n, [tag_ok, move_ok, del_ok])
    # CT-07 xóa thư mục có nội dung
    go_root(M)
    row_menu(M, M.locator('[data-test="list-folder"][data-id="gt"]'), 'm-delete')
    default_move = T(M, 'del-mode-move').is_checked(); T(M, 'dlg-ok').click(); W(M, 300)
    d = pr.data(); moved_up = not any(f['id'] == 'gt' for f in d['folders']) and next(f for f in d['folders'] if f['id'] == 'an')['parentId'] is None
    row_menu(M, M.locator('[data-test="list-folder"][data-id="an"]'), 'm-delete'); T(M, 'del-mode-all').check(); T(M, 'dlg-ok').click(); W(M, 300)
    d = pr.data(); all_gone = not any(f['id'] in ('an', 'co', 'op') for f in d['folders']) and bid(d, 'b1') is None and bid(d, 'b6') is None
    ok('CT-07 xóa thư mục có nội dung', default_move and moved_up and all_gone, [default_move, moved_up, all_gone])
    pr.seed(S0); W(M, 600)
    # CT-35
    go_root(M)
    reqs = []; ctx.on('request', lambda r: reqs.append(r.url))
    with ctx.expect_page() as newp: item_id(M, 'b13').locator('[data-test="item-title"]').click()
    np_ = newp.value; np_.wait_for_timeout(800); np_url = next((u for u in reqs if 'tin.vn' in u), np_.url); np_.close(); M.bring_to_front()
    row_menu(M, item_id(M, 'b13'), 'm-copyurl'); W(M, 200)
    clip = M.evaluate("navigator.clipboard.readText().catch(() => '')")
    ok('CT-35 mở tab mới + chép địa chỉ', 'tin.vn' in np_url and 'chép' in toast(M) and clip == 'https://tin.vn', [np_url, toast(M), clip])

    # ================= Sao lưu =================
    T(M, 'btn-more').click(); T(M, 'menu-backup').click(); W(M, 200)
    with M.expect_download() as dl: T(M, 'backup-export').click()
    dl = dl.value; exp_path = os.path.join(OUT, dl.suggested_filename); dl.save_as(exp_path)
    want_name = 'so-dau-trang-' + datetime.datetime.now(VN).strftime('%Y-%m-%d') + '.json'
    src = pr.data()
    bad1 = os.path.join(OUT, 'chu.txt'); open(bad1, 'w').write('xin chào')
    bad2 = os.path.join(OUT, 'sai.json'); open(bad2, 'w').write('{"a": 1}')
    e39 = []
    for f in (bad1, bad2):
        T(M, 'backup-file').set_input_files(f); T(M, 'backup-import').click(); W(M)
        e39.append('err' in cls(T(M, 'backup-result')))
    ok('CT-39 tệp hỏng', all(e39) and pr.data() == src, e39)
    newer = os.path.join(OUT, 'moi.json'); open(newer, 'w').write(json.dumps({'version': 3, 'folders': [], 'bookmarks': []}))
    T(M, 'backup-file').set_input_files(newer); T(M, 'backup-import').click(); W(M)
    ok('CT-42 tệp bản mới hơn', 'cập nhật' in T(M, 'backup-result').inner_text() and pr.data() == src, T(M, 'backup-result').inner_text())
    payload = json.load(open(exp_path))
    for b in payload['bookmarks']:
        if b['id'] == 'b10': b['title'] = 'GitHub repo (mới)'; b['updatedAt'] = max(x['updatedAt'] for x in src['bookmarks']) + 1000
        if b['id'] == 'b12': b['title'] = 'Ghi chú (cũ)'; b['updatedAt'] = b['createdAt']
    payload['bookmarks'].append({'id': 'n1', 'title': 'Mới toanh', 'url': 'https://moi.vn', 'folderId': None, 'tags': [], 'createdAt': ms(2026, 11, 1), 'updatedAt': ms(2026, 11, 1), 'order': 99})
    mf = os.path.join(OUT, 'gop.json'); open(mf, 'w').write(json.dumps(payload, ensure_ascii=False))
    T(M, 'backup-file').set_input_files(mf); T(M, 'backup-mode-merge').check(force=True); T(M, 'backup-import').click(); W(M, 400)
    d = pr.data()
    ok('CT-40 gộp', bm(d, 'GitHub repo (mới)') and bm(d, 'Ghi chú họp') and not bm(d, 'Ghi chú (cũ)') and bm(d, 'Mới toanh') and len(d['bookmarks']) == len(src['bookmarks']) + 1)
    before = pr.data()
    T(M, 'backup-file').set_input_files(exp_path); T(M, 'backup-mode-replace').check(force=True); T(M, 'backup-import').click()
    try: T(M, 'dlg-replace').wait_for(timeout=3000); asked = True
    except Exception: asked = False
    T(M, 'dlg-replace').locator('[data-test="dlg-cancel"]').click(); W(M)
    ok('CT-41 thay thế phải xác nhận', asked and pr.data() == before)
    T(M, 'dlg-close').last.click(); W(M, 150)

    # ================= CT-73 chỉ ghi phần liên quan =================
    pr.pg.evaluate("() => { window.__keys = []; chrome.storage.onChanged.addListener(c => { window.__keys.push(...Object.keys(c)); }); }")
    go_root(M); row_menu(M, item_id(M, 'b9'), 'm-edit'); T(M, 'bm-title').fill('Du lịch Hà Nội mới'); T(M, 'bm-save').click(); W(M, 500)
    keys = pr.pg.evaluate("window.__keys")
    ok('CT-73 lưu một dấu trang ghi ≤ 6 khóa', 0 < len(set(keys)) <= 6, keys)

    # ================= Kích thước, vùng chạm =================
    sizes = {}
    for w in (360, 412):
        M.set_viewport_size({'width': w, 'height': 800}); W(M, 200)
        sizes[w] = no_hscroll(M)
        T(M, 'btn-filter').click(); W(M, 150)
        sizes[f'{w}-loc'] = no_hscroll(M) and M.evaluate("(() => { const d = document.querySelector('dialog[open]'); return d.scrollWidth <= d.clientWidth; })()")
        T(M, 'dlg-close').click(); W(M, 150)
    drawer_hidden = M.evaluate("getComputedStyle(document.querySelector('#side')).visibility") == 'hidden'
    ok('CT-C3 không cuộn ngang 360/412, ngăn kéo', all(sizes.values()) and drawer_hidden, sizes)
    M.set_viewport_size({'width': 390, 'height': 844}); W(M, 150)
    hs = {t: T(M, t).bounding_box()['height'] for t in ('fab-add', 'btn-filter', 'btn-drawer', 'btn-more')}
    hs['row-menu'] = T(M, 'row-menu').first.bounding_box()['height']
    T(M, 'fab-add').click(); hs['bm-save'] = T(M, 'bm-save').bounding_box()['height']; hs['bm-folder'] = T(M, 'bm-folder').bounding_box()['height']; T(M, 'bm-cancel').click()
    P = open_popup(ctx, eid, a_tid); hs['popup-save'] = T(P, 'popup-save').bounding_box()['height']; P.screenshot(path=os.path.join(OUT, 'v2-popup.png')); P.close()
    ok('CT-C4 nút chính ≥ 44px', all(v >= 44 for v in hs.values()), hs)
    M.screenshot(path=os.path.join(OUT, 'v2-quanly-390.png'))

    # ================= Tải lại, mở lại =================
    keep = pr.data()
    M.reload(); M.wait_for_selector('body.ready'); go_all(M)
    reload_ok = T(M, 'list-count').inner_text() == f"{len(keep['bookmarks'])} dấu trang"
    ctx.close()
    ctx, eid = launch(p, prof); pr = Probe(ctx, eid)
    ok('CT-C2 tải lại / mở lại trình duyệt', reload_ok and pr.data() == keep, reload_ok)
    ctx.close()

    # ================= CT-38 nhập sang hồ sơ mới =================
    ctx2, eid2 = launch(p, tempfile.mkdtemp()); pr2 = Probe(ctx2, eid2); M2 = open_manager(ctx2, eid2)
    T(M2, 'btn-more').click(); T(M2, 'menu-backup').click(); W(M2, 200)
    T(M2, 'backup-file').set_input_files(exp_path); T(M2, 'backup-mode-replace').check(force=True); T(M2, 'backup-import').click()
    T(M2, 'dlg-replace').wait_for(timeout=3000); T(M2, 'dlg-replace').locator('[data-test="dlg-ok"]').click(); W(M2, 500)
    got = pr2.data(); key = lambda x: x['id']
    same = sorted(got['bookmarks'], key=key) == sorted(src['bookmarks'], key=key) and sorted(got['folders'], key=key) == sorted(src['folders'], key=key) and got['tagColors'] == src['tagColors']
    ok('CT-38 xuất → nhập trình duyệt khác (gồm thứ tự, màu nhãn)', dl.suggested_filename == want_name and same, [dl.suggested_filename, want_name, same])
    # CT-C5 dữ liệu hỏng
    pr2.setraw({'sdt_b_3': 'không phải danh sách'})
    raw_before = pr2.raw(['sdt_b_3', 'sdt_meta'])
    M2.reload(); M2.wait_for_selector('body.ready')
    banner = T(M2, 'error-banner').is_visible()
    T(M2, 'fab-add').click(); T(M2, 'bm-url').fill('https://a.vn'); T(M2, 'bm-save').click(); W(M2, 300)
    blocked = 'không ghi' in toast(M2)
    ok('CT-C5 dữ liệu hỏng không bị ghi đè', banner and blocked and pr2.raw(['sdt_b_3', 'sdt_meta']) == raw_before, [banner, blocked])
    ctx2.close()

    # ================= CT-74 chuyển đổi dữ liệu v1 =================
    ctx3, eid3 = launch(p, tempfile.mkdtemp()); pr3 = Probe(ctx3, eid3)
    v1 = {'version': 1, 'folders': [{'id': 'f2', 'name': 'Zeta', 'parentId': None, 'createdAt': 1}, {'id': 'f1', 'name': 'Alpha', 'parentId': None, 'createdAt': 2}],
          'bookmarks': [{'id': 'v2', 'title': 'Sau', 'url': f'{BASE}/trang-hai.html', 'folderId': 'f1', 'tags': ['x'], 'createdAt': 20, 'updatedAt': 20},
                        {'id': 'v1', 'title': 'Trước', 'url': f'{BASE}/trang-thu.html', 'folderId': 'f1', 'tags': [], 'createdAt': 10, 'updatedAt': 15}]}
    pr3.setraw({'sdt_data': v1})
    M3 = open_manager(ctx3, eid3)
    go_root(M3); fo = ids(M3, 'list-folder'); open_list_folder(M3, 'f1'); bo = ids(M3)
    raw3 = pr3.raw(['sdt_data', 'sdt_data_backup_v1', 'sdt_meta'])
    A3 = ctx3.new_page(); A3.goto(f'{BASE}/trang-thu.html')
    badge3 = pr3.badge(A3.url, '✓')
    v1file = os.path.join(OUT, 'v1.json'); open(v1file, 'w').write(json.dumps(v1))
    M3.bring_to_front(); T(M3, 'btn-more').click(); T(M3, 'menu-backup').click(); W(M3, 200)
    T(M3, 'backup-file').set_input_files(v1file); T(M3, 'backup-mode-merge').check(force=True); T(M3, 'backup-import').click(); W(M3, 400)
    v1_import = 'err' not in cls(T(M3, 'backup-result'))
    ok('CT-74 chuyển dữ liệu v1 → v2 (bản tiện ích)', fo == ['f1', 'f2'] and bo == ['v1', 'v2'] and 'sdt_data' not in raw3 and raw3.get('sdt_data_backup_v1') == v1
       and raw3['sdt_meta']['version'] == 2 and badge3 == '✓' and v1_import and bid(pr3.data(), 'v1')['updatedAt'] == 15, [fo, bo, list(raw3.keys()), badge3, v1_import])
    ctx3.close()
    ctx4, eid4 = launch(p, tempfile.mkdtemp()); pr4 = Probe(ctx4, eid4)
    badv1 = {'version': 1, 'folders': 'x', 'bookmarks': []}
    pr4.setraw({'sdt_data': badv1})
    M4 = open_manager(ctx4, eid4)
    ok('CT-74 dữ liệu v1 hỏng không bị ghi đè', T(M4, 'error-banner').is_visible() and pr4.raw(None) == {'sdt_data': badv1}, pr4.raw(None))
    ctx4.close()

    ok('CT-C1 không lỗi console', not errs, errs)

srv.shutdown()
qua = sum(kq.values())
print(f'\nGiao diện: {qua}/{len(kq)} qua')
json.dump({'kq': kq, 'notes': notes}, open(os.path.join(OUT, 'ketqua.json'), 'w'), ensure_ascii=False, indent=1)
sys.exit(0 if qua == len(kq) else 1)
