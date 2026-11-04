# python3 tests/html_ui_test.py — nghiệm thu CN-18 (nhập/xuất HTML) trên bản tiện ích. Chạy python3 tests/html_mau.py trước.
import os, sys, json, time, tempfile, collections
from html.parser import HTMLParser
from playwright.sync_api import sync_playwright
HERE = os.path.dirname(os.path.abspath(__file__))
src = open(os.path.join(HERE, 'ui_test.py'), encoding='utf-8').read().split('def is_drawer_open')[0]
g = {'__file__': os.path.join(HERE, 'ui_test.py')}
exec(compile(src, 'ui_helpers', 'exec'), g)
launch, open_manager, Probe, T, W, ok, kq, notes, errs = (g[k] for k in ('launch', 'open_manager', 'Probe', 'T', 'W', 'ok', 'kq', 'notes', 'errs'))
sample = g['sample']
H = os.path.join(HERE, 'out', 'html')
OUT = os.path.join(HERE, 'out')

class Tree(HTMLParser):
    """Bộ đọc HTML chuẩn của Python: dựng (đường dẫn thư mục → [tên thư mục con], [dấu trang]) từ tệp xuất."""
    def __init__(s):
        super().__init__(convert_charrefs=True); s.stack = ['']; s.pending = None; s.cur = None; s.buf = ''
        s.subs = collections.defaultdict(list); s.items = collections.defaultdict(list)
    def handle_starttag(s, t, a):
        a = dict(a)
        if t == 'dl': s.stack.append(s.pending if s.pending is not None else s.stack[-1]); s.pending = None
        elif t in ('h3', 'a'): s.cur = (t, a); s.buf = ''
    def handle_endtag(s, t):
        if t == 'dl': s.stack.pop()
        elif t in ('h3', 'a') and s.cur:
            kind, a = s.cur; p = s.stack[-1]
            if kind == 'h3': s.subs[p].append(s.buf); s.pending = (p + ' › ' if p else '') + s.buf
            else: s.items[p].append((s.buf, a.get('href'), int(a.get('add_date')), a.get('tags') or ''))
            s.cur = None
    def handle_data(s, d):
        if s.cur: s.buf += d

def paths(d):
    F = {f['id']: f for f in d['folders']}
    def p(i):
        out = []
        while i: out.append(F[i]['name']); i = F[i]['parentId']
        return ' › '.join(reversed(out))
    return p

def summary(d, sec=True):
    p = paths(d)
    subs = collections.defaultdict(list); items = collections.defaultdict(list)
    for f in sorted(d['folders'], key=lambda f: (f['order'], f['createdAt'], f['id'])): subs[p(f['parentId'])].append(f['name'])
    for b in sorted(d['bookmarks'], key=lambda b: (b['order'], b['createdAt'], b['id'])):
        items[p(b['folderId'])].append((b['title'], b['url'], b['createdAt'] // 1000 if sec else b['createdAt'], ','.join(b['tags'])))
    return dict(subs), dict(items)

def open_backup(M):
    for _ in range(3):
        if not M.evaluate("[...document.querySelectorAll('dialog')].some(d => d.open)"): break
        M.keyboard.press('Escape'); W(M, 200)
    T(M, 'btn-more').click(); T(M, 'menu-backup').click(); W(M, 250)

def result(M): return T(M, 'backup-result').inner_text().strip()
def is_err(M): return 'err' in (T(M, 'backup-result').get_attribute('class') or '')

def do_import(M, f, mode, confirm=True, wait=60):
    open_backup(M)
    T(M, 'backup-file').set_input_files(f)
    T(M, f'backup-mode-{mode}').check(force=True)
    M.evaluate("""() => { window.__res = []; const el = document.querySelector('[data-test="backup-result"]');
        el.textContent = ''; new MutationObserver(() => window.__res.push(el.textContent)).observe(el, { childList: true, characterData: true, subtree: true }); }""")
    t0 = time.time(); T(M, 'backup-import').click()
    end = time.time() + wait
    while time.time() < end:
        if mode == 'replace' and T(M, 'dlg-replace').count() and T(M, 'dlg-replace').first.is_visible():
            T(M, 'dlg-replace').locator('[data-test="%s"]' % ('dlg-ok' if confirm else 'dlg-cancel')).click()
        r = result(M)
        if r and r != 'Đang đọc tệp…': break
        M.wait_for_timeout(50)
    W(M, 300)
    return result(M), round(time.time() - t0, 2), M.evaluate('window.__res')

with sync_playwright() as p:
    # ---------- hồ sơ 1: dữ liệu mẫu ----------
    ctx, eid = launch(p, tempfile.mkdtemp(), w=390)
    pr = Probe(ctx, eid)
    s = sample(); s['bookmarks'][0]['title'] = 'Conan & "Kid" <đặc biệt>'
    pr.seed(s)
    M = open_manager(ctx, eid)
    open_backup(M)
    ok('CT-75 có nút Xuất tệp HTML, ô chọn nhận .html', T(M, 'backup-export-html').is_visible() and '.html' in T(M, 'backup-file').get_attribute('accept'))
    with M.expect_download() as dl: T(M, 'backup-export-html').click()
    d1 = dl.value; f_exp = os.path.join(OUT, 'xuat-thu.html'); d1.save_as(f_exp)
    html = open(f_exp, encoding='utf-8').read()
    import datetime
    today = datetime.datetime.now(datetime.timezone(datetime.timedelta(hours=7))).strftime('%Y-%m-%d')
    ok('CT-75 tên tệp', d1.suggested_filename == f'so-dau-trang-{today}.html', d1.suggested_filename)
    ok('CT-75 mở đầu Netscape', html.startswith('<!DOCTYPE NETSCAPE-Bookmark-file-1>'))
    tp = Tree(); tp.feed(html)
    data0 = pr.data(); subs0, items0 = summary(data0)
    items_parsed = {k: [(t, u, d, tg) for t, u, d, tg in v] for k, v in tp.items.items()}
    ok('CT-75 bộ đọc HTML chuẩn ra đúng cây và thứ tự', dict(tp.subs) == subs0 and items_parsed == items0,
       {'subs': [dict(tp.subs), subs0]} if dict(tp.subs) != subs0 else [x for x in items_parsed.items() if items0.get(x[0]) != x[1]][:2])
    ok('CT-75 mã hóa & < > "', 'Conan &amp; &quot;Kid&quot; &lt;đặc biệt&gt;' in html)
    M.keyboard.press('Escape'); W(M, 200)

    # CT-78 gộp vào dữ liệu mẫu
    r1, t1, _ = do_import(M, os.path.join(H, 'gop.html'), 'merge')
    d = pr.data()
    ok('CT-78 gộp lần một', r1.startswith('Đã gộp: thêm 4 dấu trang, bỏ qua 3 đã có; thêm 1 thư mục') and len(d['bookmarks']) == 20 and len(d['folders']) == 8, r1)
    r2, _, _ = do_import(M, os.path.join(H, 'gop.html'), 'merge')
    d2 = pr.data()
    ok('CT-78 gộp lần hai không thêm', r2.startswith('Đã gộp: thêm 0 dấu trang, bỏ qua 7 đã có; thêm 0 thư mục') and len(d2['bookmarks']) == 20, r2)

    # CT-81 tệp không đúng → báo lỗi, dữ liệu giữ nguyên
    before = pr.data()
    bad = []
    for f in ('trang-thuong.html', 'rong.html', 'rac.html', 'chi-js.html'):
        r, _, _ = do_import(M, os.path.join(H, f), 'replace')
        bad.append((f, is_err(M), r))
    ok('CT-81 báo lỗi, dữ liệu không đổi', all(e for _, e, _ in bad) and pr.data() == before, bad)
    T(M, 'backup-file').set_input_files([])
    T(M, 'backup-import').click(); W(M, 200)
    ok('CT-81 chưa chọn tệp', 'Chọn một tệp .json hoặc .html' in result(M))

    # CT-76 kiểu Chrome, Thay thế → hỏi xác nhận; Hủy giữ nguyên
    r, _, _ = do_import(M, os.path.join(H, 'chrome.html'), 'replace', confirm=False)
    ok('CT-76 Hủy → giữ nguyên', 'Đã hủy' in r and pr.data() == before, r)
    r, _, _ = do_import(M, os.path.join(H, 'chrome.html'), 'replace')
    d = pr.data(); sb, it = summary(d, sec=False)
    ok('CT-76 thay thế bằng tệp Chrome', r == 'Đã thay thế: 4 dấu trang, 4 thư mục.' and sb.get('') == ['Bookmarks bar', 'Other bookmarks']
       and it.get('Bookmarks bar') == [('Tom & Jerry <3', 'https://vidu.vn/a?x=1&y=2', 1785000010000, ''), ('VnExpress', 'https://vnexpress.net/', 1785000050000, '')], [r, sb, it])

    # CT-77 kiểu Soul
    r, _, _ = do_import(M, os.path.join(H, 'soul.html'), 'replace')
    d = pr.data(); sb, it = summary(d, sec=False)
    ok('CT-77 tệp Soul', r.startswith('Đã thay thế: 6 dấu trang, 4 thư mục.') and 'Bỏ 2 mục không phải trang web: “Ứng dụng”, “↔ Công cụ”' in r
       and sb.get('Favorites bar') == ['Trống', 'Phim', 'phim (2)'] and [x[0] for x in it.get('Favorites bar', [])] == ['Một', 'Đổi (GB) <> (Big5) & "x"', 'Ba'], [r, sb, it.get('Favorites bar')])
    M.keyboard.press('Escape'); W(M, 200)
    M.reload(); M.wait_for_selector('body.ready'); W(M, 300)
    T(M, 'list-folder').first.click(); W(M, 400)
    ok('CT-77 xem thư mục sau nhập', T(M, 'view-title').inner_text().strip() == 'Favorites bar' and T(M, 'list-item').count() == 3 and T(M, 'list-folder').count() == 3)

    # CT-79 kiểu Firefox (Gộp)
    r, _, _ = do_import(M, os.path.join(H, 'firefox.html'), 'merge')
    d = pr.data()
    conan = next(b for b in d['bookmarks'] if b['title'] == 'Conan')
    ok('CT-79 nhãn TAGS, ngày cập nhật', conan['tags'] == ['anime', 'Hay'] and conan['updatedAt'] == 1785090000000, [r, conan])
    M.keyboard.press('Escape'); W(M, 200)
    M.set_viewport_size({'width': 360, 'height': 800}); open_backup(M); W(M, 200)
    hs = M.evaluate("() => { const d = [...document.querySelectorAll('dialog')].find(x => x.open); return d ? d.scrollWidth <= d.clientWidth + 1 && document.documentElement.scrollWidth <= innerWidth : false; }")
    hb = T(M, 'backup-export-html').bounding_box()['height']
    ok('CT-C3 khung 360: màn Sao lưu không cuộn ngang', hs and hb >= 44, hb)
    M.screenshot(path=os.path.join(OUT, 'v21-saoluu-360.png'))
    M.keyboard.press('Escape'); W(M, 200)
    M.set_viewport_size({'width': 390, 'height': 844})

    # CT-82 tệp ~100 MB
    big = os.path.join(H, 'lon.html')
    if os.path.exists(big):
        r, t, seen = do_import(M, big, 'replace', wait=120)
        ok(f'CT-82 tệp {os.path.getsize(big) // 1_000_000} MB nhập {t} s', r == 'Đã thay thế: 11000 dấu trang, 160 thư mục.' and t <= 5 and 'Đang đọc tệp…' in seen and len(pr.data()['bookmarks']) == 11000, [r, t, seen[:3]])
    ok('CT-C1 không lỗi console (hồ sơ 1)', not errs, errs[:5])
    ctx.close()

    # ---------- CT-80: xuất ở hồ sơ 1 (dữ liệu mẫu) → nhập ở hồ sơ mới ----------
    ctx2, eid2 = launch(p, tempfile.mkdtemp(), w=390)
    pr2 = Probe(ctx2, eid2)
    M2 = open_manager(ctx2, eid2)
    r, _, _ = do_import(M2, f_exp, 'replace')
    got = pr2.data()
    ok('CT-80 xuất → nhập hồ sơ mới khớp', summary(got) == (subs0, items0) and r.startswith('Đã thay thế: 16 dấu trang, 7 thư mục.'), r)
    upd = {b['title']: b['updatedAt'] // 1000 for b in data0['bookmarks']}
    ok('CT-80 ngày cập nhật khớp tới giây', all(upd[b['title']] == b['updatedAt'] // 1000 for b in got['bookmarks']))
    # JSON vẫn nhập như cũ
    exp_json = os.path.join(OUT, 'xuat-thu.json')
    json.dump({'app': 'so-dau-trang', 'version': 2, 'exportedAt': '2026-11-04T00:00:00Z', 'folders': data0['folders'],
               'bookmarks': [{k: v for k, v in b.items() if k != 'urlKey'} for b in data0['bookmarks']], 'tagColors': data0.get('tagColors', {})}, open(exp_json, 'w', encoding='utf-8'), ensure_ascii=False)
    r, _, _ = do_import(M2, exp_json, 'replace')
    ok('hồi quy: nhập JSON vẫn đúng', r.startswith('Đã thay thế: 16 dấu trang, 7 thư mục.') and pr2.data()['tagColors'] == data0['tagColors'], r)
    ok('CT-C1 không lỗi console (hồ sơ 2)', not errs, errs[:5])
    ctx2.close()

qua = sum(kq.values())
print(f'\nNhập/xuất HTML (giao diện): {qua}/{len(kq)} qua')
json.dump({'kq': kq, 'notes': notes}, open(os.path.join(OUT, 'ketqua-html-ui.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
sys.exit(0 if qua == len(kq) else 1)
