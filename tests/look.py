import tempfile, json, sys, os
sys.path.insert(0, os.path.dirname(__file__))
from seed import sample
from playwright.sync_api import sync_playwright
EXT='/home/claude/app/so-dau-trang/ext'; OUT='/home/claude/app/so-dau-trang/tests/out'
with sync_playwright() as p:
    ctx = p.chromium.launch_persistent_context(tempfile.mkdtemp(), headless=True, channel='chromium',
        args=[f'--disable-extensions-except={EXT}', f'--load-extension={EXT}'], viewport={'width': 390, 'height': 844}, timezone_id='Asia/Ho_Chi_Minh', has_touch=True)
    sw = ctx.service_workers[0] if ctx.service_workers else ctx.wait_for_event('serviceworker')
    eid = sw.url.split('/')[2]; errs=[]
    pg = ctx.new_page(); pg.on('pageerror', lambda e: errs.append(str(e))); pg.on('console', lambda m: m.type=='error' and errs.append(m.text))
    pg.goto(f'chrome-extension://{eid}/manager.html'); pg.wait_for_selector('body.ready')
    pg.evaluate("d => SDTStore.replaceAll(SDT.validateData(d).data)", sample())
    pg.reload(); pg.wait_for_selector('body.ready')
    pg.click('[data-test=btn-drawer]'); pg.wait_for_timeout(300)
    pg.click('[data-test=folder-item][data-id=gt] [data-test=folder-caret]'); pg.wait_for_timeout(100)
    pg.click('[data-test=folder-item][data-id=an] [data-test=folder-open]'); pg.wait_for_timeout(300)
    pg.screenshot(path=f'{OUT}/v2-thumuc.png')
    pg.click('[data-test=btn-filter]'); pg.wait_for_timeout(200)
    pg.fill('[data-test=filter-title]','Conan'); pg.fill('[data-test=filter-url]','vidu.vn')
    pg.locator('[data-test=filter-tag][data-tag=anime]').check(force=True)
    pg.check('[data-test=filter-datemode-month]', force=True); pg.fill('[data-test=filter-month]','2026-08')
    pg.screenshot(path=f'{OUT}/v2-loc.png')
    pg.check('[data-test=filter-scope-all]', force=True)
    pg.click('[data-test=filter-apply]'); pg.wait_for_timeout(300)
    pg.screenshot(path=f'{OUT}/v2-ketqua.png')
    pg.click('[data-test=btn-clear-filter-inline]'); pg.wait_for_timeout(200)
    pg.locator('[data-test=list-item]').first.locator('[data-test=row-menu]').click(); pg.wait_for_timeout(200)
    pg.screenshot(path=f'{OUT}/v2-menu.png')
    pg.click('[data-test=m-edit]'); pg.wait_for_timeout(200)
    pg.click('[data-test=bm-folder]'); pg.wait_for_timeout(200)
    pg.screenshot(path=f'{OUT}/v2-cay.png')
    pg.click('[data-test=pick-cancel]'); pg.click('[data-test=bm-cancel]')
    pg.set_viewport_size({'width':1280,'height':800}); pg.wait_for_timeout(300)
    pg.screenshot(path=f'{OUT}/v2-maytinh.png')
    print('errs', errs)
    ctx.close()
