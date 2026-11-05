# python3 tests/replace_ui_test.py — nghiệm thu đổi chữ hàng loạt (2.4.0) trên bản tiện ích
import os, sys, json, time, tempfile, urllib.parse
from playwright.sync_api import sync_playwright
HERE = os.path.dirname(os.path.abspath(__file__))
src = open(os.path.join(HERE, 'ui_test.py'), encoding='utf-8').read().split('def is_drawer_open')[0]
g = {'__file__': os.path.join(HERE, 'ui_test.py')}
exec(compile(src, 'ui_helpers', 'exec'), g)
launch, open_manager, Probe, T, W, ok, kq, notes, errs, sample = (g[k] for k in ('launch', 'open_manager', 'Probe', 'T', 'W', 'ok', 'kq', 'notes', 'errs', 'sample'))
OUT = os.path.join(HERE, 'out')

def key(u):
    p = urllib.parse.urlsplit(u); host = p.hostname.lower()
    if host.startswith('www.'): host = host[4:]
    return host + p.path.rstrip('/') + ('?' + p.query if p.query else '')
def mk(i, title, url):
    return {'id': i, 'title': title, 'url': url, 'urlKey': key(url), 'folderId': None, 'tags': [], 'createdAt': 1785000000000, 'updatedAt': 1785000000000, 'order': 100}
def wait_preview(M, starts, t=5):
    end = time.time() + t
    while time.time() < end:
        v = T(M, 'rp-preview').inner_text()
        if v.startswith(starts): return v
        W(M, 50)
    return T(M, 'rp-preview').inner_text()

with sync_playwright() as p:
    ctx, eid = launch(p, tempfile.mkdtemp(), w=390)
    pr = Probe(ctx, eid)
    s = sample()
    s['bookmarks'] += [mk('s1', 'Truyện qidian 1', 'https://www.sangtacviet.com/truyen/qidian/1/100/'),
                       mk('s2', 'Truyện qidian 2', 'https://www.sangtacviet.com/truyen/qidian/1/200/'),
                       mk('s3', 'Truyện fanqie', 'https://sangtacviet.com/truyen/fanqie/1/300/'),
                       mk('s4', 'Đã có bản .app', 'https://www.sangtacviet.app/truyen/qidian/1/100/')]
    pr.seed(s)
    M = open_manager(ctx, eid)

    # CT-110 ví dụ của người dùng: tìm → ⋯ → Đổi chữ các kết quả
    T(M, 'search-input').fill('www.sangtacviet.com'); W(M, 400)
    n_res = T(M, 'list-count').inner_text().strip()
    T(M, 'btn-more').click(); W(M, 250)
    mi = T(M, 'menu-replace').inner_text().strip()
    T(M, 'menu-replace').click(); W(M, 300)
    pre = T(M, 'rp-find').input_value()
    T(M, 'rp-with').fill('www.sangtacviet.app')
    pv = wait_preview(M, 'Sẽ đổi')
    samples = T(M, 'rp-sample').count(); okt = T(M, 'rp-ok').inner_text().strip()
    M.screenshot(path=os.path.join(OUT, 'v24-doichu.png'))
    T(M, 'rp-ok').click(); W(M, 500)
    d = pr.data(); by = {b['id']: b for b in d['bookmarks']}
    toast = T(M, 'toast-msg').inner_text()
    ok('CT-110 tìm → Đổi chữ các kết quả → đổi đúng 2 mục', n_res == '2 kết quả' and mi == 'Đổi chữ các kết quả (2)' and pre == 'www.sangtacviet.com'
       and pv == 'Sẽ đổi 2 dấu trang. 1 mục sẽ trùng địa chỉ với dấu trang khác.' and samples == 2 and okt == 'Đổi 2 dấu trang'
       and by['s1']['url'] == 'https://www.sangtacviet.app/truyen/qidian/1/100/' and by['s2']['url'] == 'https://www.sangtacviet.app/truyen/qidian/1/200/'
       and by['s3']['url'] == 'https://sangtacviet.com/truyen/fanqie/1/300/' and by['s1']['updatedAt'] > 1785000000000 and by['s3']['updatedAt'] == 1785000000000
       and toast.startswith('Đã đổi 2 dấu trang. 1 mục trùng địa chỉ'), [n_res, mi, pre, pv, samples, okt, toast])
    T(M, 'toast-action').click(); W(M, 500)
    d = pr.data(); by = {b['id']: b for b in d['bookmarks']}
    ok('CT-110 Hoàn tác trả lại địa chỉ cũ', by['s1']['url'] == 'https://www.sangtacviet.com/truyen/qidian/1/100/' and by['s1']['updatedAt'] == 1785000000000)
    T(M, 'search-input').fill(''); W(M, 300)

    # CT-111 chọn nhiều → Đổi chữ ở tên bằng regex, chỉ mục đã chọn
    T(M, 'search-input').fill('sangtacviet'); W(M, 400)
    T(M, 'btn-select-mode').click(); W(M, 200)
    for i in ('s1', 's3'): M.locator(f'[data-test="list-item"][data-id="{i}"] [data-test="item-check"]').check(force=True)
    W(M, 200)
    T(M, 'bulk-replace').click(); W(M, 300)
    note = T(M, 'dlg-replace-text').locator('.muted').first.inner_text()
    T(M, 'rp-field-title').check(force=True)
    T(M, 'rp-find').fill('Truyện (\\w+)'); T(M, 'rp-with').fill('[$1]'); T(M, 'rp-regex').set_checked(True, force=True)
    pv2 = wait_preview(M, 'Sẽ đổi')
    T(M, 'rp-ok').click(); W(M, 500)
    d = pr.data(); by = {b['id']: b for b in d['bookmarks']}
    ok('CT-111 chọn nhiều + regex ở tên', note.startswith('Áp dụng cho 2 dấu trang') and pv2 == 'Sẽ đổi 2 dấu trang.' and by['s1']['title'] == '[qidian] 1' and by['s3']['title'] == '[fanqie]'
       and by['s2']['title'] == 'Truyện qidian 2', [note, pv2, by['s1']['title'], by['s3']['title']])

    # CT-112 lỗi: regex sai → báo, nút mờ; địa chỉ không hợp lệ → báo bỏ qua
    T(M, 'bulk-all').click(); W(M, 200)
    T(M, 'bulk-replace').click(); W(M, 300)
    T(M, 'rp-find').fill('truyen/('); T(M, 'rp-regex').set_checked(True, force=True); W(M, 300)
    e1 = 'err' in (T(M, 'rp-preview').get_attribute('class') or '') and T(M, 'rp-preview').inner_text().startswith('Biểu thức chưa đúng') and not T(M, 'rp-ok').is_enabled()
    T(M, 'rp-regex').set_checked(False, force=True); T(M, 'rp-find').fill('https://'); T(M, 'rp-with').fill('')
    pv3 = wait_preview(M, 'Không có dấu trang nào đổi. Bỏ qua')
    e2 = pv3.startswith('Không có dấu trang nào đổi. Bỏ qua 4 mục (địa chỉ mới không hợp lệ') and not T(M, 'rp-ok').is_enabled()
    hz = M.evaluate("() => { const d = [...document.querySelectorAll('dialog')].find(x => x.open); return d.scrollWidth <= d.clientWidth + 1; }")
    T(M, 'rp-cancel').click(); W(M, 200)
    ok('CT-112 regex sai / địa chỉ hỏng → báo, không cho đổi', e1 and e2 and hz, [e1, pv3])

    # khung 360: thanh chọn nhiều đủ 6 nút, không cuộn ngang
    M.set_viewport_size({'width': 360, 'height': 800}); W(M, 300)
    bar = M.evaluate("() => { const b = document.querySelector('[data-test=\"bulk-delete\"]').parentElement; return [b.scrollWidth <= b.clientWidth + 1, document.documentElement.scrollWidth <= innerWidth, [...b.children].every(x => x.getBoundingClientRect().height >= 44)]; }")
    M.screenshot(path=os.path.join(OUT, 'v24-thanhchon-360.png'))
    ok('CT-C3 khung 360: thanh chọn nhiều không cuộn ngang, nút ≥ 44px', all(bar), bar)
    ok('CT-C1 không lỗi console', not errs, errs[:5])
    ctx.close()

    # CT-113 tốc độ: (a) cỡ dữ liệu người dùng: 12.000 dấu trang, đổi 3.000; (b) 50.000 dấu trang, đổi 10.000
    def run(total, every, label, limit):
        ctx, eid = launch(p, tempfile.mkdtemp(), w=390)
        pr = Probe(ctx, eid)
        bs = []
        for i in range(total):
            u = f'https://www.sangtacviet.com/truyen/qidian/1/{i}/' if i % every == 0 else f'https://trang{i}.vidu.vn/bai/{i}'
            bs.append(mk(f'z{i}', f'Bài {i}', u) | {'order': i})
        pr.seed({'version': 2, 'folders': [], 'bookmarks': bs, 'tagColors': {}})
        M = open_manager(ctx, eid)
        T(M, 'search-input').fill('www.sangtacviet.com'); W(M, 800)
        T(M, 'btn-more').click(); W(M, 250); T(M, 'menu-replace').click(); W(M, 300)
        T(M, 'rp-with').fill('www.sangtacviet.app'); pv = wait_preview(M, 'Sẽ đổi', 10)
        M.evaluate("""() => { window.__msgs = []; new MutationObserver(() => { const m = document.querySelector('[data-test="toast-msg"]'); if (m) window.__msgs.push(m.textContent); }).observe(document.body, { subtree: true, childList: true, characterData: true }); }""")
        t0 = time.time(); T(M, 'rp-ok').click()
        end = time.time() + 60
        while time.time() < end and not any(x.startswith('Đã đổi') for x in M.evaluate('window.__msgs')): W(M, 30)
        el = round(time.time() - t0, 2)
        busy = any(x.startswith('Đang đổi') for x in M.evaluate('window.__msgs'))
        d = pr.data(); n = sum(1 for b in d['bookmarks'] if 'sangtacviet.app' in b['url'])
        want = total // every + (1 if total % every else 0)
        ok(f'CT-113 {label}: {el} s ≤ {limit} s', pv == f'Sẽ đổi {want} dấu trang.' and n == want and el <= limit and busy, [pv, n, el, busy])
        notes[f'CT-113 {label} (s)'] = el
        ctx.close()
    run(12000, 4, '12.000 dấu trang, đổi 3.000', 3)
    run(50000, 5, '50.000 dấu trang, đổi 10.000', 3)
    ok('CT-C1 không lỗi console (tốc độ)', not errs, errs[:5])

qua = sum(kq.values())
print(f'\nĐổi chữ hàng loạt (giao diện): {qua}/{len(kq)} qua')
json.dump({'kq': kq, 'notes': notes}, open(os.path.join(OUT, 'ketqua-replace-ui.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
sys.exit(0 if qua == len(kq) else 1)
