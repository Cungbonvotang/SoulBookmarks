# python3 tests/state_ui_test.py — nghiệm thu 2.6.0 trên bản tiện ích: nhớ sắp xếp / chỗ xem / vị trí cuộn, và các lỗi đã sửa
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
def first_visible(M):
    return M.evaluate("""() => { const bar = document.querySelector('.topbar').getBoundingClientRect().bottom;
      for (const r of document.querySelectorAll('#list [data-row]')) { const b = r.getBoundingClientRect(); if (b.height && b.bottom > bar + 1) return [r.dataset.id, Math.round(b.top)]; } return null; }""")
def tree_open(M): return sorted(e.get_attribute('data-id') for e in M.locator('[data-test="folder-item"][aria-expanded="true"]').all())

with sync_playwright() as p:
    ctx, eid = launch(p, tempfile.mkdtemp(), w=390)
    pr = Probe(ctx, eid)
    s = sample()
    for i in range(240):
        u = f'https://anime{i}.vidu.vn/tap/{i}'
        s['bookmarks'].append({'id': f'x{i:03d}', 'title': f'Tập {i:03d}', 'url': u, 'urlKey': key(u), 'folderId': 'an', 'tags': [], 'createdAt': 1780000000000 + i * 60000, 'updatedAt': 1780000000000 + i * 60000, 'order': 100 + i})
    pr.seed(s)
    M = open_manager(ctx, eid)
    # vào Giải trí › Anime, chọn A–Z, cuộn xuống giữa danh sách
    M.evaluate("() => document.querySelector('[data-test=\"folder-item\"][data-id=\"gt\"] [data-test=\"folder-caret\"]').click()"); W(M, 200)
    M.evaluate("() => document.querySelector('[data-test=\"folder-item\"][data-id=\"an\"] [data-test=\"folder-open\"]').click()"); W(M, 300)
    T(M, 'sort-select').select_option('az'); W(M, 300)
    for _ in range(6): M.mouse.wheel(0, 1600); W(M, 250)
    fv1 = first_visible(M); W(M, 500)
    M.close()
    M = open_manager(ctx, eid); W(M, 400)
    fv2 = first_visible(M)
    ok('CT-130 mở lại: đúng thư mục, cách sắp xếp, mục đầu màn hình, cây thư mục', T(M, 'view-title').inner_text().strip() == 'Anime' and T(M, 'sort-select').input_value() == 'az'
       and fv1 and fv2 and fv1[0] == fv2[0] and abs(fv1[1] - fv2[1]) <= 3 and 'gt' in tree_open(M), [fv1, fv2, T(M, 'sort-select').input_value(), tree_open(M)])
    M.screenshot(path=os.path.join(OUT, 'v26-mo-lai.png'))

    # sắp xếp kiểu xem phẳng nhớ riêng; ô tìm không nhớ
    M.evaluate("() => document.querySelector('[data-test=\"folder-all\"]').click()"); W(M, 300)
    T(M, 'sort-select').select_option('updated'); W(M, 200)
    T(M, 'search-input').fill('conan'); W(M, 600)
    M.close()
    M = open_manager(ctx, eid); W(M, 400)
    a = (T(M, 'view-title').inner_text().strip(), T(M, 'sort-select').input_value(), T(M, 'search-input').input_value())
    M.evaluate("() => document.querySelector('[data-test=\"folder-item\"][data-id=\"an\"] [data-test=\"folder-open\"]').click()"); W(M, 300)
    b = T(M, 'sort-select').input_value()
    ok('CT-131 nhớ riêng sắp xếp Tất cả / thư mục; ô tìm mở lên trống', a == ('Tất cả dấu trang', 'updated', '') and b == 'az', [a, b])
    M.close()

    # mục đầu màn hình đã bị xóa → vị trí gần nhất
    M = open_manager(ctx, eid); W(M, 300)
    for _ in range(3): M.mouse.wheel(0, 1200); W(M, 250)
    fv = first_visible(M); W(M, 500); M.close()
    pr.pg.evaluate("async id => { const L = await SDTStore.loadAll(); await SDTStore.save(L.data, SDT.deleteBookmarks(L.data, [id]).data); }", fv[0])
    M = open_manager(ctx, eid); W(M, 400)
    fv3 = first_visible(M)
    ok('CT-132 mục đầu màn hình đã xóa → mở ở vị trí gần nhất', fv3 and fv3[0] != fv[0] and fv3[0].startswith('x') and abs(int(fv3[0][1:]) - int(fv[0][1:])) <= 2, [fv, fv3])
    M.close()

    # thư mục đã nhớ bị xóa → thư mục cha gần nhất
    pr.pg.evaluate("async () => { const L = await SDTStore.loadAll(); await SDTStore.save(L.data, SDT.deleteFolder(L.data, 'an', 'all', Date.now()).data); }")
    M = open_manager(ctx, eid); W(M, 400)
    ok('CT-133 thư mục đã nhớ bị xóa → mở thư mục cha', T(M, 'view-title').inner_text().strip() == 'Giải trí', T(M, 'view-title').inner_text())
    M.close()

    # hai tab: tab thao tác sau cùng thắng
    M1 = open_manager(ctx, eid); M2 = open_manager(ctx, eid); W(M2, 300)
    M1.bring_to_front(); M1.evaluate("() => document.querySelector('[data-test=\"folder-item\"][data-id=\"da\"], [data-test=\"folder-root\"]').click()"); W(M1, 500)
    M2.bring_to_front(); M2.evaluate("() => document.querySelector('[data-test=\"folder-all\"]').click()"); W(M2, 500)
    M1.close(); M2.close()
    M = open_manager(ctx, eid); W(M, 400)
    ok('CT-134 hai tab: tab thao tác sau cùng quyết định', T(M, 'view-title').inner_text().strip() == 'Tất cả dấu trang', T(M, 'view-title').inner_text())
    ok('CT-C1 không lỗi console (ghi nhớ)', not errs, errs[:5])

    # ---- các lỗi đã sửa ----
    pr.seed(sample())
    M.reload(); M.wait_for_selector('body.ready'); W(M, 400)
    M.evaluate("() => document.querySelector('[data-test=\"folder-all\"]').click()"); W(M, 300)
    M.locator('[data-test="list-item"][data-id="b2"] [data-test="row-menu"]').click(); W(M, 200)
    T(M, 'm-delete').click(); W(M, 400)
    pr.pg.evaluate("""async () => { const L = await SDTStore.loadAll(); const r = SDT.addBookmark(L.data, { title: 'Lưu từ popup', url: 'https://popup.vn/moi', tags: [] }, Date.now()); await SDTStore.save(L.data, r.data, 'popup'); }""")
    W(M, 900)
    T(M, 'toast-action').click(); W(M, 700)
    d = pr.data()
    ok('CT-135 Hoàn tác không xóa dấu trang nơi khác vừa lưu', any(b['id'] == 'b2' for b in d['bookmarks']) and any(b['title'] == 'Lưu từ popup' for b in d['bookmarks']))

    T(M, 'btn-select-mode').click(); W(M, 200)
    t = M.locator('[data-test="list-item"][data-id="b3"] [data-test="item-title"]')
    t.click(); W(M, 150); c1 = T(M, 'bulk-count').inner_text()
    t.click(); W(M, 150); c2 = T(M, 'bulk-count').inner_text()
    ok('CT-136 chọn nhiều: chạm tên lần hai bỏ chọn', c1 == '1 đã chọn' and c2 == '0 đã chọn', [c1, c2])
    T(M, 'bulk-cancel').click(); W(M, 200)

    # cắt rồi dán khi ghi lỗi: giữ trạng thái cắt; nơi khác báo hỏng → hiện biểu ngữ
    M.evaluate("() => document.querySelector('[data-test=\"folder-item\"][data-id=\"cv\"] [data-test=\"folder-open\"], [data-test=\"folder-root\"]').click()"); W(M, 300)
    M.locator('[data-test="list-item"]').first.locator('[data-test="row-menu"]').click(); W(M, 200)
    T(M, 'm-cut').click(); W(M, 300)
    pr.setraw({'sdt_error': 'Phần dữ liệu "sdt_b_3" bị hỏng.'}); W(M, 900)
    banner = T(M, 'error-banner').count() == 1 and T(M, 'error-banner').is_visible()
    M.evaluate("() => document.querySelector('[data-test=\"folder-root\"]').click()"); W(M, 300)
    paste_btn = T(M, 'btn-paste-here').count()
    if paste_btn: T(M, 'btn-paste-here').click(); W(M, 400)
    still = T(M, 'btn-paste-here').count()
    ok('CT-137 nơi khác báo dữ liệu hỏng → hiện biểu ngữ ngay', banner)
    ok('CT-138 dán ghi lỗi → vẫn giữ trạng thái cắt', paste_btn == 1 and still == 1, [paste_btn, still])
    pr.pg.evaluate("async () => chrome.storage.local.remove('sdt_error')")

    # kho bị chèn địa chỉ javascript: → bỏ qua mục, báo
    raw = pr.raw(['sdt_b_0'])['sdt_b_0']
    raw.append({'id': 'evil', 'title': 'Mục chèn', 'url': 'javascript:alert(1)', 'urlKey': 'evil', 'folderId': None, 'tags': [], 'createdAt': 1, 'updatedAt': 1, 'order': 1})
    pr.setraw({'sdt_b_0': raw})
    M.reload(); M.wait_for_selector('body.ready'); W(M, 500)
    tmsg = T(M, 'toast-msg').inner_text() if T(M, 'toast-msg').count() else ''
    M.evaluate("() => document.querySelector('[data-test=\"folder-all\"]').click()"); W(M, 300)
    ok('CT-139 kho có địa chỉ javascript: → không hiện, có báo, app vẫn ghi được', 'Bỏ qua 1 mục' in tmsg and M.locator('[data-test="list-item"][data-id="evil"]').count() == 0 and T(M, 'error-banner').count() == 0, [tmsg])
    ok('CT-C1 không lỗi console (sửa lỗi)', not errs, errs[:5])
    ctx.close()

qua = sum(kq.values())
print(f'\nBản 2.6.0 (giao diện): {qua}/{len(kq)} qua')
json.dump({'kq': kq, 'notes': notes}, open(os.path.join(OUT, 'ketqua-state-ui.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
sys.exit(0 if qua == len(kq) else 1)
