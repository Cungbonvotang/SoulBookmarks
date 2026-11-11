# Hồ sơ app: Sổ Dấu Trang
Artifact: không · Kho mã: github.com/Cungbonvotang/SoulBookmarks (nhánh main; so-dau-trang.user.js và so-dau-trang-kho.user.js ở gốc kho; script chính có @updateURL, script Kho cố ý không có) · ID tiện ích: fnaogpencohieonebopoaemepgjamdod · Phiên bản: 2.8.0 · DATA_VERSION: 2 · Cập nhật: 2026-11-11

Dạng app: hai bản dùng chung logic và định dạng dữ liệu.
- Bản tiện ích: tiện ích trình duyệt Manifest V3 cho Chrome/Edge/Cốc Cốc máy tính. Chrome Android không chạy được tiện ích.
- Bản Soul: một tệp userscript (so-dau-trang.user.js) cho Soul Browser Android, dùng kho GM_getValue/GM_setValue (đã kiểm: lưu chung được giữa các trang).
Dữ liệu hai bản tách riêng; chuyển qua lại bằng xuất/nhập JSON (cùng định dạng).

## 1. Chức năng ← thiet-ke-webapp

- CN-01 Thư mục: tạo, đổi tên, xóa; thư mục lồng nhau (có thư mục con). Gốc tên "Dấu trang" luôn có, không xóa, không đổi tên được; dấu trang không nằm trong thư mục nào thì thuộc gốc. (Bản 1.x gọi gốc là "Chưa phân loại".) [đổi ở 2.0.0]
  - Chấp nhận: bấm "+ Thư mục", nhập "Công việc" → thư mục hiện trên cây và trong danh sách của gốc; bấm vào → xem nội dung thư mục (CN-13).
  - Chấp nhận: đổi thư mục cha bằng kéo thả (CN-14), cắt/dán (CN-16) hoặc "Chuyển vào…" chọn trên cây (CN-15).
  - Biên: tên rỗng hoặc toàn khoảng trắng → báo lỗi, không tạo.
  - Biên: trùng tên trong cùng thư mục cha (không phân biệt hoa thường) → báo lỗi.
  - Biên: chuyển thư mục vào chính nó hoặc thư mục con của nó → không cho, báo lỗi.
  - Biên: xóa thư mục còn dấu trang/thư mục con → hỏi: "Chuyển nội dung lên thư mục cha" hoặc "Xóa hết"; mặc định chọn chuyển.

- CN-02 Thêm dấu trang: từ popup (điền sẵn tên và địa chỉ của tab đang mở) hoặc thêm tay trong trình quản lý.
  - Trường: tên, địa chỉ, nơi lưu (thư mục), nhãn (nhiều), thời gian tạo, thời gian cập nhật (tự ghi).
  - Chấp nhận: đang ở một trang web, bấm biểu tượng tiện ích → popup có sẵn tên trang và địa chỉ; chọn thư mục (bằng cây, CN-15), gõ nhãn, bấm Lưu → biểu tượng chuyển sang trạng thái "đã lưu". Dấu trang mới nằm cuối thư mục.
  - Chấp nhận: gõ nhãn tách bằng dấu phẩy hoặc Enter; gợi ý nhãn đã có khi gõ.
  - Biên: tên rỗng → lấy địa chỉ làm tên.
  - Biên: địa chỉ rỗng hoặc sai dạng → báo lỗi. Gõ "vnexpress.net" thiếu http → tự thêm "https://".
  - Biên: nhãn trùng nhau, khác hoa thường, có khoảng trắng thừa → gộp thành một, cắt khoảng trắng.
  - Biên: địa chỉ đã có dấu trang (theo quy tắc so khớp ở CN-05) → cảnh báo "Trang này đã lưu ở <thư mục>", cho chọn "Mở bản cũ để sửa" hoặc "Vẫn lưu thêm".
  - Biên: trang nội bộ trình duyệt (chrome://, about:, trang tiện ích) → popup báo không lưu được trang này.

- CN-03 Sửa dấu trang: đổi tên, địa chỉ, thư mục, nhãn.
  - Chấp nhận: sửa nhãn, bấm Lưu → thời gian cập nhật đổi thành lúc lưu, thời gian tạo giữ nguyên.
  - Biên: bấm Lưu mà không đổi gì → thời gian cập nhật không đổi.
  - Biên: đổi địa chỉ trùng dấu trang khác → cảnh báo như CN-02.

- CN-04 Xóa dấu trang: một cái hoặc chọn nhiều.
  - Chấp nhận: bấm Xóa → dấu trang biến mất, hiện thanh "Đã xóa · Hoàn tác" khoảng 5 giây; bấm Hoàn tác → trở lại nguyên vẹn (cả thời gian).
  - Chấp nhận: chọn nhiều → Xóa / Chuyển thư mục / Thêm nhãn hàng loạt.
  - Biên: xóa trang đang mở trên tab → biểu tượng tiện ích về trạng thái "chưa lưu".

- CN-05 Báo trang đang mở đã lưu chưa.
  - Chấp nhận: mở hoặc chuyển sang tab có trang đã lưu → biểu tượng tiện ích có dấu ✓ (huy hiệu màu). Trang chưa lưu → không có dấu.
  - Chấp nhận: bấm biểu tượng ở trang đã lưu → popup ghi "Đã lưu · <thư mục> · <ngày lưu>", hiện form để sửa ngay và nút Xóa.
  - Quy tắc so khớp (bỏ qua khác biệt nhỏ): coi là cùng một trang khi chỉ khác http/https, có/không "www.", có/không dấu "/" cuối, phần "#..." cuối, hoa thường của tên miền. Phần "?..." (tham số) vẫn tính là khác trang.
  - Biên: trang đổi địa chỉ không tải lại (trang kiểu ứng dụng một trang) → dấu cập nhật theo địa chỉ mới.
  - Biên: Soul Browser không hiện huy hiệu trên biểu tượng → popup vẫn báo đúng trạng thái (ghi vào mục 7 nếu xảy ra).

- CN-06 Tìm kiếm và lọc nhiều điều kiện cùng lúc (trong trình quản lý). Mọi điều kiện đang đặt phải thỏa cùng lúc. [viết lại ở 2.0.0]
  - Ô tìm chung trên thanh trên: khớp tên, địa chỉ hoặc nhãn; không phân biệt hoa thường và không phân biệt dấu ("ha noi" khớp "Hà Nội"); nhiều từ thì phải có đủ các từ.
  - Bảng lọc có các điều kiện riêng: Tên có chữ…; Địa chỉ có chữ…; Nhãn (chọn một hay nhiều, dấu trang phải có đủ); Thời gian theo "Ngày tạo" hoặc "Ngày cập nhật", kiểu "Đúng ngày" / "Trong tháng" (chọn tháng và năm) / "Khoảng ngày" (tính trọn ngày, giờ máy); Phạm vi: thư mục đang xem (gồm cả thư mục con) hoặc toàn bộ.
  - Các điều kiện đang bật hiện thành dãy thẻ trên đầu danh sách, mỗi thẻ có nút × bỏ riêng điều kiện đó; "Bỏ lọc" bỏ hết.
  - Chấp nhận: đặt cùng lúc "tạo trong tháng 8/2026" + nhãn "anime" + địa chỉ có "vidu.vn" + tên có "Conan" → chỉ ra dấu trang thỏa cả bốn; số kết quả hiện trên đầu danh sách.
  - Chấp nhận: gõ "github" ở ô chung + nhãn "code" + từ 01/10/2026 đến 31/10/2026 → chỉ hiện dấu trang thỏa cả ba.
  - Biên: "Trong tháng" tính từ 00:00 ngày 1 tới 23:59 ngày cuối tháng (tháng 2 năm nhuận có 29 ngày).
  - Biên: chỉ điền "Từ" → từ ngày đó tới nay; chỉ điền "Đến" → mọi dấu trang tới hết ngày đó.
  - Biên: "Từ" sau "Đến" → tự đổi chỗ hai ngày và báo nhỏ.
  - Biên: không có kết quả → hiện "Không tìm thấy" và nút "Xóa bộ lọc".
  - Biên: đang tìm/lọc thì danh sách chỉ hiện dấu trang khớp (không hiện thư mục), mỗi dấu trang ghi đường dẫn thư mục; chạm đường dẫn → mở thư mục đó.
  - Cách so chữ [mới ở 2.3.0]: bảng lọc có mục "Cách so chữ" với ba công tắc, áp dụng cho ô tìm chung, "Tên có chữ", "Địa chỉ có chữ" (không áp cho Nhãn):
    - Aa Phân biệt hoa thường: "Conan" không khớp "conan"; dấu vẫn bỏ qua khi không bật Đúng cụm/Regex.
    - "…" Đúng cụm: khớp nguyên cụm đã gõ, liền nhau, đúng thứ tự, kể cả dấu ("Hà Nội" không khớp "Hà Đông và Nội Bài", không khớp "ha noi").
    - .* Regex: biểu thức chính quy chạy trên chữ gốc có dấu, từng ô riêng (tên, địa chỉ, nhãn) nên ^ $ theo từng ô; hoa thường theo công tắc Aa.
    - Tắt cả ba: như cũ. Công tắc đang bật hiện thành thẻ (×), tính vào số trên nút Lọc; "Bỏ lọc"/"Xóa bộ lọc" tắt hết; không nhớ sau khi đóng trình quản lý.
    - Biên: bật cả Regex và Đúng cụm → Regex thắng, Đúng cụm mờ đi. Regex sai → báo "Biểu thức chưa đúng: …" dưới đầu danh sách, không có kết quả. Regex > 200 ký tự → báo. Tìm regex quá 1,5 giây → dừng, báo "Tìm quá lâu nên đã dừng" (một mục đơn lẻ cực nặng vẫn có thể làm chậm).
    - Biên: ô tìm đổi chữ gợi ý theo cách đang bật ("Tìm bằng regex", "Tìm đúng cụm").
  - Bỏ so với 1.x: lựa chọn "Tìm từ khóa trong Tất cả/Tên/Địa chỉ/Nhãn" (thay bằng hai ô "Tên có chữ", "Địa chỉ có chữ" dùng được cùng lúc).

- CN-07 Sắp xếp danh sách: "Tự xếp" (thứ tự người dùng kéo thả; mặc định khi xem một thư mục hoặc gốc), "Mới lưu trước" (mặc định ở "Tất cả dấu trang" và khi đang tìm/lọc), "Mới cập nhật trước", "Tên A–Z", "Tên Z–A". Không phải "Tự xếp" thì không kéo thả được; thư mục vẫn đứng trước dấu trang và xếp theo tên. [đổi ở 2.0.0]

- CN-08 Mở dấu trang: bấm vào dấu trang → mở trong tab mới; "Chép địa chỉ" trong menu của dòng (CN-16).

- CN-09 Quản lý nhãn: danh sách mọi nhãn kèm số dấu trang; bấm nhãn → lọc theo nhãn đó; đổi tên nhãn (áp cho mọi dấu trang); xóa nhãn (gỡ khỏi mọi dấu trang, không xóa dấu trang).
  - Biên: đổi tên nhãn thành nhãn đã có → gộp hai nhãn làm một.
  - Màu nhãn [mới ở 2.0.0]: mỗi nhãn có một màu trong bảng 10 màu dịu (xanh lam, xanh lá, tím, hồng, cam, vàng, xanh ngọc, đỏ, nâu, xám), có bản sáng và bản tối. Nhãn mới tự nhận màu theo tên (cùng tên → luôn cùng màu). Đổi màu ở màn Nhãn: bấm chấm màu → chọn màu.
  - Chấp nhận: đổi màu nhãn "anime" sang tím → mọi chỗ hiện nhãn "anime" (dòng dấu trang, ô nhập nhãn, gợi ý, bảng lọc, thẻ điều kiện) đổi sang tím; tải lại vẫn tím; xuất/nhập giữ màu.
  - Biên: đổi tên nhãn giữ màu; gộp vào nhãn có sẵn thì lấy màu của nhãn đích; xóa nhãn thì bỏ màu đã chọn.
  - Biên: có hàng trăm nhãn → màn Nhãn và phần chọn nhãn trong bảng lọc có ô tìm nhãn.

- CN-10 Sao lưu: xuất toàn bộ ra tệp JSON; nhập tệp JSON theo hai cách "Gộp" hoặc "Thay thế toàn bộ".
  - Chấp nhận: bấm Xuất → tải về tệp "so-dau-trang-YYYY-MM-DD.json". Nhập tệp đó ở trình duyệt khác → có đủ thư mục, dấu trang, nhãn, thời gian.
  - Biên: tệp không phải JSON hoặc sai cấu trúc → báo lỗi, dữ liệu hiện tại không đổi.
  - Biên: Gộp gặp dấu trang cùng mã → giữ bản có thời gian cập nhật mới hơn.
  - Biên: "Thay thế toàn bộ" → hỏi xác nhận trước.
  - Biên: tệp có DATA_VERSION cũ hơn → tự chuyển đổi; mới hơn bản tiện ích → báo cần cập nhật tiện ích.

- CN-13 Xem thư mục như trình duyệt. [mới ở 2.0.0]
  - Chấp nhận: xem một thư mục (hoặc gốc "Dấu trang") → danh sách hiện các thư mục con trước (biểu tượng thư mục, tên, số mục bên trong), rồi tới các dấu trang nằm trực tiếp trong thư mục.
  - Chấp nhận: bấm thư mục con → vào thư mục đó; trên đầu có đường dẫn "Dấu trang › Công việc › Dự án", bấm từng phần để quay ra.
  - Chấp nhận: mục "Tất cả dấu trang" vẫn có: danh sách phẳng mọi dấu trang, không hiện thư mục.
  - Biên: thư mục trống → "Thư mục trống" kèm nút thêm dấu trang và thêm thư mục con.
  - Bỏ so với 1.x: công tắc "Gồm thư mục con" (thư mục con nay hiện ngay trong danh sách; khi tìm trong thư mục thì luôn gồm thư mục con).
- CN-14 Kéo thả, thứ tự tự đặt. [mới ở 2.0.0]
  - Chấp nhận: ở chế độ "Tự xếp", mỗi dòng có tay nắm ≡. Kéo tay nắm (chuột hoặc ngón tay) lên/xuống → có vạch chỉ chỗ thả; thả → mục nằm đúng chỗ đó; thứ tự giữ nguyên sau khi tải lại.
  - Chấp nhận: thả lên giữa một dòng thư mục (dòng sáng lên) → mục chuyển vào cuối thư mục đó. Trên máy tính, thả lên thư mục ở cây bên trái cũng được.
  - Chấp nhận: kéo gần mép trên/dưới danh sách → danh sách tự cuộn.
  - Thư mục chỉ đổi chỗ trong nhóm thư mục, dấu trang chỉ đổi chỗ trong nhóm dấu trang (thư mục luôn đứng trước).
  - Biên: thả thư mục vào chính nó hoặc thư mục con của nó → không cho, báo lỗi.
  - Biên: thả ra ngoài danh sách hoặc bấm Esc → hủy, không đổi gì.
  - Biên: chỉ đổi chỗ thì không đổi thời gian cập nhật; chuyển sang thư mục khác thì có (như 1.x).
  - Biên: sau khi kéo thả có thanh "Hoàn tác".
- CN-15 Chọn thư mục bằng cây. [mới ở 2.0.0]
  - Ô "Thư mục" trong bảng lưu nhanh/popup và hộp thêm/sửa là nút ghi đường dẫn thư mục đang chọn; bấm → hộp cây thư mục (mở/đóng từng nhánh, thư mục đang chọn được tô).
  - Chấp nhận: chọn một thư mục → "Chọn" → nút hiện đường dẫn mới.
  - Chấp nhận: "Thư mục mới" → nhập tên → thư mục mới được tạo bên trong thư mục đang tô và được chọn luôn.
  - Hộp này dùng chung cho "Chuyển vào…" (một dấu trang, nhiều dấu trang, thư mục).
  - Biên: tên rỗng/trùng → báo lỗi như CN-01. Khi chuyển thư mục: chính nó và các thư mục con của nó không chọn được.
  - Biên: thư mục mới tạo trong hộp vẫn giữ dù sau đó không lưu dấu trang (giống trình duyệt).
- CN-16 Cắt / chép / dán, menu ngữ cảnh. [mới ở 2.0.0]
  - Mỗi dòng có nút ⋮; bấm chuột phải hoặc nhấn giữ dòng cũng mở menu ấy. (Thay cho ba nút Sửa/Chép/Xóa nằm sẵn trên dòng ở 1.x.)
  - Menu dấu trang: Mở trong tab mới, Sửa, Chép địa chỉ, Cắt, Sao chép, Dán (khi đã cắt/chép), Chuyển vào…, Chọn, Xóa. Menu thư mục: Mở, Thư mục con mới, Đổi tên, Cắt, Sao chép, Dán vào thư mục này, Chuyển vào…, Xóa. Bấm chuột phải/nhấn giữ chỗ trống của danh sách: Dấu trang mới, Thư mục mới, Dán.
  - Chấp nhận: Cắt dấu trang ở A → mở B → Dán → dấu trang sang B (giữ mã, ngày tạo), không còn ở A.
  - Chấp nhận: Sao chép dấu trang → Dán ở B → B có bản sao mới (mã mới, ngày tạo = lúc dán); A vẫn còn bản cũ.
  - Chấp nhận: Dán từ menu của một dòng → mục đặt ngay sau dòng đó; dán từ chỗ trống → cuối thư mục.
  - Chấp nhận: Sao chép một thư mục rồi dán → chép cả thư mục con và dấu trang bên trong.
  - Chấp nhận (máy tính): Ctrl+X, Ctrl+C, Ctrl+V, phím Delete làm việc với các mục đang chọn (hoặc dòng đang có tiêu điểm).
  - Chấp nhận: chọn nhiều → thanh hàng loạt có thêm Cắt, Sao chép.
  - Biên: dán thư mục đã cắt vào chính nó hoặc thư mục con của nó → báo lỗi, không đổi gì.
  - Biên: đang xem "Tất cả dấu trang" hoặc kết quả tìm → không có Dán (chưa rõ thư mục đích).
  - Biên: mục đã cắt bị xóa trước khi dán → bỏ qua mục đó, báo số mục đã dán.
  - Biên: trùng tên thư mục khi dán → tên mới thêm " (2)".
  - Biên: sau khi dán có thanh "Hoàn tác".
- CN-17 Chạy nhanh với dữ liệu lớn (mấy chục nghìn dấu trang trở lên). [mới ở 2.0.0]
  - Mốc đo trên máy thử với 50.000 dấu trang, 1.000 thư mục, 500 nhãn (điện thoại có thể chậm hơn 2–4 lần):
    - mở trình quản lý tới lúc thấy danh sách ≤ 1,5 giây;
    - gõ một chữ trong ô tìm / đổi điều kiện lọc → kết quả ≤ 200 ms;
    - mở popup / bảng lưu nhanh ≤ 300 ms; lưu, sửa, xóa một dấu trang ≤ 300 ms;
    - bản Soul: mỗi lần tải trang web, kiểm tra trang đã lưu chưa ≤ 30 ms (không đọc toàn bộ dữ liệu);
    - bản tiện ích: đổi tab → huy hiệu đúng ≤ 200 ms.
  - Danh sách dài hiện dần từng phần khi cuộn (không vẽ hết một lúc); cuộn không giật.
  - Chấp nhận: thử với 100.000 dấu trang → mọi chức năng vẫn chạy đúng, không treo, không mất dữ liệu.
  - Biên: lưu một dấu trang chỉ ghi phần dữ liệu liên quan, không ghi lại toàn bộ.
- CN-18 Nhập/xuất tệp dấu trang HTML của trình duyệt (định dạng chung của Chrome, Edge, Soul, Firefox). [mới ở 2.1.0]
  - Xuất: màn Sao lưu có nút "Xuất tệp HTML" → tải về "so-dau-trang-YYYY-MM-DD.html" giữ cây thư mục, thứ tự, tên, địa chỉ, ngày tạo/cập nhật (tính theo giây) và nhãn (thuộc tính TAGS). Thư mục cấp 1 và dấu trang ở gốc "Dấu trang" nằm ở cấp ngoài cùng của tệp. Không có ảnh biểu tượng.
  - Nhập: ô chọn tệp nhận cả .json và .html, tự nhận loại theo nội dung; cách Gộp / Thay thế toàn bộ dùng chung.
  - Chấp nhận: Thay thế toàn bộ bằng tệp HTML → hỏi xác nhận → dữ liệu đúng như tệp (cây, thứ tự, tên, địa chỉ, ngày, nhãn TAGS).
  - Chấp nhận: Gộp tệp HTML → thư mục trùng tên (không phân biệt hoa thường) ở cùng chỗ được ghép làm một; dấu trang đã có (cùng địa chỉ theo CN-05, cùng thư mục) bỏ qua; mục mới thêm vào cuối thư mục; báo "thêm X dấu trang, bỏ qua Y đã có, thêm Z thư mục". Gộp lại cùng tệp → thêm 0.
  - Chấp nhận: xuất HTML rồi nhập lại (Thay thế) → giữ đủ cây, thứ tự, tên, địa chỉ, nhãn; ngày đúng tới giây.
  - Biên: mục không lưu được (javascript:, chrome://, edge://, about:…) → bỏ qua; báo số mục bỏ và tên (tối đa 10 tên).
  - Biên: ngày ghi theo giây, mili giây hoặc micro giây → tự nhận; thiếu ngày → lúc nhập; dấu trang có LAST_MODIFIED → ngày cập nhật, không có → bằng ngày tạo.
  - Biên: tệp kiểu Soul: thư mục trống không có khối con, địa chỉ javascript chứa dấu ngoặc kép, tên chứa < > & không mã hóa → các mục còn lại đọc đúng chỗ. Tệp kiểu Chrome mã hóa &amp; &lt; &gt; &quot; → giải mã. Khi xuất thì mã hóa các ký tự này.
  - Biên: hai thư mục cùng tên nằm cạnh nhau trong một tệp → thư mục sau đổi thành "Tên (2)".
  - Biên: tệp rất lớn (~100 MB do ảnh biểu tượng) → đọc được, bỏ ảnh; khi đọc hiện "Đang đọc tệp…"; máy thử ≤ 5 giây.
  - Biên: tệp HTML không phải tệp dấu trang, hoặc không có dấu trang/thư mục nào → báo lỗi, dữ liệu giữ nguyên.
  - Không đổi: "Chép / Dán dữ liệu" của bản Soul vẫn là JSON.

- CN-22 Trình quản lý mở lại ở chỗ thao tác lần cuối. [mới ở 2.6.0]
  - Nhớ: cách sắp xếp (riêng cho xem trong thư mục và cho xem phẳng "Tất cả"/kết quả tìm), chỗ đang xem (Tất cả / Dấu trang / thư mục), mục đang ở đầu màn hình (vị trí cuộn), các thư mục đang mở trong cây. Không nhớ ô tìm và bộ lọc.
  - Nơi lưu: bản tiện ích — localStorage "sdt_mgr" của trang tiện ích; bản Soul — khóa sdt_ui (mục "mgr") trong script Kho (chung mọi trang, còn sau khi cập nhật). Không nằm trong dữ liệu dấu trang, không vào tệp sao lưu.
  - Chấp nhận: vào thư mục, chọn A–Z, cuộn xuống, đóng → mở lại → đúng thư mục, A–Z, cùng mục ở đầu màn hình (lệch ≤ 3px), cây mở như cũ.
  - Biên: thư mục đã nhớ bị xóa → mở thư mục cha gần nhất còn lại, không thì "Dấu trang". Mục đầu màn hình đã xóa/chuyển → vị trí gần nhất trong danh sách. Nhiều tab → tab thao tác sau cùng quyết định. Đang tìm khi đóng → nhớ chỗ trước khi tìm. Ghi sau khi ngừng cuộn 0,3 s và khi đóng trang / đóng lớp phủ.

- CN-21 Tìm dấu trang trùng để so sánh, chọn giữ lại. [mới ở 2.5.0]
  - Mở: nút ⋯ → "Tìm dấu trang trùng". Hai thẻ: "Trùng địa chỉ" (cùng khóa địa chỉ theo CN-05; khác "?…" không tính) và "Trùng tên" (không phân biệt hoa thường, khoảng trắng thừa; phân biệt dấu).
  - Mỗi nhóm một thẻ: từng mục có tên (bấm để mở trang), địa chỉ đầy đủ, thư mục, nhãn, ngày tạo/sửa; chỗ khác nhau giữa các mục được tô đậm. Ô "Giữ" mỗi mục, mặc định giữ mục cập nhật gần nhất; giữ được nhiều mục; mỗi nhóm phải giữ ít nhất một mục (bỏ mục giữ cuối → báo, ô tự chọn lại).
  - Chấp nhận: nút "Xóa N mục không giữ" trên nhóm, "Bỏ qua nhóm này" (ẩn tới khi đóng màn), "Áp dụng tất cả (xóa M)" có hỏi xác nhận; xong có Hoàn tác; màn tự tính lại sau khi xóa / hoàn tác (lựa chọn Giữ vẫn được nhớ trong lúc mở màn).
  - Tùy chọn "Gộp nhãn vào mục giữ lại" (mặc định bật): nhãn của mục bị xóa thêm vào mọi mục giữ trong nhóm (không lặp, không phân biệt hoa thường); mục được thêm nhãn có ngày cập nhật = lúc làm.
  - Biên: mục trùng ở các thư mục khác nhau vẫn tính trùng, ghi rõ thư mục. Nhiều nhóm → hiện 30 nhóm, nút "Xem thêm". 50.000 dấu trang: mở màn ≤ 1 s. Khung 360: ô Giữ và nút ≥ 44px, không cuộn ngang.

- CN-20 Đổi chữ hàng loạt ở tên / địa chỉ. [mới ở 2.4.0]
  - Mở: nút ⋯ → "Đổi chữ các kết quả (N)" khi đang tìm (áp cho mọi kết quả), hoặc nút "Đổi chữ" trên thanh chọn nhiều (áp cho dấu trang đã chọn; thư mục bỏ qua).
  - Hộp "Đổi chữ hàng loạt": Đổi ở (Địa chỉ / Tên / Cả hai), Tìm (điền sẵn chữ đang tìm), Thay bằng, Aa phân biệt hoa thường, .* Regex ($1, $2… giữ phần đã bắt). Không bật Regex thì chữ tìm hiểu đúng như gõ (dấu "." là dấu chấm).
  - Chấp nhận: tìm "www.sangtacviet.com" → ⋯ → Đổi chữ các kết quả → Thay bằng "www.sangtacviet.app" → xem trước "Sẽ đổi N dấu trang." kèm tối đa 5 dòng cũ → mới → bấm "Đổi N dấu trang" → địa chỉ đổi, ngày cập nhật = lúc đổi, thông báo kèm Hoàn tác. Mục không chứa chữ cần tìm giữ nguyên (cả ngày cập nhật).
  - Biên: địa chỉ mới không hợp lệ hoặc tên thành rỗng → bỏ qua mục đó, xem trước và thông báo ghi số mục bỏ kèm lý do; tên > 500 ký tự → cắt.
  - Biên: địa chỉ mới trùng dấu trang khác (so theo CN-05) → vẫn đổi, báo "N mục trùng địa chỉ với dấu trang khác".
  - Biên: Regex sai / quá 200 ký tự / chạy quá lâu → báo trong hộp, nút Đổi mờ. Không có mục nào đổi → nút Đổi mờ.
  - Biên: đổi > 500 mục → hiện "Đang đổi N dấu trang…" trong lúc ghi.

- CN-19 (bản Soul) Giữ dấu trang qua các lần cập nhật script. [mới ở 2.2.0] Nút cập nhật trong danh sách script của Soul xóa kho GM của script được cập nhật (người dùng báo 2026-11-04).
  - Thêm script thứ hai "Sổ Dấu Trang – Kho" (so-dau-trang-kho.user.js, @version 1.0.0 cố định, không có @updateURL/@downloadURL): chỉ cất và trả dữ liệu. Script chính đọc/ghi qua Kho.
  - Chấp nhận: có Kho → bấm cập nhật script chính (kho riêng của nó bị xóa) → mở trang → đủ dấu trang, nút ruy băng đúng; lưu thêm được; vị trí nút ruy băng cũng giữ.
  - Chấp nhận: chưa cài Kho → app chạy bằng kho riêng như cũ; trình quản lý có dòng nhắc "Chưa cài script Kho" kèm nút "Cài script Kho" (mở địa chỉ script Kho trên kho mã).
  - Chấp nhận: cài Kho khi kho riêng đang có dữ liệu → dữ liệu tự chuyển sang Kho (chép rồi đọc lại kiểm); kho riêng giữ bản cũ và một dấu "đã chuyển".
  - Biên: cả Kho và kho riêng đều có dữ liệu (chưa chuyển) → gộp như "Gộp" JSON (cùng mã giữ bản cập nhật mới hơn), không bỏ bên nào.
  - Biên: đã chuyển sang Kho mà Kho bị tắt/gỡ → báo lỗi "Không thấy script Sổ Dấu Trang – Kho", nút ruy băng trạng thái lỗi, không ghi gì.
  - Biên: hai đường nói chuyện: dùng chung vùng chạy của userscript (trang không thấy nếu Soul tách vùng) hoặc sự kiện DOM (trang có thể nghe). Màn Sao lưu ghi rõ nơi cất và trường hợp đang dùng.
  - Biên: Kho chỉ nhận khóa dạng sdt_…, giá trị là chuỗi; không có lệnh xóa toàn bộ; lệnh lạ bị từ chối.
  - Biên: kiểm tra trang đã lưu chưa khi tải trang vẫn ≤ 30 ms với 50.000 dấu trang trong Kho.
  - Biên: lần chuyển từ 2.1.x lên 2.2.0 phải chép tay một lần (2.1.x không biết Kho; cập nhật xóa kho cũ trước khi 2.2.0 chạy).

- CN-11 (bản Soul) Nút ruy băng nổi trên mọi trang web: thay cho biểu tượng trên thanh công cụ.
  - Chấp nhận: mở trang đã lưu → mép phải màn hình có nút ruy băng đỏ đặc; trang chưa lưu → ruy băng viền, không tô.
  - Chấp nhận: chạm nút → bảng lưu nhanh trượt lên từ dưới (giống popup bản tiện ích: trạng thái, tên, địa chỉ, thư mục, nhãn, Lưu/Cập nhật, Xóa, Mở trình quản lý).
  - Chấp nhận: kéo nút lên/xuống dọc mép phải để đổi chỗ; vị trí được nhớ cho mọi trang.
  - Chấp nhận (2.8.0): kéo nút sang ngang rồi thả → nút bám vào mép gần hơn (trái hoặc phải, theo giữa màn hình); mép và cao độ được nhớ cho mọi trang (cất trong Kho như vị trí cũ).
  - Chấp nhận (2.8.0): khi không chạm, nút mờ (độ đục ~0,4) để đỡ che trang; chạm, kéo, rê chuột hoặc bảng lưu nhanh đang mở → rõ hẳn; thả tay / đóng bảng → mờ lại sau ~1,8 giây. Trạng thái đã lưu / chưa lưu vẫn nhận ra được khi mờ.
  - Biên: trang đổi địa chỉ không tải lại → nút đổi trạng thái theo địa chỉ mới trong khoảng 1 giây.
  - Biên: lưu/xóa ở tab khác rồi quay lại tab này → nút cập nhật đúng khi tab hiện lại.
  - Biên: khung nhúng (iframe) trong trang → không hiện nút.
  - Biên: thanh công cụ dưới của Soul nằm đè lên trang → trên điện thoại (≤ 640px), bảng lưu nhanh, hộp thoại dạng tấm, menu, nút +, thanh chọn nhiều và thông báo đều chừa 64px ở đáy. [2.1.2]
  - Biên: kiểu chữ, màu của trang web không làm vỡ giao diện nút/bảng, và ngược lại app không làm đổi giao diện trang.
- CN-12 (bản Soul) Trình quản lý dạng lớp phủ toàn màn hình: mở từ bảng lưu nhanh hoặc lệnh menu userscript của Soul; đủ chức năng CN-01, CN-03, CN-04, CN-06…CN-10 như bản tiện ích.
  - Áp dụng đủ CN-13…CN-16 (nhấn giữ dòng = menu; kéo bằng tay nắm ≡).
  - Chấp nhận: bấm "Mở trình quản lý" → lớp phủ che trang, trang bên dưới không cuộn theo; nút Đóng (và nút Quay lại của trình duyệt nếu Soul cho phép) → về đúng trang và vị trí cũ.
  - Chấp nhận: bấm một dấu trang → mở trong tab mới.
  - Biên: CN-10 trên điện thoại: ngoài "Xuất tệp JSON" có thêm "Chép dữ liệu" (chép JSON vào bộ nhớ tạm) và nhập bằng "Dán dữ liệu", phòng khi Soul không tải/chọn được tệp.
  - Biên: menu userscript của Soul có hai lệnh "Lưu / sửa trang này" và "Mở trình quản lý" (nếu Soul hiện menu này).

- CN-23 (2.7.0) Danh sách dễ đọc, dễ chạm hơn (trình quản lý, cả bản tiện ích và bản Soul). Không đổi dữ liệu.
  - Tên dài: tên dấu trang và tên thư mục trong danh sách hiện tối đa 2 dòng, quá thì "…".
  - Kiểu xem Gọn: nút "Xem gọn" ở đầu danh sách bật/tắt. Khi bật: dòng thấp (≤ 50px, vẫn ≥ 44px), tên 1 dòng, không hiện nhãn và ngày; tên miền và đường dẫn thư mục vẫn hiện. Lựa chọn được nhớ khi mở lại (như CN-22).
    - Chấp nhận: bật Gọn → dòng thấp hơn rõ (trước ≥ 62px); tắt → như cũ; đóng rồi mở lại trình quản lý → vẫn Gọn.
  - Điện thoại (rộng ≤ 860px): tay nắm ≡ chỉ hiện sau khi bấm "Sắp xếp lại". Nút này chỉ có khi đang "Tự xếp" trong một thư mục có từ 2 mục, không ở chế độ chọn nhiều. Bấm "Xong", sang thư mục khác hoặc đổi cách sắp xếp → tay nắm ẩn lại. Máy tính: tay nắm luôn hiện như trước, không có nút này.
    - Biên: đang "Sắp xếp lại" thì nút ⋮ của dòng tạm ẩn để nhường chỗ; nhấn giữ dòng vẫn ra menu.
  - Tô chữ khớp: khi tìm bằng ô tìm, "Tên có chữ" hoặc "Địa chỉ có chữ", phần chữ khớp trong tên và tên miền được tô nền, theo đúng cách so chữ đang bật (không dấu / phân biệt hoa thường / đúng cụm / regex).
    - Biên: tìm "sang tac" → tô nguyên chữ có dấu "Sáng tác"; regex sai → không tô; chữ chỉ khớp ở phần địa chỉ không hiện trên dòng → không tô, không lỗi; bỏ tìm → hết tô.
  - Số đếm thư mục: cây thư mục và dòng thư mục ghi tổng số dấu trang nằm trong thư mục, tính cả thư mục con. Dòng thư mục ghi "N dấu trang", thêm "· M thư mục con" nếu có.
  - Đường dẫn ở kết quả tìm: bấm → mở thư mục chứa, cuộn tới đúng dấu trang đó và làm nổi nó trong chốc lát.
    - Biên: mục nằm sau hơn 60 dòng trong thư mục → vẫn tới đúng.
  - Vùng chạm: ô sắp xếp, "Chọn nhiều", "Sắp xếp lại", "Xem gọn" cao ≥ 44px trên điện thoại. Màu tay nắm ≡, gợi ý phím tắt trong menu và dấu › của đường dẫn đậm hơn: tương phản ≥ 4.5:1 trên nền trắng (trước 2.58:1).

## 2. Dữ liệu ← thiet-ke-webapp
Nơi lưu: bản tiện ích chrome.storage.local (quyền unlimitedStorage); bản Soul GM_setValue, thêm "sdt_ui" (vị trí nút nổi). Từ 2.2.0 bản Soul cất các khóa sdt_* (kể cả sdt_ui) trong kho GM của script "Sổ Dấu Trang – Kho" (giá trị là chuỗi JSON như cũ); kho GM riêng của script chính chỉ còn bản cũ và dấu "sdt_kho_moved". Từ 2.0.0 dữ liệu chia thành các khóa "sdt_*" (xem dưới); bản 1.x dùng một khóa "sdt_data" · Sao lưu: xuất/nhập JSON (bản Soul thêm chép/dán)
Mỗi trình duyệt giữ dữ liệu riêng; chuyển giữa máy tính và điện thoại bằng xuất/nhập JSON. Gỡ tiện ích hoặc xóa dữ liệu trình duyệt là mất dữ liệu.

DATA_VERSION 2 (từ bản 2.0.0): thêm trường order cho thư mục và dấu trang.
Chuyển đổi v1 → v2 lúc mở app: chép nguyên dữ liệu cũ sang khóa "sdt_data_backup_v1" (cùng nơi lưu) rồi gán order: thư mục theo tên (A–Z) trong từng thư mục cha, dấu trang theo ngày tạo cũ → mới trong từng thư mục. Chuyển lỗi → giữ dữ liệu cũ, báo, không ghi đè. Tệp sao lưu v1 nhập được (tự chuyển đổi). Tệp v2 nhập vào bản 1.x sẽ bị báo "cần cập nhật" → nên cập nhật cả hai bản (máy tính, Soul) cùng lúc.

Cách lưu v2 (để chạy nhanh với dữ liệu lớn, CN-17): dữ liệu chia thành nhiều khóa trong cùng nơi lưu.
- "sdt_meta": { version, rev (tăng mỗi lần ghi), tagColors, … } · "sdt_folders": Folder[] · "sdt_b_<k>": Bookmark[] (dấu trang chia đều vào các phần theo mã) · "sdt_i_<k>": bảng tra địa chỉ (urlKey → mã dấu trang) chia theo urlKey, để biết trang đã lưu chưa mà chỉ đọc một phần nhỏ · "sdt_tagstat": số dấu trang theo nhãn (cho gợi ý nhãn).
- Mỗi lần lưu chỉ ghi các phần bị đổi rồi tăng rev; nơi khác thấy rev đổi thì đọc lại (bản tiện ích chỉ đọc lại các phần đã đổi).
- "sdt_error": khi phát hiện một phần dữ liệu hỏng, app ghi lời báo vào khóa này (không đụng dữ liệu) để mọi nơi ngừng ghi; "Thay thế toàn bộ" xóa khóa này.
- Mô hình logic (dùng để xuất/nhập và để thử) vẫn là một khối:
- Gốc: { version: số (DATA_VERSION), folders: Folder[], bookmarks: Bookmark[], tagColors: { "<nhãn viết thường>": "<mã màu>" } [v2] }
- Folder: id: chuỗi duy nhất; name: chuỗi, bắt buộc, ≤ 100 ký tự, không trùng trong cùng cha; parentId: id | null (null = cấp gốc); createdAt: số (ms); order: số (thứ tự trong các thư mục cùng cha, nhỏ đứng trước) [v2].
- Bookmark: id: chuỗi duy nhất; title: chuỗi ≤ 500 ký tự; url: chuỗi, bắt buộc, http/https/ftp/file; urlKey: chuỗi, địa chỉ đã chuẩn hóa theo CN-05, dùng để so khớp; folderId: id | null (null = gốc "Dấu trang"); tags: chuỗi[] không trùng (so không phân biệt hoa thường), giữ cách viết lần đầu; createdAt: số (ms); updatedAt: số (ms), ≥ createdAt; order: số (thứ tự trong cùng thư mục) [v2].
- Tệp xuất: { app: "so-dau-trang", version, exportedAt, folders, bookmarks, tagColors (v2) }.
- Tệp HTML (từ 2.1.0, CN-18): định dạng dấu trang Netscape; H3 = thư mục (ADD_DATE, LAST_MODIFIED theo giây), A = dấu trang (HREF, ADD_DATE, LAST_MODIFIED, TAGS). Không chứa màu nhãn và mã (id); khi nhập, mã được tạo mới.

## 3. Giao diện ← thiet-ke-webapp
- P1 Popup (bấm biểu tượng tiện ích): dòng trạng thái "Đã lưu / Chưa lưu"; form nhanh: tên, địa chỉ, thư mục (chọn), nhãn · nút chính Lưu (hoặc Cập nhật), phụ Xóa, "Mở trình quản lý".
- M1 Trình quản lý (trang đầy đủ, mở trong tab): thanh trên có ô tìm, nút Lọc, nút Sắp xếp, nút ⋮ (Nhãn, Sao lưu); bên trái cây thư mục (điện thoại: ngăn kéo trượt từ trái, trên đầu có đường dẫn thư mục hiện tại); giữa là danh sách dấu trang (tên, tên miền, nhãn, ngày) · nút nổi "+" thêm dấu trang.
- M1 (2.0.0): cây bên trái gồm "Tất cả dấu trang", gốc "Dấu trang" và các thư mục; đầu danh sách có đường dẫn thư mục và dãy thẻ điều kiện lọc; dòng thư mục và dòng dấu trang đều có nút ⋮ (menu CN-16) và tay nắm ≡ khi "Tự xếp"; dòng dấu trang bỏ ba nút Sửa/Chép/Xóa.
- M1 (2.7.0, CN-23): hàng công cụ đầu danh sách gồm ô sắp xếp, "Chọn nhiều", "Sắp xếp lại" (chỉ điện thoại), nút "Xem gọn" ở cuối hàng; tên dài 2 dòng; chữ khớp tô nền vàng nhạt; cây thư mục ghi tổng số dấu trang kể cả thư mục con.
- M2 Bảng lọc (2.0.0): Tên có chữ, Địa chỉ có chữ, Nhãn, Thời gian (Ngày tạo/cập nhật; Đúng ngày / Trong tháng / Khoảng ngày), Phạm vi · nút Áp dụng, Xóa bộ lọc.
- M6 Hộp cây thư mục (CN-15): cây mở/đóng nhánh, thư mục đang chọn tô màu · nút Thư mục mới, Chọn, Hủy.
- Màu nhãn: nền nhạt + chữ đậm cùng sắc trong viên thuốc; trong bảng lọc nhãn chưa chọn có chấm màu, nhãn đã chọn tô đặc màu của nó; màn Nhãn có chấm màu bấm được để đổi màu.
- M7 Menu ngữ cảnh (CN-16): trên máy tính hiện cạnh chuột; trên điện thoại là tấm trượt từ dưới.
- M3 Hộp thêm/sửa dấu trang: các trường như P1 kèm thời gian tạo/cập nhật (chỉ đọc) · nút Lưu, Hủy. Ô Thư mục mở M6.
- M4 Nhãn: danh sách nhãn + số lượng · đổi tên, xóa.
- M5 Sao lưu: Xuất JSON, Nhập JSON (Gộp / Thay thế). Từ 2.1.0: thêm "Xuất tệp HTML"; ô chọn tệp nhận .json và .html.
- Luồng: P1 → M1 khi bấm "Mở trình quản lý"; M1 → M2/M3/M4/M5 qua nút tương ứng; đóng thì về M1.
- Bản Soul: S1 nút ruy băng nổi (mép phải, kéo dọc được; từ 2.8.0 kéo sang mép trái được, mờ khi không chạm) · S2 bảng lưu nhanh = P1 dạng tấm trượt từ dưới · S3 trình quản lý = M1…M5 trong lớp phủ toàn màn hình có nút Đóng. Luồng: S1 → S2 khi chạm; S2 → S3 khi "Mở trình quản lý"; menu userscript → S2 hoặc S3. Giao diện nằm trong Shadow DOM để tách khỏi trang; dùng phông hệ thống (không tải phông ngoài, không lấy ảnh biểu tượng trang từ máy chủ ngoài).
- Điện thoại: rộng 360–412px, vùng chạm ≥ 44px; máy tính: cây thư mục cố định bên trái.
- Thẩm mỹ: gọn, nhiều chữ, theo chế độ sáng/tối của hệ thống.
- Thẩm mỹ 2.0.0 (thay cho trên): sáng, dịu, hiện đại. Nền xám xanh rất nhạt #F5F6FA, mặt trắng, chữ #1D2433; màu nhấn xanh lam dịu #3D6BE0 (nền nhạt #E9EFFD) cho nút chính, mục đang chọn, nhãn; đỏ san hô #E5484D chỉ dùng cho ruy băng "đã lưu" và Xóa; vàng cam #F2A93B cho biểu tượng thư mục. Ngăn thư mục nền sáng (không còn khối xanh đậm). Danh sách chia nhóm trong khối bo góc 16px, dòng cách bằng vạch mảnh; ô nhập nền xám nhạt không viền, bo 12px; nút bo 14px; nhãn và thẻ điều kiện dạng viên thuốc. Chế độ tối theo máy (nền #12151C, nhấn #7D9BF7). Bản mẫu: mock/giao-dien-2.0-de-xuat.png.

## 4. Ca thử ← kiem-thu-webapp (lập từ mục 1, không từ mã)
Cách chạy: Chromium nạp tiện ích (launchPersistentContext --load-extension), khung 390×844; popup mở dạng trang với tab đích; huy hiệu đọc qua service worker. Hàm thuần thử riêng bằng Node.

Thư mục (CN-01)
- CT-01 (CN-01) Tạo "Công việc" → hiện trên cây; bấm vào → danh sách chỉ còn dấu trang của thư mục đó.
- CT-02 (CN-01, CN-13) Tạo thư mục con "Dự án" trong "Công việc" → hiện lồng dưới "Công việc" trên cây; xem "Công việc" → dòng thư mục "Dự án" đứng đầu danh sách. [đổi ở 2.0.0: bỏ công tắc "gồm thư mục con"]
- CT-03 (CN-01) Tên rỗng và tên "   " → báo lỗi, số thư mục không đổi.
- CT-04 (CN-01) Tạo "công việc" cùng cấp với "Công việc" → báo lỗi; tạo "Công việc" bên trong "Dự án" → được.
- CT-05 (CN-01, CN-15) "Chuyển vào…" của "Công việc": trong hộp cây, "Công việc" và "Dự án" bị khóa không chọn được; kéo thả hoặc dán "Công việc" vào "Dự án" → báo lỗi, cây không đổi; chuyển "Dự án" lên gốc → được. [đổi ở 2.0.0]
- CT-06 (CN-01) Đổi tên "Công việc" → "Việc làm" → cây và nơi lưu của dấu trang hiện tên mới.
- CT-07 (CN-01) Xóa thư mục có 2 dấu trang + 1 thư mục con, chọn "Chuyển lên thư mục cha" → dấu trang và thư mục con về cha; lặp lại với "Xóa hết" → mất cả dấu trang và thư mục con. Hộp hỏi mặc định chọn "chuyển".
- CT-08 (CN-01) Gốc "Dấu trang" không có nút xóa/đổi tên. [đổi tên gốc ở 2.0.0]

Thêm (CN-02)
- CT-09 (CN-02) Mở trang mẫu "Trang Thử", mở popup → tên "Trang Thử", địa chỉ đúng tab; chọn thư mục, nhãn, Lưu → huy hiệu ✓ trên tab đó, dấu trang có trong trình quản lý với createdAt = updatedAt ≈ lúc lưu.
- CT-10 (CN-02) Gõ nhãn "a, B ,b , a" → lưu ra 2 nhãn ["a","B"]; Enter tách nhãn; gõ "gi" → gợi ý nhãn có sẵn bắt đầu "gi".
- CT-11 (CN-02) Thêm tay, tên rỗng → tên hiện bằng địa chỉ.
- CT-12 (CN-02) Địa chỉ rỗng → lỗi; "không phải url" → lỗi; "vnexpress.net" → lưu thành "https://vnexpress.net".
- CT-13 (CN-02) Thêm lại "http://www.vidu.vn/a/" khi đã có "https://vidu.vn/a" → cảnh báo tên thư mục cũ; "Mở bản cũ để sửa" → mở form bản cũ, không thêm; "Vẫn lưu thêm" → có 2 bản.
- CT-14 (CN-02) Popup với tab chrome://extensions hoặc about:blank → báo không lưu được, không có nút Lưu.

Sửa (CN-03)
- CT-15 (CN-03) Sửa nhãn rồi Lưu → updatedAt mới hơn, createdAt giữ nguyên.
- CT-16 (CN-03) Mở sửa, Lưu ngay không đổi → updatedAt giữ nguyên.
- CT-17 (CN-03) Đổi địa chỉ thành địa chỉ của dấu trang khác → cảnh báo trùng.

Xóa (CN-04)
- CT-18 (CN-04) Xóa một dấu trang → biến mất, thanh "Hoàn tác" hiện; bấm Hoàn tác → trở lại với đúng id, createdAt, updatedAt, nhãn, thư mục.
- CT-19 (CN-04) Chọn 2 dấu trang → Thêm nhãn "x" → cả 2 có "x"; Chuyển thư mục → cả 2 sang; Xóa → cả 2 mất.
- CT-20 (CN-04) Xóa dấu trang của tab đang mở → huy hiệu tab đó trống.

Báo trạng thái (CN-05)
- CT-21 (CN-05) Tab A đã lưu, tab B chưa lưu → huy hiệu A là ✓, B trống; điều hướng B sang trang đã lưu → B thành ✓.
- CT-22 (CN-05) Popup ở trang đã lưu → hiện "Đã lưu", tên thư mục, ngày lưu; có nút Cập nhật và Xóa.
- CT-23 (CN-05) Hàm so khớp: các cặp sau là cùng trang: http/https; có/không www.; có/không "/" cuối; có/không "#abc"; "VIDU.vn" vs "vidu.vn". Không cùng trang: "?a=1" vs "?a=2"; "/a" vs "/b".
- CT-24 (CN-05) Trang gọi history.pushState sang đường dẫn đã lưu → huy hiệu thành ✓ không cần tải lại.

Tìm kiếm (CN-06)
- CT-25 (CN-06) Gõ "ha noi" → ra dấu trang tên "Du lịch Hà Nội"; gõ "HÀ NỘI" cũng ra.
- CT-26 (CN-06) "Tên có chữ" github → chỉ dấu trang có github trong tên; "Địa chỉ có chữ" github → chỉ trong địa chỉ; đặt cả hai → phải khớp cả hai; ô chung "github" → khớp tên, địa chỉ hoặc nhãn. [đổi ở 2.0.0]
- CT-27 (CN-06) Chọn nhãn "code" và "js" → chỉ dấu trang có đủ cả hai.
- CT-28 (CN-06) Đúng ngày 15/10/2026 theo ngày tạo → chỉ dấu trang tạo trong ngày đó (gồm 00:00 và 23:59); chuyển sang ngày cập nhật → theo updatedAt.
- CT-29 (CN-06) "github" + nhãn "code" + từ 01/10/2026 đến 31/10/2026 → chỉ dấu trang thỏa cả ba; số kết quả hiện đúng.
- CT-30 (CN-06) Chỉ "Từ 20/10/2026" → mọi dấu trang từ ngày đó; chỉ "Đến 10/10/2026" → mọi dấu trang tới hết ngày đó.
- CT-31 (CN-06) Từ 31/10 đến 01/10 → tự đổi chỗ, có thông báo, kết quả như CT-29 không có từ khóa.
- CT-32 (CN-06) Không kết quả → "Không tìm thấy" + nút Xóa bộ lọc; bấm → hiện lại toàn bộ.
- CT-33 (CN-06) Đang xem "Công việc": phạm vi "thư mục đang xem" tìm trong "Công việc" và các thư mục con; "toàn bộ" tìm khắp nơi. [đổi ở 2.0.0]

Sắp xếp, mở (CN-07, CN-08)
- CT-34 (CN-07) 3 dấu trang tạo/cập nhật khác lúc, tên khác → mỗi kiểu sắp xếp ra đúng thứ tự (gồm "Tự xếp" theo thứ tự kéo thả).
- CT-35 (CN-08) Bấm dấu trang → mở tab mới đúng địa chỉ; menu "Chép địa chỉ" → báo đã chép, bộ nhớ tạm đúng địa chỉ.

Nhãn (CN-09)
- CT-36 (CN-09) Màn Nhãn liệt kê mỗi nhãn kèm số dấu trang đúng; bấm nhãn → danh sách lọc theo nhãn đó.
- CT-37 (CN-09) Đổi tên "js" → "javascript" áp mọi dấu trang; đổi "javascript" → "code" (đã có) → gộp, không dấu trang nào có nhãn lặp; xóa nhãn "code" → dấu trang còn nguyên, chỉ mất nhãn.

Sao lưu (CN-10)
- CT-38 (CN-10) Xuất → tệp "so-dau-trang-YYYY-MM-DD.json" đúng ngày; nhập vào hồ sơ trình duyệt mới (Thay thế) → số thư mục, dấu trang, nhãn, thời gian trùng khớp.
- CT-39 (CN-10) Nhập tệp chữ thường và JSON sai cấu trúc → báo lỗi, dữ liệu không đổi.
- CT-40 (CN-10) Gộp tệp có dấu trang cùng id, updatedAt mới hơn → lấy bản tệp; cũ hơn → giữ bản hiện có; id mới → thêm vào.
- CT-41 (CN-10) Chọn "Thay thế toàn bộ" → có hỏi xác nhận; Hủy → dữ liệu không đổi.
- CT-42 (CN-10) Tệp có version lớn hơn DATA_VERSION → báo cần cập nhật tiện ích, dữ liệu không đổi. (Version cũ hơn: chưa có vì DATA_VERSION = 1.)

Ca chung
- CT-C1 Mở popup và trình quản lý, làm các thao tác trên → không lỗi console/pageerror (cả service worker).
- CT-C2 Tải lại trình quản lý và đóng–mở lại trình duyệt (cùng hồ sơ) → dữ liệu còn nguyên.
- CT-C3 Trình quản lý ở khung 360 và 412px không cuộn ngang; cây thư mục là ngăn kéo.
- CT-C4 Nút chính (Lưu, +, Lọc, mở ngăn kéo) cao ≥ 44px trên khung điện thoại.
- CT-C5 Dữ liệu trong bộ nhớ bị hỏng (không phải JSON hợp lệ / version lạ) → app báo lỗi, không ghi đè dữ liệu cũ.

Bản 2.0.0 (CN-06 mới, CN-07, CN-09 màu, CN-13…CN-17, dữ liệu v2) — thêm 2026-11-03. Các ca CT-15…CT-19 mở Sửa/Xóa/Chọn qua menu ⋮ thay cho nút trên dòng (hành vi kiểm không đổi).
- CT-58 (CN-06) Bốn điều kiện cùng lúc: tạo trong tháng 8/2026 + nhãn "anime" + địa chỉ có "vidu.vn" + tên có "Conan" (dữ liệu mẫu có các dấu trang chỉ thiếu đúng một điều kiện) → chỉ ra dấu trang thỏa cả bốn; số kết quả đúng; có 4 thẻ điều kiện.
- CT-59 (CN-06) "Trong tháng" 02/2028 gồm dấu trang lúc 29/02/2028 23:59, không gồm 01/03/2028 00:00 và 31/01/2028 23:59; bấm × trên một thẻ → chỉ bỏ điều kiện đó, kết quả cập nhật; "Bỏ lọc" → bỏ hết.
- CT-60 (CN-06) Đang lọc → danh sách không có dòng thư mục, mỗi dấu trang có đường dẫn thư mục; bấm đường dẫn → mở thư mục đó, bỏ lọc.
- CT-61 (CN-07) Xem thư mục → mặc định "Tự xếp", có tay nắm ≡; "Tất cả dấu trang" → mặc định "Mới lưu trước", không có tay nắm; chọn "Tên A–Z" trong thư mục → mất tay nắm, thư mục vẫn đứng trước.
- CT-62 (CN-09) Hai lần mở cùng tên nhãn → cùng màu tự gán; đổi màu "anime" sang tím ở màn Nhãn → dòng dấu trang, ô nhập nhãn, bảng lọc, thẻ điều kiện đều tím; tải lại vẫn tím; xuất → nhập ở hồ sơ mới vẫn tím; đổi tên nhãn giữ màu; gộp vào nhãn có sẵn lấy màu nhãn đích; xóa nhãn rồi tạo lại → về màu tự gán.
- CT-63 (CN-13) Xem gốc → các thư mục cấp 1 đứng đầu (có số mục), rồi dấu trang không thuộc thư mục; bấm thư mục → vào trong, đường dẫn "Dấu trang › …" đúng; bấm phần "Dấu trang" của đường dẫn → về gốc; thư mục trống → "Thư mục trống" + hai nút thêm; "Tất cả dấu trang" → danh sách phẳng không có thư mục.
- CT-64 (CN-14) "Tự xếp": kéo tay nắm dấu trang thứ 3 lên đầu → thứ tự mới; tải lại vẫn giữ; thời gian cập nhật không đổi; Hoàn tác → về thứ tự cũ. Kéo thư mục đổi chỗ trong nhóm thư mục cũng được.
- CT-65 (CN-14) Kéo dấu trang thả vào giữa dòng thư mục "Dự án" → dấu trang nằm cuối "Dự án", thời gian cập nhật đổi; kéo "Công việc" thả vào "Dự án" (con của nó) → báo lỗi, không đổi; đang kéo bấm Esc → không đổi; kéo xuống gần mép dưới khi danh sách dài → danh sách tự cuộn.
- CT-66 (CN-14) Máy tính (khung 1280): kéo dấu trang thả lên thư mục ở cây bên trái → chuyển vào thư mục đó.
- CT-67 (CN-15) Bảng lưu nhanh/hộp sửa: bấm ô Thư mục → hộp cây; mở nhánh, chọn "Dự án", Chọn → ô hiện "Công việc › Dự án"; "Thư mục mới" "Tạm" khi đang tô "Công việc" → tạo trong "Công việc" và được chọn; đóng không lưu dấu trang → "Tạm" vẫn còn; tên trùng → báo lỗi; hộp có ô lọc tìm thư mục theo tên.
- CT-68 (CN-16) Cắt dấu trang ở A, dán ở B → sang B, giữ mã và ngày tạo; Sao chép dấu trang, dán ở B → bản mới (mã khác, ngày tạo = lúc dán), A còn bản cũ; Dán từ menu của một dòng → nằm ngay sau dòng đó; Sao chép thư mục có con rồi dán → chép đủ cây và dấu trang; dán thư mục đã cắt vào con của nó → báo lỗi; ở "Tất cả dấu trang" không có Dán; trùng tên thư mục khi dán → thêm " (2)"; Hoàn tác sau dán → về như cũ.
- CT-69 (CN-16) Menu mở được bằng nút ⋮, chuột phải, và nhấn giữ (sự kiện contextmenu) trên dòng; chuột phải chỗ trống → Dấu trang mới / Thư mục mới / Dán; máy tính: chọn 2 dòng, Ctrl+X → mở thư mục khác → Ctrl+V → chuyển cả 2; Delete xóa mục đang chọn (có Hoàn tác).
- CT-70 (CN-16) Chọn nhiều 1 thư mục + 2 dấu trang → Sao chép → dán ở thư mục khác → đủ 3 mục mới; Cắt → dán → chuyển đủ.
- CT-71 (CN-17) Dữ liệu mẫu 50.000 dấu trang, 1.000 thư mục, 500 nhãn: đo mở trình quản lý ≤ 1,5 s; gõ tìm ≤ 200 ms; đổi điều kiện lọc ≤ 200 ms; mở popup ≤ 300 ms; lưu/sửa/xóa một dấu trang ≤ 300 ms; đổi tab → huy hiệu ≤ 200 ms; bản Soul tải trang → nút ruy băng đúng trạng thái, phần kiểm tra ≤ 30 ms; số dòng đang vẽ trong danh sách ≤ 400 lúc mới mở.
- CT-72 (CN-17) 100.000 dấu trang: mở, tìm, lưu, xuất, nhập đều chạy, không lỗi, số dấu trang sau xuất → nhập giữ nguyên.
- CT-73 (CN-17) Lưu một dấu trang → chỉ ghi ≤ 6 khóa (phần chứa dấu trang, bảng tra, thống kê nhãn, meta), không ghi lại toàn bộ.
- CT-74 (dữ liệu) Kho có dữ liệu v1 (khóa "sdt_data") → mở bản 2.0.0 → đủ thư mục, dấu trang, nhãn, thời gian; thư mục xếp theo tên, dấu trang theo ngày tạo cũ → mới; có khóa "sdt_data_backup_v1" giống hệt dữ liệu cũ; huy hiệu/nút ruy băng đúng; tệp xuất v1 nhập vào 2.0.0 được. Dữ liệu v1 hỏng → báo lỗi, không ghi đè. (Làm ở cả bản tiện ích và bản Soul.)

Bản Soul (CN-11, CN-12) — thêm 2026-11-03. Cách chạy: Chromium thường, tiêm userscript vào trang mẫu kèm giả lập GM_* (kho chung đặt ở máy chủ thử, hai nguồn localhost và 127.0.0.1 để giả hai trang web), khung 390×844 có chạm.
- CT-43 (CN-11) Trang chưa lưu → có nút ruy băng ở mép phải, trạng thái "chưa lưu"; chạm → bảng lưu nhanh có sẵn tên và địa chỉ trang; chọn thư mục, nhãn, Lưu → nút thành "đã lưu", kho GM có dấu trang đó.
- CT-44 (CN-11) Trang khác chưa lưu → nút "chưa lưu"; mở lại trang đã lưu kèm "#doan-2" → nút "đã lưu".
- CT-45 (CN-11) Kéo nút xuống ~200px → nút dời theo, không mở bảng; tải lại hoặc sang trang khác → nút ở vị trí mới; chạm không kéo → mở bảng.
- CT-46 (CN-11) Trang gọi history.pushState sang đường dẫn đã lưu → nút thành "đã lưu" trong ≤ 1,5 giây.
- CT-47 (CN-11) Tab B mở trang X (chưa lưu); tab A lưu X; quay lại tab B → nút ở tab B thành "đã lưu".
- CT-48 (CN-11) Trang có khung nhúng (iframe) → chỉ một nút ruy băng ở trang chính, không có trong khung.
- CT-49 (CN-11) Trang mẫu có CSS phá (đổi cỡ chữ, màu, ẩn mọi button, box-sizing) → nút và bảng vẫn đúng cỡ (nút Lưu ≥ 44px, chữ đọc được); kiểu chữ của trang trước và sau khi app chạy không đổi.
- CT-50 (CN-12) Cuộn trang 500px, mở trình quản lý → lớp phủ hiện, trang bên dưới không cuộn; Đóng → lớp phủ mất, trang vẫn ở 500px, cuộn lại được.
- CT-51 (CN-12) Lớp phủ đang mở, bấm Quay lại của trình duyệt → lớp phủ đóng, địa chỉ trang không đổi.
- CT-52 (CN-12) Bấm một dấu trang trong lớp phủ → mở tab mới đúng địa chỉ.
- CT-53 (CN-12) Trong lớp phủ: tạo thư mục, thêm dấu trang, tìm "ha noi" ra "Hà Nội", lọc theo nhãn, xóa rồi Hoàn tác → đúng như bản tiện ích.
- CT-54 (CN-12, CN-10) "Chép dữ liệu" → bộ nhớ tạm có JSON đúng định dạng tệp xuất; "Dán dữ liệu" JSON đó vào kho trống (Thay thế, có xác nhận) → đủ dấu trang, thư mục; dán chữ rác → báo lỗi, dữ liệu không đổi.
- CT-55 (CN-12) Lệnh menu "Lưu / sửa trang này" → mở bảng lưu nhanh; "Mở trình quản lý" → mở lớp phủ.
- CT-56 (CN-10) Tệp xuất từ bản tiện ích nhập vào bản Soul → dữ liệu khớp; dữ liệu chép từ bản Soul nhập vào bản tiện ích → dữ liệu khớp.
- CT-57 (CN-11, CN-12) Trang có chính sách bảo mật chặt (Trusted Types + chặn kiểu nội tuyến, như YouTube) → nút ruy băng đúng cỡ, bảng lưu nhanh và trình quản lý mở được, thư mục con vẫn thụt lề, không lỗi.
Bản 2.1.0 (CN-18 nhập/xuất HTML) — thêm 2026-11-04. Tệp mẫu đều là dữ liệu giả.
- CT-75 (CN-18) Xuất HTML → tên tệp "so-dau-trang-YYYY-MM-DD.html"; mở đầu "<!DOCTYPE NETSCAPE-Bookmark-file-1>"; đọc bằng bộ đọc HTML chuẩn (Python html.parser) ra đúng cây thư mục, đúng thứ tự, dấu trang đúng thư mục; ADD_DATE tính theo giây; TAGS đúng; tên có & < > " được mã hóa.
- CT-76 (CN-18) Nhập tệp kiểu Chrome (ngày theo giây, thư mục "Bookmarks bar" có PERSONAL_TOOLBAR_FOLDER, tên có &amp;, thư mục trống có khối con rỗng), Thay thế → có hỏi xác nhận; đủ thư mục, dấu trang; ngày = giây × 1000; tên đã giải mã.
- CT-77 (CN-18) Nhập tệp kiểu Soul (ngày mili giây, thư mục trống không có khối con, đoạn javascript chứa dấu ngoặc kép và thẻ HTML, chrome://, tên có "<>" thô, hai thư mục "Phim"/"phim" cạnh nhau) → mọi dấu trang http đúng thư mục và thứ tự; thư mục sau thành "phim (2)"; báo bỏ 2 mục kèm tên.
- CT-78 (CN-18) Gộp tệp HTML vào dữ liệu có sẵn: thư mục "Công việc" trùng tên được ghép (không thêm thư mục mới); dấu trang cùng địa chỉ (khác http/https, www) trong cùng thư mục bỏ qua; dấu trang mới nằm cuối thư mục; thông báo đếm đúng; Gộp lần hai → thêm 0 dấu trang, 0 thư mục.
- CT-79 (CN-18) Tệp kiểu Firefox: TAGS="anime,Hay" → hai nhãn; LAST_MODIFIED của dấu trang → ngày cập nhật; ngày micro giây (16 chữ số) và thiếu ngày → đúng như CN-18.
- CT-80 (CN-18) Dữ liệu mẫu → Xuất HTML → hồ sơ trình duyệt mới nhập (Thay thế) → cây, thứ tự, tên, địa chỉ, nhãn trùng khớp; ngày tạo/cập nhật khớp tới giây.
- CT-81 (CN-18) Nhập tệp .html là trang web thường, tệp dấu trang rỗng, tệp chữ rác → báo lỗi, dữ liệu không đổi.
- CT-82 (CN-18, CN-17) Tệp ~100 MB (11.000 dấu trang, mỗi mục có ảnh biểu tượng) → nhập (Thay thế) ≤ 5 giây trên máy thử, có hiện "Đang đọc tệp…", không lỗi, đủ số dấu trang.
- CT-83 (CN-18, CN-12) Bản Soul: "Xuất tệp HTML" tải về tệp đúng nội dung; nhập tệp HTML qua ô chọn tệp (Gộp) → dữ liệu đúng.
- CT-84 (CN-11, CN-12) Khung 360×640: nút Lưu của bảng lưu nhanh, nút +, nút Lưu của hộp thêm, mục cuối của menu ⋯, thanh chọn nhiều đều cách đáy màn hình ≥ 64px (kể cả khi phải cuộn bảng). [2.1.2]
Bản 2.2.0 (CN-19 script Kho) — thêm 2026-11-04. Cách chạy: hai kho GM giả tách riêng cho script chính và script Kho; Kho chạy lúc document-start; "bấm cập nhật" = xóa kho GM của script chính.
- CT-85 (CN-19) Chưa cài Kho: lưu một dấu trang → nằm trong kho riêng; trình quản lý có dòng nhắc + nút "Cài script Kho" mở đúng địa chỉ; Sao lưu ghi "sẽ mất".
- CT-86 (CN-19) Kho riêng có 16 dấu trang, cài Kho → mở trang → Kho có đủ 16 (đúng tên), kho riêng có dấu "đã chuyển"; hết dòng nhắc; Sao lưu ghi nơi cất là Kho.
- CT-87 (CN-19) Xóa kho riêng (giả cập nhật) → mở trang → đủ 16; lưu thêm → Kho có 17, kho riêng không có phần dấu trang; kéo nút ruy băng → vị trí cất trong Kho.
- CT-88 (CN-19) Kho có 16, kho riêng có 2 mục mới + 1 mục trùng mã sửa mới hơn, chưa chuyển → gộp: 18 mục, mục trùng lấy bản mới hơn.
- CT-89 (CN-19) Đã chuyển, Kho bị tắt → chế độ "missing", ruy băng lỗi, trình quản lý báo "Không thấy script…", thêm dấu trang không ghi; cả hai kho không đổi.
- CT-90 (CN-19) Đường sự kiện DOM: đọc đủ, lưu thêm được; trang gửi khóa lạ, lệnh "clear", giá trị không phải chuỗi → bị từ chối, Kho không đổi.
- CT-91 (CN-19, CN-17) 50.000 dấu trang trong Kho: mở trang đã lưu → ruy băng "đã lưu", phần kiểm tra ≤ 30 ms (3 lần).
- CT-92 (CN-19, CN-11) Trang bảo mật chặt (Trusted Types, CSP) có Kho → vẫn dùng Kho, bảng lưu nhanh mở được.
- CT-93 (CN-19) Tiêu đề: Kho @version 1.0.0, @run-at document-start, không có @updateURL/@downloadURL; script chính có @grant unsafeWindow và @updateURL.
Bản 2.3.0 (CN-06 cách so chữ) — thêm 2026-11-05.
- CT-94 (CN-06) Tắt cả ba công tắc: "ha noi" và "HÀ NỘI" ra cùng kết quả như trước.
- CT-95 (CN-06) Aa: tên "Conan" → 5 dấu trang; "conan" → 0; "Tham tu" khớp "Thám tử", "tham tu" → 0.
- CT-96 (CN-06) Đúng cụm: "Hà Nội" → chỉ "Du lịch Hà Nội" (không khớp "Hà Đông và Nội Bài"); "Nội Hà", "ha noi" → 0; "hà nội" khớp, thêm Aa → 0; cụm trong địa chỉ.
- CT-97 (CN-06) Regex: "tập \d+" ở tên → 5, thêm Aa → 4; "^Du lịch" ở ô chung → 1; "^https://vidu\.vn/conan" ở địa chỉ; "conan|github" ở ô chung; bật cả Đúng cụm → như Regex.
- CT-98 (CN-06) Regex sai "tập (" → báo lỗi, 0 kết quả; > 200 ký tự → báo; "^(a+)+$" trên 400 mục nặng → dừng và báo trong vài giây.
- CT-99 (CN-06, CN-17) 50.000 dấu trang: mỗi cách so chữ ≤ 150 ms ở hàm thuần; gõ tìm trên giao diện vẫn ≤ 200 ms (CT-71).
- CT-100 (CN-06) Bảng lọc có "Cách so chữ" với ba công tắc, mỗi dòng ≥ 44px; bật Regex → Đúng cụm mờ, tắt → dùng lại được.
- CT-101 (CN-06) Bật Aa + tên "conan" → "0 kết quả", có thẻ Aa; bấm × trên thẻ → "5 kết quả".
- CT-102 (CN-06) Bật Regex: ô tìm ghi "Tìm bằng regex"; gõ "tập (" → báo lỗi dưới đầu danh sách; gõ "tập \d+" → 5 kết quả; thêm Aa → 4.
- CT-103 (CN-06) Bật Đúng cụm: "Hà Nội" → 1 kết quả; "ha noi" → "Không tìm thấy"; "Xóa bộ lọc" → hết thẻ, ô tìm về "Tìm dấu trang".
- CT-104 (CN-06, CN-12) Bản Soul: trong lớp phủ, Regex "tập \d+" → 5, regex sai → báo lỗi, thêm Aa → 4.
Bản 2.4.0 (CN-20 đổi chữ hàng loạt) — thêm 2026-11-06.
- CT-105 (CN-20) Hàm thuần: đổi "www.sangtacviet.com" → "www.sangtacviet.app" ở địa chỉ: đổi 2 mục (kể cả viết HOA), khóa địa chỉ mới, ngày cập nhật = lúc đổi, mục khác giữ nguyên đối tượng; báo 1 mục trùng; 2 mẫu xem trước; giữ tên, nhãn, thư mục, ngày tạo; chỉ đổi mục được chọn.
- CT-106 (CN-20) Aa chỉ đổi đúng hoa thường; Regex "Truyện (\w)" → "Chương $1" ở tên; "Cả hai" đổi cả tên và địa chỉ.
- CT-107 (CN-20) Bỏ "https://" → 3 mục bỏ qua vì địa chỉ không hợp lệ; tên thành rỗng → bỏ qua; tên > 500 → cắt.
- CT-108 (CN-20) Chưa nhập chữ tìm → lỗi; Regex sai → lỗi; "." không bật Regex là dấu chấm; dữ liệu sau đổi hợp lệ.
- CT-109 (CN-20, CN-17) Hàm thuần: 10.000 mục đổi trong 20.000 mục chọn < 1 giây.
- CT-110 (CN-20) Giao diện: tìm "www.sangtacviet.com" → "2 kết quả" → ⋯ → "Đổi chữ các kết quả (2)" → Tìm điền sẵn → xem trước "Sẽ đổi 2 dấu trang. 1 mục sẽ trùng…", 2 dòng mẫu, nút "Đổi 2 dấu trang" → đổi đúng, mục khác giữ nguyên → Hoàn tác trả lại.
- CT-111 (CN-20) Chọn 2 mục → "Đổi chữ" → hộp ghi "Áp dụng cho 2 dấu trang" → Tên + Regex → chỉ 2 mục đổi.
- CT-112 (CN-20) Regex sai → xem trước báo lỗi, nút mờ; bỏ "https://" → "Không có dấu trang nào đổi. Bỏ qua 4 mục…", nút mờ; hộp không cuộn ngang.
- CT-113 (CN-20, CN-17) Tốc độ (từ lúc bấm Đổi tới thông báo "Đã đổi", có "Đang đổi…"): 12.000 dấu trang đổi 3.000 ≤ 3 s; 50.000 dấu trang đổi 10.000 ≤ 10 s (mốc đã duyệt ban đầu 3 s; người dùng chọn giữ 2.4.0 với mốc này và làm lại cách lưu ở bản sau, 2026-11-06).
- CT-114 (CN-20, CN-12) Bản Soul: ⋯ → Đổi chữ các kết quả trong lớp phủ → đổi đúng 4 mục.
- CT-C3 khung 360: thanh chọn nhiều đủ 6 nút, không cuộn ngang, nút ≥ 44px.
Bản 2.5.0 (CN-21 dấu trang trùng) — thêm 2026-11-06.
- CT-115 (CN-21) Hàm thuần: trùng địa chỉ gom http/https, www, "/" cuối, "#…", hoa thường tên miền; "?id=1" và "?id=2" không trùng.
- CT-116 (CN-21) Trùng tên: "Conan tập 1" ~ "CONAN TẬP 1", "Hà Nội" ~ "hà  nội", không gom "Ha Noi"; mục cập nhật gần nhất đứng đầu nhóm.
- CT-117 (CN-21) Xử lý: xóa mục không giữ, gộp nhãn (ngày cập nhật đổi); tắt gộp nhãn thì giữ nguyên; giữ nhiều mục; nhóm không còn mục giữ → không xóa; dữ liệu sau xử lý hợp lệ.
- CT-118 (CN-21, CN-17) 50.000 dấu trang, 5.000 nhóm: tìm trùng địa chỉ / tên ≤ 300 ms, xử lý ≤ 300 ms (hàm thuần).
- CT-119 (CN-21) Giao diện: "Có 1 nhóm trùng, 2 dấu trang thừa."; nhóm 3 mục xếp mới nhất trước; giữ mặc định mục mới nhất; thư mục và địa chỉ khác nhau được tô đậm.
- CT-120 (CN-21) Bỏ chọn mục giữ cuối cùng → báo "…ít nhất một mục", ô tự chọn lại.
- CT-121 (CN-21) Giữ mục ở thư mục khác → "Xóa 2 mục không giữ" → xóa đúng, gộp nhãn, thông báo kèm Hoàn tác → Hoàn tác trả lại, nhóm hiện lại.
- CT-122 (CN-21) Thẻ "Trùng tên" có nhóm "Du lịch Hà Nội"; "Bỏ qua nhóm này" → hết nhóm; "Áp dụng tất cả" → hỏi xác nhận đúng số → xóa.
- CT-123 (CN-21, CN-17) 50.000 dấu trang, 5.000 nhóm: mở màn ≤ 1 s, hiện 30 nhóm, "Xem thêm" → 60.
- CT-124 (CN-21, CN-12) Bản Soul: trong lớp phủ tìm trùng, xóa mục không giữ, gộp nhãn.
Bản 2.6.0 (CN-22 và 9 lỗi soát ngày 2026-11-09) — thêm 2026-11-09.
- CT-125 (CN-14 Hoàn tác) Hàm thuần: Hoàn tác xóa / sửa / tạo thư mục / đổi màu chỉ trả lại các mục bước đó đã đổi; dấu trang nơi khác vừa lưu, sửa của nơi khác, thư mục nơi khác tạo, màu nhãn khác giữ nguyên.
- CT-126 (CN-17) Kho: hai nơi sửa thư mục / màu nhãn gần nhau (một nơi chưa nhận thay đổi của nơi kia) → không mất thư mục, giữ cả hai màu.
- CT-127 (CN-06, CN-20) Regex "conan\-1", "\_x", "a{2", "Conan \d" dùng được ở ô tìm và Đổi chữ; regex sai thật vẫn báo.
- CT-128 Kho có mục địa chỉ javascript: → bỏ qua mục đó (không khóa app); safeUrl chỉ nhận http/https/ftp/file.
- CT-129 (CN-18) Gộp HTML: "đã có" tách khỏi "trùng ngay trong tệp".
- CT-130…CT-134 (CN-22) Giao diện: mở lại đúng thư mục / sắp xếp / mục đầu màn hình / cây; nhớ riêng sắp xếp phẳng; ô tìm mở trống; mục đầu màn hình bị xóa → vị trí gần nhất; thư mục bị xóa → thư mục cha; hai tab → tab sau cùng.
- CT-135 Giao diện: xóa → popup lưu mục mới → Hoàn tác → mục cũ trở lại, mục mới còn.
- CT-136 Chọn nhiều: chạm tên lần hai bỏ chọn.
- CT-137 Nơi khác ghi dấu "dữ liệu hỏng" → trình quản lý đang mở hiện biểu ngữ ngay.
- CT-138 Cắt rồi dán khi ghi lỗi → vẫn giữ trạng thái cắt (nút "Dán … vào đây" còn).
- CT-139 Kho bị chèn mục javascript: → mục không hiện, có thông báo "Bỏ qua 1 mục…", không vào chế độ lỗi.
- CT-140 (CN-22, bản Soul) Mở lại cùng trang và ở trang khác → đúng thư mục và cách sắp xếp.
Bản 2.6.1 (7 lỗi soát ngày 2026-11-10) — thêm 2026-11-10.
- CT-141 (CN-03 kéo thả) Thả 200 lần liên tiếp vào cùng một khe, thứ tự cỡ Date.now() (mục lưu từ popup) và thứ tự nhỏ: lần nào mục cũng nằm đúng chỗ, không có hai mục trùng số thứ tự.
- CT-142 Ghép thay đổi: thao tác tính từ bản cũ được áp lên bản mới nhất mà không bỏ thay đổi đã ghi trước đó.
- CT-143 (CN-17) Kho: ba lần ghi gọi cùng lúc vào cùng một phần dữ liệu → đủ cả ba, rev tăng 3; "Thay thế toàn bộ" xếp hàng sau lần ghi đang chờ; dùng khóa chung của backend khi có.
- CT-144 Giao diện: bấm "Xóa" ở hai nhóm trùng trong cùng một nhịp → cả hai được ghi, số nhóm trên màn hình khớp kho.
- CT-145 Xóa nhãn → thông báo "Đã xóa nhãn “x” khỏi N dấu trang." kèm Hoàn tác → trả lại đủ. Gộp nhãn (đổi tên trùng nhãn khác) → có Hoàn tác → trả lại nhãn cũ.
- CT-146 Chọn hết (≥ 10 dấu trang) → Xóa → hỏi "Xóa N dấu trang?"; Hủy giữ nguyên; Xóa → Hoàn tác (12 giây) trả lại đủ. Chọn 3 → Xóa: không hỏi, có Hoàn tác.
- CT-147 Đang ở thư mục, tìm chữ chỉ có ở thư mục khác → dòng "Đang tìm trong “…”" + nút "Xem N kết quả ở thư mục khác" → bấm ra N kết quả. Có kết quả trong thư mục → vẫn có dòng phạm vi và nút "Tìm ở tất cả thư mục".
- CT-148 Xóa mục trùng rồi đóng hộp "Dấu trang trùng" → thông báo kèm Hoàn tác vẫn hiện, bấm trả lại mục.
- CT-149 (CN-17) 50.000 dấu trang: đang đổi chữ 12.500 mục thì xóa một mục khác → kho đổi đủ 12.499 mục còn lại, mục xóa mất, màn hình khớp kho.
- CT-150 320 nhãn: màn Nhãn ghi "Đang hiện 300 trong 320 nhãn…", bảng Lọc ghi "Đang hiện 200 trong 320…"; tìm nhãn thì hiện đúng.
Bản 2.7.0 (CN-23) — thêm 2026-11-10.
- CT-151 (CN-23) Hàm: số dấu trang của thư mục tính cả thư mục con, nhiều tầng; thư mục trống = 0.
- CT-152 (CN-23) Hàm: vùng tô chữ khớp. "sang tac" trong "Sáng tác Việt" → tô "Sáng" và "tác"; phân biệt hoa thường "Sang" không tô "sang"; đúng cụm chỉ tô cả cụm liền; regex tô từng chỗ khớp; regex sai / ô trống → không có vùng nào; hai vùng chồng nhau gộp làm một; "Địa chỉ có chữ" chỉ tô ở tên miền, "Tên có chữ" chỉ tô ở tên.
- CT-153 (CN-23) 390px: tên dài hiện 2 dòng, không tràn ngang. Bật "Xem gọn" → dòng ≤ 50px và ≥ 44px, tên 1 dòng, không thấy nhãn và ngày, còn tên miền; tắt → dòng ≥ 62px. Bật rồi đóng, mở lại → vẫn Gọn.
- CT-154 (CN-23) 390px, thư mục "Tự xếp": chưa thấy tay nắm; bấm "Sắp xếp lại" → thấy tay nắm, nút ⋮ ẩn, kéo đổi chỗ được và lưu; "Xong" → tay nắm ẩn. Đổi sang "Tên A–Z" hoặc bật "Chọn nhiều" → không còn nút "Sắp xếp lại". Thư mục 1 mục → không có nút. 1280px: tay nắm hiện sẵn, không có nút.
- CT-155 (CN-23) Tìm "sang tac" → tên "Sáng tác…" có phần tô đúng hai chữ; "Địa chỉ có chữ" = tên miền → tên miền có phần tô; xóa ô tìm → không còn phần tô nào.
- CT-156 (CN-23) Cây: thư mục cha ghi tổng dấu trang của mình và các thư mục con. Dòng thư mục ghi "N dấu trang · M thư mục con"; thư mục không có thư mục con chỉ ghi "N dấu trang".
- CT-157 (CN-23) Tìm ra một dấu trang nằm thứ 80 trong thư mục 100 mục → bấm đường dẫn → mở đúng thư mục, dòng đó nằm trong khung nhìn và được làm nổi; ô tìm trống.
- CT-158 (CN-23) 390px: ô sắp xếp, "Chọn nhiều", "Sắp xếp lại", "Xem gọn" cao ≥ 44px. Màu tay nắm và gợi ý phím tắt có tương phản ≥ 4.5:1 với nền trắng.
- CT-159 (CN-23, bản Soul) Trong lớp phủ: "Sắp xếp lại" rồi kéo đổi chỗ được; bật "Xem gọn", đóng, mở lại ở trang khác → vẫn Gọn.
- CT-C8 (CN-23) Khung 360 và 412px, kiểu Thoáng và Gọn, có tên rất dài không dấu cách: không cuộn ngang; không lỗi console.
- CT-C6 (bản Soul) Không lỗi console/pageerror trên trang khi dùng; khung 360 và 412px: bảng và lớp phủ không cuộn ngang; nút chính ≥ 44px.
- CT-160 (CN-11, 2.8.0) Để yên 2 giây → nút mờ (độ đục < 0,5); nhấn giữ → rõ (> 0,9); kéo sang trái quá giữa màn hình rồi thả → nút bám mép trái đúng cao độ mới, không mở bảng, còn rõ ngay sau khi thả rồi mờ lại; tải lại và trang khác → vẫn mép trái, cùng cao độ; chạm → mở bảng, nút rõ suốt lúc bảng mở, đóng bảng → mờ lại; kéo về phải → bám mép phải.
- CT-C7 (bản Soul) Kho GM chứa dữ liệu hỏng → bảng và lớp phủ báo lỗi, không ghi đè kho.
## 5. Kết quả thử gần nhất ← kiem-thu-webapp
2026-11-11, bản 2.8.0, giờ Asia/Ho_Chi_Minh. Tổng 364/364 qua.
- Hàm thuần: core 52/52, HTML 32/32, cách so chữ 17/17, đổi chữ hàng loạt 17/17, dấu trang trùng 10/10, sửa lỗi 2.6.0 12/12, sửa lỗi 2.6.1 8/8, bản 2.7.0 17/17 (CT-151, CT-152).
- Bản tiện ích: ui_test 66/66, HTML 21/21, cách so chữ 8/8, đổi chữ hàng loạt 9/9, dấu trang trùng 10/10, bản 2.6.0 12/12, bản 2.6.1 14/14, bản 2.7.0 9/9 (CT-153…CT-158, CT-C8).
- Bản Soul: 27/27 (thêm CT-160). Script Kho: 11/11. Tốc độ (perf_test): 12/12.
- Ca cũ sửa theo đặc tả mới (CN-23): các ca kéo thả ở khung 390px (CT-64, CT-65, CT-53) bấm "Sắp xếp lại" trước khi kéo.
- Chưa thử được ở máy: Soul thật (độ mờ và kéo ngang nút ruy băng bằng tay thật; ô sắp xếp tự co theo chữ và tên 2 dòng khi đang tìm ở kiểu Gọn cần WebView mới; máy cũ vẫn dùng được, chỉ xuống dòng khác đi).
## 6. Nhật ký phiên bản ← tao-webapp, sua-webapp
- 1.0.0 (2026-11-03): bản đầu. Đủ CN-01…CN-10. Phông Be Vietnam Pro đóng gói sẵn. Biểu tượng ruy băng đổi màu + huy hiệu ✓. manifest có "key" để ID cố định giữa các lần cài.
- 1.1.0 (2026-11-03): thêm bản Soul (userscript): nút ruy băng nổi, bảng lưu nhanh, trình quản lý lớp phủ, chép/dán dữ liệu. Tách popup/trình quản lý thành mô-đun gắn vào gốc bất kỳ (env). Bỏ innerHTML (an toàn với Trusted Types), kiểu nội tuyến qua CSSOM. Biểu tượng ruy băng vẽ lại bằng nét viền rõ hơn. DATA_VERSION giữ 1.
- 2.0.0 (2026-11-03): thư mục như trình duyệt (thư mục trong danh sách, đường dẫn), kéo thả + thứ tự tự đặt, cây thư mục khi lưu/chuyển (tạo thư mục ngay trong hộp), cắt/chép/dán + menu ngữ cảnh + phím tắt + Hoàn tác, tìm nhiều điều kiện (Tên, Địa chỉ, Nhãn, Đúng ngày/Trong tháng/Khoảng ngày, Phạm vi) với thẻ điều kiện, màu nhãn (10 màu), giao diện mới sáng/dịu + chế độ tối, kho chia phần cho dữ liệu lớn (vẽ dần, bộ đệm tìm, chỉ ghi phần đổi, bảng tra địa chỉ). DATA_VERSION 2, tự chuyển từ v1 (dự phòng "sdt_data_backup_v1").
- 2.1.0 (2026-11-04): nhập/xuất tệp dấu trang HTML của trình duyệt (CN-18): nút "Xuất tệp HTML"; ô chọn tệp nhận .json và .html; Gộp ghép thư mục cùng tên, bỏ dấu trang đã có; đọc được tệp kiểu Chrome, Soul, Firefox kể cả tệp ~100 MB. DATA_VERSION giữ 2.
- 2.1.1 (2026-11-04): đưa mã lên kho GitHub SoulBookmarks; userscript có @homepageURL/@updateURL/@downloadURL trỏ tới tệp ở gốc kho; build.py ghi tệp ra gốc kho. Chức năng không đổi.
- 2.1.2 (2026-11-04): sửa lỗi người dùng báo: nút ở đáy bảng lưu nhanh (Xóa, Cập nhật) bị thanh công cụ dưới của Soul che. Bản Soul chừa 64px ở đáy cho mọi phần bám đáy màn hình (soul/soul.css). Bản máy tính không đổi.
- 2.2.0 (2026-11-04): script "Sổ Dấu Trang – Kho" 1.0.0 giữ dữ liệu bản Soul qua các lần cập nhật script chính (CN-19); tự chuyển dữ liệu sang Kho, gộp khi hai bên đều có; báo lỗi không ghi khi Kho bị tắt; trình quản lý có dòng nhắc cài Kho; Sao lưu ghi nơi cất. manager.js nhận env.notice và env.storageInfo (bản tiện ích không dùng). DATA_VERSION giữ 2.
- 2.3.0 (2026-11-05): tìm kiếm thêm ba cách so chữ: phân biệt hoa thường, đúng cụm, regex (CN-06); thẻ điều kiện, báo regex sai, dừng regex quá lâu. Áp dụng cả bản máy tính và bản Soul. DATA_VERSION giữ 2.
- 2.4.0 (2026-11-06): đổi chữ hàng loạt ở tên / địa chỉ (CN-20): ⋯ → Đổi chữ các kết quả, nút Đổi chữ trên thanh chọn nhiều, xem trước, Hoàn tác, báo mục bỏ qua / trùng địa chỉ. Thanh chọn nhiều 6 nút chia đều. DATA_VERSION giữ 2.
- 2.5.0 (2026-11-06): tìm dấu trang trùng địa chỉ / tên, so sánh, chọn giữ, xóa mục thừa, gộp nhãn, Hoàn tác (CN-21). DATA_VERSION giữ 2. Phương án làm lại cách lưu (3.0.0, IndexedDB cho bản máy tính) vẫn chờ người dùng duyệt.
- 2.6.0 (2026-11-09): trình quản lý nhớ cách sắp xếp, chỗ xem, vị trí cuộn, cây thư mục (CN-22). Sửa 9 lỗi soát ngày 2026-11-09: Hoàn tác chỉ trả lại mục đã đổi (core.revertChanges); kho ghi thư mục và màu nhãn theo từng mục; regex thử lại không cờ u; kiểm danh sách đang chọn bằng tập mã; chạm tên khi chọn nhiều; bỏ qua / không mở địa chỉ ngoài http, https, ftp, file (core.safeUrl); popup chỉ lấy tab của cửa sổ đang dùng; gộp HTML báo riêng trùng trong tệp; giữ trạng thái cắt khi dán lỗi; báo ngay khi nơi khác ghi dấu dữ liệu hỏng. DATA_VERSION giữ 2.
- 2.6.1 (2026-11-10): sửa 7 lỗi soát ngày 2026-11-10: mọi lần ghi xếp hàng (kho: hàng đợi + khóa navigator.locks ở bản tiện ích; trình quản lý: hàng đợi ghi/đọc lại, ghép thay đổi bằng core.rebaseChanges); Hoàn tác cho xóa nhãn và đổi tên/gộp nhãn; hỏi lại khi xóa từ 10 dấu trang, Hoàn tác 12 giây; ghi rõ phạm vi khi tìm trong thư mục và đưa lối sang kết quả nơi khác; thông báo (Hoàn tác) không mất theo hộp thoại; thứ tự kéo thả tự đánh số lại khi số thực hết chỗ; báo khi danh sách nhãn bị cắt. DATA_VERSION giữ 2.
- 2.7.0 (2026-11-10): danh sách dễ đọc, dễ chạm hơn (CN-23): tên 2 dòng; nút "Xem gọn" (được nhớ); điện thoại có "Sắp xếp lại" mới hiện tay nắm ≡; tô chữ khớp khi tìm (core.highlightRanges); cây và dòng thư mục ghi tổng dấu trang kể cả thư mục con (core.folderTotals); bấm đường dẫn ở kết quả tìm → tới đúng mục; nút đầu danh sách cao 44px trên điện thoại; màu tay nắm, gợi ý phím tắt đậm hơn. DATA_VERSION giữ 2; trạng thái nhớ thêm trường dense.
- 2.8.0 (2026-11-11): nút ruy băng bản Soul (CN-11): mờ khi không chạm, rõ khi chạm / kéo / bảng đang mở; kéo sang mép trái hoặc phải (thả là bám mép gần hơn); nhớ mép (sdt_ui.side) cùng cao độ cho mọi trang. Bản máy tính không đổi. DATA_VERSION giữ 2.
## 7. Vấn đề đã biết ← mọi skill (chỉ thêm, ghi nguồn)
- [thiet-ke-webapp] Hiểu "Chrome và Soul trên điện thoại" là Chrome trên máy tính + Soul Browser trên Android, vì Chrome Android không cài được tiện ích.
- [thiet-ke-webapp] Chưa xác minh Soul Browser cài được tiện ích từ tệp (không qua Chrome Web Store); kiểm khi tạo app. Nếu không được, cần phương án khác cho điện thoại.
- [tao-webapp] Soul Browser (Android) không chạy tiện ích Chrome: theo báo cáo người dùng trên GitHub (ilyhalight/voice-over-translation#860), Soul chỉ nhận userscript với API riêng. Bản 1.0.0 không dùng được trên Soul. Trình duyệt Android có hỗ trợ tiện ích Chrome: Vivaldi 8.2+ (cài .crx), Microsoft Edge (cài .crx qua tùy chọn nhà phát triển). Chờ người dùng chọn hướng.
- [tao-webapp] Lỗi đã sửa trong vòng thử: xóa thư mục khi đang xem "Tất cả" làm chuyển nhầm sang thư mục cha (manager.js deleteFolderDlg).
- [tao-webapp] Thông báo nhỏ (toast) được đặt vào hộp thoại đang mở để không bị lớp nền che.
- [thiet-ke-webapp] Kết quả script kiểm tra trên Soul (Android 16, Chrome 156, 2026-11-03): có GM_getValue/GM_setValue (đồng bộ, lưu chung giữa vnexpress.net và vi.wikipedia.org), GM_deleteValue, GM_listValues, GM_addStyle, GM_openInTab, GM_setClipboard, GM_registerMenuCommand, GM_info, GM.*, unsafeWindow, Shadow DOM, <dialog>, Clipboard, a[download]. KHÔNG có GM_addValueChangeListener → bản Soul đọc lại dữ liệu khi tab hiện lại.
- [sua-webapp] Lỗi đã sửa trong vòng thử 1.1.0: ô tìm kiếm đọc e.target sau thời gian chờ → trong Shadow DOM e.target bị đổi thành phần tử chủ, tìm kiếm hỏng ở bản Soul. Nay đọc lại ô tìm trực tiếp.
- [sua-webapp] Máy thử (thanh cuộn kiểu máy tính) lệch 8px khi mở lớp phủ vì thanh cuộn biến mất; đóng lại về đúng vị trí. Android dùng thanh cuộn nổi nên không gặp.
- [sua-webapp] Bản Soul: xóa userscript trong Soul có thể xóa luôn kho GM của nó. Trước khi cài lại/cập nhật nên "Chép dữ liệu" hoặc xuất tệp.
- [sua-webapp] Chưa có: nút ẩn ruy băng trên từng trang (người dùng đã biết, để sau nếu cần).
- [sua-webapp] Lỗi đã sửa trong vòng thử 2.0.0: (1) đọc lại một phần sau khi popup/tab khác ghi làm mất thư mục của dấu trang vừa đổi (kiểm với danh sách thư mục rỗng); (2) sửa dấu trang không đổi địa chỉ vẫn báo trùng khi có bản trùng cũ; (3) Ctrl+X/C/V không chạy sau khi vừa bấm ô chọn.
- [sua-webapp] Popup/bảng lưu nhanh chỉ đọc phần nhỏ nên chưa biết một phần dữ liệu hỏng cho tới khi trình quản lý mở và phát hiện; từ lúc đó mọi nơi ngừng ghi (khóa "sdt_error"). Phần hỏng không bao giờ bị ghi đè.
- [sua-webapp] Tệp xuất từ 2.0.0 (v2) không nhập được vào bản 1.x (1.x báo cần cập nhật): cập nhật cả bản máy tính và bản Soul.
- [sua-webapp] Ô "Trong tháng" dùng ô chọn tháng của trình duyệt; chữ hiện theo ngôn ngữ máy (máy thử tiếng Anh hiện "August 2026").
- [sua-webapp] 2.1.0: tệp HTML không mang màu nhãn; ngày chỉ đúng tới giây. Chrome đặt dấu trang nhập từ HTML vào một thư mục tên "Imported" (hành vi của Chrome). Muốn chuyển đủ giữa hai bản Sổ Dấu Trang thì dùng JSON.
- [sua-webapp] 2.1.0: nhập tệp HTML không có Hoàn tác (như nhập JSON); Thay thế toàn bộ có hỏi xác nhận.
- [sua-webapp] 2.1.1: kho SoulBookmarks đang để riêng tư → địa chỉ raw.githubusercontent.com không tải được nếu không đăng nhập, nên Soul chưa tự cập nhật/cài từ địa chỉ được cho tới khi kho để công khai. Khóa ký khoa-ky.pem không đưa lên kho (giữ trong gói zip).
- [sua-webapp] 2.2.0: nút cập nhật script trong Soul xóa kho GM của script đó (người dùng báo, 2026-11-04) → lý do có script Kho. Không bấm cập nhật script Kho; Kho giữ @version 1.0.0 mãi để Soul không có bản mới mà đề nghị.
- [sua-webapp] 2.2.0: kho GM riêng của script chính vẫn giữ bản dữ liệu tại lúc chuyển sang Kho (không xóa, phòng trang giả mạo Kho); bản này cũ dần và mất ở lần cập nhật kế, không được dùng lại vì có dấu "sdt_kho_moved".
- [sua-webapp] 2.2.0: một trang web cố ý giả mạo script Kho (khi chưa cài Kho, qua đường sự kiện) có thể nhận được bản sao dấu trang; dữ liệu thật không bị xóa. Rủi ro thấp, đã ghi trong màn Sao lưu khi dùng đường trang có thể thấy.
- [sua-webapp] 2.4.0: thao tác hàng loạt trên nhiều mục rải rác (đổi chữ, xóa, thêm nhãn) ở bản tiện ích tốn ~5 s với 50.000 dấu trang vì chrome.storage ghi lại gần hết các phần dữ liệu. Người dùng chọn làm lại cách lưu (bản sau).
- [kiem-thu-webapp] Soát toàn diện 2026-11-09 (bản 2.5.0): 9 lỗi — Hoàn tác đè thay đổi của nơi khác (mất dấu trang vừa lưu ở popup / tab khác); regex cờ u từ chối "\-", "\_", "a{2"; kiểm lựa chọn O(chọn × tổng) ~1,4 s với 10.000/50.000; chạm tên khi chọn nhiều không bỏ chọn; kho Soul (đường sự kiện) có thể bị chèn địa chỉ javascript:; popup lấy tab cửa sổ khác; gộp HTML gọi trùng-trong-tệp là "đã có"; dán lỗi làm mất trạng thái cắt; dấu "dữ liệu hỏng" từ nơi khác không báo cho trình quản lý đang mở (kho chỉ báo khi sdt_meta đổi). Đã sửa ở 2.6.0.
- [kiem-thu-webapp] Soát lần 2 ngày 2026-11-10 (bản 2.6.0): 7 vấn đề — (1) hai thao tác chồng nhau làm lệch kho và màn hình: 50.000 dấu trang, đổi chữ 12.500 mục rồi xóa một mục khi đang ghi → kho chỉ đổi 12.305 (đọc–sửa–ghi chồng nhau trên cùng phần dữ liệu; S.data bị ghi đè bằng bản tính từ dữ liệu cũ); (2) xóa nhãn, gộp nhãn không có Hoàn tác; (3) Chọn hết → Xóa không hỏi lại; (4) tìm trong thư mục không báo phạm vi; (5) Hoàn tác mất khi đóng hộp trùng; (6) thứ tự cỡ Date.now() hết độ phân giải số thực sau 13–25 lần thả cùng khe; (7) danh sách nhãn cắt 300 / 200 không báo. Đã sửa ở 2.6.1.
- [sua-webapp] 2.6.1: thông báo ở đáy hộp thoại che nút hành động ở đáy hộp trong lúc đang hiện (tối đa 6–12 giây); đóng hộp bằng nút X ở đầu hộp vẫn được. Chưa đổi.
- (sua-webapp 2.7.0, 2026-11-10) Ô sắp xếp tự co theo chữ dùng CSS field-sizing, tên 2 dòng khi đang tìm ở kiểu Gọn dùng :has(); trình duyệt cũ không hiểu thì hàng công cụ xuống dòng / tên còn 1 dòng, không lỗi. "Dấu trang" (gốc) trong cây vẫn đếm mục trực tiếp (dấu trang + thư mục cấp một), khác các thư mục (tổng dấu trang kể cả thư mục con).
