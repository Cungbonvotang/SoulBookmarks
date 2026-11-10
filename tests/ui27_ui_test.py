# python3 tests/ui27_ui_test.py — nghiệm thu bản 2.7.0 (CN-23) trên bản tiện ích: tên 2 dòng, xem gọn, sắp xếp lại, tô chữ khớp, số đếm, đi tới mục
import os, sys, json, tempfile, urllib.parse
from playwright.sync_api import sync_playwright
HERE = os.path.dirname(os.path.abspath(__file__))
src = open(os.path.join(HERE, 'ui_test.py'), encoding='utf-8').read().split('def is_drawer_open')[0]
g = {'__file__': os.path.join(HERE, 'ui_test.py')}
exec(compile(src, 'ui_helpers', 'exec'), g)
launch, open_manager, Probe, T, W, ok, kq, notes, errs, sample, bid = (g[k] for k in ('launch', 'open_manager', 'Probe', 'T', 'W', 'ok', 'kq', 'notes', 'errs', 'sample', 'bid'))
OUT = os.path.join(HERE, 'out')
def key(u):
    p = urllib.parse.urlsplit(u); host = p.hostname.lower()
    if host.startswith('www.'): host = host[4:]
    return host + p.path.rstrip('/') + ('?' + p.query if p.query else '')
def mk(i, title, url, folder=None, order=50, tags=()):
    return {'id': i, 'title': title, 'url': url, 'urlKey': key(url), 'folderId': folder, 'tags': list(tags), 'createdAt': 1780000000000 + order, 'updatedAt': 1780000000000 + order, 'order': order}
def js_click(M, sel): M.evaluate("s => document.querySelector(s).click()", sel); W(M, 300)
def tree_open(M, fid): js_click(M, f'[data-test="folder-item"][data-id="{fid}"] [data-test="folder-open"]')
def tree_caret(M, fid): js_click(M, f'[data-test="folder-item"][data-id="{fid}"] [data-test="folder-caret"]')
def row(M, i): return M.locator(f'[data-test="list-item"][data-id="{i}"]')
def frow(M, i): return M.locator(f'[data-test="list-folder"][data-id="{i}"]')
def hgt(loc): return loc.bounding_box()['height']
def ids(M): return [e.get_attribute('data-id') for e in T(M, 'list-item').all()]
def no_hscroll(M): return M.evaluate("document.documentElement.scrollWidth <= innerWidth")
def lum(rgb):
    def ch(v):
        v /= 255.0
        return v / 12.92 if v <= 0.03928 else ((v + 0.055) / 1.055) ** 2.4
    r, gg, b = rgb
    return 0.2126 * ch(r) + 0.7152 * ch(gg) + 0.0722 * ch(b)
def contrast(c1, c2):
    a, b = sorted([lum(c1), lum(c2)], reverse=True)
    return (a + 0.05) / (b + 0.05)
def rgb_of(M, sel, prop='color'):
    s = M.evaluate("([s, p]) => getComputedStyle(document.querySelector(s))[p]", [sel, prop])
    return [int(float(x)) for x in s[s.index('(') + 1:s.index(')')].split(',')[:3]]

LONG = 'Ta liền bình thường bên trên học, như thế nào liền thành tối cường – Chương 100 bản dịch đầy đủ có chú thích'
NOSPACE = 'Sieudaikhongcodaucachnao' * 6

with sync_playwright() as p:
    ctx, eid = launch(p, tempfile.mkdtemp(), w=390)
    pr = Probe(ctx, eid)
    s = sample()
    s['bookmarks'].append(mk('lg', LONG, 'https://sangtacviet.app/truyen/1', folder='an', order=900, tags=['truyện', 'đang đọc']))
    s['bookmarks'].append(mk('ns', NOSPACE, 'https://' + 'tenmienratdai' * 5 + '.vn/x', folder='an', order=901))
    s['bookmarks'].append(mk('st', 'Sáng tác Việt', 'https://www.sangtacviet.com/a', folder='ht', order=902))
    s['folders'].append({'id': 'tr', 'name': 'Trăm mục', 'parentId': None, 'createdAt': 1780000000000, 'order': 990})
    s['folders'].append({'id': 'mot', 'name': 'Một mục', 'parentId': None, 'createdAt': 1780000000000, 'order': 991})
    for i in range(100):
        s['bookmarks'].append(mk(f't{i:03d}', f'Mục trăm {i:03d}' + (' kimcuong' if i == 79 else ''), f'https://tram.vn/{i}', folder='tr', order=1000 + i))
    s['bookmarks'].append(mk('m1', 'Chỉ một', 'https://mot.vn/1', folder='mot', order=2000))
    pr.seed(s)
    M = open_manager(ctx, eid)

    # CT-156 số đếm
    tree_caret(M, 'gt'); tree_caret(M, 'an')
    cnt = lambda fid: M.locator(f'[data-test="folder-item"][data-id="{fid}"] [data-test="folder-count"]').text_content()
    counts = {k: cnt(k) for k in ('gt', 'an', 'cv', 'ht', 'tr')}
    tree_open(M, 'gt')
    meta_an = frow(M, 'an').locator('[data-test="folder-row-meta"]').inner_text()
    tree_open(M, 'an')
    meta_co = frow(M, 'co').locator('[data-test="folder-row-meta"]').inner_text()
    ok('CT-156 cây ghi tổng kể cả thư mục con; dòng thư mục ghi "N dấu trang · M thư mục con"',
       counts == {'gt': '10', 'an': '10', 'cv': '3', 'ht': '4', 'tr': '100'} and meta_an == '10 dấu trang · 2 thư mục con' and meta_co == '4 dấu trang', [counts, meta_an, meta_co])

    # CT-153 tên 2 dòng, xem gọn
    t_long = row(M, 'lg').locator('[data-test="item-title"]'); t_short = row(M, 'b8').locator('[data-test="item-title"]')
    h_long, h_short = hgt(t_long), hgt(t_short)
    two = 1.8 * h_short < h_long < 2.3 * h_short
    row_roomy = hgt(row(M, 'b8'))
    tags_vis = row(M, 'lg').locator('[data-test="item-tag"]').first.is_visible() and row(M, 'lg').locator('[data-test="item-date"]').is_visible()
    hs_roomy = no_hscroll(M)
    T(M, 'btn-dense').click(); W(M, 300)
    pressed = T(M, 'btn-dense').get_attribute('aria-pressed')
    row_dense = hgt(row(M, 'b8')); row_dense_long = hgt(row(M, 'lg'))
    one = hgt(row(M, 'lg').locator('[data-test="item-title"]')) < 1.3 * hgt(row(M, 'b8').locator('[data-test="item-title"]'))
    hidden = (not row(M, 'lg').locator('[data-test="item-tag"]').first.is_visible()) and (not row(M, 'lg').locator('[data-test="item-date"]').is_visible())
    dom_vis = row(M, 'lg').locator('[data-test="item-domain"]').is_visible()
    frow_dense = hgt(frow(M, 'co'))
    hs_dense = no_hscroll(M)
    W(M, 500); M.reload(); M.wait_for_selector('body.ready'); W(M, 300)
    kept = T(M, 'btn-dense').get_attribute('aria-pressed') == 'true' and T(M, 'view-title').inner_text().strip() == 'Anime' and hgt(row(M, 'b8')) <= 50
    T(M, 'btn-dense').click(); W(M, 300)
    back = hgt(row(M, 'b8')) >= 62
    ok('CT-153 tên dài 2 dòng; Xem gọn: dòng 44–50px, tên 1 dòng, ẩn nhãn và ngày, còn tên miền; nhớ sau khi mở lại; tắt → như cũ',
       two and row_roomy >= 62 and tags_vis and pressed == 'true' and 44 <= row_dense <= 50 and 44 <= row_dense_long <= 50 and 44 <= frow_dense <= 50 and one and hidden and dom_vis and kept and back,
       [h_long, h_short, row_roomy, pressed, row_dense, row_dense_long, frow_dense, one, hidden, dom_vis, kept, back])

    # CT-154 sắp xếp lại
    tree_open(M, 'co')
    grip = lambda i: row(M, i).locator('[data-test="row-handle"]')
    before = ids(M)
    hid0 = not grip('b1').is_visible() and row(M, 'b1').locator('[data-test="row-menu"]').is_visible()
    T(M, 'btn-reorder').click(); W(M, 250)
    on = T(M, 'btn-reorder').get_attribute('aria-pressed') == 'true' and T(M, 'btn-reorder').inner_text().strip() == 'Xong'
    shown = grip('b1').is_visible() and not row(M, 'b1').locator('[data-test="row-menu"]').is_visible()
    gb = grip(before[-1]).bounding_box(); fb = row(M, before[0]).bounding_box()
    M.mouse.move(gb['x'] + gb['width'] / 2, gb['y'] + gb['height'] / 2); M.mouse.down(); M.mouse.move(fb['x'] + 100, fb['y'] + 5, steps=12); M.mouse.up(); W(M, 500)
    after = ids(M)
    moved = after == [before[-1]] + before[:-1]
    still_on = grip('b1').is_visible()
    saved = [b['id'] for b in sorted([b for b in pr.data()['bookmarks'] if b['folderId'] == 'co'], key=lambda b: b['order'])] == after
    T(M, 'btn-reorder').click(); W(M, 250)
    off = not grip('b1').is_visible() and T(M, 'btn-reorder').inner_text().strip() == 'Sắp xếp lại'
    T(M, 'btn-reorder').click(); W(M, 200)
    T(M, 'sort-select').select_option('az'); W(M, 250)
    gone_sort = T(M, 'btn-reorder').count() == 0
    T(M, 'sort-select').select_option('manual'); W(M, 250)
    reset_after_sort = T(M, 'btn-reorder').get_attribute('aria-pressed') == 'false' and not grip('b1').is_visible()
    T(M, 'btn-select-mode').click(); W(M, 250)
    gone_sel = T(M, 'btn-reorder').count() == 0
    T(M, 'btn-select-mode').click(); W(M, 250)
    T(M, 'btn-reorder').click(); W(M, 200); tree_open(M, 'op'); tree_open(M, 'co')
    reset_after_nav = T(M, 'btn-reorder').get_attribute('aria-pressed') == 'false'
    tree_open(M, 'mot')
    one_item = T(M, 'btn-reorder').count() == 0
    M.set_viewport_size({'width': 1280, 'height': 800}); W(M, 300); tree_open(M, 'co')
    desk = grip('b1').is_visible() and not T(M, 'btn-reorder').is_visible() and row(M, 'b1').locator('[data-test="row-menu"]').is_visible()
    M.set_viewport_size({'width': 390, 'height': 844}); W(M, 300)
    ok('CT-154 điện thoại: tay nắm chỉ hiện khi "Sắp xếp lại"; kéo được và lưu; Xong / đổi sắp xếp / chọn nhiều / sang thư mục khác → ẩn; 1 mục: không có nút; máy tính: như cũ',
       hid0 and on and shown and moved and still_on and saved and off and gone_sort and reset_after_sort and gone_sel and reset_after_nav and one_item and desk,
       [hid0, on, shown, before, after, still_on, saved, off, gone_sort, reset_after_sort, gone_sel, reset_after_nav, one_item, desk])

    # CT-158 vùng chạm và tương phản
    tree_open(M, 'co')
    hh = {k: hgt(M.locator(sel)) for k, sel in (('sort', '.sortpill'), ('select', '[data-test="btn-select-mode"]'), ('reorder', '[data-test="btn-reorder"]'), ('dense', '[data-test="btn-dense"]'))}
    T(M, 'btn-reorder').click(); W(M, 200)
    c_grip = contrast(rgb_of(M, '[data-test="row-handle"]'), [255, 255, 255])
    T(M, 'btn-reorder').click(); W(M, 200)
    row(M, 'b1').locator('[data-test="row-menu"]').click(); W(M, 300)
    has_hint = M.locator('.menu-hint').count() > 0
    c_hint = contrast(rgb_of(M, '.menu-hint'), [255, 255, 255]) if has_hint else 0
    M.keyboard.press('Escape'); W(M, 200)
    if M.locator('dialog[open]').count(): js_click(M, 'dialog[open] [data-test="dlg-close"]')
    M.set_viewport_size({'width': 1280, 'height': 800}); W(M, 300)
    row(M, 'b1').click(button='right'); W(M, 300)
    c_hint_desk = contrast(rgb_of(M, '.menu-hint'), [255, 255, 255]) if M.locator('.menu-hint').count() else 0
    M.keyboard.press('Escape'); W(M, 200)
    M.set_viewport_size({'width': 390, 'height': 844}); W(M, 300)
    ok('CT-158 nút đầu danh sách cao ≥ 44px; tay nắm và gợi ý phím tắt tương phản ≥ 4.5', all(v >= 44 for v in hh.values()) and c_grip >= 4.5 and max(c_hint, c_hint_desk) >= 4.5, [hh, round(c_grip, 2), round(c_hint, 2), round(c_hint_desk, 2)])

    # CT-155 tô chữ khớp
    js_click(M, '[data-test="folder-all"]')
    T(M, 'search-input').fill('sang tac'); W(M, 500)
    marks = row(M, 'st').locator('[data-test="item-title"] [data-test="hl"]').all_inner_texts()
    title_txt = row(M, 'st').locator('[data-test="item-title"]').inner_text()
    dom_marks = row(M, 'st').locator('[data-test="item-domain"] [data-test="hl"]').all_inner_texts()   # ô tìm chung: tên miền cũng khớp "sang" + "tac" liền nhau
    T(M, 'search-input').fill('sangtacviet.com'); W(M, 500)
    dm = row(M, 'st').locator('[data-test="item-domain"] [data-test="hl"]').all_inner_texts()
    T(M, 'search-input').fill('('); W(M, 300)
    T(M, 'search-input').fill(''); W(M, 400)
    none = T(M, 'hl').count() == 0
    # ô "Địa chỉ có chữ"
    T(M, 'btn-filter').click(); W(M, 300); T(M, 'filter-url').fill('sangtacviet'); T(M, 'filter-apply').click(); W(M, 500)
    um = row(M, 'st').locator('[data-test="item-domain"] [data-test="hl"]').all_inner_texts()
    tm = row(M, 'st').locator('[data-test="item-title"] [data-test="hl"]').count()
    T(M, 'btn-clear-filter-inline').click(); W(M, 400)
    ok('CT-155 tìm "sang tac" tô "Sáng" và "tác"; địa chỉ tô ở tên miền; bỏ tìm → hết tô',
       marks == ['Sáng', 'tác'] and title_txt == 'Sáng tác Việt' and dom_marks == ['sangtac'] and dm == ['sangtacviet.com'] and none and um == ['sangtacviet'] and tm == 0 and T(M, 'hl').count() == 0, [marks, title_txt, dom_marks, dm, none, um, tm])

    # CT-157 bấm đường dẫn → tới đúng mục
    T(M, 'search-input').fill('kimcuong'); W(M, 500)
    one_res = T(M, 'list-count').inner_text() == '1 kết quả'
    row(M, 't079').locator('[data-test="item-path"]').click(); W(M, 500)
    r = row(M, 't079')
    in_dom = r.count() == 1
    bb = r.bounding_box() if in_dom else None
    in_view = bool(bb) and bb['y'] >= 60 and bb['y'] + bb['height'] <= 844
    flash = in_dom and 'flash' in (r.get_attribute('class') or '')
    ok('CT-157 đường dẫn ở kết quả → mở thư mục, dòng nằm trong khung nhìn và được làm nổi; ô tìm trống',
       one_res and T(M, 'view-title').inner_text().strip() == 'Trăm mục' and in_view and flash and T(M, 'search-input').input_value() == '', [one_res, T(M, 'view-title').inner_text(), bb, flash])
    W(M, 2600)
    ok('CT-157 hết làm nổi sau chốc lát', 'flash' not in (row(M, 't079').get_attribute('class') or ''))

    # CT-C8 không cuộn ngang ở 360 / 412, Thoáng và Gọn, tên rất dài không dấu cách
    res = {}
    tree_open(M, 'an')
    for w in (360, 412):
        M.set_viewport_size({'width': w, 'height': 800}); W(M, 250)
        res[f'{w}-thoang'] = no_hscroll(M)
        T(M, 'btn-dense').click(); W(M, 250); res[f'{w}-gon'] = no_hscroll(M)
        T(M, 'search-input').fill('sieudai'); W(M, 400); res[f'{w}-gon-tim'] = no_hscroll(M) and T(M, 'hl').count() > 0
        T(M, 'btn-dense').click(); W(M, 250); res[f'{w}-thoang-tim'] = no_hscroll(M)
        T(M, 'search-input').fill(''); W(M, 300)
    M.set_viewport_size({'width': 390, 'height': 844}); W(M, 200)
    ok('CT-C8 khung 360 và 412px, Thoáng và Gọn: không cuộn ngang', hs_roomy and hs_dense and all(res.values()), [hs_roomy, hs_dense, res])
    ok('CT-C8 không lỗi console', not errs, errs[:5])
    ctx.close()

qua = sum(kq.values())
print(f'\nBản 2.7.0 (giao diện): {qua}/{len(kq)} qua')
json.dump({'kq': kq, 'notes': notes}, open(os.path.join(OUT, 'ketqua-ui27.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
sys.exit(0 if qua == len(kq) else 1)
