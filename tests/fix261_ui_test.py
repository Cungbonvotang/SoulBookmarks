# python3 tests/fix261_ui_test.py — nghiệm thu các lỗi sửa ở 2.6.1 trên bản tiện ích
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
def mk(i, title, url, upd=1780000000000, tags=(), folder=None, order=50):
    return {'id': i, 'title': title, 'url': url, 'urlKey': key(url), 'folderId': folder, 'tags': list(tags), 'createdAt': 1780000000000, 'updatedAt': upd, 'order': order}
def click_all(M): M.evaluate("() => document.querySelector('[data-test=\"folder-all\"]').click()"); W(M, 300)

with sync_playwright() as p:
    ctx, eid = launch(p, tempfile.mkdtemp(), w=390)
    pr = Probe(ctx, eid)
    s = sample()
    for gi in range(4):
        s['bookmarks'].append(mk(f'g{gi}a', f'Trùng {gi}', f'https://trung.vn/{gi}', upd=1781000000000))
        s['bookmarks'].append(mk(f'g{gi}b', f'Trùng {gi} bản cũ', f'http://www.trung.vn/{gi}/'))
    pr.seed(s)
    M = open_manager(ctx, eid)

    # CT-144 hai cú bấm cùng một nhịp ở hộp trùng: màn hình và kho khớp nhau
    T(M, 'btn-more').click(); W(M, 250); T(M, 'menu-dups').click(); W(M, 400)
    M.evaluate("() => { const b = document.querySelectorAll('[data-test=\"dup-apply-group\"]'); b[0].click(); b[1].click(); }")
    W(M, 1500)
    shown = T(M, 'dup-group').count()
    stored = [b['id'] for b in pr.data()['bookmarks'] if b['id'].startswith('g') and b['id'].endswith('b')]
    ok('CT-144 hai thao tác cùng lúc: cả hai được ghi, màn hình khớp kho', shown == 2 and len(stored) == 2, [shown, stored])

    # CT-148 đóng hộp trùng: thông báo Hoàn tác vẫn còn và dùng được
    T(M, 'dup-apply-group').first.click(); W(M, 600)
    T(M, 'dlg-dups').locator('[data-test="dlg-close"]').click(); W(M, 300)   # nút X ở đầu hộp (thông báo đang che nút Xong ở đáy)
    still = T(M, 'toast-action').count() == 1 and T(M, 'toast').evaluate("e => e.classList.contains('show')")
    n1 = len(pr.data()['bookmarks'])
    if still: T(M, 'toast-action').click(); W(M, 600)
    ok('CT-148 đóng hộp “Dấu trang trùng”: Hoàn tác vẫn còn và trả lại mục', still and len(pr.data()['bookmarks']) == n1 + 1, [still, n1, len(pr.data()['bookmarks'])])

    # CT-145 xóa nhãn / gộp nhãn có Hoàn tác
    def tag_n(t): return sum(1 for b in pr.data()['bookmarks'] if t in [x.lower() for x in b['tags']])
    a0 = tag_n('anime')
    T(M, 'btn-more').click(); W(M, 200); T(M, 'menu-tags').click(); W(M, 300)
    M.locator('[data-test="tags-row"][data-tag="anime"] [data-test="tag-delete"]').click(); W(M, 200); T(M, 'dlg-ok').click(); W(M, 500)
    msg = T(M, 'toast-msg').inner_text(); a1 = tag_n('anime')
    T(M, 'toast-action').click(); W(M, 600)
    ok('CT-145 xóa nhãn: có Hoàn tác, trả lại đủ', a0 > 0 and a1 == 0 and msg == f'Đã xóa nhãn “anime” khỏi {a0} dấu trang.' and tag_n('anime') == a0, [a0, a1, msg, tag_n('anime')])
    c0 = tag_n('conan')
    M.locator('[data-test="tags-row"][data-tag="conan"] [data-test="tag-rename"]').click(); W(M, 200)
    T(M, 'dlg-input').fill('anime'); T(M, 'dlg-ok').click(); W(M, 500)
    msg2 = T(M, 'toast-msg').inner_text(); c1 = tag_n('conan')
    T(M, 'toast-action').click(); W(M, 600)
    ok('CT-145 gộp nhãn: có Hoàn tác, trả lại nhãn cũ', c0 > 0 and c1 == 0 and msg2.startswith('Đã gộp vào nhãn') and tag_n('conan') == c0 and tag_n('anime') == a0, [c0, c1, msg2, tag_n('conan')])
    M.keyboard.press('Escape'); W(M, 200)

    # CT-146 xóa nhiều dấu trang: hỏi lại từ 10 mục; dưới 10 không hỏi
    click_all(M)
    T(M, 'btn-select-mode').click(); W(M, 200); T(M, 'bulk-all').click(); W(M, 200)
    total = len(pr.data()['bookmarks'])
    T(M, 'bulk-delete').click(); W(M, 300)
    asked = T(M, 'dlg-delete-items').count() == 1 and f'Xóa {total} dấu trang?' in T(M, 'dlg-delete-items').inner_text()
    T(M, 'dlg-cancel').click(); W(M, 300)
    kept = len(pr.data()['bookmarks']) == total
    T(M, 'bulk-delete').click(); W(M, 300); T(M, 'dlg-ok').click(); W(M, 600)
    gone = len(pr.data()['bookmarks']) == 0
    T(M, 'toast-action').click(); W(M, 700)
    ok('CT-146 xóa từ 10 dấu trang: hỏi lại; Hủy giữ nguyên; Xóa rồi Hoàn tác trả lại đủ', asked and kept and gone and len(pr.data()['bookmarks']) == total, [asked, kept, gone])
    T(M, 'btn-select-mode').click(); W(M, 200)
    for i in ('b1', 'b2', 'b3'): M.locator(f'[data-test="list-item"][data-id="{i}"] [data-test="item-check"]').check(force=True)
    W(M, 200); T(M, 'bulk-delete').click(); W(M, 500)
    ok('CT-146 xóa 3 dấu trang: không hỏi, có Hoàn tác', T(M, 'dlg-delete-items').count() == 0 and len(pr.data()['bookmarks']) == total - 3 and T(M, 'toast-action').count() == 1)
    T(M, 'toast-action').click(); W(M, 600)

    # CT-147 tìm trong thư mục: báo phạm vi, đưa lối sang kết quả nơi khác
    M.evaluate("() => document.querySelector('[data-test=\"folder-item\"][data-id=\"cv\"] [data-test=\"folder-open\"]').click()"); W(M, 300)
    T(M, 'search-input').fill('conan'); W(M, 400)
    note = T(M, 'scope-note').inner_text() if T(M, 'scope-note').count() else ''
    btn = T(M, 'empty-scope-all').inner_text() if T(M, 'empty-scope-all').count() else ''
    T(M, 'empty-scope-all').click(); W(M, 400)
    cnt = T(M, 'list-count').inner_text()
    ok('CT-147 tìm trong thư mục: ghi rõ phạm vi, nút xem kết quả ở thư mục khác', 'Đang tìm trong “Công việc”' in note and btn == 'Xem 5 kết quả ở thư mục khác' and cnt == '5 kết quả' and T(M, 'scope-note').count() == 0, [note, btn, cnt])
    M.locator('[data-test="cond-chip"][data-key="scope"] [data-test="cond-x"]').click(); W(M, 300)
    T(M, 'search-input').fill('ghi'); W(M, 400)
    has_note = T(M, 'scope-note').count() == 1 and T(M, 'list-count').inner_text() == '1 kết quả'
    T(M, 'scope-all').click(); W(M, 300)
    ok('CT-147 có kết quả trong thư mục: vẫn ghi phạm vi, nút “Tìm ở tất cả thư mục”', has_note and 'scope' in [e.get_attribute('data-key') for e in T(M, 'cond-chip').all()], [has_note])
    T(M, 'search-input').fill(''); W(M, 300)
    hz = M.evaluate("document.documentElement.scrollWidth <= innerWidth")
    ok('CT-C3 khung 390 không cuộn ngang', hz)
    ok('CT-C1 không lỗi console', not errs, errs[:5])
    ctx.close()

    # CT-150 hơn 300 nhãn: có dòng báo còn nhãn khác
    ctx, eid = launch(p, tempfile.mkdtemp(), w=390)
    pr = Probe(ctx, eid)
    bs = [mk(f't{i}', f'Mục {i}', f'https://nhan.vn/{i}', tags=[f'nhãn {i:03d}'], order=i) for i in range(320)]
    pr.seed({'version': 2, 'folders': [], 'bookmarks': bs, 'tagColors': {}})
    M = open_manager(ctx, eid)
    T(M, 'btn-more').click(); W(M, 200); T(M, 'menu-tags').click(); W(M, 400)
    m1 = T(M, 'tags-more').inner_text() if T(M, 'tags-more').count() else ''
    T(M, 'tags-search').fill('nhãn 31'); W(M, 300)
    rows = T(M, 'tags-row').count(); gone = T(M, 'tags-more').count() == 0
    T(M, 'dlg-tags').locator('[data-test="dlg-close"]').click(); W(M, 200)
    T(M, 'btn-filter').click(); W(M, 400)
    m2 = T(M, 'filter-tag-more').inner_text() if T(M, 'filter-tag-more').count() else ''
    M.keyboard.press('Escape'); W(M, 200)
    ok('CT-150 nhiều nhãn: báo đang hiện 300 / 200 trong 320, tìm thì hiện đúng', m1.startswith('Đang hiện 300 trong 320 nhãn') and rows == 10 and gone and m2.startswith('Đang hiện 200 trong 320 nhãn'), [m1, rows, m2])
    ok('CT-C1 không lỗi console (nhãn)', not errs, errs[:5])
    ctx.close()

    # CT-149 thao tác khác trong lúc đang ghi hàng loạt (50.000 dấu trang): kho và màn hình khớp, không mất thay đổi
    ctx, eid = launch(p, tempfile.mkdtemp(), w=1280)
    pr = Probe(ctx, eid)
    bs = [mk(f'z{i}', f'Bài {i}', (f'https://www.sangtacviet.com/truyen/{i}/' if i % 4 == 0 else f'https://trang{i}.vidu.vn/bai/{i}'), order=i) | {'createdAt': 1780000000000 + i} for i in range(50000)]
    pr.seed({'version': 2, 'folders': [], 'bookmarks': bs, 'tagColors': {}})
    M = open_manager(ctx, eid); M.set_viewport_size({'width': 1280, 'height': 800}); W(M, 300)
    T(M, 'search-input').fill('www.sangtacviet.com'); W(M, 900)
    T(M, 'btn-more').click(); W(M, 250); T(M, 'menu-replace').click(); W(M, 300)
    T(M, 'rp-with').fill('www.sangtacviet.app'); W(M, 900)
    first = M.locator('[data-test="list-item"]').first.get_attribute('data-id')
    T(M, 'rp-ok').click(no_wait_after=True)
    M.locator(f'[data-test="list-item"][data-id="{first}"] [data-test="row-menu"]').click(); T(M, 'm-delete').click()
    end = time.time() + 40
    while time.time() < end:
        d = pr.data()
        if first not in {b['id'] for b in d['bookmarks']} and sum(1 for b in d['bookmarks'] if 'sangtacviet.app' in b['url']) >= 12499: break
        W(M, 500)
    W(M, 1500)
    d = pr.data()
    n_app = sum(1 for b in d['bookmarks'] if 'sangtacviet.app' in b['url']); n_com = sum(1 for b in d['bookmarks'] if 'sangtacviet.com' in b['url'])
    T(M, 'search-input').fill(''); W(M, 500); T(M, 'search-input').fill('sangtacviet.app'); W(M, 900)
    scr = T(M, 'list-count').inner_text()
    ok('CT-149 xóa một mục trong lúc đang đổi chữ 12.500 mục: đổi đủ, mục xóa mất, màn hình khớp kho', n_app == 12499 and n_com == 0 and first not in {b['id'] for b in d['bookmarks']} and scr == '12499 kết quả', [n_app, n_com, scr])
    ok('CT-C1 không lỗi console (ghi chồng)', not errs, errs[:5])
    ctx.close()

qua = sum(kq.values())
print(f'\nSửa lỗi 2.6.1 (giao diện): {qua}/{len(kq)} qua')
json.dump({'kq': kq, 'notes': notes}, open(os.path.join(OUT, 'ketqua-fix261-ui.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
sys.exit(0 if qua == len(kq) else 1)
