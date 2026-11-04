# python3 soul/build.py — dựng so-dau-trang.user.js từ mã dùng chung + phần riêng của Soul
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

header = f"""// ==UserScript==
// @name         Sổ Dấu Trang
// @namespace    so-dau-trang
// @version      {version}
// @description  Lưu dấu trang theo thư mục và nhãn; nút ruy băng cho biết trang đang mở đã lưu chưa. Dữ liệu chỉ nằm trong trình duyệt.
// @homepageURL  https://github.com/Cungbonvotang/SoulBookmarks
// @updateURL    https://raw.githubusercontent.com/Cungbonvotang/SoulBookmarks/main/so-dau-trang.user.js
// @downloadURL  https://raw.githubusercontent.com/Cungbonvotang/SoulBookmarks/main/so-dau-trang.user.js
// @match        *://*/*
// @include      *
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_deleteValue
// @grant        GM_listValues
// @grant        GM_openInTab
// @grant        GM_setClipboard
// @grant        GM_registerMenuCommand
// @run-at       document-idle
// @noframes
// ==/UserScript==
"""
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
out = os.path.join(os.path.dirname(HERE), 'so-dau-trang.user.js')   # ở gốc kho mã: địa chỉ cập nhật cố định
open(out, 'w', encoding='utf-8').write(header + body + '\n')
print(out, os.path.getsize(out), 'byte, phiên bản', version)
