# Sổ Dấu Trang

Lưu dấu trang theo thư mục và nhãn, tìm nhiều điều kiện, báo trang đang mở đã lưu chưa. Hai bản dùng chung mã:

- **Soul Browser (Android)** — hai userscript:
  - [`so-dau-trang-kho.user.js`](so-dau-trang-kho.user.js) — **Kho**: giữ dấu trang. Cài một lần, **không bấm cập nhật** script này (Soul xóa dữ liệu của script khi cập nhật).
    `https://raw.githubusercontent.com/Cungbonvotang/SoulBookmarks/main/so-dau-trang-kho.user.js`
  - [`so-dau-trang.user.js`](so-dau-trang.user.js) — script chính (giao diện, chức năng). Cập nhật thoải mái; dấu trang nằm trong Kho nên không mất.
    `https://raw.githubusercontent.com/Cungbonvotang/SoulBookmarks/main/so-dau-trang.user.js`
- **Chrome / Edge / Cốc Cốc (máy tính)** — thư mục [`ext/`](ext): `chrome://extensions` → bật chế độ nhà phát triển → "Tải tiện ích đã giải nén" → chọn thư mục `ext`.

Dữ liệu chỉ nằm trong trình duyệt. Sao lưu: trình quản lý → ⋯ → Sao lưu (JSON; HTML để chuyển sang trình duyệt khác).

## Cho người sửa mã
- Hồ sơ app (chức năng, dữ liệu, ca thử, nhật ký): [`_hoso.md`](_hoso.md)
- Sửa mã chung trong `ext/`, phần riêng Soul trong `soul/`, rồi dựng lại userscript: `python3 soul/build.py`
- Script Kho: `soul/kho.js` (giữ nguyên giao thức v1 và @version 1.0.0; `build.py` dựng ra `so-dau-trang-kho.user.js`)
- Thử: `node tests/core.test.js` · `python3 tests/html_mau.py && node tests/html.test.js && node tests/search.test.js` · `python3 tests/search_ui_test.py` · `python3 tests/ui_test.py` · `python3 tests/html_ui_test.py` · `python3 tests/soul_test.py` · `python3 tests/kho_test.py` · `python3 tests/perf_test.py`
- Tăng `"version"` trong `ext/manifest.json` mỗi lần phát hành; `@version` của userscript lấy từ đó.
