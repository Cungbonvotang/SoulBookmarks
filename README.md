# Sổ Dấu Trang

Lưu dấu trang theo thư mục và nhãn, tìm nhiều điều kiện, báo trang đang mở đã lưu chưa. Hai bản dùng chung mã:

- **Soul Browser (Android)** — **một** userscript [`so-dau-trang.user.js`](so-dau-trang.user.js) (từ bản 3.0.0):
  `https://raw.githubusercontent.com/Cungbonvotang/SoulBookmarks/main/so-dau-trang.user.js`
  - Cài **một lần**, sau đó **không bấm Cập nhật và không gỡ** script này trong Soul (Soul xóa dấu trang của script khi cập nhật / gỡ). App tự cập nhật: script tự tải mã mới ([`so-dau-trang-app.js`](so-dau-trang-app.js)) 6 giờ một lần; menu userscript có "Kiểm tra bản mới".
  - Đang dùng bản 2.x (hai script): bấm Cập nhật script "Sổ Dấu Trang" **lần cuối** → mở một trang web bất kỳ → app tự chép dấu trang từ script "Sổ Dấu Trang – Kho" và báo "Đã chép … dấu trang" → sau đó gỡ được script Kho.
- **Chrome / Edge / Cốc Cốc (máy tính)** — thư mục [`ext/`](ext): `chrome://extensions` → bật chế độ nhà phát triển → "Tải tiện ích đã giải nén" → chọn thư mục `ext`.

Dữ liệu chỉ nằm trong trình duyệt. Sao lưu: trình quản lý → ⋯ → Sao lưu (JSON; HTML để chuyển sang trình duyệt khác).

## Cho người sửa mã
- Hồ sơ app (chức năng, dữ liệu, ca thử, nhật ký): [`_hoso.md`](_hoso.md)
- Sửa mã chung trong `ext/`, phần riêng Soul trong `soul/`, rồi dựng lại: `python3 soul/build.py` → `so-dau-trang-app.js` (mã app, bộ nạp tự tải từ nhánh main) và `soul/dist/so-dau-trang.dev.user.js` (bản thử).
- **Bộ nạp `so-dau-trang.user.js` đông cứng từ 3.0.0** (mẫu ở `soul/loader.js`): `build.py` không ghi đè nó. Đừng sửa, đừng đổi `@version` — Soul sẽ đề nghị cập nhật và cập nhật thì mất dấu trang. Mã app mới chỉ cần `so-dau-trang-app.js` lên nhánh main.
- Script Kho cũ: `soul/kho.js` (chỉ còn để chuyển dữ liệu từ bản 2.x; giữ nguyên giao thức v1 và @version 1.0.0).
- Thử: `node tests/core.test.js` · `python3 tests/html_mau.py && node tests/html.test.js && node tests/search.test.js && node tests/replace.test.js && node tests/dups.test.js && node tests/fix26.test.js && node tests/fix261.test.js && node tests/ui27.test.js` · `python3 tests/search_ui_test.py` · `python3 tests/replace_ui_test.py` · `python3 tests/dups_ui_test.py` · `python3 tests/state_ui_test.py` · `python3 tests/fix261_ui_test.py && python3 tests/ui27_ui_test.py` · `python3 tests/ui_test.py` · `python3 tests/html_ui_test.py` · `python3 tests/soul_test.py` · `python3 tests/kho_test.py` · `python3 tests/perf_test.py`
- Tăng `"version"` trong `ext/manifest.json` mỗi lần phát hành; phiên bản trong dòng đầu `// SDT_APP …` của `so-dau-trang-app.js` lấy từ đó (bộ nạp chỉ tải khi phiên bản lớn hơn bản đang có).
