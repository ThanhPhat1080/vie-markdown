# vie-markdown

Dịch file Markdown từ tiếng Anh sang tiếng Việt ngay trong VS Code, dùng Google Gemini. Giữ nguyên định dạng Markdown, code block và thuật ngữ kỹ thuật.

## Cài đặt

```bash
code --install-extension vie-markdown-0.0.1.vsix
```

## Lấy API key (miễn phí)

1. Vào https://aistudio.google.com/apikey và tạo key bằng tài khoản Google của bạn.
2. Lần đầu chạy lệnh dịch, extension sẽ hỏi key. Key được lưu bằng `SecretStorage` của VS Code, không nằm trong settings.json.
3. Đổi key sau này: `Ctrl+Shift+P` → `vie-markdown: Đặt API key Gemini`.

## Cách dùng

Mở một file `.md`, rồi:

- bấm nút **VIE** trên thanh tiêu đề của editor (góc trên bên phải), hoặc
- `Ctrl+Shift+P` → gõ `vie-markdown`.

Bản dịch mở trong một tab Markdown mới bên cạnh. Bạn sửa tay được, rồi lưu bằng `Ctrl+S` (ví dụ `ten-file.vi.md`).

Mỗi tiêu đề `#` giữ dòng tiếng Anh gốc, ngay dưới là bản dịch dạng `*Title: ...*` để dễ tìm lại bản gốc.

## Cài đặt (Settings)

| Setting | Ý nghĩa | Mặc định |
|---|---|---|
| `vieMarkdown.keepTerms` | Danh sách từ giữ nguyên tiếng Anh, không dịch | `[]` |
| `vieMarkdown.model` | Tên model Gemini | `gemini-3.5-flash-lite` |

## Quyền riêng tư

Nội dung file được gửi tới Google Gemini để dịch. Với gói miễn phí, Google có thể dùng dữ liệu để cải thiện sản phẩm. Đừng dịch file chứa thông tin nhạy cảm.

## Giới hạn của gói miễn phí

Gói free giới hạn số request và số token mỗi phút/ngày; mức cụ thể do Google quy định và có thể thay đổi, xem trang chính thức của Google AI Studio. Khi vượt mức, extension tự chờ và thử lại tối đa 3 lần. Nếu vẫn lỗi, phần đã dịch được giữ trong tab mới, bạn chờ vài phút rồi chạy lại.

Bản dịch của AI có thể lệch định dạng. Nếu số tiêu đề, code block hoặc link không khớp bản gốc, extension sẽ hiện cảnh báo.

## Thông báo lỗi và cảnh báo

Mọi thông báo đều nói rõ nguyên nhân và có nút hành động:

| Tình huống | Bạn thấy gì |
|---|---|
| API key sai | Key đã lưu bị xóa, nút **Nhập key mới** |
| Model không tồn tại (404) | Nêu tên model, nút **Mở cài đặt model** |
| Hết hạn mức free (429) | Đã thử lại 3 lần (theo gợi ý chờ của Google), nút đổi model |
| Gemini quá tải (5xx) | Tự thử lại 3 lần; nếu vẫn lỗi thì báo mã HTTP |
| Mạng chậm / quá 120 giây | Gợi ý kiểm tra mạng hoặc dùng model nhẹ hơn |
| Bị bộ lọc an toàn chặn, hoặc bản dịch bị cắt cụt | Nêu rõ **phần** nào bị ảnh hưởng |
| Lỗi giữa chừng | "Đã dịch X/Y phần", phần đã dịch nằm trong tab mới |

Sau khi dịch xong, extension còn cảnh báo:

- **Lệch định dạng**: số tiêu đề, code block hoặc link khác bản gốc.
- **Đoạn chưa dịch**: câu tiếng Anh dài (từ 40 ký tự, từ 6 từ trở lên) còn nguyên trong bản dịch; thông báo trích vài câu đầu để bạn kiểm tra và dịch bổ sung.

Bấm **Xem chi tiết** để mở kênh Output `vie-markdown`: log từng request (model, mã HTTP, thời gian), danh sách đầy đủ các đoạn chưa dịch và lý do lỗi. API key không bao giờ được ghi vào log.
