# python3 tests/kho_test.py — nghiệm thu bản 3.0.0: một script duy nhất (CN-24): chép dữ liệu từ script Kho cũ, bộ nạp tự cập nhật.
# Hai kho GM giả tách riêng: "main" (script Sổ Dấu Trang) và "kho" (script Sổ Dấu Trang – Kho của bản 2.x).
import json, os, sys, time, hashlib, subprocess, threading, http.server, socketserver, urllib.parse
from playwright.sync_api import sync_playwright
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from seed import sample

ROOT = os.path.dirname(os.path.abspath(__file__))
APP = os.path.dirname(ROOT)
SITE = os.path.join(ROOT, 'site')
OUT = os.path.join(ROOT, 'out'); os.makedirs(OUT, exist_ok=True)
DEV_JS = open(os.path.join(APP, 'soul', 'dist', 'so-dau-trang.dev.user.js'), encoding='utf-8').read()
ROOT_JS = open(os.path.join(APP, 'so-dau-trang.user.js'), encoding='utf-8').read()
APP_JS = open(os.path.join(APP, 'so-dau-trang-app.js'), encoding='utf-8').read()
KHO_JS = open(os.path.join(APP, 'so-dau-trang-kho.user.js'), encoding='utf-8').read()
VERSION = json.load(open(os.path.join(APP, 'ext', 'manifest.json')))['version']
PORT = 8772
L = f'http://localhost:{PORT}'
GMS = {'main': {}, 'kho': {}}
SERVE = {'code': '', 'hits': 0}       # mã app máy thử "đăng" cho bộ nạp tải

class H(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *a, **k): super().__init__(*a, directory=SITE, **k)
    def log_message(self, *a): pass
    def end_headers(self):
        self.send_header('Cache-Control', 'no-store'); self.send_header('Access-Control-Allow-Origin', '*'); super().end_headers()
    def do_GET(self):
        if self.path.startswith('/__app'):
            SERVE['hits'] += 1
            b = SERVE['code'].encode('utf-8'); self.send_response(200 if SERVE['code'] else 404)
            self.send_header('Content-Type', 'text/plain; charset=utf-8'); self.end_headers(); self.wfile.write(b); return
        if self.path.startswith('/__gm'):
            q = urllib.parse.parse_qs(urllib.parse.urlsplit(self.path).query)
            st = GMS[q['ns'][0]]
            body = json.dumps(list(st.keys())) if 'list' in q else json.dumps({'v': st[q['k'][0]]} if q['k'][0] in st else {})
            b = body.encode(); self.send_response(200); self.send_header('Content-Type', 'application/json'); self.end_headers(); self.wfile.write(b); return
        return super().do_GET()
    def do_POST(self):
        n = int(self.headers.get('Content-Length', 0)); d = json.loads(self.rfile.read(n) or b'{}')
        st = GMS[d['ns']]
        if d.get('v') is None: st.pop(d['k'], None)
        else: st[d['k']] = d['v']
        self.send_response(200); self.end_headers(); self.wfile.write(b'ok')
class Srv(socketserver.ThreadingMixIn, socketserver.TCPServer): allow_reuse_address = True; daemon_threads = True
srv = Srv(('127.0.0.1', PORT), H); threading.Thread(target=srv.serve_forever, daemon=True).start()

SHIM = """
window.__SDT_TEST__ = true;
window.__mkGM = function (ns) {
  const base = '%s/__gm';
  function req(m, url, body) { const x = new XMLHttpRequest(); x.open(m, url, false); if (body) x.setRequestHeader('Content-Type', 'text/plain'); x.send(body || null); return x.responseText; }
  return {
    get: (k, d) => { const o = JSON.parse(req('GET', base + '?ns=' + ns + '&k=' + encodeURIComponent(k))); return 'v' in o ? o.v : d; },
    set: (k, v) => { req('POST', base, JSON.stringify({ ns, k, v })); },
    del: (k) => { req('POST', base, JSON.stringify({ ns, k, v: null })); },
    list: () => JSON.parse(req('GET', base + '?ns=' + ns + '&list=1')),
  };
};
window.__opened = []; window.__menu = {};
""" % L

def init(with_kho=False, force_events=False, kho_delay=None, update=None, main_js=None):
    s = SHIM
    if force_events: s += "\nwindow.__SDT_KHO_FORCE_EVENTS__ = true;\n"
    if update is not None: s += "\nwindow.__SDT_LOADER_TEST__ = " + json.dumps(update) + ";\n"
    if with_kho:   # Kho (bản 2.x) chạy lúc document-start; kho_delay: chạy trễ sau script chính
        kho = "(function () { const g = window.__mkGM('kho'); (function (GM_getValue, GM_setValue, GM_deleteValue, GM_listValues) {\n" + KHO_JS + "\n})(g.get, g.set, g.del, g.list); })();"
        s += "\n" + (kho if kho_delay is None else "window.addEventListener('DOMContentLoaded', function () { setTimeout(function () {\n" + kho + "\n}, %d); });" % kho_delay) + "\n"
    s += ("\nwindow.addEventListener('DOMContentLoaded', function () { const g = window.__mkGM('main');"
          " (function (GM_getValue, GM_setValue, GM_deleteValue, GM_listValues, GM_openInTab, GM_setClipboard, GM_registerMenuCommand) {\n" + (main_js or DEV_JS) +
          "\n})(g.get, g.set, g.del, g.list, u => window.__opened.push(u), t => g.set('__clip', t), (n, f) => { window.__menu[n] = f; }); });")
    return s

kq, notes, errs = {}, {}, []
def ok(name, cond, info=''):
    kq[name] = bool(cond)
    if info != '' or not cond: notes[name] = str(info)[:600]
    print(('QUA   ' if cond else 'TRƯỢT ') + name + ('' if cond else '  ← ' + str(info)[:600]), flush=True)
def T(pg, t): return pg.locator(f'[data-test="{t}"]')
def W(pg, n=250): pg.wait_for_timeout(n)

def count(ns):
    n = 0
    for k, v in GMS[ns].items():
        if k.startswith('sdt_b_'): n += len(json.loads(v))
    return n
def titles(ns):
    out = {}
    for k, v in GMS[ns].items():
        if k.startswith('sdt_b_'):
            for b in json.loads(v): out[b['id']] = b['title']
    return out
def data_keys(ns): return {k: v for k, v in GMS[ns].items() if k.startswith('sdt_') and not k.startswith('sdt_kho_')}

def page(ctx, path='/trang-thu.html', w=390, expect_errors=False):
    pg = ctx.new_page(); pg.set_viewport_size({'width': w, 'height': 844})
    if not expect_errors:
        pg.on('pageerror', lambda e: errs.append(f'{path}: {e}'))
        pg.on('console', lambda m: m.type == 'error' and 'Failed to load resource' not in m.text and 'Content Security Policy' not in m.text and 'Trusted Type' not in m.text and 'TrustedScript' not in m.text and errs.append(f'{path}: {m.text}'))
    pg.goto(L + path); pg.wait_for_selector('[data-test="soul-ribbon"]')
    pg.evaluate("() => window.__SDT_SOUL__.ready"); W(pg, 300)
    return pg
def storage(pg): return pg.evaluate("() => window.__SDT_SOUL__.storage()")
def loader(pg): return pg.evaluate("() => { const l = window.__sdtLoader; return l ? { running: l.running, source: l.source, evalBlocked: l.evalBlocked, error: l.error } : null; }")
def data(pg): return pg.evaluate("async () => { const r = await window.__SDT_SOUL__.store.loadAll(); return r.ok ? r.data : { error: r.error }; }")
def seed(pg, d): pg.evaluate("async d => window.__SDT_SOUL__.store.replaceAll(d)", d)
def rib(pg): return T(pg, 'soul-ribbon').get_attribute('data-state')
def wait_rib(pg, want, t=8.0):
    end = time.time() + t
    while time.time() < end:
        if rib(pg) == want: return True
        W(pg, 100)
    return rib(pg) == want
def save_here(pg, title=None):
    T(pg, 'soul-ribbon').click(); pg.wait_for_selector('[data-test="popup-status"]'); W(pg, 200)
    if title: T(pg, 'popup-title').last.fill(title)
    T(pg, 'popup-save').last.click(); W(pg, 400)
    T(pg, 'soul-sheet-close').click(); W(pg, 200)
def open_mgr(pg):
    T(pg, 'soul-ribbon').click(); pg.wait_for_selector('[data-test="popup-status"]'); W(pg, 150)
    T(pg, 'popup-open-manager').last.click(); pg.wait_for_selector('[data-test="soul-overlay"] [data-test="fab-add"]'); W(pg, 300)
def backup_info(pg):
    T(pg, 'btn-more').click(); T(pg, 'menu-backup').click(); W(pg, 250)
    t = T(pg, 'backup-storage-info').inner_text(); pg.keyboard.press('Escape'); W(pg, 200); return t
def banner(pg): return T(pg, 'env-banner').inner_text() if T(pg, 'env-banner').count() else ''

def key(u):
    p = urllib.parse.urlsplit(u); host = p.hostname.lower()
    if host.startswith('www.'): host = host[4:]
    return host + (':' + str(p.port) if p.port else '') + p.path.rstrip('/') + ('?' + p.query if p.query else '')

with sync_playwright() as p:
    b = p.chromium.launch()
    def ctx_(**kw):
        c = b.new_context(viewport={'width': 390, 'height': 844}, has_touch=True, timezone_id='Asia/Ho_Chi_Minh', locale='vi-VN')
        c.add_init_script(init(**kw)); return c
    A = ctx_()                    # chỉ script Sổ Dấu Trang
    B = ctx_(with_kho=True)       # còn script Kho cũ

    # Dựng trạng thái "bản 2.x": dữ liệu nằm trong Kho, kho riêng của script chính có dấu "đã chuyển" + bản cũ.
    def make_v2(d, stale_main=None):
        GMS['main'].clear(); GMS['kho'].clear()
        P = page(A); seed(P, d); P.close()
        GMS['kho'].update(data_keys('main'))
        GMS['main'].clear()
        if stale_main is not None:
            P = page(A); seed(P, stale_main); P.close()
            for k in [k for k in GMS['main'] if k.startswith('sdt_kho_')]: GMS['main'].pop(k)
            GMS['main']['sdt_kho_moved'] = '1'
    def with_saved(d, title='Trang thử đã lưu'):
        d = json.loads(json.dumps(d)); u = f'{L}/trang-thu.html'
        d['bookmarks'].append({'id': 'tt', 'title': title, 'url': u, 'urlKey': key(u), 'folderId': None, 'tags': [], 'createdAt': 1785000000000, 'updatedAt': 1785000000000, 'order': 99})
        return d

    # CT-93 tiêu đề: một script, không có địa chỉ cập nhật, phiên bản bộ nạp cố định; tệp mã app ghi đúng phiên bản
    rh = ROOT_JS.split('==/UserScript==')[0]
    h93 = ['@updateURL' not in rh, '@downloadURL' not in rh, '@version      3.0.0' in rh, '@grant        unsafeWindow' in rh,
           '@grant        GM_xmlhttpRequest' in rh, '@connect      raw.githubusercontent.com' in rh, '@run-at       document-idle' in rh,
           APP_JS.startswith('// SDT_APP ' + VERSION + '\n'), 'so-dau-trang-app.js' in ROOT_JS]
    before = hashlib.sha256(open(os.path.join(APP, 'so-dau-trang.user.js'), 'rb').read()).hexdigest()
    subprocess.run([sys.executable, os.path.join(APP, 'soul', 'build.py')], check=True, capture_output=True)
    after = hashlib.sha256(open(os.path.join(APP, 'so-dau-trang.user.js'), 'rb').read()).hexdigest()
    ok('CT-93 một script: không địa chỉ cập nhật, bộ nạp 3.0.0 đông cứng, tệp mã app đúng phiên bản', all(h93) and before == after, [h93, before == after])

    # CT-170 người mới (chưa từng có Kho): lưu ngay trong script; không nhắc cài Kho; sau 3 lần không thấy Kho thì thôi chờ
    GMS['main'].clear(); GMS['kho'].clear()
    t0 = time.time(); P = page(A); t_first = time.time() - t0
    save_here(P, 'Trang thử A'); n170 = [count('main'), count('kho')]
    open_mgr(P); b170 = banner(P); info170 = backup_info(P); P.close()
    GMS['main'].clear()
    for _ in range(3): P = page(A, '/trang-hai.html'); P.close()
    t0 = time.time(); P = page(A, '/trang-hai.html'); t_fourth = time.time() - t0; st170 = storage(P); P.close()
    ok('CT-170 người mới: lưu ngay trong script, không nhắc cài Kho, thôi chờ Kho sau 3 lần', n170 == [1, 0] and b170 == '' and 'ngay trong script' in info170
       and 'Bản app: ' + VERSION in info170 and t_fourth < 2.0 and st170['mode'] == 'local', [n170, b170, info170, round(t_first, 2), round(t_fourth, 2), st170])

    # CT-171 chuyển từ 2.x: bấm cập nhật lần cuối (kho riêng bị xóa) → tự chép từ Kho, đủ dấu trang, ruy băng đỏ, lời báo gỡ Kho
    make_v2(with_saved(sample()))
    kho_before = dict(GMS['kho'])
    P = page(B, '/trang-thu.html')
    on171 = wait_rib(P, 'on'); st171 = storage(P); n171 = len(data(P).get('bookmarks', []))
    same171 = data_keys('main') == {k: v for k, v in kho_before.items()}
    open_mgr(P); b171 = banner(P)
    T(P, 'env-banner-act').click(); W(P, 300); gone171 = banner(P) == ''
    P.close(); P = page(B, '/trang-hai.html'); save_here(P, 'Lưu sau khi chép'); P.close()
    P = page(A, '/trang-thu.html'); n_nokho = len(data(P).get('bookmarks', [])); on_nokho = rib(P) == 'on'; st_nokho = storage(P); P.close()
    ok('CT-171 chuyển từ 2.x: chép đủ từ Kho, ruy băng đỏ, báo gỡ Kho; gỡ Kho vẫn đủ; Kho không bị ghi',
       on171 and st171['mode'] == 'local' and st171['imported'] and st171['imported']['n'] == 17 and n171 == 17 and same171
       and 'Đã chép 17 dấu trang' in b171 and 'gỡ script' in b171 and gone171 and n_nokho == 18 and on_nokho and st_nokho['mode'] == 'local' and GMS['kho'] == kho_before,
       [on171, st171, n171, same171, b171[:80], gone171, n_nokho, on_nokho, GMS['kho'] == kho_before])

    # CT-172 Kho chạy trễ (0,6 s, 4 s) hoặc lần đầu không chạy → vẫn chép được, ruy băng đỏ; bản cũ thời 2.x không bị gộp vào
    res172 = {}
    stale = {'version': 2, 'folders': [], 'tagColors': {}, 'bookmarks': [{'id': 'old', 'title': 'Đã xóa từ lâu', 'url': 'https://cu.vn/x', 'urlKey': 'cu.vn/x', 'folderId': None, 'tags': [], 'createdAt': 1, 'updatedAt': 1, 'order': 0}]}
    for name, delay, stl in (('tre-0.6s', 600, None), ('tre-4s', 4000, None), ('ban-cu-2x-tre-0.6s', 600, stale)):
        make_v2(with_saved(sample()), stl)
        D = b.new_context(viewport={'width': 390, 'height': 844}, has_touch=True); D.add_init_script(init(with_kho=True, kho_delay=delay))
        P = page(D, '/trang-thu.html')
        on = wait_rib(P, 'on'); st = storage(P); d = data(P)
        res172[name] = [on, st['mode'], len(d.get('bookmarks', [])), 'old' in [x['id'] for x in d.get('bookmarks', [])], data_keys('main') == data_keys('kho')]
        P.close(); D.close()
    # lần đầu Kho không chạy (WebView bỏ lỡ), lần sau chạy
    make_v2(with_saved(sample()), stale)
    P = page(A, '/trang-thu.html'); miss = [storage(P)['mode'], rib(P)]; open_mgr(P)
    err_b = T(P, 'error-banner').count() > 0 and 'chưa đọc được' in T(P, 'error-banner').inner_text()
    T(P, 'fab-add').click(); T(P, 'bm-url').fill('https://khong-ghi.vn'); T(P, 'bm-save').click(); W(P, 400); P.close()
    nowrite = 'khong-ghi' not in json.dumps(GMS)
    P = page(B, '/trang-thu.html'); again = [wait_rib(P, 'on'), storage(P)['mode'], len(data(P).get('bookmarks', []))]; P.close()
    ok('CT-172 Kho chạy trễ / lần đầu không chạy: vẫn chép đủ, không lẫn bản cũ, lúc chưa có Kho không ghi gì',
       all(v[0] and v[1] == 'local' and v[2] == 17 and not v[3] and v[4] for v in res172.values()) and miss == ['missing', 'err'] and err_b and nowrite and again == [True, 'local', 17],
       [res172, miss, err_b, nowrite, again])

    # CT-173 lưu trong lúc chờ Kho (kho riêng trống, Kho tới muộn 4 s) → gộp, không mất bên nào
    make_v2(sample())
    D = b.new_context(viewport={'width': 390, 'height': 844}, has_touch=True); D.add_init_script(init(with_kho=True, kho_delay=4500))
    P = page(D, '/trang-thu.html')
    save_here(P, 'Lưu lúc chờ Kho')
    W(P, 2500)
    end = time.time() + 6
    while time.time() < end and not storage(P)['imported']: W(P, 200)
    d173 = data(P); t173 = sorted(x['title'] for x in d173.get('bookmarks', []))
    on173 = wait_rib(P, 'on'); P.close(); D.close()
    ok('CT-173 lưu lúc chờ Kho rồi Kho tới → gộp đủ hai bên', len(t173) == 17 and 'Lưu lúc chờ Kho' in t173 and on173, [len(t173), on173])

    # CT-176 đường sự kiện DOM vẫn chép được
    make_v2(with_saved(sample()))
    C = ctx_(with_kho=True, force_events=True)
    P = page(C, '/trang-thu.html'); r176 = [wait_rib(P, 'on'), storage(P)['mode'], len(data(P).get('bookmarks', []))]; P.close(); C.close()
    ok('CT-176 đường sự kiện DOM: chép được từ Kho', r176 == [True, 'local', 17], r176)

    # CT-92 trang bảo mật chặt (Trusted Types): chép được, bảng lưu nhanh mở được, chạy bản có sẵn
    make_v2(with_saved(sample()))
    P = page(B, '/tt.html')
    T(P, 'soul-ribbon').click(); P.wait_for_selector('[data-test="popup-status"]'); W(P, 200)
    ok('CT-92 trang bảo mật chặt: chép được, bảng mở được', storage(P)['imported'] and T(P, 'popup-save').last.is_visible(), storage(P))
    P.close()

    # ---------- bộ nạp tự cập nhật ----------
    def bump(v, extra=''):
        return APP_JS.replace('// SDT_APP ' + VERSION + '\n', '// SDT_APP ' + v + '\nwindow.__SDT_RAN__ = ' + json.dumps(v) + ';' + extra + '\n', 1)
    upd = {'url': L + '/__app', 'autoCheck': True, 'delay': 0}
    U = ctx_(update=upd)
    def wait_code(want, t=6.0):
        end = time.time() + t
        while time.time() < end:
            if want(GMS['main'].get('sdtl_code')): return True
            time.sleep(0.1)
        return False
    # CT-180 có bản mới → tải, cất; lần mở trang sau chạy bản mới; dữ liệu vẫn đủ; 6 giờ sau mới kiểm lại
    make_v2(with_saved(sample())); GMS['main'].update(GMS['kho']); GMS['main']['sdt_kho_imported'] = json.dumps({'at': 1, 'n': 17}); GMS['main']['sdt_kho_import_seen'] = '1'
    SERVE['code'] = bump('9.9.0'); SERVE['hits'] = 0
    P = page(U); l1 = loader(P); got = wait_code(lambda c: bool(c) and c.startswith('// SDT_APP 9.9.0')); P.close()
    hits1 = SERVE['hits']
    P = page(U, '/trang-thu.html'); l2 = loader(P); ran = P.evaluate('window.__SDT_RAN__ || null'); on180 = rib(P) == 'on'; n180 = len(data(P).get('bookmarks', []))
    W(P, 600); hits2 = SERVE['hits']
    open_mgr(P); info180 = backup_info(P); P.close()
    ok('CT-180 tự cập nhật: tải bản mới, lần sau chạy bản mới, dữ liệu đủ, không kiểm lại trong 6 giờ',
       l1['source'] == 'bundled' and got and l2 == {'running': '9.9.0', 'source': 'update', 'evalBlocked': False, 'error': None} and ran == '9.9.0'
       and on180 and n180 == 17 and hits1 == 1 and hits2 == 1 and '9.9.0 (đã tự cập nhật)' in info180, [l1, got, l2, ran, on180, n180, hits1, hits2, info180[-160:]])
    # CT-184 lệnh "Kiểm tra bản mới" kiểm ngay, báo kết quả
    SERVE['code'] = bump('9.9.1')
    P = page(U); P.evaluate("window.__menu['Kiểm tra bản mới']()"); W(P, 800)
    t184 = T(P, 'toast-msg').last.inner_text() if T(P, 'toast-msg').count() else ''
    P.evaluate("window.__menu['Kiểm tra bản mới']()"); W(P, 800)
    t184b = T(P, 'toast-msg').last.inner_text() if T(P, 'toast-msg').count() else ''
    P.close()
    ok('CT-184 "Kiểm tra bản mới": tải ngay và báo; lần hai báo đang mới nhất', 'Đã tải bản 9.9.1' in t184 and 'mới nhất' in t184b and GMS['main']['sdtl_code'].startswith('// SDT_APP 9.9.1'), [t184, t184b])
    # CT-181 bản mới lỗi cú pháp → không cất, vẫn chạy bản đang có
    SERVE['code'] = '// SDT_APP 9.9.2\nfunction (( {'
    P = page(U); P.evaluate("window.__menu['Kiểm tra bản mới']()"); W(P, 800); P.close()
    P = page(U, '/trang-thu.html'); l181 = loader(P); on181 = rib(P) == 'on'; P.close()
    ok('CT-181 bản mới lỗi cú pháp: không dùng, vẫn chạy bản trước', GMS['main']['sdtl_code'].startswith('// SDT_APP 9.9.1') and GMS['main'].get('sdtl_bad') == '9.9.2'
       and l181['running'] == '9.9.1' and on181, [l181, GMS['main'].get('sdtl_bad')])
    # CT-182 bản mới hỏng lúc chạy → quay về bản có sẵn ngay trong lần đó, đánh dấu hỏng, không tải lại bản đó
    SERVE['code'] = '// SDT_APP 9.9.3\nwindow.__SDT_RAN__ = "9.9.3"; throw new Error("hỏng lúc chạy");'
    P = page(U); P.evaluate("window.__menu['Kiểm tra bản mới']()"); W(P, 800); P.close()
    P = page(U, '/trang-thu.html', expect_errors=True); l182 = loader(P); on182 = rib(P) == 'on'; hosts = P.evaluate("document.querySelectorAll('sdt-so-dau-trang').length")
    P.evaluate("window.__menu['Kiểm tra bản mới']()"); W(P, 800); P.close()
    P = page(U, '/trang-thu.html'); l182b = loader(P); P.close()
    ok('CT-182 bản mới hỏng lúc chạy: về bản có sẵn, đánh dấu hỏng, không chạy lại', l182['source'] == 'bundled' and on182 and hosts == 1 and GMS['main'].get('sdtl_bad') == '9.9.3'
       and l182b['source'] == 'bundled', [l182, on182, hosts, GMS['main'].get('sdtl_bad'), l182b])
    # CT-183 trang chặn chạy mã tải về (CSP không 'unsafe-eval', Trusted Types) → chạy bản có sẵn, dữ liệu chung
    SERVE['code'] = bump('9.9.4')
    P = page(U); P.evaluate("window.__menu['Kiểm tra bản mới']()"); W(P, 800); P.close()
    res183 = {}
    for path in ('/noeval.html', '/tt.html'):
        P = page(U, path); l = loader(P); n = len(data(P).get('bookmarks', []))
        T(P, 'soul-ribbon').click(); P.wait_for_selector('[data-test="popup-status"]'); W(P, 200); vis = T(P, 'popup-save').last.is_visible()
        res183[path] = [l['source'], l['evalBlocked'], n, vis]; P.close()
    P = page(U, '/trang-hai.html'); l183 = loader(P); P.close()
    ok('CT-183 trang chặn chạy mã: dùng bản có sẵn, vẫn đủ dữ liệu; trang thường dùng bản mới',
       all(v == ['bundled', True, 17, True] for v in res183.values()) and l183['running'] == '9.9.4', [res183, l183])
    U.close()

    # CT-91 tốc độ: 50.000 dấu trang (chép từ Kho xong) → kiểm tra trang ≤ 30 ms
    big = {'version': 2, 'folders': [], 'tagColors': {}, 'bookmarks': []}
    for i in range(50000):
        u = f'https://trang{i}.vidu.vn/bai/{i}'
        big['bookmarks'].append({'id': f'k{i}', 'title': f'Bài {i}', 'url': u, 'urlKey': key(u), 'folderId': None, 'tags': [], 'createdAt': 1700000000000 + i, 'updatedAt': 1700000000000 + i, 'order': i})
    make_v2(with_saved(big))
    P = page(B, '/trang-thu.html'); imp91 = storage(P)['imported']; P.close()
    times, states = [], []
    for _ in range(3):
        P = page(A, '/trang-thu.html')
        times.append(round(P.evaluate("window.__SDT_SOUL__.timing.checks[0]"), 1)); states.append(rib(P)); P.close()
    ok('CT-91 50.000 dấu trang: chép từ Kho được, kiểm tra trang ≤ 30 ms', imp91 and imp91['n'] == 50001 and max(times) <= 30 and states == ['on'] * 3, [imp91, times, states])

    ok('CT-C6 không lỗi console (một script)', not errs, errs[:5])
    b.close()

srv.shutdown()
qua = sum(kq.values())
print(f'\nMột script + bộ nạp: {qua}/{len(kq)} qua')
json.dump({'kq': kq, 'notes': notes}, open(os.path.join(OUT, 'ketqua-kho.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
sys.exit(0 if qua == len(kq) else 1)
