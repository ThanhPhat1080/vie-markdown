# VIE-markdown 🇻🇳

**AI gen ra 47 file Markdown trong một buổi chiều. Bạn đọc chưa hết file đầu thì file thứ 12 đã đẻ thêm 3 file con.**

Đã ruk còn toàn tiếng Anh. Đọc đến đoạn thứ ba là đầu óc bắt đầu mụ dần, có khi gật đầu bừa rồi giật mình: *"Ủa, nãy mình mới approve cái gì vậy?"*. Dễ bị AI "chơi" ghia! 😵‍💫

Trình English chưa tự tin thì dễ bị AI "chơi" lắm bạn ơi. **Ruk, đọc doc bằng tiếng mẹ đẻ đi cho khỏe.**

### Giải pháp: cái extension này

Bấm **VIE** → file Markdown biến thành tiếng Việt, code block, link, bảng vẫn y nguyên. Xong. Không drama.



- 🆓 **Cần API key free.** Gemini hoặc Groq đều có gói miễn phí, tự đi xin (link ở dưới), 2 phút là xong. (Nhớ free nó sẽ share cho nhà cung cấp AI, dùng cẩn thận nhé! 🫡)
- 💸 Bạn muốn dùng key đã nạp VIP cho sang, cho bảo mật hơn thì... **chuyện của bạn**, author không phán xét or xin ké.
- 🧠 Dịch xong nhớ đọc lại, đừng tin AI mù quáng. Nhưng ít nhất lúc này bạn *đọc hiểu* thứ nó viết.

### 🍜 Vângg, author cũng cần được chăm 🥹

Tool này sinh ra để mình **thoát khỏi chính cái app này**: dịch đỡ mệt rồi đi rèn en-lịt cho đàng hoàng, ngày nào đó không cần extension nữa.
Nên ae, bạn bè xã hội, nếu thấy xài ngon thì **nuôi mình một bữa** để mình có sức học eng nhé T.T

<p align="center">
  <img src="docs/momo-qr.jpg" alt="MoMo QR nuôi author" width="260">
  <br><sub>Quét MoMo, only 10k thôi. Cảm ơn ae nhiều, hứa học en-lịt chăm hơn 🫡</sub>
</p>

---

Dịch file Markdown từ tiếng Anh sang tiếng Việt ngay trong VS Code, dùng Gemini hoặc Groq. Giữ nguyên định dạng Markdown, code block và thuật ngữ kỹ thuật.

## Cài đặt (dễ hơn nấu mì gói)

```bash
code --install-extension vie-markdown-0.0.1.vsix
```
## ⚠️ Quyền riêng tư

Nội dung file được gửi tới provider bạn chọn 🥹🥹(Google Gemini hoặc Groq) để dịch. Với gói miễn phí của Google, dữ liệu có thể được dùng để cải thiện sản phẩm. Đừng dịch file chứa thông tin nhạy cảm (mật khẩu, key, hợp đồng... AI không cần biết).

## Lấy API key (miễn phí, đừng lo, chưa ai đòi 💵)

- Gemini: https://aistudio.google.com/apikey
- Groq: https://console.groq.com/keys

Nhập key ở một trong hai nơi:

1. Settings (`Ctrl+,` → gõ `vieMarkdown`): ô `vieMarkdown.geminiApiKey` và `vieMarkdown.groqApiKey`. Key lưu chữ thường trong settings.json, nên đặt ở User settings và không commit.
2. Hoặc để extension hỏi khi bạn chọn provider chưa có key; key nhập ở hộp thoại được ghi vào setting tương ứng.

Đổi key bằng lệnh `vie-markdown: Đặt API key Gemini` hoặc `vie-markdown: Đặt API key Groq`.

## Cách dùng

<p align="center">
  <img src="docs/vie-button.png" alt="Nút VIE nằm ở góc trên bên phải thanh tiêu đề editor" width="720">
</p>

Mở một file `.md`, rồi:

- bấm nút **VIE** trên thanh tiêu đề của editor (góc trên bên phải), hoặc
- `Ctrl+Shift+P` → gõ `vie-markdown`.

Bản dịch mở trong một tab Markdown mới bên cạnh. Bạn sửa tay được, rồi lưu bằng `Ctrl+S` (ví dụ `ten-file.vi.md`).

Mỗi tiêu đề `#` giữ dòng tiếng Anh gốc, ngay dưới là bản dịch dạng `*Title: ...*` để dễ tìm lại bản gốc.

## Chỉnh cho vừa ý (Settings)

| Setting | Ý nghĩa | Mặc định |
|---|---|---|
| `vieMarkdown.keepTerms` | Danh sách từ giữ nguyên tiếng Anh, không dịch | `[]` |
| `vieMarkdown.model` | Tên model Gemini | `gemini-3.5-flash-lite` |


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

## Chọn model

Mỗi lần bấm **VIE**, một danh sách hiện ra để bạn chọn model dịch, ví dụ `Gemini · gemini-3.5-flash-lite` hoặc `Groq · qwen/qwen3.8-27b`. Lần chọn trước được xếp lên đầu. Đổi tên model bằng setting `vieMarkdown.model` (Gemini) và `vieMarkdown.groqModel` (Groq).

Extension không tự đổi provider khi lỗi; nếu một provider hết hạn mức hay quá chậm, chạy lại và chọn provider kia.

Timeout tự tăng theo độ dài đoạn (Gemini 90 giây + 5 ms/ký tự, tối đa 5 phút; Groq 45 giây + 5 ms/ký tự). Với Groq, đoạn dài được chia thành phần ≤ 4000 ký tự để không vượt giới hạn token/phút của gói free, và không chờ quá 20 giây khi bị giới hạn tốc độ.
