# python3 tests/kho_test.py — nghiệm thu CN-19 (script Kho giữ dữ liệu qua cập nhật) với hai kho GM giả riêng cho hai script
import json, os, sys, time, threading, http.server, socketserver, urllib.parse
from playwright.sync_api import sync_playwright
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from seed import sample

ROOT = os.path.dirname(os.path.abspath(__file__))
APP = os.path.dirname(ROOT)
SITE = os.path.join(ROOT, 'site')
OUT = os.path.join(ROOT, 'out'); os.makedirs(OUT, exist_ok=True)
MAIN_JS = open(os.path.join(APP, 'so-dau-trang.user.js'), encoding='utf-8').read()
KHO_JS = open(os.path.join(APP, 'so-dau-trang-kho.user.js'), encoding='utf-8').read()
PORT = 8772
L = f'http://localhost:{PORT}'
GMS = {'main': {}, 'kho': {}}      # hai kho GM tách riêng như Soul cấp cho từng script

class H(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *a, **k): super().__init__(*a, directory=SITE, **k)
    def log_message(self, *a): pass
    def end_headers(self):
        self.send_header('Cache-Control', 'no-store'); super().end_headers()
    def do_GET(self):
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

def init(with_kho=True, force_events=False, kho_delay=None):
    s = SHIM
    if force_events: s += "\nwindow.__SDT_KHO_FORCE_EVENTS__ = true;\n"
    if with_kho:   # Kho chạy lúc document-start với kho GM riêng của nó (kho_delay: chạy trễ sau script chính, như Soul đôi khi làm)
        kho = "(function () { const g = window.__mkGM('kho'); (function (GM_getValue, GM_setValue, GM_deleteValue, GM_listValues) {\n" + KHO_JS + "\n})(g.get, g.set, g.del, g.list); })();"
        s += "\n" + (kho if kho_delay is None else "window.addEventListener('DOMContentLoaded', function () { setTimeout(function () {\n" + kho + "\n}, %d); });" % kho_delay) + "\n"
    s += ("\nwindow.addEventListener('DOMContentLoaded', function () { const g = window.__mkGM('main');"
          " (function (GM_getValue, GM_setValue, GM_deleteValue, GM_listValues, GM_openInTab, GM_setClipboard, GM_registerMenuCommand) {\n" + MAIN_JS +
          "\n})(g.get, g.set, g.del, g.list, u => window.__opened.push(u), t => g.set('__clip', t), (n, f) => { window.__menu[n] = f; }); });")
    return s

kq, notes, errs = {}, {}, []
def ok(name, cond, info=''):
    kq[name] = bool(cond)
    if info != '' or not cond: notes[name] = str(info)[:500]
    print(('QUA   ' if cond else 'TRƯỢT ') + name + ('' if cond else '  ← ' + str(info)[:500]), flush=True)
def T(pg, t): return pg.locator(f'[data-test="{t}"]')
def W(pg, n=250): pg.wait_for_timeout(n)

def count(ns):
    st = GMS[ns]; n = 0
    for k, v in st.items():
        if k.startswith('sdt_b_'): n += len(json.loads(v))
    return n
def titles(ns):
    out = {}
    for k, v in GMS[ns].items():
        if k.startswith('sdt_b_'):
            for b in json.loads(v): out[b['id']] = b['title']
    return out

def page(ctx, path='/trang-thu.html', w=390):
    pg = ctx.new_page(); pg.set_viewport_size({'width': w, 'height': 844})
    pg.on('pageerror', lambda e: errs.append(f'{path}: {e}'))
    pg.on('console', lambda m: m.type == 'error' and 'Failed to load resource' not in m.text and errs.append(f'{path}: {m.text}'))
    pg.goto(L + path); pg.wait_for_selector('[data-test="soul-ribbon"]')
    pg.evaluate("() => window.__SDT_SOUL__.ready"); W(pg, 300)
    return pg
def storage(pg): return pg.evaluate("() => window.__SDT_SOUL__.storage()")
def data(pg): return pg.evaluate("async () => { const r = await window.__SDT_SOUL__.store.loadAll(); return r.ok ? r.data : { error: r.error }; }")
def seed(pg, d): pg.evaluate("async d => window.__SDT_SOUL__.store.replaceAll(d)", d)
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

def key(u):
    p = urllib.parse.urlsplit(u); host = p.hostname.lower()
    if host.startswith('www.'): host = host[4:]
    return host + (':' + str(p.port) if p.port else '') + p.path.rstrip('/') + ('?' + p.query if p.query else '')

with sync_playwright() as p:
    b = p.chromium.launch()
    def ctx_(**kw):
        c = b.new_context(viewport={'width': 390, 'height': 844}, has_touch=True, timezone_id='Asia/Ho_Chi_Minh', locale='vi-VN')
        c.add_init_script(init(**kw)); return c
    A = ctx_(with_kho=False)
    B = ctx_(with_kho=True)

    # CT-93 tiêu đề hai script
    kh = KHO_JS.split('==/UserScript==')[0]; mh = MAIN_JS.split('==/UserScript==')[0]
    ok('CT-93 Kho không có địa chỉ cập nhật, chạy sớm; script chính có unsafeWindow',
       '@updateURL' not in kh and '@downloadURL' not in kh and '@version      1.0.0' in kh and '@run-at       document-start' in kh
       and '@grant        unsafeWindow' in mh and '@updateURL' in mh)

    # CT-85 chưa cài Kho
    P = page(A)
    st85 = storage(P)
    save_here(P, 'Trang thử A')
    open_mgr(P)
    banner = T(P, 'env-banner').is_visible() and 'Chưa cài script Kho' in T(P, 'env-banner').inner_text()
    T(P, 'env-banner-act').click(); W(P, 200)
    opened = P.evaluate('window.__opened')
    info85 = backup_info(P)
    ok('CT-85 chưa cài Kho: dùng kho riêng, nhắc cài Kho', st85['mode'] == 'local' and count('main') == 1 and count('kho') == 0 and banner
       and opened == ['https://raw.githubusercontent.com/Cungbonvotang/SoulBookmarks/main/so-dau-trang-kho.user.js'] and 'sẽ mất' in info85, [st85, count('main'), banner, opened, info85])
    P.close()

    # CT-86 cài Kho → dữ liệu tự chuyển sang Kho
    GMS['main'].clear(); GMS['kho'].clear()
    P = page(A); seed(P, sample()); P.close()
    before = titles('main')
    P = page(B, '/trang-hai.html')
    st86 = storage(P)
    open_mgr(P)
    no_banner = T(P, 'env-banner').count() == 0
    info86 = backup_info(P)
    ok('CT-86 cài Kho: dữ liệu tự chuyển sang Kho', st86['mode'] == 'kho-page' and titles('kho') == before and len(before) == 16
       and 'sdt_kho_moved' in GMS['main'] and no_banner and 'Sổ Dấu Trang – Kho' in info86 and 'có thể đọc' in info86, [st86, len(titles('kho')), no_banner, info86])
    P.close()

    # CT-87 giả "bấm cập nhật" script chính: Soul xóa kho riêng của nó
    GMS['main'].clear()
    P = page(B, '/trang-thu.html')
    d87 = data(P)
    save_here(P, 'Lưu sau cập nhật')
    k87 = count('kho'); main_b = [k for k in GMS['main'] if k.startswith('sdt_b_') or k == 'sdt_meta']
    ok('CT-87 cập nhật script chính không mất dấu trang', len(d87.get('bookmarks', [])) == 16 and k87 == 17 and not main_b and storage(P)['mode'] == 'kho-page',
       [len(d87.get('bookmarks', [])), k87, main_b])
    # vị trí nút ruy băng cũng nằm trong Kho
    rb = T(P, 'soul-ribbon').bounding_box()
    P.mouse.move(rb['x'] + 20, rb['y'] + 20); P.mouse.down(); P.mouse.move(rb['x'] + 20, rb['y'] - 180, steps=8); P.mouse.up(); W(P, 300)
    ok('CT-87 vị trí nút cất trong Kho', 'sdt_ui' in GMS['kho'] and 'sdt_ui' not in GMS['main'], [list(GMS['kho'].keys())[:3]])
    P.close()

    # CT-88 cả hai bên có dữ liệu → gộp
    GMS['main'].clear(); GMS['kho'].clear()
    P = page(B); seed(P, sample()); P.close()
    s2 = sample()
    newer = dict(s2['bookmarks'][0]); newer['title'] = 'Conan (bản mới hơn)'; newer['updatedAt'] = newer['updatedAt'] + 86400000
    extra = [{'id': 'x1', 'title': 'Chỉ có ở kho riêng 1', 'url': 'https://rieng.vn/1', 'urlKey': 'rieng.vn/1', 'folderId': None, 'tags': [], 'createdAt': 1785000000000, 'updatedAt': 1785000000000, 'order': 9},
             {'id': 'x2', 'title': 'Chỉ có ở kho riêng 2', 'url': 'https://rieng.vn/2', 'urlKey': 'rieng.vn/2', 'folderId': 'cv', 'tags': [], 'createdAt': 1785000000000, 'updatedAt': 1785000000000, 'order': 9}]
    local_d = {'version': 2, 'folders': s2['folders'], 'bookmarks': [newer] + extra, 'tagColors': {}}
    kho_saved = dict(GMS['kho']); GMS['kho'].clear(); GMS['main'].clear()
    P = page(A); seed(P, local_d); P.close()           # ghi vào kho riêng (không có Kho)
    GMS['kho'].update(kho_saved); GMS['main'].pop('sdt_kho_moved', None)
    P = page(B)
    t88 = titles('kho')
    ok('CT-88 cả hai có dữ liệu → gộp, không mất bên nào', len(t88) == 18 and t88.get('b1') == 'Conan (bản mới hơn)' and 'x1' in t88 and 'x2' in t88 and storage(P)['mode'] == 'kho-page',
       [len(t88), t88.get('b1')])
    P.close()

    # CT-89 Kho bị tắt sau khi đã chuyển → báo lỗi, không ghi
    snap = dict(GMS['kho']); snap_main = dict(GMS['main'])
    P = page(A)
    st89 = storage(P); rib = T(P, 'soul-ribbon').get_attribute('data-state')
    open_mgr(P)
    err_b = T(P, 'error-banner').is_visible() and 'Không thấy script' in T(P, 'error-banner').inner_text()
    T(P, 'fab-add').click(); T(P, 'bm-url').fill('https://khong-ghi.vn'); T(P, 'bm-save').click(); W(P, 400)
    ok('CT-89 Kho bị tắt: báo lỗi, không ghi', st89['mode'] == 'missing' and rib == 'err' and err_b and GMS['kho'] == snap and GMS['main'] == snap_main,
       [st89, rib, err_b, GMS['kho'] == snap])
    P.close()

    # CT-161 (2.8.1) Kho chạy trễ hơn script chính (Soul không bảo đảm thứ tự): vẫn dùng Kho, ruy băng đỏ, đủ dấu trang
    snap161 = (dict(GMS['main']), dict(GMS['kho']))
    GMS['main'].clear(); GMS['kho'].clear()
    P = page(B); seed(P, sample()); save_here(P, 'Trang thử đã lưu'); P.close()
    n_kho = count('kho')
    def ribbon_on(pg, t=8.0):
        end = time.time() + t
        while time.time() < end:
            if T(pg, 'soul-ribbon').get_attribute('data-state') == 'on': return True
            W(pg, 100)
        return False
    res161 = {}
    for name, delay, wipe in (('cap-nhat-tre-0.6s', 600, True), ('da-chuyen-tre-0.6s', 600, False), ('cap-nhat-tre-4s', 4000, True)):
        if wipe: GMS['main'].clear()          # giả "bấm cập nhật" script chính
        D = ctx_(with_kho=True, kho_delay=delay)
        P = page(D, '/trang-thu.html')
        on = ribbon_on(P)
        st = storage(P)
        n = len(data(P).get('bookmarks', []))
        open_mgr(P); W(P, 300)
        no_err = T(P, 'error-banner').count() == 0 and T(P, 'env-banner').count() == 0
        main_data = [k for k in GMS['main'] if k.startswith('sdt_b_') or k == 'sdt_meta']
        res161[name] = [on, st['mode'], n, no_err, main_data]
        P.close(); D.close()
    ok('CT-161 Kho chạy trễ: vẫn dùng Kho, ruy băng đỏ, trình quản lý đủ dấu trang',
       all(v[0] and v[1] == 'kho-page' and v[2] == n_kho and v[3] and not v[4] for v in res161.values()) and n_kho == 17, [n_kho, res161])
    GMS['main'].clear(); GMS['main'].update(snap161[0]); GMS['kho'].clear(); GMS['kho'].update(snap161[1])

    # CT-90 đường sự kiện DOM; Kho từ chối khóa lạ và lệnh xóa toàn bộ
    C = ctx_(with_kho=True, force_events=True)
    P = page(C, '/trang-hai.html')
    st90 = storage(P); n90 = len(data(P).get('bookmarks', []))
    save_here(P, 'Lưu qua sự kiện')
    attack = P.evaluate("""() => {
      const res = []; const on = e => res.push(JSON.parse(e.detail)); document.addEventListener('sdt-kho:res', on);
      for (const q of [{ id: 'a', op: 'set', data: { khac: 'x' } }, { id: 'b', op: 'clear' }, { id: 'c', op: 'set', data: { sdt_meta: 5 } }])
        document.dispatchEvent(new CustomEvent('sdt-kho:req', { detail: JSON.stringify(q) }));
      document.removeEventListener('sdt-kho:res', on); return res.map(r => r.ok); }""")
    ok('CT-90 đường sự kiện chạy; khóa lạ, lệnh lạ bị từ chối', st90['channel'] == 'events' and n90 == 18 and count('kho') == 19 and attack == [False, False, False] and 'khac' not in GMS['kho'],
       [st90, n90, count('kho'), attack])
    P.close(); C.close()

    # CT-92 trang bảo mật chặt
    P = page(B, '/tt.html')
    T(P, 'soul-ribbon').click(); P.wait_for_selector('[data-test="popup-status"]'); W(P, 200)
    ok('CT-92 trang bảo mật chặt: hai script vẫn nói chuyện được', storage(P)['mode'] == 'kho-page' and T(P, 'popup-save').last.is_visible(), storage(P))
    P.close()

    # CT-91 tốc độ với 50.000 dấu trang trong Kho
    GMS['main'].clear(); GMS['kho'].clear()
    big = {'version': 2, 'folders': [], 'tagColors': {}, 'bookmarks': []}
    for i in range(50000):
        u = f'https://trang{i}.vidu.vn/bai/{i}'
        big['bookmarks'].append({'id': f'k{i}', 'title': f'Bài {i}', 'url': u, 'urlKey': key(u), 'folderId': None, 'tags': [], 'createdAt': 1700000000000 + i, 'updatedAt': 1700000000000 + i, 'order': i})
    u0 = f'{L}/trang-thu.html'
    big['bookmarks'].append({'id': 'kk', 'title': 'Trang thử', 'url': u0, 'urlKey': key(u0), 'folderId': None, 'tags': [], 'createdAt': 1, 'updatedAt': 1, 'order': 0})
    P = page(B); seed(P, big); P.close()
    times, states = [], []
    for _ in range(3):
        P = page(B, '/trang-thu.html')
        times.append(round(P.evaluate("window.__SDT_SOUL__.timing.checks[0]"), 1)); states.append(T(P, 'soul-ribbon').get_attribute('data-state')); P.close()
    ok('CT-91 50.000 dấu trang trong Kho: kiểm tra trang ≤ 30 ms', max(times) <= 30 and states == ['on'] * 3, [times, states])

    ok('CT-C6 không lỗi console (Kho)', not errs, errs[:5])
    b.close()

srv.shutdown()
qua = sum(kq.values())
print(f'\nScript Kho: {qua}/{len(kq)} qua')
json.dump({'kq': kq, 'notes': notes}, open(os.path.join(OUT, 'ketqua-kho.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
sys.exit(0 if qua == len(kq) else 1)
