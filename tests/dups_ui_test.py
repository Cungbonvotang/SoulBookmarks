# python3 tests/dups_ui_test.py — nghiệm thu "Tìm dấu trang trùng" (2.5.0) trên bản tiện ích
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
def mk(i, title, url, upd, tags=(), folder=None):
    return {'id': i, 'title': title, 'url': url, 'urlKey': key(url), 'folderId': folder, 'tags': list(tags), 'createdAt': 1780000000000, 'updatedAt': upd, 'order': 50}
def group(M, gid):   # nhóm chứa dấu trang gid
    return T(M, 'dup-group').filter(has=M.locator(f'[data-test="dup-item"][data-id="{gid}"]'))
def open_dups(M):
    T(M, 'btn-more').click(); W(M, 250); T(M, 'menu-dups').click(); W(M, 400)

with sync_playwright() as p:
    ctx, eid = launch(p, tempfile.mkdtemp(), w=390)
    pr = Probe(ctx, eid)
    s = sample()
    s['bookmarks'] += [mk('d1', 'Conan 1100 (bản cũ)', 'http://www.vidu.vn/conan-1100/#top', 1780000000000, ['cũ'], 'gt'),
                       mk('d2', 'Conan 1100 bản 2', 'https://VIDU.vn/conan-1100', 1781000000000, ['anime']),
                       mk('d3', 'Du lịch Hà Nội', 'https://khac.vn/ha-noi-2', 1781000000000, ['ăn uống'])]
    pr.seed(s)
    M = open_manager(ctx, eid)
    open_dups(M)
    sm = T(M, 'dup-summary').inner_text()
    G = group(M, 'b1')
    ids = [e.get_attribute('data-id') for e in G.locator('[data-test="dup-item"]').all()]
    kept = [e.get_attribute('data-id') for e in G.locator('.ditem.kept').all()]
    diff_bold = G.locator('[data-test="dup-folder"].diff').count() == 3 and G.locator('[data-test="dup-url"].diff').count() == 3
    ok('CT-119 trùng địa chỉ: nhóm b1 có 3 mục, giữ mặc định mục mới nhất, tô đậm chỗ khác', sm == 'Có 1 nhóm trùng, 2 dấu trang thừa.' and ids == ['b1', 'd2', 'd1'] and kept == ['b1'] and diff_bold, [sm, ids, kept, diff_bold])
    M.screenshot(path=os.path.join(OUT, 'v25-trung.png'))

    # không bỏ được mục giữ cuối cùng
    G.locator('[data-test="dup-item"][data-id="b1"] [data-test="dup-keep"]').click(force=True); W(M, 300)
    still = group(M, 'b1').locator('[data-test="dup-item"][data-id="b1"] [data-test="dup-keep"]').is_checked()
    ok('CT-120 mỗi nhóm giữ ít nhất một mục', still and 'ít nhất một mục' in T(M, 'toast-msg').inner_text())

    # đổi lựa chọn: giữ d1 (ở thư mục khác) thay b1 → xóa 2, gộp nhãn
    group(M, 'b1').locator('[data-test="dup-item"][data-id="d1"] [data-test="dup-keep"]').check(force=True); W(M, 200)
    group(M, 'b1').locator('[data-test="dup-item"][data-id="b1"] [data-test="dup-keep"]').uncheck(force=True); W(M, 200)
    btn = group(M, 'b1').locator('[data-test="dup-apply-group"]').inner_text()
    group(M, 'b1').locator('[data-test="dup-apply-group"]').click(); W(M, 600)
    d = pr.data(); by = {b['id']: b for b in d['bookmarks']}
    toast = T(M, 'toast-msg').inner_text()
    ok('CT-121 xóa mục không giữ, gộp nhãn vào mục giữ', btn == 'Xóa 2 mục không giữ' and 'b1' not in by and 'd2' not in by and sorted(by['d1']['tags']) == sorted(['cũ', 'anime', 'conan'])
       and toast.startswith('Đã xóa 2 dấu trang trùng. Gộp nhãn vào 1 mục') and T(M, 'dup-summary').inner_text() == 'Không có dấu trang trùng địa chỉ.', [btn, by.get('d1', {}).get('tags'), toast])
    T(M, 'toast-action').click(); W(M, 700)
    d = pr.data(); by = {b['id']: b for b in d['bookmarks']}
    ok('CT-121 Hoàn tác: trả lại 2 mục, nhóm hiện lại', 'b1' in by and 'd2' in by and by['d1']['tags'] == ['cũ'] and T(M, 'dup-group').count() == 1, [T(M, 'dup-summary').inner_text()])

    # trùng tên + bỏ qua nhóm + áp dụng tất cả
    T(M, 'dup-mode-title').check(force=True); W(M, 400)
    sm2 = T(M, 'dup-summary').inner_text()
    grp = group(M, 'b9'); gi = [e.get_attribute('data-id') for e in grp.locator('[data-test="dup-item"]').all()]
    grp.locator('[data-test="dup-skip"]').click(); W(M, 300)
    sm3 = T(M, 'dup-summary').inner_text()
    ok('CT-122 trùng tên; bỏ qua nhóm ẩn nhóm', sm2 == 'Có 1 nhóm trùng, 1 dấu trang thừa.' and sorted(gi) == ['b9', 'd3'] and sm3 == 'Không có dấu trang trùng tên.', [sm2, gi, sm3])
    T(M, 'dup-mode-url').check(force=True); W(M, 400)
    T(M, 'dup-apply-all').click(); W(M, 300)
    msg = T(M, 'dlg-dup-all').locator('[data-test="dlg-message"]').inner_text()
    T(M, 'dlg-dup-all').locator('[data-test="dlg-ok"]').click(); W(M, 600)
    d = pr.data(); by = {b['id']: b for b in d['bookmarks']}
    ok('CT-122 Áp dụng tất cả: hỏi xác nhận rồi xóa', msg.startswith('Xóa 2 dấu trang không giữ trong 1 nhóm') and 'd1' in by and 'b1' not in by and 'd2' not in by, [msg])   # lựa chọn "giữ d1" trước đó vẫn được nhớ sau Hoàn tác

    # khung 360
    T(M, 'toast-action').click(); W(M, 600)
    M.set_viewport_size({'width': 360, 'height': 800}); W(M, 300)
    hz = M.evaluate("() => { const d = [...document.querySelectorAll('dialog')].find(x => x.open); return d.scrollWidth <= d.clientWidth + 1 && document.documentElement.scrollWidth <= innerWidth; }")
    sizes = M.evaluate("() => [...document.querySelectorAll('[data-test=\"dup-keep\"]')].map(e => e.closest('label').getBoundingClientRect().height).concat([...document.querySelectorAll('[data-test=\"dup-apply-group\"],[data-test=\"dup-skip\"],[data-test=\"dup-apply-all\"]')].map(e => e.getBoundingClientRect().height))")
    M.screenshot(path=os.path.join(OUT, 'v25-trung-360.png'))
    ok('CT-C3 khung 360: không cuộn ngang, ô Giữ và nút ≥ 44px', hz and sizes and min(sizes) >= 44, [hz, sizes])
    ok('CT-C1 không lỗi console', not errs, errs[:5])
    ctx.close()

    # CT-123 tốc độ: 50.000 dấu trang, 5.000 nhóm trùng
    ctx, eid = launch(p, tempfile.mkdtemp(), w=390)
    pr = Probe(ctx, eid)
    bs = []
    for i in range(50000):
        n = i % 5000 if i < 10000 else i
        bs.append(mk(f'z{i}', f'Bài {i}', f'https://trang{n}.vidu.vn/bai/{n}', 1700000000000 + i) | {'order': i})
    pr.seed({'version': 2, 'folders': [], 'bookmarks': bs, 'tagColors': {}})
    M = open_manager(ctx, eid)
    T(M, 'btn-more').click(); W(M, 250)
    t0 = time.time(); T(M, 'menu-dups').click(); T(M, 'dup-summary').wait_for()
    while not T(M, 'dup-summary').inner_text(): W(M, 20)
    el = round(time.time() - t0, 2)
    sm = T(M, 'dup-summary').inner_text(); ng = T(M, 'dup-group').count()
    T(M, 'dup-more').click(); W(M, 300); ng2 = T(M, 'dup-group').count()
    ok(f'CT-123 50.000 dấu trang: mở màn trùng {el} s ≤ 1 s, hiện dần 30 nhóm', sm == 'Có 5000 nhóm trùng, 5000 dấu trang thừa.' and el <= 1 and ng == 30 and ng2 == 60, [sm, el, ng, ng2])
    ok('CT-C1 không lỗi console (tốc độ)', not errs, errs[:5])
    ctx.close()

qua = sum(kq.values())
print(f'\nDấu trang trùng (giao diện): {qua}/{len(kq)} qua')
json.dump({'kq': kq, 'notes': notes}, open(os.path.join(OUT, 'ketqua-dups-ui.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
sys.exit(0 if qua == len(kq) else 1)
