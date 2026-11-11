# python3 tests/soul_test.py — nghiệm thu bản Soul 2.0 (userscript) với giả lập GM_* trong Chromium
import json, os, sys, glob, tempfile, threading, time, http.server, socketserver, urllib.parse
from playwright.sync_api import sync_playwright
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from seed import sample, ms

ROOT = os.path.dirname(os.path.abspath(__file__))
APP = os.path.dirname(ROOT)
SITE = os.path.join(ROOT, 'site')
OUT = os.path.join(ROOT, 'out'); os.makedirs(OUT, exist_ok=True)
EXT = os.path.join(APP, 'ext')
USERJS = open(os.path.join(APP, 'so-dau-trang.user.js'), encoding='utf-8').read()
PORT = 8770
L = f'http://localhost:{PORT}'
R = f'http://127.0.0.1:{PORT}'
GM = {}            # kho GM giả: khóa → giá trị (chuỗi JSON như Soul)
GMLOG = []         # nhật ký đọc: (khóa, số byte)

class H(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *a, **k): super().__init__(*a, directory=SITE, **k)
    def log_message(self, *a): pass
    def end_headers(self):
        self.send_header('Access-Control-Allow-Origin', '*'); self.send_header('Cache-Control', 'no-store'); super().end_headers()
    def do_GET(self):
        if self.path.startswith('/__gm'):
            q = urllib.parse.parse_qs(urllib.parse.urlsplit(self.path).query)
            if 'list' in q: body = json.dumps(list(GM.keys()))
            else:
                k = q['k'][0]
                body = json.dumps({'v': GM[k]} if k in GM else {})
                GMLOG.append((k, len(body)))
            b = body.encode(); self.send_response(200); self.send_header('Content-Type', 'application/json'); self.end_headers(); self.wfile.write(b); return
        return super().do_GET()
    def do_POST(self):
        n = int(self.headers.get('Content-Length', 0)); d = json.loads(self.rfile.read(n) or b'{}')
        if d.get('v') is None: GM.pop(d['k'], None)
        else: GM[d['k']] = d['v']
        self.send_response(200); self.end_headers(); self.wfile.write(b'ok')
class Srv(socketserver.ThreadingMixIn, socketserver.TCPServer): allow_reuse_address = True; daemon_threads = True
srv = Srv(('0.0.0.0', PORT), H); threading.Thread(target=srv.serve_forever, daemon=True).start()

SHIM = """
window.__SDT_TEST__ = true;
(function () {
  const base = '%s/__gm';
  function req(m, url, body) { const x = new XMLHttpRequest(); x.open(m, url, false); if (body) x.setRequestHeader('Content-Type', 'text/plain'); x.send(body || null); return x.responseText; }
  window.GM_getValue = (k, d) => { const o = JSON.parse(req('GET', base + '?k=' + encodeURIComponent(k))); return 'v' in o ? o.v : d; };
  window.GM_setValue = (k, v) => { req('POST', base, JSON.stringify({ k, v })); };
  window.GM_deleteValue = (k) => { req('POST', base, JSON.stringify({ k, v: null })); };
  window.GM_listValues = () => JSON.parse(req('GET', base + '?list=1'));
  window.GM_openInTab = (u) => { window.open(u, '_blank'); };
  window.GM_setClipboard = (t) => { req('POST', base, JSON.stringify({ k: '__clip', v: t })); };
  window.__menu = {}; window.GM_registerMenuCommand = (n, f) => { window.__menu[n] = f; };
})();
""" % R
INIT = SHIM + "\nwindow.addEventListener('DOMContentLoaded', function () {\n" + USERJS + "\n});"

kq, notes, errs = {}, {}, []
def ok(name, cond, info=''):
    kq[name] = bool(cond)
    if not cond or info != '': notes[name] = str(info)[:400]
    print(('QUA   ' if cond else 'TRƯỢT ') + name + ('' if cond else '  ← ' + str(info)[:400]), flush=True)
def T(pg, t): return pg.locator(f'[data-test="{t}"]')
def W(pg, n=250): pg.wait_for_timeout(n)
def watch(pg, tag='trang'):
    pg.on('pageerror', lambda e: errs.append(f'{tag}: {e}'))
    pg.on('console', lambda m: m.type == 'error' and 'Failed to load resource' not in m.text and 'favicon' not in m.text and errs.append(f'{tag}: {m.text}'))
    return pg
def newpage(ctx, url, w=390):
    pg = watch(ctx.new_page()); pg.set_viewport_size({'width': w, 'height': 844}); pg.goto(url); pg.wait_for_selector('[data-test="soul-ribbon"]'); W(pg, 200); return pg
def state(pg): return T(pg, 'soul-ribbon').get_attribute('data-state')
def wait_state(pg, want, t=2.0):
    end = time.time() + t
    while time.time() < end:
        if state(pg) == want: return True
        W(pg, 100)
    return state(pg) == want
def data(pg): return pg.evaluate("async () => { const r = await window.__SDT_SOUL__.store.loadAll(); return r.ok ? r.data : { error: r.error }; }")
def seed(pg, d): pg.evaluate("async d => { const v = SDT_TEST_validate(d); }", d) if False else pg.evaluate("async d => window.__SDT_SOUL__.store.replaceAll(d)", validated(pg, d))
def validated(pg, d): return pg.evaluate("d => { const s = window.__SDT_SOUL__.shadow; return d; }", d)
def bm(d, title): return next((b for b in (d or {}).get('bookmarks', []) if b['title'] == title), None)
def bid(d, i): return next((b for b in (d or {}).get('bookmarks', []) if b['id'] == i), None)
def sheet_open(pg): return pg.evaluate("window.__SDT_SOUL__.shadow.querySelector('dialog.psheet').open")
def open_sheet(pg): T(pg, 'soul-ribbon').click(); pg.wait_for_selector('[data-test="popup-status"]'); W(pg, 200)
def close_sheet(pg): T(pg, 'soul-sheet-close').click(); W(pg, 150)
def open_mgr(pg):
    open_sheet(pg); T(pg, 'popup-open-manager').last.click(); pg.wait_for_selector('[data-test="soul-overlay"] [data-test="fab-add"]'); W(pg, 300)
def ovl_cls(pg): return T(pg, 'soul-overlay').get_attribute('class') or ''
def drawer(pg):
    if T(pg, 'btn-drawer').is_visible() and 'drawer-open' not in ovl_cls(pg): T(pg, 'btn-drawer').click(); W(pg, 250)
def go_root(pg): drawer(pg); T(pg, 'folder-root').click(); W(pg, 200)
def prompt(pg, v): T(pg, 'dlg-input').fill(v); T(pg, 'dlg-ok').click(); W(pg)
def item_id(pg, i): return pg.locator(f'[data-test="list-item"][data-id="{i}"]')
def row_menu(pg, row, action): row.locator('[data-test="row-menu"]').click(); W(pg, 150); T(pg, action).click(); W(pg)
def ids(pg, kind='list-item'): return [e.get_attribute('data-id') for e in T(pg, kind).all()]
def toast(pg): return T(pg, 'toast-msg').last.inner_text() if T(pg, 'toast-msg').count() else ''
def hscroll_ok(pg, test):
    return pg.evaluate("""t => { const s = window.__SDT_SOUL__.shadow; const el = s.querySelector('[data-test="' + t + '"]');
      return !!el && el.scrollWidth <= el.clientWidth + 1 && el.getBoundingClientRect().right <= innerWidth + 1; }""", test)
def seed_sample(pg):
    pg.evaluate("async d => { await window.__SDT_SOUL__.store.replaceAll(d); }", pg.evaluate("d => d", sample()))
    pg.reload(); pg.wait_for_selector('[data-test="soul-ribbon"]'); W(pg, 200)

with sync_playwright() as p:
    b = p.chromium.launch()
    ctx = b.new_context(viewport={'width': 390, 'height': 844}, has_touch=True, timezone_id='Asia/Ho_Chi_Minh', locale='vi-VN', accept_downloads=True)
    ctx.add_init_script(INIT)

    # CT-43
    A = newpage(ctx, f'{L}/trang-thu.html')
    s0 = state(A)
    open_sheet(A)
    pre = (T(A, 'popup-title').input_value(), T(A, 'popup-url').input_value(), T(A, 'popup-status').inner_text())
    T(A, 'popup-tags-input').press_sequentially('đọc sau, soul')
    T(A, 'popup-save').click(); W(A, 400)
    saved_status = T(A, 'popup-status').inner_text()
    close_sheet(A)
    d = data(A); b1 = bm(d, 'Trang Thử')
    ok('CT-43 lưu từ nút ruy băng', s0 == 'off' and pre == ('Trang Thử', f'{L}/trang-thu.html', 'Chưa lưu') and saved_status == 'Đã lưu'
       and wait_state(A, 'on') and b1 and b1['tags'] == ['đọc sau', 'soul'] and 'sdt_meta' in GM and 'sdt_data' not in GM, [s0, pre, saved_status, b1])
    # CT-44
    B = newpage(ctx, f'{R}/trang-hai.html'); off_other = state(B)
    B.goto(f'{L}/trang-thu.html#doan-2'); B.wait_for_selector('[data-test="soul-ribbon"]')
    ok('CT-44 trạng thái theo trang, kể cả #…', off_other == 'off' and wait_state(B, 'on'), [off_other, state(B)])
    B.close()
    # CT-45
    box = T(A, 'soul-ribbon').bounding_box()
    A.mouse.move(box['x'] + 20, box['y'] + 20); A.mouse.down(); A.mouse.move(box['x'] + 20, box['y'] + 220, steps=12); A.mouse.up(); W(A)
    box2 = T(A, 'soul-ribbon').bounding_box(); closed = not sheet_open(A)
    A.reload(); A.wait_for_selector('[data-test="soul-ribbon"]'); W(A, 150); box3 = T(A, 'soul-ribbon').bounding_box()
    C = newpage(ctx, f'{R}/trang-hai.html'); box4 = T(C, 'soul-ribbon').bounding_box(); C.close()
    T(A, 'soul-ribbon').click(); W(A, 300); tap = sheet_open(A); close_sheet(A)
    ok('CT-45 kéo nút, nhớ vị trí', 190 <= box2['y'] - box['y'] <= 210 and closed and abs(box3['y'] - box2['y']) <= 3 and abs(box4['y'] - box2['y']) <= 3 and tap, [box['y'], box2['y'], box3['y'], box4['y']])
    # CT-160 (2.8.0) Ruy băng mờ khi không chạm; kéo sang mép trái / phải, nhớ mép và cao độ
    def opa(pg): return float(pg.evaluate("() => getComputedStyle(window.__SDT_SOUL__.shadow.querySelector('.rib')).opacity"))
    def side(pg): return T(pg, 'soul-ribbon').get_attribute('data-side')
    A.mouse.move(200, 120); W(A, 2300)
    idle0 = opa(A)
    rb = T(A, 'soul-ribbon').bounding_box()
    A.mouse.move(rb['x'] + 20, rb['y'] + 20); A.mouse.down(); W(A, 250); pressed = opa(A)
    A.mouse.move(150, rb['y'] + 20 - 120, steps=12); A.mouse.up(); W(A, 250)
    lb = T(A, 'soul-ribbon').bounding_box(); awake_after = opa(A); closed160 = not sheet_open(A)
    A.mouse.move(200, 120); W(A, 2300); faded = opa(A)
    ui = json.loads(GM.get('sdt_ui', '{}'))
    A.reload(); A.wait_for_selector('[data-test="soul-ribbon"]'); W(A, 150); lb2 = T(A, 'soul-ribbon').bounding_box()
    C = newpage(ctx, f'{R}/trang-hai.html'); lb3 = T(C, 'soul-ribbon').bounding_box(); side3 = side(C); C.close()
    T(A, 'soul-ribbon').click(); W(A, 300); tap160 = sheet_open(A); A.mouse.move(200, 120); W(A, 2300); open_awake = opa(A)
    close_sheet(A); A.mouse.move(200, 120); W(A, 2300); faded2 = opa(A)
    left_ok = lb['x'] == 0 and abs(lb['y'] - (rb['y'] - 120)) <= 3 and side(A) == 'left' and ui.get('side') == 'left' \
        and abs(lb2['x']) < 1 and abs(lb2['y'] - lb['y']) <= 3 and side3 == 'left' and abs(lb3['x']) < 1 and abs(lb3['y'] - lb['y']) <= 3
    fade_ok = idle0 < 0.5 and pressed > 0.9 and awake_after > 0.9 and faded < 0.5 and open_awake > 0.9 and faded2 < 0.5
    # kéo về mép phải
    lb = T(A, 'soul-ribbon').bounding_box()
    A.mouse.move(lb['x'] + 20, lb['y'] + 20); A.mouse.down(); A.mouse.move(260, lb['y'] + 20, steps=12); A.mouse.up(); W(A, 250)
    back = T(A, 'soul-ribbon').bounding_box()
    right_ok = abs(back['x'] + back['width'] - 390) < 1 and side(A) == 'right' and json.loads(GM.get('sdt_ui', '{}')).get('side') == 'right' and not sheet_open(A)
    ok('CT-160 ruy băng mờ khi không chạm; kéo sang mép trái/phải, nhớ vị trí', fade_ok and left_ok and closed160 and tap160 and right_ok,
       [idle0, pressed, awake_after, faded, open_awake, faded2, lb, lb2, lb3, side3, ui, back, closed160, tap160])
    # CT-46
    P = newpage(ctx, f'{L}/spa.html'); p0 = state(P); P.click('#go')
    ok('CT-46 đổi địa chỉ không tải lại', p0 == 'off' and wait_state(P, 'on', 1.5), [p0, state(P)])
    P.close()
    # CT-47
    TB = newpage(ctx, f'{L}/trang-hai.html'); tb0 = state(TB)
    TA = newpage(ctx, f'{L}/trang-hai.html'); open_sheet(TA); T(TA, 'popup-save').click(); W(TA, 300); close_sheet(TA)
    TB.bring_to_front(); TB.evaluate("document.dispatchEvent(new Event('visibilitychange'))")
    ok('CT-47 tab khác cập nhật khi hiện lại', tb0 == 'off' and wait_state(TB, 'on'), [tb0, state(TB)])
    TA.close(); TB.close()
    # CT-48
    F = watch(ctx.new_page()); F.goto(f'{L}/iframe.html'); W(F, 800)
    mn = F.evaluate("document.querySelectorAll('sdt-so-dau-trang').length")
    fn = F.frames[1].evaluate("document.querySelectorAll('sdt-so-dau-trang').length") if len(F.frames) > 1 else -1
    ok('CT-48 không chạy trong khung nhúng', mn == 1 and fn == 0, [mn, fn]); F.close()
    # CT-49
    X = newpage(ctx, f'{L}/pha.html'); rb = T(X, 'soul-ribbon').bounding_box()
    h1 = X.evaluate("(() => { const s = getComputedStyle(document.querySelector('h1')); return [s.fontSize, s.color, s.fontFamily, s.letterSpacing]; })()")
    open_sheet(X); sv = T(X, 'popup-save'); sb = sv.bounding_box(); fs = sv.evaluate("e => getComputedStyle(e).fontSize"); tf = T(X, 'popup-title').evaluate("e => getComputedStyle(e).fontSize")
    X.screenshot(path=os.path.join(OUT, 'soul2-pha.png'))
    ok('CT-49 CSS trang không làm vỡ app và ngược lại', 40 <= rb['width'] <= 50 and 52 <= rb['height'] <= 64 and sv.is_visible() and sb['height'] >= 44 and fs == '15px' and tf == '15px'
       and h1 == ['40px', 'rgb(255, 0, 0)', 'serif', '5px'], [rb, sb, fs, tf, h1])
    close_sheet(X); X.close()

    # CT-50, CT-51
    D = newpage(ctx, f'{L}/dai.html')
    D.evaluate("window.scrollTo(0, 500)"); W(D, 100)
    open_mgr(D)
    ov = T(D, 'soul-overlay').is_visible(); locked = D.evaluate("getComputedStyle(document.documentElement).overflow") == 'hidden'
    y_open = D.evaluate("scrollY"); D.mouse.move(200, 400); D.mouse.wheel(0, 600); W(D); y_during = D.evaluate("scrollY")
    T(D, 'btn-close-manager').click(); W(D, 300)
    y_after = D.evaluate("scrollY"); unlocked = D.evaluate("getComputedStyle(document.documentElement).overflow") != 'hidden'
    D.evaluate("window.scrollTo(0, 900)"); W(D, 100); y_can = D.evaluate("scrollY")
    ok('CT-50 lớp phủ khóa cuộn, đóng về chỗ cũ', ov and locked and abs(y_open - 500) <= 16 and y_during == y_open and y_after == 500 and unlocked and y_can == 900, [ov, locked, y_open, y_during, y_after, y_can])
    url0 = D.url; open_mgr(D); D.go_back(); W(D, 400)
    ok('CT-51 nút Quay lại đóng lớp phủ', not T(D, 'soul-overlay').is_visible() and D.url == url0)

    # Dữ liệu mẫu
    D.evaluate("async d => window.__SDT_SOUL__.store.replaceAll(d)", sample()); D.reload(); D.wait_for_selector('[data-test="soul-ribbon"]'); W(D, 200)
    # CT-53 trong lớp phủ: thư mục, thêm, tìm, lọc, xóa + hoàn tác, kéo thả, cắt/dán, màu
    open_mgr(D)
    root_folders = ids(D, 'list-folder')
    drawer(D); T(D, 'folder-add').click(); prompt(D, 'Mới tạo'); made = any(f['name'] == 'Mới tạo' for f in data(D)['folders'])
    T(D, 'drawer-scrim').click(position={'x': 370, 'y': 400}); W(D)
    T(D, 'fab-add').click(); T(D, 'bm-url').fill('dulich.vn/sapa'); T(D, 'bm-title').fill('Du lịch Sa Pa'); T(D, 'bm-tags-input').press_sequentially('du lịch'); T(D, 'bm-save').click(); W(D, 300)
    T(D, 'search-input').fill('sa pa'); W(D, 300); found = [e.inner_text() for e in T(D, 'item-title').all()]
    T(D, 'search-input').fill(''); W(D, 300)
    T(D, 'btn-filter').click(); D.locator('[data-test="filter-tag"][data-tag="du lịch"]').set_checked(True, force=True); T(D, 'filter-apply').click(); W(D)
    by_tag = sorted(e.inner_text() for e in T(D, 'item-title').all())
    T(D, 'btn-clear-filter-inline').click(); W(D)
    n = T(D, 'list-item').count()
    row_menu(D, item_id(D, 'b9'), 'm-delete'); W(D); after_del = T(D, 'list-item').count()
    T(D, 'toast-action').click(); W(D, 400)
    # kéo thả trong lớp phủ: b13 lên trên b9
    no_grip = not item_id(D, 'b13').locator('[data-test="row-handle"]').is_visible()          # 2.7.0: tay nắm chỉ hiện khi "Sắp xếp lại"
    T(D, 'btn-reorder').click(); W(D, 200)
    item_id(D, 'b9').evaluate("e => e.scrollIntoView({ block: 'center' })"); W(D, 200)   # 2.2.0: có dòng nhắc cài Kho ở đầu danh sách
    b9b = item_id(D, 'b9').bounding_box(); hb = item_id(D, 'b13').locator('[data-test="row-handle"]').bounding_box()
    D.mouse.move(hb['x'] + 10, hb['y'] + 10); D.mouse.down(); D.mouse.move(b9b['x'] + 100, b9b['y'] + 5, steps=10); D.mouse.up(); W(D, 400)
    dragged = no_grip and ids(D)[:2] == ['b13', 'b9']
    T(D, 'btn-reorder').click(); W(D, 200)                                                   # Xong: nút ⋮ hiện lại
    # cắt / dán
    row_menu(D, item_id(D, 'b13'), 'm-cut')
    D.locator('[data-test="list-folder"][data-id="ht"] [data-test="folder-row-name"]').click(); W(D)
    T(D, 'btn-paste-here').click(); W(D, 400)
    pasted = bid(data(D), 'b13')['folderId'] == 'ht'
    purple = 'tc-purple' in (D.locator('[data-test="list-item"]').first.locator('[data-test="item-tag"]').first.get_attribute('class') or '') if False else True
    go_root(D); D.locator('[data-test="list-folder"][data-id="gt"] [data-test="folder-row-name"]').click(); W(D); D.locator('[data-test="list-folder"][data-id="an"] [data-test="folder-row-name"]').click(); W(D)
    purple = 'tc-purple' in (item_id(D, 'b2').locator('[data-test="item-tag"][data-tag="anime"]').get_attribute('class') or '')
    ok('CT-53 chức năng 2.0 trong lớp phủ', root_folders == ['cv', 'gt', 'ht'] and made and found == ['Du lịch Sa Pa'] and by_tag == ['Du lịch Hà Nội', 'Du lịch Sa Pa']
       and after_del == n - 1 and T(D, 'list-item').count() >= 1 and dragged and pasted and purple, [root_folders, made, found, by_tag, n, after_del, dragged, pasted, purple])
    # CT-52
    reqs = []; ctx.on('request', lambda r: reqs.append(r.url))
    with ctx.expect_page() as np: item_id(D, 'b2').locator('[data-test="item-title"]').click()
    newp = np.value; W(newp, 600); nurl = next((u for u in reqs if 'conan-movie-29' in u), newp.url); newp.close()
    ok('CT-52 mở dấu trang ở tab mới', 'conan-movie-29' in nurl and T(D, 'soul-overlay').is_visible(), nurl)
    # CT-54 chép / dán
    T(D, 'btn-more').click(); T(D, 'menu-backup').click(); W(D)
    T(D, 'backup-copy').click(); W(D)
    clip = GM.get('__clip', '')
    try: cj = json.loads(clip)
    except Exception: cj = None
    cur = data(D)
    copy_ok = bool(cj) and cj.get('app') == 'so-dau-trang' and cj.get('version') == 2 and len(cj['bookmarks']) == len(cur['bookmarks']) and cj.get('tagColors', {}).get('anime') == 'purple'
    snap = {k: v for k, v in GM.items() if k.startswith('sdt_')}
    T(D, 'backup-paste').fill('rác không phải json'); T(D, 'backup-import-paste').click(); W(D)
    garbage = 'err' in (T(D, 'backup-result').get_attribute('class') or '') and {k: v for k, v in GM.items() if k.startswith('sdt_')} == snap
    T(D, 'dlg-close').last.click(); T(D, 'btn-close-manager').click(); W(D)
    for k in [k for k in GM if k.startswith('sdt_') and k != 'sdt_ui']: GM.pop(k)
    D.reload(); D.wait_for_selector('[data-test="soul-ribbon"]'); open_mgr(D)
    empty_before = T(D, 'list-item').count() + T(D, 'list-folder').count()
    T(D, 'btn-more').click(); T(D, 'menu-backup').click(); W(D)
    T(D, 'backup-paste').fill(clip); T(D, 'backup-mode-replace').check(force=True); T(D, 'backup-import-paste').click()
    T(D, 'dlg-replace').wait_for(timeout=3000); T(D, 'dlg-replace').locator('[data-test="dlg-ok"]').click(); W(D, 400)
    restored = data(D); key = lambda x: x['id']
    same = sorted([{k: v for k, v in x.items() if k != 'urlKey'} for x in restored['bookmarks']], key=key) == sorted(cj['bookmarks'], key=key) and len(restored['folders']) == len(cj['folders'])
    ok('CT-54 chép / dán dữ liệu', copy_ok and garbage and empty_before == 0 and same, [copy_ok, garbage, empty_before, same])
    T(D, 'dlg-close').last.click(); T(D, 'btn-close-manager').click(); W(D)
    # CT-55
    D.evaluate("window.__menu['Lưu / sửa trang này']()"); W(D, 300); m1 = sheet_open(D); close_sheet(D)
    D.evaluate("window.__menu['Mở trình quản lý']()"); W(D, 400); m2 = T(D, 'soul-overlay').is_visible()
    ok('CT-55 lệnh menu userscript', m1 and m2, [m1, m2])
    # CT-C6 kích thước
    sizes = {}
    for w in (360, 412):
        D.set_viewport_size({'width': w, 'height': 800}); W(D, 150); sizes[f'{w}-ovl'] = hscroll_ok(D, 'soul-overlay')
    hs = {t: T(D, t).bounding_box()['height'] for t in ('fab-add', 'btn-filter', 'btn-close-manager', 'btn-drawer')}
    hs['row-menu'] = T(D, 'row-menu').first.bounding_box()['height']
    D.screenshot(path=os.path.join(OUT, 'soul2-quanly.png'))
    T(D, 'btn-close-manager').click(); W(D)
    for w in (360, 412):
        D.set_viewport_size({'width': w, 'height': 800}); W(D, 150); open_sheet(D)
        sizes[f'{w}-sheet'] = D.evaluate("(() => { const d = window.__SDT_SOUL__.shadow.querySelector('dialog.psheet'); return d.scrollWidth <= d.clientWidth + 1 && d.getBoundingClientRect().right <= innerWidth + 1; })()")
        hs[f'popup-save-{w}'] = T(D, 'popup-save').bounding_box()['height']
        D.screenshot(path=os.path.join(OUT, f'soul2-bang-{w}.png')); close_sheet(D)
    hs['ribbon'] = T(D, 'soul-ribbon').bounding_box()['height']
    D.set_viewport_size({'width': 390, 'height': 844}); W(D, 100)
    ok('CT-C6 không cuộn ngang, vùng chạm ≥ 44px', all(sizes.values()) and all(v >= 44 for v in hs.values()), [sizes, hs])
    D.close()

    # CT-56 chéo bản
    files = sorted(glob.glob(os.path.join(OUT, 'so-dau-trang-20*.json')))
    ext_file = files[-1] if files else None
    cross1 = cross2 = False
    if ext_file:
        ef = json.load(open(ext_file))
        E = newpage(ctx, f'{L}/trang-hai.html'); open_mgr(E)
        T(E, 'btn-more').click(); T(E, 'menu-backup').click(); W(E)
        T(E, 'backup-file').set_input_files(ext_file); T(E, 'backup-mode-replace').check(force=True); T(E, 'backup-import').click()
        T(E, 'dlg-replace').wait_for(timeout=3000); T(E, 'dlg-replace').locator('[data-test="dlg-ok"]').click(); W(E, 400)
        got = data(E)
        cross1 = sorted(x['id'] for x in got['bookmarks']) == sorted(x['id'] for x in ef['bookmarks']) and got['tagColors'] == ef.get('tagColors', {})
        E.close()
    soul_clip = os.path.join(OUT, 'tu-soul.json'); open(soul_clip, 'w').write(clip)
    ectx = p.chromium.launch_persistent_context(tempfile.mkdtemp(), headless=True, channel='chromium',
        args=[f'--disable-extensions-except={EXT}', f'--load-extension={EXT}'], viewport={'width': 390, 'height': 844}, timezone_id='Asia/Ho_Chi_Minh')
    sw = ectx.service_workers[0] if ectx.service_workers else ectx.wait_for_event('serviceworker', timeout=15000)
    eid = sw.url.split('/')[2]
    M = watch(ectx.new_page(), 'tiện ích'); M.goto(f'chrome-extension://{eid}/manager.html'); M.wait_for_selector('body.ready')
    T(M, 'btn-more').click(); T(M, 'menu-backup').click(); W(M)
    T(M, 'backup-file').set_input_files(soul_clip); T(M, 'backup-mode-replace').check(force=True); T(M, 'backup-import').click()
    T(M, 'dlg-replace').wait_for(timeout=3000); T(M, 'dlg-replace').locator('[data-test="dlg-ok"]').click(); W(M, 400)
    ed = M.evaluate("async () => (await SDTStore.loadAll()).data")
    cross2 = sorted(x['id'] for x in ed['bookmarks']) == sorted(x['id'] for x in cj['bookmarks']) and ed['tagColors'].get('anime') == 'purple'
    ectx.close()
    ok('CT-56 dữ liệu chuyển qua lại giữa hai bản', bool(ext_file) and cross1 and cross2, [ext_file, cross1, cross2])

    # CT-57 trang bảo mật chặt
    Z = newpage(ctx, f'{L}/tt.html')
    n_err = len(errs)
    enforced = Z.evaluate("(() => { try { document.body.innerHTML = '<b>x</b>'; return false; } catch (e) { return true; } })()")
    W(Z, 100); del errs[n_err:]
    zr = T(Z, 'soul-ribbon').bounding_box(); open_sheet(Z); zs = T(Z, 'popup-save').bounding_box()
    T(Z, 'popup-open-manager').last.click(); Z.wait_for_selector('[data-test="soul-overlay"] [data-test="fab-add"]')
    drawer(Z)
    if Z.locator('[data-test="folder-item"][data-id="gt"]').get_attribute('aria-expanded') == 'false': Z.locator('[data-test="folder-item"][data-id="gt"] [data-test="folder-caret"]').click(); W(Z)
    pads = Z.evaluate("""(() => [...window.__SDT_SOUL__.shadow.querySelectorAll('[data-test="folder-item"]')].map(r => parseFloat(getComputedStyle(r).paddingLeft)))()""")
    icons_ok = Z.evaluate("window.__SDT_SOUL__.shadow.querySelectorAll('.ic svg path, .ic svg circle, .ic svg rect').length") > 5
    ok('CT-57 trang bảo mật chặt (Trusted Types, CSP)', enforced and 40 <= zr['width'] <= 50 and zs['height'] >= 44 and len(pads) >= 2 and max(pads) > min(pads) and icons_ok, [enforced, zr, zs, pads, icons_ok])
    Z.close()

    # CT-74 (bản Soul) chuyển dữ liệu v1 trong kho GM
    for k in [k for k in GM if k.startswith('sdt_') and k != 'sdt_ui']: GM.pop(k)
    v1 = {'version': 1, 'folders': [{'id': 'f2', 'name': 'Zeta', 'parentId': None, 'createdAt': 1}, {'id': 'f1', 'name': 'Alpha', 'parentId': None, 'createdAt': 2}],
          'bookmarks': [{'id': 'v2', 'title': 'Sau', 'url': f'{L}/trang-hai.html', 'folderId': 'f1', 'tags': ['x'], 'createdAt': 20, 'updatedAt': 20},
                        {'id': 'v1', 'title': 'Trước', 'url': f'{L}/trang-thu.html', 'folderId': 'f1', 'tags': [], 'createdAt': 10, 'updatedAt': 15}]}
    GM['sdt_data'] = json.dumps(v1)
    V = newpage(ctx, f'{L}/trang-thu.html')
    mig_on = wait_state(V, 'on')
    migrated = 'sdt_meta' in GM and 'sdt_data' not in GM and json.loads(GM.get('sdt_data_backup_v1', 'null')) == v1
    open_mgr(V); go_root(V); fo = ids(V, 'list-folder')
    V.locator('[data-test="list-folder"][data-id="f1"] [data-test="folder-row-name"]').click(); W(V); bo = ids(V)
    ok('CT-74 chuyển dữ liệu v1 → v2 (bản Soul)', mig_on and migrated and fo == ['f1', 'f2'] and bo == ['v1', 'v2'], [mig_on, migrated, fo, bo])
    V.close()

    # CT-83 xuất / nhập HTML trên bản Soul
    import html_mau
    HD = html_mau.write()
    X = newpage(ctx, f'{L}/trang-hai.html')
    seed_sample(X)
    open_mgr(X)
    T(X, 'btn-more').click(); T(X, 'menu-backup').click(); W(X)
    with X.expect_download() as dl: T(X, 'backup-export-html').click()
    hp = os.path.join(OUT, 'soul-xuat.html'); dl.value.save_as(hp)
    ht = open(hp, encoding='utf-8').read()
    exp_ok = dl.value.suggested_filename.endswith('.html') and ht.startswith('<!DOCTYPE NETSCAPE-Bookmark-file-1>') and ht.count('<DT><A ') == 16 and ht.count('<DT><H3 ') == 7
    T(X, 'backup-file').set_input_files(os.path.join(HD, 'gop.html')); T(X, 'backup-mode-merge').check(force=True); T(X, 'backup-import').click()
    end = time.time() + 10
    while time.time() < end and not T(X, 'backup-result').inner_text().startswith('Đã gộp'): W(X, 100)
    res83 = T(X, 'backup-result').inner_text()
    d83 = data(X)
    imp_ok = res83.startswith('Đã gộp: thêm 4 dấu trang, bỏ qua 3 đã có; thêm 1 thư mục') and len(d83['bookmarks']) == 20 and len(d83['folders']) == 8
    ok('CT-83 Soul: xuất HTML, nhập HTML (Gộp)', exp_ok and imp_ok, [dl.value.suggested_filename, exp_ok, res83])
    X.close()

    # CT-84 chừa chỗ cho thanh công cụ dưới của Soul (64px)
    Y = newpage(ctx, f'{L}/trang-thu.html', w=360)
    Y.set_viewport_size({'width': 360, 'height': 640})
    seed_sample(Y)
    ih = Y.evaluate('innerHeight')
    def bottom(loc):
        loc.scroll_into_view_if_needed(); W(Y, 100)
        b = loc.bounding_box(); return round(b['y'] + b['height']) if b else 9999
    gaps = {}
    open_sheet(Y)
    gaps['bảng lưu nhanh: nút Lưu'] = bottom(T(Y, 'popup-save').last)
    T(Y, 'popup-open-manager').last.click(); Y.wait_for_selector('[data-test="soul-overlay"] [data-test="fab-add"]'); W(Y, 300)
    gaps['nút +'] = bottom(T(Y, 'fab-add'))
    T(Y, 'fab-add').click(); W(Y, 300)
    gaps['hộp thêm: nút Lưu'] = bottom(T(Y, 'bm-save').last)
    Y.keyboard.press('Escape'); W(Y, 200)
    T(Y, 'btn-more').click(); W(Y, 250)
    gaps['menu ⋯: mục cuối'] = bottom(Y.locator('[data-test="soul-overlay"] .menu-item, dialog .menu-item').last)
    Y.keyboard.press('Escape'); W(Y, 200)
    T(Y, 'btn-select-mode').click(); W(Y, 250)
    gaps['thanh chọn nhiều'] = bottom(T(Y, 'bulk-delete'))
    Y.screenshot(path=os.path.join(OUT, 'soul-day-360.png'))
    ok('CT-84 chừa 64px ở đáy cho thanh công cụ của Soul', all(v <= ih - 64 for v in gaps.values()), [ih, gaps])
    Y.close()

    # CT-104 cách so chữ trong lớp phủ (regex + hoa thường)
    V = newpage(ctx, f'{L}/trang-hai.html')
    seed_sample(V); open_mgr(V)
    T(V, 'btn-filter').click(); W(V, 300); T(V, 'filter-regex').set_checked(True, force=True); T(V, 'filter-apply').click(); W(V, 300)
    T(V, 'search-input').fill('tập \\d+'); W(V, 400); c104a = T(V, 'list-count').inner_text().strip()
    T(V, 'search-input').fill('tập ('); W(V, 400); e104 = T(V, 'search-error').count() == 1
    T(V, 'btn-filter').click(); W(V, 300); T(V, 'filter-case').set_checked(True, force=True); T(V, 'filter-apply').click(); W(V, 300)
    T(V, 'search-input').fill('tập \\d+'); W(V, 400); c104b = T(V, 'list-count').inner_text().strip()
    ok('CT-104 Soul: regex, hoa thường trong lớp phủ', c104a == '5 kết quả' and e104 and c104b == '4 kết quả', [c104a, e104, c104b])
    V.close()

    # CT-114 đổi chữ hàng loạt trong lớp phủ
    V = newpage(ctx, f'{L}/trang-hai.html')
    seed_sample(V); open_mgr(V)
    T(V, 'search-input').fill('vidu.vn/conan'); W(V, 400)
    T(V, 'btn-more').click(); W(V, 250); T(V, 'menu-replace').click(); W(V, 300)
    T(V, 'rp-with').fill('vidu.app/conan'); W(V, 400)
    pv114 = T(V, 'rp-preview').inner_text()
    T(V, 'rp-ok').click(); W(V, 600)
    n114 = sum(1 for b in data(V)['bookmarks'] if 'vidu.app/conan' in b['url'])
    t114 = T(V, 'toast-msg').inner_text()
    ok('CT-114 Soul: đổi chữ các kết quả', pv114.startswith('Sẽ đổi 4 dấu trang') and n114 == 4 and t114.startswith('Đã đổi 4 dấu trang'), [pv114, n114, t114])
    V.close()

    # CT-124 tìm dấu trang trùng trong lớp phủ
    V = newpage(ctx, f'{L}/trang-hai.html')
    seed_sample(V)
    V.evaluate("""async () => { const st = window.__SDT_SOUL__.store; const r = await st.loadAll(); const d = r.data;
      const b = Object.assign({}, d.bookmarks.find(x => x.id === 'b1'), { id: 'dupx', title: 'Bản trùng', url: 'http://www.vidu.vn/conan-1100/', updatedAt: 1, tags: ['cũ'] });
      await st.save(d, Object.assign({}, d, { bookmarks: d.bookmarks.concat([b]) })); }""")
    open_mgr(V)
    T(V, 'btn-more').click(); W(V, 250); T(V, 'menu-dups').click(); W(V, 400)
    sm124 = T(V, 'dup-summary').inner_text()
    T(V, 'dup-apply-group').first.click(); W(V, 600)
    ids124 = [b['id'] for b in data(V)['bookmarks']]
    b1t = next(b['tags'] for b in data(V)['bookmarks'] if b['id'] == 'b1')
    ok('CT-124 Soul: tìm trùng, xóa mục không giữ, gộp nhãn', sm124 == 'Có 1 nhóm trùng, 1 dấu trang thừa.' and 'dupx' not in ids124 and 'b1' in ids124 and 'cũ' in b1t, [sm124, b1t])
    V.close()

    # CT-140 Soul: nhớ chỗ xem và cách sắp xếp qua các trang (cất cùng dữ liệu, còn sau khi đóng)
    V = newpage(ctx, f'{L}/trang-thu.html')
    seed_sample(V); open_mgr(V)
    V.evaluate("() => window.__SDT_SOUL__.shadow.querySelector('[data-test=\"folder-item\"][data-id=\"gt\"] [data-test=\"folder-caret\"]').click()"); W(V, 200)
    V.evaluate("() => window.__SDT_SOUL__.shadow.querySelector('[data-test=\"folder-item\"][data-id=\"an\"] [data-test=\"folder-open\"]').click()"); W(V, 300)
    T(V, 'sort-select').select_option('za'); W(V, 300)
    V.evaluate("() => window.__SDT_SOUL__.closeManager()"); W(V, 300)
    open_mgr(V); same_page = (T(V, 'view-title').inner_text().strip(), T(V, 'sort-select').input_value())
    V.close()
    V = newpage(ctx, f'{L}/trang-hai.html'); open_mgr(V)
    other_page = (T(V, 'view-title').inner_text().strip(), T(V, 'sort-select').input_value())
    ok('CT-140 Soul: mở lại (cùng trang, trang khác) đúng thư mục và cách sắp xếp', same_page == ('Anime', 'za') and other_page == ('Anime', 'za'), [same_page, other_page])
    # CT-159 Soul (2.7.0): "Sắp xếp lại" rồi kéo trong lớp phủ; "Xem gọn" được nhớ khi mở ở trang khác
    T(V, 'sort-select').select_option('manual'); W(V, 300)
    g7 = item_id(V, 'b7').locator('[data-test="row-handle"]')
    hid159 = not g7.is_visible()
    T(V, 'btn-reorder').click(); W(V, 250)
    o0 = ids(V)
    gb = item_id(V, o0[-1]).locator('[data-test="row-handle"]').bounding_box(); fb = item_id(V, o0[0]).bounding_box()
    V.mouse.move(gb['x'] + gb['width'] / 2, gb['y'] + gb['height'] / 2); V.mouse.down(); V.mouse.move(fb['x'] + 100, fb['y'] + 5, steps=12); V.mouse.up(); W(V, 500)
    moved159 = ids(V) == [o0[-1]] + o0[:-1]
    T(V, 'btn-reorder').click(); W(V, 200)
    T(V, 'btn-dense').click(); W(V, 500)
    h_dense = item_id(V, 'b7').bounding_box()['height']
    V.evaluate("() => window.__SDT_SOUL__.closeManager()"); W(V, 300)
    V.close()
    V = newpage(ctx, f'{L}/trang-thu.html'); open_mgr(V)
    kept159 = T(V, 'btn-dense').get_attribute('aria-pressed') == 'true' and item_id(V, 'b7').bounding_box()['height'] <= 50
    ok('CT-159 Soul: Sắp xếp lại + kéo trong lớp phủ; Xem gọn được nhớ ở trang khác', hid159 and moved159 and 44 <= h_dense <= 50 and kept159, [hid159, o0, ids(V), h_dense, kept159])
    T(V, 'btn-dense').click(); W(V, 400)
    V.evaluate("() => GM_deleteValue('sdt_ui')")
    V.close()

    # CT-C7 dữ liệu hỏng
    snap = dict(GM)
    GM['sdt_b_3'] = json.dumps('không phải danh sách')
    snap = dict(GM)
    K = newpage(ctx, f'{L}/trang-hai.html')
    open_mgr(K); K.wait_for_selector('[data-test="error-banner"]')
    T(K, 'fab-add').click(); T(K, 'bm-url').fill('https://a.vn'); T(K, 'bm-save').click(); W(K, 300)
    blocked = 'không ghi' in toast(K)
    T(K, 'btn-close-manager').click(); W(K)
    open_sheet(K); perr = T(K, 'popup-data-error').is_visible(); close_sheet(K)
    rib_err = state(K) == 'err'
    skip = ('sdt_ui', '__clip', 'sdt_error')
    same_store = {k: v for k, v in GM.items() if k not in skip} == {k: v for k, v in snap.items() if k not in skip}
    ok('CT-C7 dữ liệu hỏng không bị ghi đè', blocked and perr and rib_err and same_store, [blocked, perr, rib_err, same_store])
    K.close()

    ok('CT-C6 không lỗi console', not errs, errs)
    b.close()

srv.shutdown()
qua = sum(kq.values())
print(f'\nBản Soul: {qua}/{len(kq)} qua')
json.dump({'kq': kq, 'notes': notes}, open(os.path.join(OUT, 'ketqua-soul.json'), 'w'), ensure_ascii=False, indent=1)
sys.exit(0 if qua == len(kq) else 1)
