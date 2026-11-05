# python3 tests/search_ui_test.py — nghiệm thu cách so chữ khi tìm (2.3.0) trên bản tiện ích
import os, sys, json, tempfile
from playwright.sync_api import sync_playwright
HERE = os.path.dirname(os.path.abspath(__file__))
src = open(os.path.join(HERE, 'ui_test.py'), encoding='utf-8').read().split('def is_drawer_open')[0]
g = {'__file__': os.path.join(HERE, 'ui_test.py')}
exec(compile(src, 'ui_helpers', 'exec'), g)
launch, open_manager, Probe, T, W, ok, kq, notes, errs, sample = (g[k] for k in ('launch', 'open_manager', 'Probe', 'T', 'W', 'ok', 'kq', 'notes', 'errs', 'sample'))
OUT = os.path.join(HERE, 'out')

def filt(M, case=None, phrase=None, regex=None, title=None):
    T(M, 'btn-filter').click(); W(M, 300)
    if title is not None: T(M, 'filter-title').fill(title)
    for t, v in (('filter-case', case), ('filter-regex', regex), ('filter-phrase', phrase)):
        if v is not None and T(M, t).is_enabled(): T(M, t).set_checked(v, force=True)
    T(M, 'filter-apply').click(); W(M, 300)
def count(M): return T(M, 'list-count').inner_text().strip()
def chips(M): return [e.get_attribute('data-key') for e in T(M, 'cond-chip').all()]
def search(M, text): T(M, 'search-input').fill(text); W(M, 300)

with sync_playwright() as p:
    ctx, eid = launch(p, tempfile.mkdtemp(), w=390)
    pr = Probe(ctx, eid); pr.seed(sample())
    M = open_manager(ctx, eid)

    # bảng lọc có mục "Cách so chữ"; bật Regex thì Đúng cụm mờ
    T(M, 'btn-filter').click(); W(M, 300)
    has = T(M, 'filter-textmode').is_visible() and all(T(M, t).is_visible() for t in ('filter-case', 'filter-phrase', 'filter-regex'))
    T(M, 'filter-regex').set_checked(True, force=True); W(M, 100)
    dis = not T(M, 'filter-phrase').is_enabled()
    T(M, 'filter-regex').set_checked(False, force=True); W(M, 100)
    en = T(M, 'filter-phrase').is_enabled()
    hs = {t: T(M, t).locator('xpath=..').bounding_box()['height'] for t in ('filter-case', 'filter-phrase', 'filter-regex')}
    M.keyboard.press('Escape'); W(M, 200)
    ok('CT-100 bảng lọc có Cách so chữ; Regex làm mờ Đúng cụm; dòng ≥ 44px', has and dis and en and all(v >= 44 for v in hs.values()), [has, dis, en, hs])

    # Phân biệt hoa thường
    filt(M, case=True, title='conan')
    c1, ch1 = count(M), chips(M)
    T(M, 'cond-chip').filter(has=M.locator('text=Phân biệt hoa thường')).locator('[data-test="cond-x"]').click(); W(M, 300)
    ok('CT-101 hoa thường: "conan" ở tên → 0; bỏ thẻ Aa → 5', c1 == '0 kết quả' and 'case' in ch1 and count(M) == '5 kết quả' and 'case' not in chips(M), [c1, ch1, count(M)])
    M.locator('[data-test="btn-clear-filter-inline"]').click(); W(M, 300)

    # Regex qua ô tìm: sai → báo, đúng → kết quả; ô tìm đổi chữ gợi ý
    filt(M, regex=True)
    ph = T(M, 'search-input').get_attribute('placeholder')
    search(M, 'tập (')
    err = T(M, 'search-error').is_visible() and 'Biểu thức chưa đúng' in T(M, 'search-error').inner_text()
    search(M, 'tập \\d+')
    c2, e2 = count(M), T(M, 'search-error').count()
    ok('CT-102 regex: sai → báo dưới ô, đúng → 5 kết quả', ph == 'Tìm bằng regex' and err and c2 == '5 kết quả' and e2 == 0 and 'regex' in chips(M), [ph, err, c2, e2])
    filt(M, case=True); c3 = count(M)
    ok('CT-102 regex + hoa thường → 4 kết quả', c3 == '4 kết quả', c3)
    M.locator('[data-test="btn-clear-filter-inline"]').click(); W(M, 300)
    search(M, '')

    # Đúng cụm
    filt(M, phrase=True)
    search(M, 'Hà Nội'); c4 = count(M)
    search(M, 'ha noi'); c5 = M.locator('[data-test="empty-state"]').inner_text()
    ok('CT-103 đúng cụm: "Hà Nội" → 1; "ha noi" → Không tìm thấy', c4 == '1 kết quả' and 'Không tìm thấy' in c5 and 'phrase' in chips(M), [c4, c5[:40]])
    # Bỏ lọc tắt hết
    M.locator('[data-test="btn-clear-filter"]').click(); W(M, 300)
    ok('CT-103 "Xóa bộ lọc" tắt hết cách so chữ', not chips(M) and T(M, 'search-input').get_attribute('placeholder') == 'Tìm dấu trang' and T(M, 'search-input').input_value() == '')

    # khung 360: bảng lọc không cuộn ngang
    M.set_viewport_size({'width': 360, 'height': 800}); W(M, 200)
    T(M, 'btn-filter').click(); W(M, 300)
    M.screenshot(path=os.path.join(OUT, 'v23-loc-360.png'))
    T(M, 'filter-textmode').scroll_into_view_if_needed(); W(M, 200)
    M.screenshot(path=os.path.join(OUT, 'v23-cachsochu-360.png'))
    hz = M.evaluate("() => { const d = [...document.querySelectorAll('dialog')].find(x => x.open); return d.scrollWidth <= d.clientWidth + 1 && document.documentElement.scrollWidth <= innerWidth; }")
    ok('CT-C3 khung 360: bảng lọc không cuộn ngang', hz)
    ok('CT-C1 không lỗi console', not errs, errs[:5])
    ctx.close()

qua = sum(kq.values())
print(f'\nCách so chữ (giao diện): {qua}/{len(kq)} qua')
json.dump({'kq': kq, 'notes': notes}, open(os.path.join(OUT, 'ketqua-search-ui.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
sys.exit(0 if qua == len(kq) else 1)
