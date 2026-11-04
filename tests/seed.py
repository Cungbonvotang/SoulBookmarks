# Dữ liệu mẫu dùng chung cho các phép thử giao diện 2.0
import datetime
def ms(y, m, d, hh=12, mm=0):
    return int(datetime.datetime(y, m, d, hh, mm, tzinfo=datetime.timezone(datetime.timedelta(hours=7))).timestamp() * 1000)
def sample():
    F = [
        {'id': 'cv', 'name': 'Công việc', 'parentId': None, 'createdAt': ms(2026, 9, 1), 'order': 0},
        {'id': 'da', 'name': 'Dự án', 'parentId': 'cv', 'createdAt': ms(2026, 9, 2), 'order': 0},
        {'id': 'gt', 'name': 'Giải trí', 'parentId': None, 'createdAt': ms(2026, 9, 3), 'order': 1},
        {'id': 'an', 'name': 'Anime', 'parentId': 'gt', 'createdAt': ms(2026, 9, 4), 'order': 0},
        {'id': 'co', 'name': 'Conan', 'parentId': 'an', 'createdAt': ms(2026, 9, 5), 'order': 0},
        {'id': 'op', 'name': 'One Piece', 'parentId': 'an', 'createdAt': ms(2026, 9, 6), 'order': 1},
        {'id': 'ht', 'name': 'Học tập', 'parentId': None, 'createdAt': ms(2026, 9, 7), 'order': 2},
    ]
    def b(i, title, url, folder, tags, c, u=None, order=0):
        return {'id': i, 'title': title, 'url': url, 'folderId': folder, 'tags': tags, 'createdAt': c, 'updatedAt': u or c, 'order': order}
    B = [
        b('b1', 'Thám tử lừng danh Conan – Tập 1100', 'https://vidu.vn/conan-1100', 'co', ['anime', 'conan'], ms(2026, 8, 12), order=0),
        b('b2', 'Conan movie 29: lịch chiếu Việt Nam', 'https://vidu.vn/conan-movie-29', 'an', ['anime', 'phim'], ms(2026, 8, 3), order=0),
        b('b3', 'Conan tập 1 (bản khác)', 'https://khac.vn/conan-1', 'co', ['anime'], ms(2026, 8, 5), order=1),
        b('b4', 'Conan tập 2', 'https://vidu.vn/conan-2', 'co', ['phim'], ms(2026, 8, 6), order=2),
        b('b5', 'Conan tập 3', 'https://vidu.vn/conan-3', 'co', ['anime'], ms(2026, 9, 1, 0, 0), order=3),
        b('b6', 'One Piece tập 1120', 'https://vidu.vn/one-piece-1120', 'op', ['anime'], ms(2026, 8, 7), order=0),
        b('b7', 'Lịch phát sóng anime mùa thu 2026', 'https://lichanime.vn/thu-2026', 'an', ['anime', 'lịch'], ms(2026, 11, 2), order=1),
        b('b8', 'Top 20 anime trinh thám hay nhất', 'https://vidu.vn/top-20-trinh-tham', 'an', ['anime'], ms(2026, 10, 28), order=2),
        b('b9', 'Du lịch Hà Nội', 'https://dulich.vn/ha-noi', None, ['du lịch'], ms(2026, 10, 15, 0, 0), order=0),
        b('b10', 'GitHub repo', 'https://github.com/x', 'da', ['code', 'js'], ms(2026, 10, 15, 23, 59), order=0),
        b('b11', 'Bài viết mẹo lập trình', 'https://blog.vn/github-tips', 'da', ['code'], ms(2026, 10, 5), ms(2026, 10, 25), order=1),
        b('b12', 'Ghi chú họp', 'https://note.vn', 'cv', ['github'], ms(2026, 9, 30), order=0),
        b('b13', 'Tin tức', 'https://tin.vn', None, [], ms(2026, 10, 21), order=1),
        b('b14', 'Nhuận cuối', 'https://n.vn/1', 'ht', [], ms(2028, 2, 29, 23, 59), order=0),
        b('b15', 'Sau nhuận', 'https://n.vn/2', 'ht', [], ms(2028, 3, 1, 0, 0), order=1),
        b('b16', 'Trước nhuận', 'https://n.vn/3', 'ht', [], ms(2028, 1, 31, 23, 59), order=2),
    ]
    import urllib.parse
    def key(u):
        p = urllib.parse.urlsplit(u)
        host = p.hostname.lower()
        if host.startswith('www.'): host = host[4:]
        return host + (':' + str(p.port) if p.port else '') + p.path.rstrip('/') + ('?' + p.query if p.query else '')
    for x in B: x['urlKey'] = key(x['url'])
    return {'version': 2, 'folders': F, 'bookmarks': B, 'tagColors': {'anime': 'purple'}}
