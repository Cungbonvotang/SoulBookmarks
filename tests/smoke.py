import tempfile, sys
from playwright.sync_api import sync_playwright
EXT = '/home/claude/app/so-dau-trang/ext'
with sync_playwright() as p:
    ctx = p.chromium.launch_persistent_context(tempfile.mkdtemp(), headless=True, channel='chromium',
        args=[f'--disable-extensions-except={EXT}', f'--load-extension={EXT}'],
        viewport={'width': 390, 'height': 844}, timezone_id='Asia/Ho_Chi_Minh', device_scale_factor=1)
    sw = ctx.service_workers[0] if ctx.service_workers else ctx.wait_for_event('serviceworker', timeout=10000)
    eid = sw.url.split('/')[2]
    print('id', eid)
    errs = []
    pg = ctx.new_page()
    pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.on('console', lambda m: m.type == 'error' and errs.append(m.text))
    pg.goto(f'chrome-extension://{eid}/manager.html')
    pg.wait_for_timeout(800)
    pg.screenshot(path='/tmp/m1.png')
    print(pg.locator('[data-test=empty-state]').inner_text())
    print('errs', errs)
    ctx.close()
