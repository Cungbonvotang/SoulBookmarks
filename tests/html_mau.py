# Tệp dấu trang HTML mẫu (dữ liệu giả) cho các ca CT-75…CT-83. python3 tests/html_mau.py → ghi vào tests/out/html/
import os, random
ROOT = os.path.dirname(os.path.abspath(__file__))
DIR = os.path.join(ROOT, 'out', 'html')
HEAD = '''<!DOCTYPE NETSCAPE-Bookmark-file-1>
<!-- This is an automatically generated file.
     It will be read and overwritten.
     DO NOT EDIT! -->
<META HTTP-EQUIV="Content-Type" CONTENT="text/html; charset=UTF-8">
<TITLE>Bookmarks</TITLE>
<H1>Bookmarks</H1>
'''
ICON = 'data:image/png;base64,' + 'iVBORw0KGgoAAAANSUhEUgAAABAAAAAQ' * 4

CHROME = HEAD + '''<DL><p>
    <DT><H3 ADD_DATE="1785000000" LAST_MODIFIED="1785000100" PERSONAL_TOOLBAR_FOLDER="true">Bookmarks bar</H3>
    <DL><p>
        <DT><A HREF="https://vidu.vn/a?x=1&amp;y=2" ADD_DATE="1785000010" ICON="''' + ICON + '''">Tom &amp; Jerry &lt;3</A>
        <DT><H3 ADD_DATE="1785000020" LAST_MODIFIED="1785000020">Công việc</H3>
        <DL><p>
            <DT><A HREF="https://github.com/" ADD_DATE="1785000030">GitHub</A>
        </DL><p>
        <DT><H3 ADD_DATE="1785000040" LAST_MODIFIED="1785000040">Trống</H3>
        <DL><p>
        </DL><p>
        <DT><A HREF="https://vnexpress.net/" ADD_DATE="1785000050">VnExpress</A>
    </DL><p>
    <DT><H3 ADD_DATE="1785000060" LAST_MODIFIED="1785000060">Other bookmarks</H3>
    <DL><p>
        <DT><A HREF="https://wiki.vn/" ADD_DATE="1785000070">Wiki &quot;VN&quot;</A>
    </DL><p>
</DL><p>
'''

SOUL = HEAD + '''<DL><p>
    <DT><H3 ADD_DATE="1785000000000" LAST_MODIFIED="1785000000000">Favorites bar</H3>
    <DL><p>
        <DT><H3 ADD_DATE="1785000001000" LAST_MODIFIED="1785000001000">Trống</H3>
        <DT><A HREF="https://a.vn/1" ADD_DATE="1785000002000" ICON="''' + ICON + '''">Một</A>
        <DT><A HREF="chrome://apps/" ADD_DATE="1785000003000" ICON="null">Ứng dụng</A>
        <DT><A HREF="javascript:void(d.write('<!DOCTYPE HTML><html style="opacity:0;"><body><a data-x="1">X</a><DL><p></body></html>'))" ADD_DATE="1785000004000" ICON="''' + ICON + '''">↔ Công cụ</A>
        <DT><A HREF="http://b.vn/2" ADD_DATE="1785000005000" ICON="''' + ICON + '''">Đổi (GB) <> (Big5) & "x"</A>
        <DT><H3 ADD_DATE="1785000006000" LAST_MODIFIED="1785000006000">Phim</H3>
        <DL><p>
            <DT><A HREF="https://phim.vn/1" ADD_DATE="1785000007000" ICON="''' + ICON + '''">P1</A>
        </DL><p>
        <DT><H3 ADD_DATE="1785000008000" LAST_MODIFIED="1785000008000">phim</H3>
        <DL><p>
            <DT><A HREF="https://phim.vn/2" ADD_DATE="1785000009000" ICON="''' + ICON + '''">P2</A>
        </DL><p>
        <DT><A HREF="https://a.vn/3" ADD_DATE="1785000010000" ICON="''' + ICON + '''">Ba</A>
    </DL><p>
    <DT><A HREF="https://goc.vn/" ADD_DATE="1785000011000" ICON="''' + ICON + '''">Gốc</A>
</DL><p>
'''

FIREFOX = '''<!DOCTYPE NETSCAPE-Bookmark-file-1>
<!-- This is an automatically generated file. -->
<META HTTP-EQUIV="Content-Type" CONTENT="text/html; charset=UTF-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'self'; script-src 'none'">
<TITLE>Bookmarks</TITLE>
<H1>Bookmarks Menu</H1>
<DL><p>
    <DT><A HREF="https://anime.vn/conan" ADD_DATE="1785000000" LAST_MODIFIED="1785090000" ICON_URI="https://anime.vn/f.ico" TAGS="anime,Hay">Conan</A>
    <DD>Mô tả của Firefox
    <DT><A HREF="https://micro.vn/" ADD_DATE="1785000000123456">Micro</A>
    <DT><A HREF="https://nodate.vn/">Không ngày</A>
    <DT><H3 ADD_DATE="1785000000" LAST_MODIFIED="1785000000" PERSONAL_TOOLBAR_FOLDER="true">Bookmarks Toolbar</H3>
    <DL><p>
    </DL><p>
</DL>
'''

# Gộp vào dữ liệu mẫu tests/seed.py (Công việc có b12 note.vn; Dự án có b10 github.com/x; gốc có b9 dulich.vn/ha-noi)
MERGE = HEAD + '''<DL><p>
    <DT><H3 ADD_DATE="1785000000" LAST_MODIFIED="1785000000">công việc</H3>
    <DL><p>
        <DT><A HREF="http://www.note.vn/" ADD_DATE="1785000001">Ghi chú họp (bản khác)</A>
        <DT><A HREF="https://moi.vn/1" ADD_DATE="1785000002">Mới 1</A>
        <DT><H3 ADD_DATE="1785000003" LAST_MODIFIED="1785000003">Dự án</H3>
        <DL><p>
            <DT><A HREF="https://github.com/x/" ADD_DATE="1785000004">GitHub repo (trùng)</A>
        </DL><p>
        <DT><H3 ADD_DATE="1785000005" LAST_MODIFIED="1785000005">Hợp đồng</H3>
        <DL><p>
            <DT><A HREF="https://hd.vn/" ADD_DATE="1785000006">Hợp đồng mẫu</A>
        </DL><p>
    </DL><p>
    <DT><A HREF="https://dulich.vn/ha-noi/" ADD_DATE="1785000007">Hà Nội (trùng)</A>
    <DT><A HREF="https://tin.vn/khac" ADD_DATE="1785000008">Tin khác</A>
    <DT><A HREF="https://vidu.vn/conan-1100" ADD_DATE="1785000009">Conan ở gốc</A>
</DL><p>
'''

NOT_BM = '<!DOCTYPE html><html><head><title>Trang</title></head><body><dl><dt><a href="https://a.vn">a</a></dt></dl></body></html>'
EMPTY = HEAD + '<DL><p>\n</DL><p>\n'
ONLY_BAD = HEAD + '<DL><p>\n    <DT><A HREF="javascript:alert(1)" ADD_DATE="1785000000">JS</A>\n</DL><p>\n'
GARBAGE = 'xin chào, đây không phải tệp dấu trang'

def big(n=11000, nf=160, icon_kb=8, seed=7):
    """Tệp kiểu Soul ~100 MB: n dấu trang trong nf thư mục, mỗi mục có ảnh biểu tượng icon_kb KB."""
    rnd = random.Random(seed)
    icon = 'data:image/png;base64,' + ''.join(rnd.choice('ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/') for _ in range(icon_kb * 1024))
    out = [HEAD, '<DL><p>']
    per = n // nf
    k = 0
    for f in range(nf):
        out.append(f'    <DT><H3 ADD_DATE="{1700000000000 + f}" LAST_MODIFIED="{1700000000000 + f}">Thư mục {f}</H3>')
        out.append('    <DL><p>')
        cnt = per if f < nf - 1 else n - per * (nf - 1)
        for _ in range(cnt):
            out.append(f'        <DT><A HREF="https://trang{k}.vidu.vn/bai/{k}" ADD_DATE="{1700000000000 + k * 1000}" ICON="{icon}">Bài viết số {k}</A>')
            k += 1
        out.append('    </DL><p>')
    out.append('</DL><p>\n')
    return '\n'.join(out)

FILES = {'chrome.html': CHROME, 'soul.html': SOUL, 'firefox.html': FIREFOX, 'gop.html': MERGE,
         'trang-thuong.html': NOT_BM, 'rong.html': EMPTY, 'chi-js.html': ONLY_BAD, 'rac.html': GARBAGE}

def write(with_big=False):
    os.makedirs(DIR, exist_ok=True)
    import json, sys
    sys.path.insert(0, ROOT)
    from seed import sample
    json.dump(sample(), open(os.path.join(DIR, 'seed.json'), 'w', encoding='utf-8'), ensure_ascii=False)
    for name, text in FILES.items():
        open(os.path.join(DIR, name), 'w', encoding='utf-8').write(text)
    if with_big and not os.path.exists(os.path.join(DIR, 'lon.html')):
        open(os.path.join(DIR, 'lon.html'), 'w', encoding='utf-8').write(big())
    return DIR

if __name__ == '__main__':
    print(write(with_big=True))
