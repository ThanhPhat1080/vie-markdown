# vie-markdown: Thiết kế extension VS Code dịch Markdown Anh → Việt

Ngày: 2026-10-31

## 1. Mục tiêu

Extension VS Code giúp đọc các file Markdown sinh ra khi làm việc với AI bằng tiếng Việt.

Thành công khi:
- Bản dịch tự nhiên, ít máy móc.
- Giữ nguyên toàn bộ định dạng Markdown của file gốc.
- Xuất được thành một file Markdown tiếng Việt riêng.

Phạm vi bản thử nghiệm:
- Chỉ dịch một chiều Anh → Việt.
- Chia sẻ cho vài người quen, mỗi người tự dùng API key của mình (BYO key).
- Không trả phí: dùng gói free của Google Gemini (AI Studio).
- Chưa đưa lên Marketplace.

Ngoài phạm vi (YAGNI): đa ngôn ngữ, đa nhà cung cấp, webview song song hai khung, đồng bộ cuộn, dịch thư mục hàng loạt.

## 2. Trải nghiệm người dùng

- Khi mở file `.md`, nút "VIE" xuất hiện trên thanh tiêu đề editor (góc trên bên phải). VS Code không có "top sidebar" đúng nghĩa nên dùng vị trí này.
- Cách khác: `Ctrl+Shift+P` → gõ `vie-markdown`.
- Kết quả mở trong một tab Markdown chưa lưu (untitled) ngay bên phải file gốc. Người dùng xem, sửa tay, rồi lưu bằng `Ctrl+S` (gợi ý tên `<tên>.vi.md`).
- Có thể dùng Markdown Preview có sẵn của VS Code để xem dạng đã render.

## 3. Quy tắc dịch

1. Dịch sang tiếng Việt tự nhiên, không dịch từng từ.
2. **Giữ nguyên thuật ngữ kỹ thuật tiếng Anh** (ví dụ `commit`, `API`, `pull request`, `token`, `deploy`). Danh sách mặc định nằm trong prompt, người dùng bổ sung qua setting `vieMarkdown.keepTerms`.
3. **Không dịch**: code block (kể cả comment bên trong), inline code, URL, đường dẫn file, front-matter YAML, HTML tag.
4. Giữ nguyên mọi cú pháp Markdown: bảng, danh sách, checkbox, link, ảnh, in đậm/nghiêng, trích dẫn, đường kẻ ngang.
5. **Quy tắc tiêu đề**: mỗi tiêu đề dùng `#` giữ nguyên dòng tiếng Anh gốc, dòng ngay dưới là bản dịch dạng in nghiêng, để người dùng dễ tìm lại bản gốc.

   Gốc:
   ```markdown
   ## Installation

   Run the command below.
   ```
   Kết quả:
   ```markdown
   ## Installation
   *Title: Cài đặt*

   Chạy lệnh bên dưới.
   ```
6. Chỉ trả về Markdown, không thêm lời giải thích.

## 4. Kiến trúc

Các đơn vị nhỏ, mỗi đơn vị một việc:

| Đơn vị | File | Việc làm | Phụ thuộc |
|---|---|---|---|
| Giao diện VS Code | `src/extension.ts` | Đăng ký lệnh, nút VIE, tiến độ, mở tab nháp, hiện cảnh báo | VS Code API, các đơn vị bên dưới |
| Cắt file | `src/splitter.ts` | Cắt Markdown thành các phần tại ranh giới tiêu đề `#`, không cắt giữa code block | không |
| Tạo prompt | `src/prompt.ts` | Dựng prompt từ quy tắc ở mục 3 và `keepTerms` | không |
| Bộ dịch | `src/translator.ts` | Gọi REST API Gemini bằng `fetch`, thử lại khi lỗi 429 | mạng |
| Kiểm tra | `src/validator.ts` | So số tiêu đề, code block, link, dòng `Title:` giữa gốc và bản dịch | không |
| Cài đặt | `src/settings.ts` | Đọc setting, đọc/ghi API key qua `SecretStorage` | VS Code API |

`splitter`, `prompt`, `validator` là hàm thuần, test không cần VS Code hay mạng. `translator` có giao diện chung (`translate(text, prompt) → text`) để sau này đổi nhà cung cấp chỉ cần thay file này.

Công nghệ: TypeScript, không dùng SDK ngoài, gọi thẳng REST của Gemini.

## 5. Luồng chạy

1. Đọc nội dung file `.md` đang mở. Nếu không phải Markdown thì báo lỗi.
2. Lấy API key từ `SecretStorage`. Chưa có thì hiện ô nhập, kèm link tới Google AI Studio để lấy key miễn phí.
3. Gửi nguyên file kèm prompt. Nếu file vượt ngưỡng kích thước thì `splitter` cắt tại ranh giới tiêu đề và gửi lần lượt từng phần.
4. Hiển thị tiến độ ("phần 2/5") và cho phép hủy.
5. Nối các phần theo thứ tự rồi chạy `validator`.
6. Mở tab nháp bên cạnh với bản dịch. Nếu `validator` báo lệch thì hiện cảnh báo nêu rõ chỗ lệch.

## 6. Kiểm tra sau dịch (validator)

So sánh bản gốc và bản dịch:
- Số tiêu đề `#` (bỏ qua dòng `#` nằm trong code block).
- Số code block.
- Số link và ảnh.
- Số dòng `*Title: ...*` phải bằng số tiêu đề.

Lệch thì cảnh báo, không tự sửa và không chặn việc mở bản dịch. Đây là kiểm tra nhẹ, không gọi thêm AI.

## 7. Setting và lệnh

- `vieMarkdown.keepTerms`: mảng chuỗi, các từ không dịch, thêm vào danh sách mặc định.
- `vieMarkdown.model`: tên model Gemini, mặc định là một model nhanh có trong gói free.
- Lệnh `vie-markdown`: dịch file đang mở.
- Lệnh phụ: đặt hoặc đổi API key.

## 8. Xử lý lỗi

- Thiếu hoặc sai key: báo rõ và mở lại ô nhập.
- Lỗi 429 (hết hạn mức free): chờ rồi thử lại tối đa 3 lần với thời gian chờ tăng dần. Vẫn lỗi thì dừng, giữ lại các phần đã dịch và báo người dùng chờ vài phút rồi chạy lại.
- Lỗi mạng, phản hồi rỗng hoặc bị bộ lọc an toàn chặn: báo lỗi cho phần tương ứng, không làm mất phần đã dịch.
- Hủy giữa chừng: dừng gọi tiếp, giữ phần đã dịch.

## 9. Quyền riêng tư và giới hạn của gói free

- Nội dung file được gửi tới Google Gemini. Gói free có thể cho phép Google dùng dữ liệu để cải thiện sản phẩm, nên không dùng cho file chứa thông tin nhạy cảm. README của extension phải nói rõ điều này.
- Hạn mức free (số request và số token mỗi phút/ngày) do Google quy định và có thể thay đổi. Cần kiểm tra trên trang chính thức khi triển khai, không hard-code con số.
- API key lưu bằng `SecretStorage`, không nằm trong settings.json.

## 10. Kiểm thử

- Test tự động cho `splitter`, `prompt`, `validator` bằng Markdown mẫu: code block chứa dòng `#`, bảng, front-matter, danh sách lồng nhau, tiêu đề nhiều cấp.
- `translator` test bằng mock (kể cả kịch bản 429).
- Chạy thử tay với API key thật trên vài file Markdown do AI sinh ra.

## 11. Rủi ro đã biết

- Gửi nguyên file với prompt không đảm bảo AI luôn giữ đúng định dạng. Giảm thiểu bằng `validator` cảnh báo; nếu thực tế sai nhiều, phương án nâng cấp là bảo vệ code block/URL bằng ký hiệu giữ chỗ trước khi gửi (đã thảo luận, chưa làm ở bản đầu).
- Chất lượng tiếng Việt phụ thuộc model free; có thể đổi model qua setting.
