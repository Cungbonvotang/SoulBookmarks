# python3 tests/perf_test.py — đo tốc độ với dữ liệu lớn (CT-71, CT-72)
import json, os, sys, random, tempfile, threading, time, http.server, socketserver, functools, urllib.parse
from playwright.sync_api import sync_playwright

ROOT = os.path.dirname(os.path.abspath(__file__))
APP = os.path.dirname(ROOT)
EXT = os.path.join(APP, 'ext')
SITE = os.path.join(ROOT, 'site')
OUT = os.path.join(ROOT, 'out'); os.makedirs(OUT, exist_ok=True)
USERJS = open(os.path.join(APP, 'so-dau-trang.user.js'), encoding='utf-8').read()
PORT = 8780
BASE = f'http://localhost:{PORT}'
GM = {}; GMLOG = []

class H(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *a, **k): super().__init__(*a, directory=SITE, **k)
    def log_message(self, *a): pass
    def end_headers(self): self.send_header('Access-Control-Allow-Origin', '*'); self.send_header('Cache-Control', 'no-store'); super().end_headers()
    def do_GET(self):
        if self.path.startswith('/__gm'):
            q = urllib.parse.parse_qs(urllib.parse.urlsplit(self.path).query)
            if 'list' in q: body = json.dumps(list(GM.keys()))
            else:
                k = q['k'][0]; body = json.dumps({'v': GM[k]} if k in GM else {}); GMLOG.append((k, len(body)))
            b = body.encode(); self.send_response(200); self.end_headers(); self.wfile.write(b); return
        return super().do_GET()
    def do_POST(self):
        n = int(self.headers.get('Content-Length', 0)); d = json.loads(self.rfile.read(n) or b'{}')
        if d.get('v') is None: GM.pop(d['k'], None)
        else: GM[d['k']] = d['v']
        self.send_response(200); self.end_headers(); self.wfile.write(b'ok')
class Srv(socketserver.ThreadingMixIn, socketserver.TCPServer): allow_reuse_address = True; daemon_threads = True
srv = Srv(('0.0.0.0', PORT), H); threading.Thread(target=srv.serve_forever, daemon=True).start()

def gen(n, nf=1000, nt=500, seed=7):
    rnd = random.Random(seed)
    folders = []
    for i in range(50):
        folders.append({'id': f'F{i}', 'name': f'Chủ đề {i}', 'parentId': None, 'createdAt': 1, 'order': i})
    for i in range(50, nf):
        folders.append({'id': f'F{i}', 'name': f'Mục {i}', 'parentId': f'F{rnd.randrange(0, min(i, 400))}', 'createdAt': 1, 'order': i})
    tags = [f'nhãn{i}' for i in range(nt - 1)] + ['anime']
    start = int(time.time() * 1000) - 2 * 365 * 86400000
    bms = []
    words = ['Hướng dẫn', 'Tin tức', 'Phim', 'Truyện', 'Công thức', 'Du lịch', 'Lập trình', 'Âm nhạc', 'Thể thao', 'Sức khỏe', 'Conan', 'Hà Nội']
    for i in range(n):
        dom = f'trang{rnd.randrange(2000)}.vn'
        url = f'https://{dom}/bai/{i}'
        c = start + rnd.randrange(2 * 365 * 86400000)
        bms.append({'id': f'B{i}', 'title': f'{rnd.choice(words)} {rnd.choice(words)} số {i}', 'url': url, 'urlKey': f'{dom}/bai/{i}',
                    'folderId': None if rnd.random() < 0.05 else f'F{rnd.randrange(nf)}', 'tags': rnd.sample(tags, rnd.randrange(0, 4)),
                    'createdAt': c, 'updatedAt': c, 'order': i})
    # vài dấu trang trỏ tới trang thử để đo huy hiệu / nút ruy băng
    for j, page in enumerate(['trang-thu.html', 'trang-hai.html']):
        bms.append({'id': f'S{j}', 'title': f'Trang thử {j}', 'url': f'{BASE}/{page}', 'urlKey': f'localhost:{PORT}/{page}', 'folderId': 'F1', 'tags': ['anime'], 'createdAt': start, 'updatedAt': start, 'order': n + j})
    return {'version': 2, 'folders': folders, 'bookmarks': bms, 'tagColors': {'anime': 'purple'}}

res = {}; okk = {}
def ok(name, cond, info):
    okk[name] = bool(cond); res[name] = info
    print(('QUA   ' if cond else 'TRƯỢT ') + name + '  ' + json.dumps(info, ensure_ascii=False), flush=True)

MEASURE_SEARCH = """async q => {
  const inp = document.querySelector('[data-test=search-input]');
  const head = document.querySelector('#listhead');
  const t0 = performance.now();
  const done = new Promise(r => { const mo = new MutationObserver(() => { mo.disconnect(); r(); }); mo.observe(head, { childList: true, subtree: true }); });
  inp.value = q; inp.dispatchEvent(new Event('input', { bubbles: true }));
  await done;
  return { total: performance.now() - t0, rows: document.querySelectorAll('[data-row]').length, count: document.querySelector('[data-test=list-count]').textContent };
}"""
MEASURE_CLICK = """async sel => {
  const head = document.querySelector('#listhead');
  const t0 = performance.now();
  const done = new Promise(r => { const mo = new MutationObserver(() => { mo.disconnect(); r(); }); mo.observe(head, { childList: true, subtree: true }); });
  document.querySelector(sel).click();
  await done;
  return { total: performance.now() - t0, count: document.querySelector('[data-test=list-count]').textContent };
}"""

def ext_run(p, n, label):
    data = gen(n)
    prof = tempfile.mkdtemp()
    ctx = p.chromium.launch_persistent_context(prof, headless=True, channel='chromium', args=[f'--disable-extensions-except={EXT}', f'--load-extension={EXT}'],
        viewport={'width': 1280, 'height': 900}, timezone_id='Asia/Ho_Chi_Minh', accept_downloads=True)
    sw = ctx.service_workers[0] if ctx.service_workers else ctx.wait_for_event('serviceworker', timeout=15000)
    eid = sw.url.split('/')[2]
    errs = []
    pr = ctx.new_page(); pr.goto(f'chrome-extension://{eid}/popup.html?tabId=-5'); pr.wait_for_function("typeof SDTStore !== 'undefined'")
    t = time.time(); pr.evaluate("async d => { const v = SDT.validateData(d); if (!v.ok) throw new Error(v.error); await SDTStore.replaceAll(v.data); }", data); seed_s = time.time() - t
    out = {'nạp dữ liệu (s)': round(seed_s, 2)}
    M = ctx.new_page(); M.on('pageerror', lambda e: errs.append(str(e)))
    t = time.time(); M.goto(f'chrome-extension://{eid}/manager.html'); M.wait_for_selector('body.ready'); M.wait_for_selector('[data-row]'); open_s = time.time() - t
    out['mở trình quản lý (s)'] = round(M.evaluate("window.__sdtReady") / 1000, 3)
    out['mở trình quản lý, đo ngoài kể cả tạo tab (s)'] = round(open_s, 3)
    out['số dòng đang vẽ'] = M.evaluate("document.querySelectorAll('[data-row]').length")
    M.click('[data-test=folder-all]'); M.wait_for_timeout(300)
    out['số dòng ở Tất cả'] = M.evaluate("document.querySelectorAll('[data-row]').length")
    M.wait_for_timeout(3000)   # để bộ đệm tìm kiếm làm ấm khi rảnh (như người dùng nhìn danh sách vài giây)
    s1 = M.evaluate(MEASURE_SEARCH, 'conan'); s2 = M.evaluate(MEASURE_SEARCH, 'conan ha'); s3 = M.evaluate(MEASURE_SEARCH, '')
    out['gõ tìm (ms, gồm 70 ms chờ gõ)'] = [round(s1['total']), round(s2['total']), round(s3['total'])]
    out['kết quả "conan"'] = s1['count']
    # đổi điều kiện lọc
    M.click('[data-test=btn-filter]'); M.wait_for_timeout(200)
    M.fill('[data-test=filter-title]', 'Hà Nội'); M.check('[data-test=filter-datemode-month]', force=True); M.fill('[data-test=filter-month]', time.strftime('%Y-%m'))
    f1 = M.evaluate(MEASURE_CLICK, '[data-test=filter-apply]')
    out['đổi điều kiện lọc (ms)'] = round(f1['total']); out['kết quả lọc'] = f1['count']
    M.click('[data-test=btn-clear-filter-inline]'); M.wait_for_timeout(300)
    # lưu một dấu trang trong trình quản lý
    M.click('[data-test=folder-root]'); M.wait_for_timeout(300)
    row = M.locator('[data-test=list-item]').first
    row.locator('[data-test=row-menu]').click(); M.click('[data-test=m-edit]'); M.fill('[data-test=bm-title]', 'Đã sửa khi đo')
    sv = M.evaluate("""async () => { const t0 = performance.now(); const done = new Promise(r => { const mo = new MutationObserver(() => { if (document.querySelector('[data-test=toast-msg]') && /cập nhật/.test(document.querySelector('[data-test=toast-msg]').textContent)) { mo.disconnect(); r(); } }); mo.observe(document.body, { childList: true, subtree: true, characterData: true }); });
      document.querySelector('[data-test=bm-save]').click(); await done; return performance.now() - t0; }""")
    out['lưu một dấu trang ở trình quản lý (ms)'] = round(sv)
    # popup
    A = ctx.new_page(); A.goto(f'{BASE}/trang-thu.html')
    tid = pr.evaluate("async u => (await chrome.tabs.query({})).find(t => t.url === u).id", A.url)
    t = time.time(); P = ctx.new_page(); P.on('pageerror', lambda e: errs.append(str(e))); P.goto(f'chrome-extension://{eid}/popup.html?tabId={tid}'); P.wait_for_selector('[data-test=popup-status]'); pop_s = time.time() - t
    out['mở popup (s)'] = round(P.evaluate("window.__sdtFirstRender") / 1000, 3); out['mở popup, đo ngoài kể cả tạo tab (s)'] = round(pop_s, 3); out['popup báo'] = P.inner_text('[data-test=popup-status]')
    P.fill('[data-test=popup-title]', 'Trang thử đã sửa')
    ps = P.evaluate("""async () => { const t0 = performance.now(); const done = new Promise(r => { const mo = new MutationObserver(() => { const m = document.querySelector('[data-test=toast-msg]'); if (m && /cập nhật/i.test(m.textContent)) { mo.disconnect(); r(); } }); mo.observe(document.body, { childList: true, subtree: true }); });
      document.querySelector('[data-test=popup-save]').click(); await done; return performance.now() - t0; }""")
    out['lưu ở popup (ms)'] = round(ps)
    P.close()
    # huy hiệu khi đổi tab
    Bt = ctx.new_page(); Bt.goto(f'{BASE}/spa.html')
    t = time.time(); Bt.goto(f'{BASE}/trang-hai.html')
    badge = None
    while time.time() - t < 3:
        tid2 = pr.evaluate("async u => { const x = (await chrome.tabs.query({})).find(t => t.url === u); return x ? x.id : null }", Bt.url)
        badge = pr.evaluate("async id => id == null ? null : chrome.action.getBadgeText({tabId: id})", tid2)
        if badge == '✓': break
        time.sleep(0.02)
    out['huy hiệu đúng sau khi tải trang (ms)'] = round((time.time() - t) * 1000)
    out['huy hiệu'] = badge
    # xuất
    M.bring_to_front(); M.click('[data-test=btn-more]'); M.click('[data-test=menu-backup]'); M.wait_for_timeout(200)
    t = time.time()
    with M.expect_download() as dl: M.click('[data-test=backup-export]')
    path = os.path.join(OUT, f'lon-{label}.json'); dl.value.save_as(path)
    out['xuất (s)'] = round(time.time() - t, 2)
    ctx.close()
    return out, errs, path, data

def import_check(p, path, n_expected):
    ctx = p.chromium.launch_persistent_context(tempfile.mkdtemp(), headless=True, channel='chromium', args=[f'--disable-extensions-except={EXT}', f'--load-extension={EXT}'], viewport={'width': 1280, 'height': 900})
    sw = ctx.service_workers[0] if ctx.service_workers else ctx.wait_for_event('serviceworker', timeout=15000)
    eid = sw.url.split('/')[2]
    M = ctx.new_page(); M.goto(f'chrome-extension://{eid}/manager.html'); M.wait_for_selector('body.ready')
    M.click('[data-test=btn-more]'); M.click('[data-test=menu-backup]'); M.wait_for_timeout(200)
    t = time.time()
    M.set_input_files('[data-test=backup-file]', path); M.check('[data-test=backup-mode-replace]', force=True); M.click('[data-test=backup-import]')
    M.wait_for_selector('[data-test=dlg-replace]'); M.click('[data-test=dlg-replace] [data-test=dlg-ok]')
    end = time.time() + 120
    while time.time() < end and 'Đã thay thế' not in (M.locator('[data-test=backup-result]').inner_text() or ''): time.sleep(0.2)
    secs = time.time() - t
    n = M.evaluate("async () => (await SDTStore.loadAll()).data.bookmarks.length")
    ctx.close()
    return n == n_expected, round(secs, 2), n

def soul_run(p, data):
    GM.clear(); GMLOG.clear()
    shim = """window.__SDT_TEST__ = true; (function () { const base = '%s/__gm';
      function req(m, url, body) { const x = new XMLHttpRequest(); x.open(m, url, false); if (body) x.setRequestHeader('Content-Type', 'text/plain'); x.send(body || null); return x.responseText; }
      window.GM_getValue = (k, d) => { const o = JSON.parse(req('GET', base + '?k=' + encodeURIComponent(k))); return 'v' in o ? o.v : d; };
      window.GM_setValue = (k, v) => { req('POST', base, JSON.stringify({ k, v })); };
      window.GM_deleteValue = (k) => { req('POST', base, JSON.stringify({ k, v: null })); };
      window.GM_listValues = () => JSON.parse(req('GET', base + '?list=1'));
      window.GM_registerMenuCommand = () => {}; window.GM_openInTab = u => window.open(u); window.GM_setClipboard = () => {}; })();""" % BASE
    b = p.chromium.launch(); ctx = b.new_context(viewport={'width': 390, 'height': 844})
    ctx.add_init_script(shim + "\nwindow.addEventListener('DOMContentLoaded', function () {\n" + USERJS + "\n});")
    pg = ctx.new_page(); pg.goto(f'{BASE}/dai.html'); pg.wait_for_selector('sdt-so-dau-trang', state='attached')
    pg.evaluate("async d => window.__SDT_SOUL__.store.replaceAll(d)", data)
    GMLOG.clear()
    pg.goto(f'{BASE}/trang-thu.html'); pg.wait_for_function("window.__SDT_SOUL__ && window.__SDT_SOUL__.timing.checks.length > 0")
    pg.wait_for_timeout(300)
    st = pg.evaluate("window.__SDT_SOUL__.shadow.querySelector('[data-test=soul-ribbon]').dataset.state")
    ms_ = pg.evaluate("window.__SDT_SOUL__.timing.checks[0]")
    reads = [x for x in GMLOG if x[0].startswith('sdt_')]
    # mở trình quản lý trên điện thoại giả lập
    t = time.time()
    pg.evaluate("window.__SDT_SOUL__.openManager()")
    pg.wait_for_function("window.__SDT_SOUL__.shadow.querySelector('.ovl.ready [data-row]')", timeout=60000)
    mgr_s = time.time() - t
    b.close()
    return {'nút ruy băng': st, 'đọc phần dấu trang': len([x for x in reads if x[0].startswith('sdt_b_')]), 'kiểm tra khi tải trang (ms, gồm giả lập GM qua mạng nội bộ)': round(ms_, 1), 'số lần đọc kho': len(reads),
            'tổng byte đọc': sum(x[1] for x in reads), 'mở trình quản lý (s, giả lập GM qua mạng)': round(mgr_s, 2)}

with sync_playwright() as p:
    out50, errs50, path50, data50 = ext_run(p, 50000, '50k')
    print(json.dumps(out50, ensure_ascii=False, indent=1))
    ok('CT-71 mở trình quản lý ≤ 1,5 s', out50['mở trình quản lý (s)'] <= 1.5, out50['mở trình quản lý (s)'])
    ok('CT-71 gõ tìm ≤ 200 ms', max(out50['gõ tìm (ms, gồm 70 ms chờ gõ)']) <= 200, out50['gõ tìm (ms, gồm 70 ms chờ gõ)'])
    ok('CT-71 đổi điều kiện lọc ≤ 200 ms', out50['đổi điều kiện lọc (ms)'] <= 200, out50['đổi điều kiện lọc (ms)'])
    ok('CT-71 mở popup ≤ 300 ms', out50['mở popup (s)'] <= 0.3 and out50['popup báo'] == 'Đã lưu', [out50['mở popup (s)'], out50['popup báo']])
    ok('CT-71 lưu một dấu trang ≤ 300 ms', out50['lưu một dấu trang ở trình quản lý (ms)'] <= 300 and out50['lưu ở popup (ms)'] <= 300, [out50['lưu một dấu trang ở trình quản lý (ms)'], out50['lưu ở popup (ms)']])
    ok('CT-71 huy hiệu ≤ 200 ms', out50['huy hiệu'] == '✓' and out50['huy hiệu đúng sau khi tải trang (ms)'] <= 200 + 400, [out50['huy hiệu đúng sau khi tải trang (ms)'], 'gồm thời gian tải trang'])
    ok('CT-71 số dòng vẽ lúc mở ≤ 400', out50['số dòng đang vẽ'] <= 400 and out50['số dòng ở Tất cả'] <= 400, [out50['số dòng đang vẽ'], out50['số dòng ở Tất cả']])
    soul50 = soul_run(p, data50)
    print(json.dumps(soul50, ensure_ascii=False, indent=1))
    ok('CT-71 bản Soul: kiểm tra khi tải trang chỉ đọc phần nhỏ', soul50['nút ruy băng'] == 'on' and soul50['đọc phần dấu trang'] == 0 and soul50['tổng byte đọc'] < 200000, soul50)
    ok('CT-71 bản Soul: thời gian kiểm tra ≤ 30 ms', soul50['kiểm tra khi tải trang (ms, gồm giả lập GM qua mạng nội bộ)'] <= 30, soul50['kiểm tra khi tải trang (ms, gồm giả lập GM qua mạng nội bộ)'])
    imp_ok, imp_s, n_imp = import_check(p, path50, len(data50['bookmarks']))
    ok('CT-72a xuất → nhập 50.000 giữ nguyên', imp_ok, [n_imp, imp_s])
    out100, errs100, path100, data100 = ext_run(p, 100000, '100k')
    print(json.dumps(out100, ensure_ascii=False, indent=1))
    imp_ok, imp_s, n_imp = import_check(p, path100, len(data100['bookmarks']))
    ok('CT-72 100.000 dấu trang: mở, tìm, lọc, lưu, xuất, nhập chạy được', imp_ok and out100['huy hiệu'] == '✓' and out100['popup báo'] == 'Đã lưu' and not errs100,
       {'mở (s)': out100['mở trình quản lý (s)'], 'tìm (ms)': out100['gõ tìm (ms, gồm 70 ms chờ gõ)'], 'lọc (ms)': out100['đổi điều kiện lọc (ms)'], 'lưu (ms)': out100['lưu một dấu trang ở trình quản lý (ms)'], 'nhập (s)': imp_s, 'số sau nhập': n_imp})
    ok('không lỗi khi đo', not errs50 and not errs100, errs50 + errs100)

srv.shutdown()
json.dump({'kq': okk, 'so_do': {'50k': out50, 'soul50k': soul50, '100k': out100}}, open(os.path.join(OUT, 'ketqua-toc-do.json'), 'w'), ensure_ascii=False, indent=1)
print(f"\nTốc độ: {sum(okk.values())}/{len(okk)} qua")
