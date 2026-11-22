# python3 soul/build.py — dựng bản Soul: so-dau-trang-app.js (mã app), soul/dist/ (bản thử), so-dau-trang.user.js (bộ nạp, đông cứng)
import json, os, re, sys
HERE = os.path.dirname(os.path.abspath(__file__))
EXT = os.path.join(os.path.dirname(HERE), 'ext')
version = json.load(open(os.path.join(EXT, 'manifest.json')))['version']
TAIL = "})(typeof globalThis !== 'undefined' ? globalThis : this);"

def mod(name):
    s = open(os.path.join(EXT, name), encoding='utf-8').read()
    assert s.count(TAIL) == 1, name
    return s.replace(TAIL, '})(SDTNS);')

css = ''.join(open(os.path.join(EXT, f), encoding='utf-8').read() for f in ('common.css', 'manager.css', 'popup.css'))
css += open(os.path.join(HERE, 'soul.css'), encoding='utf-8').read()

body = '\n'.join([
    "(function () {",
    "'use strict';",
    "if (window.top !== window.self) return;",
    "if (!document.documentElement) return;",
    "const SDTNS = {};",
    mod('core.js'),
    "const SDT = SDTNS.SDT;",
    mod('storage.js'),
    "const SDTStorage = SDTNS.SDTStorage;",
    mod('ui.js'),
    "const SDTUI = SDTNS.SDTUI;",
    mod('popup.js'),
    mod('manager.js'),
    "const SDT_CSS = " + json.dumps(css, ensure_ascii=False) + ";",
    open(os.path.join(HERE, 'soul-main.js'), encoding='utf-8').read(),
    "})();",
])
ROOT = os.path.dirname(HERE)

# 1) Mã app: bộ nạp tự tải tệp này từ nhánh main (dòng đầu ghi phiên bản).
app = f"// SDT_APP {version}\n// Mã app Sổ Dấu Trang (bản Soul). Bộ nạp trong so-dau-trang.user.js tự tải tệp này; đừng cài tệp này như userscript.\n" + body + "\n"
app_out = os.path.join(ROOT, 'so-dau-trang-app.js')
open(app_out, 'w', encoding='utf-8').write(app)
print(app_out, os.path.getsize(app_out), 'byte, app', version)

# 2) Bộ nạp + bản app có sẵn. LOADER_VERSION KHÔNG BAO GIỜ ĐỔI: Soul xóa dấu trang khi cập nhật script.
LOADER_VERSION = '3.0.0'
def loader(bundled_version):
    t = open(os.path.join(HERE, 'loader.js'), encoding='utf-8').read()
    return t.replace('__LOADER_VERSION__', LOADER_VERSION).replace('__BUNDLED_VERSION__', bundled_version).replace('__BUNDLED_APP__', body)
dist = os.path.join(HERE, 'dist'); os.makedirs(dist, exist_ok=True)
dev_out = os.path.join(dist, 'so-dau-trang.dev.user.js')        # bản thử: bộ nạp + app hiện tại
open(dev_out, 'w', encoding='utf-8').write(loader(version))
print(dev_out, os.path.getsize(dev_out), 'byte (bản thử)')

# 3) Tệp cài đặt ở gốc kho: chỉ ghi một lần (khi tệp hiện có chưa phải bộ nạp LOADER_VERSION), sau đó giữ nguyên từng byte
#    để Soul không bao giờ thấy "bản mới". Muốn ghi lại thật sự: python3 soul/build.py --ghi-lai-bo-nap
out = os.path.join(ROOT, 'so-dau-trang.user.js')
cur = open(out, encoding='utf-8').read() if os.path.exists(out) else ''
frozen = '@version      ' + LOADER_VERSION in cur.split('==/UserScript==')[0] and 'SDT_APP' in cur
if frozen and '--ghi-lai-bo-nap' not in sys.argv:
    print(out, 'giữ nguyên (bộ nạp', LOADER_VERSION + ', đã đông cứng)')
else:
    open(out, 'w', encoding='utf-8').write(loader(version))
    print(out, os.path.getsize(out), 'byte, bộ nạp', LOADER_VERSION, '+ app', version)

# Script Kho: giữ dữ liệu, cố ý KHÔNG có @updateURL/@downloadURL và giữ nguyên @version để Soul không đề nghị cập nhật (cập nhật sẽ xóa kho).
KHO_VERSION = '1.0.0'
kho_header = f"""// ==UserScript==
// @name         Sổ Dấu Trang – Kho
// @namespace    so-dau-trang-kho
// @version      {KHO_VERSION}
// @description  Giữ dấu trang cho script "Sổ Dấu Trang" để cập nhật script chính không làm mất dữ liệu. Không cần và không nên cập nhật script này.
// @match        *://*/*
// @include      *
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_deleteValue
// @grant        GM_listValues
// @run-at       document-start
// @noframes
// ==/UserScript==
"""
kho_out = os.path.join(os.path.dirname(HERE), 'so-dau-trang-kho.user.js')
open(kho_out, 'w', encoding='utf-8').write(kho_header + open(os.path.join(HERE, 'kho.js'), encoding='utf-8').read())
print(kho_out, os.path.getsize(kho_out), 'byte, Kho', KHO_VERSION)
