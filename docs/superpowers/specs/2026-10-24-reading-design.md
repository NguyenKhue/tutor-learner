# Reading: đọc tài liệu có hệ thống (tab Reading)

Ngày: 2026-10-24. Trạng thái: chờ duyệt.

Tài liệu này nối tiếp `2026-10-22-tutor-learner-design.md`. Mọi thứ đã quyết ở đó (ghi điểm chỉ qua `tutor.py`, gọi `claude -p`, an toàn đường dẫn, server chỉ nghe `127.0.0.1`) giữ nguyên.

## 1. Vì sao làm

Ngoài 239 point đang học, vault còn khoảng **650 note** (`Books/` 478, `Android/` 65, `Mobile/` 25, `Computer Science/` 23, `Interview Gaps/`, `Interview Questions/`, ...). Các point chỉ lấy nguồn từ khoảng 300 note, nên hơn một nửa tài liệu Khue đã viết không được nhắc tới.

Khue muốn đọc thêm sau khi học xong Today hoặc khi rảnh, nhưng **đọc có hệ thống**: không tự chọn đại một bài, mà biết nên đọc bài nào trước, vì sao, đọc xong có kiểm tra xem nhớ gì, và được nhắc ôn lại.

**Thành công nghĩa là:** sau buổi học Today, Khue mở tab Reading, thấy 2–3 bài nên đọc tiếp theo đúng topic đang học, đọc ngay trên web, trả lời vài câu, và các note đã đọc quay lại đúng lúc trong Today.

## 2. Mục tiêu, ngoài phạm vi, điều không được xảy ra

**Mục tiêu**

- Phân loại các note trong vault theo 19 topic của Roadmap, kèm mức ưu tiên cho phỏng vấn, thời gian đọc và một câu "vì sao nên đọc".
- Tab **Reading**: gợi ý vài bài kế tiếp theo lộ trình, đọc note ngay trên web, tiến độ đọc theo topic, duyệt theo topic.
- Đọc xong thì làm **bài kiểm tra ngắn** (tự viết câu trả lời, Claude chấm, có phản hồi tiếng Anh như trang Study).
- **Lịch hỏi lại** cho note, và các note đến hạn **hiện trong Today**, tính vào mục tiêu ngày.

**Ngoài phạm vi**

- Bài blog hay tài liệu bên ngoài vault.
- Sửa note trong vault, hoặc thêm frontmatter vào note.
- Biến note thành point, hay ghi kết quả đọc vào `history` của `tutor.py`.
- Gợi ý theo nội dung giống nhau (embedding, tìm kiếm ngữ nghĩa).

**Điều không được xảy ra**

- Ghi bất cứ thứ gì vào vault. Tính năng Reading **chỉ đọc** vault, mọi trạng thái nằm trong `state.json` của app.
- Kết quả đọc làm thay đổi điểm, mastery hay lịch ôn của point.
- Một lần chấm bị lỗi (timeout, hết hạn mức) lại bị tính là trả lời sai, hoặc làm mất câu trả lời đã gõ (cùng quy tắc với Study).
- Today bị ngập vì việc đọc, lấn mất chỗ của point.
- Đọc note qua web mà lộ file ngoài vault (đường dẫn, ảnh).

## 3. Ràng buộc và số liệu

- Note được tính: mọi file `.md` trong vault, **trừ** `Tutor/`, `.claude/`, `.obsidian/`, `.git/`, `.trash/`, và các note dài hơn **60.000 ký tự**. Các note dài cỡ đó là bản dump cả cuốn sách (ví dụ `Books/Kotlin Deep Dive/Kotlin Deep Dive.md`, khoảng 950 KB) và đã có bản tách theo chương bên cạnh.
- Độ dài note (2026-10-24): trung vị 3.8K ký tự, p90 22K ký tự. Có 62 note nhúng ảnh kiểu `![[x.png]]` và 42 note nhúng kiểu `![](images/x.jpg)`.
- Mỗi lần gọi `claude -p` trừ hạn mức gói Pro, nên phải gọi ít:
  - phân loại theo **lô**, khoảng 10 note mỗi lần gọi (mỗi note chỉ gửi tiêu đề, đường dẫn và 1.500 ký tự đầu), tổng khoảng 65 lần gọi, **chỉ làm một lần**;
  - câu hỏi cho một note được tạo một lần khi đọc lần đầu, rồi lưu lại;
  - chấm cả bài kiểm tra (2–3 câu) trong **một** lần gọi.
- Khi tạo câu hỏi, gửi tối đa 60.000 ký tự của note (vì đã loại các note dài hơn, nên thực tế là cả note).

## 4. Cách làm (đã quyết)

### 4.1 Danh mục note (catalog)

- Server quét vault, lấy danh sách note theo mục 3. Với mỗi note lưu: đường dẫn tương đối, tiêu đề (tên file bỏ `.md`), số ký tự, `mtime`, và hash nội dung.
- **Phân loại** bằng Claude, theo lô 10 note. Mỗi note nhận được:
  - `topic`: đúng tên một trong các topic của `topic_order` trong `Tutor/Roadmap.md`, hoặc `null` nếu không liên quan tới phỏng vấn Android/KMP (ví dụ Home Server, English Vocabulary);
  - `priority`: `high` | `medium` | `low` | `skip`;
  - `minutes`: thời gian đọc ước tính;
  - `why`: một câu tiếng Anh đơn giản, "vì sao nên đọc".
- Prompt phân loại kèm danh sách topic và mô tả ngắn của từng topic (lấy cột "Main sources" và tên topic trong Roadmap), cùng quy tắc chọn `priority`.
- Note có `topic: null` hoặc `priority: skip` không hiện trong gợi ý, nhưng vẫn xem được khi duyệt "All notes".
- Phân loại chạy **ở nền**, mỗi lần một lô, khi Khue bấm "Build reading list" trong tab Reading (lần đầu), và tự chạy cho note mới hoặc note đổi hash khi mở tab Reading. Tab hiện tiến độ ("Classified 120 / 650"). Có thể dừng giữa chừng và chạy tiếp; lỗi hết hạn mức thì dừng và báo rõ.
- Note đã dùng làm nguồn cho point (xuất hiện trong `sources`) được đánh dấu `isSource: true`.

### 4.2 Thứ tự gợi ý ("Up next")

Tab Reading gợi ý **3 bài**. Thứ tự:

1. Note thuộc **topic đang học**, tức là topic của các point trong Today (`review`, `fresh`, `extra`).
2. Sau đó là note thuộc các topic **đã học** (topic có point không còn `new`), theo `topic_order`.
3. Rồi tới các topic còn lại, theo `topic_order`.

Trong cùng một nhóm:
- `priority` cao trước (`high` > `medium` > `low`);
- note **không** phải nguồn của point đi trước (`isSource: false`), vì Khue đã gặp note nguồn qua bài giảng;
- note ngắn trước;
- cuối cùng xếp theo đường dẫn.

Chỉ gợi ý note chưa đọc (`unread`). Có nút "Skip" để bỏ qua một gợi ý, trạng thái `skipped`; có thể khôi phục.

### 4.3 Đọc và kiểm tra

- **Đọc trên web:** trang `/read/<path>` hiển thị note bằng component Markdown đã có, kèm:
  - **ảnh nhúng** (`![[x.png]]`, `![](images/x.jpg)`) qua một API chỉ đọc. API này chỉ phục vụ file ảnh (`png`, `jpg`, `jpeg`, `gif`, `webp`, `svg`) nằm **trong vault**: kiểm tra realpath, từ chối symlink trỏ ra ngoài, gửi SVG kèm header `Content-Security-Policy: sandbox` và dùng thẻ `<img>` (không inline);
  - wikilink `[[...]]` hiện thành chữ thường (bấm vào được nếu note đó có trong catalog, thì mở `/read/...`);
  - nút "Open in Obsidian".
- Bấm **"I've read it"** thì tạo bài kiểm tra (lần đầu: Claude tạo **3 câu tự luận** từ note, mỗi câu có 2–4 tiêu chí; lưu lại cùng hash của note). Nếu note đã đổi hash từ lần tạo trước thì tạo lại.
- Khue trả lời cả 3 câu rồi gửi một lần. Claude chấm cả 3 trong **một** lần gọi, trả về cho mỗi câu `ok`, `why`, `missing`, `feedback`, và phần tiếng Anh nếu bật trong Settings.
- **Đạt** khi đúng ít nhất 2/3 câu. Đạt thì note thành `understood`. Chưa đạt thì `reread`, kèm danh sách ý còn thiếu.
- Câu trả lời được lưu **trước khi chấm**, giống Study: lỗi chấm thì giữ ở trạng thái chờ, có nút "Grade again", không tính là trượt.
- Lần **hỏi lại** (khi đến hạn): không bắt đọc lại, hỏi luôn 3 câu đã lưu. Câu nào sai thì web gợi ý mở lại note.

### 4.4 Lịch hỏi lại

Đơn giản, tính trong server của app (không dùng `tutor.py`, vì note không phải point):

- Lần kiểm tra đầu **đạt** → hỏi lại sau **7 ngày**. Lần hỏi lại thứ nhất đạt → sau **21 ngày**. Lần hỏi lại thứ hai đạt → **xong** (`done`), không nhắc nữa.
- Bất kỳ lần nào **không đạt** → đọc lại sau **2 ngày** và quay về bậc đầu (đạt lần sau thì lại là 7 ngày).
- **Nén theo ngày phỏng vấn:** ngày hỏi lại không bao giờ sau `interview_date - interview_buffer_days` (lấy từ `Tutor/config.md`). Nếu mốc đó đã qua thì không đặt lịch nữa.
- Lịch được tính lại từ lịch sử các lần kiểm tra của note (giống cách `tutor.py` tính từ `history`), không lưu trường nào không suy ra được.

### 4.5 Today

- Thêm phần **"Reading review"** trong Today, sau Review và New, gồm các note đến hạn hỏi lại (`next_check <= today`) và các note `reread` đến hạn đọc lại.
- Tối đa **3** note mỗi ngày (chỉnh được trong Settings: "Reading reviews per day", 0–10). Danh sách này cũng **khóa trong ngày** cùng danh sách Today.
- Các note này **tính vào** "N / M done". Một note được tính là xong khi đã có một lần kiểm tra được chấm trong ngày.
- **Note mới chưa đọc không vào Today**. Chúng chỉ nằm trong "Up next" của tab Reading, để Today không bị ngập.

### 4.6 Tab Reading

- **Up next:** 3 gợi ý (tiêu đề, topic, thời gian đọc, câu "why", nút Read và Skip).
- **Due for recheck:** các note đến hạn (giống phần trong Today).
- **Progress theo topic:** mỗi topic một dòng: tổng số note được gợi ý, đã hiểu, cần đọc lại.
- **Browse:** chọn topic để xem mọi note của topic đó với trạng thái; "All notes" có cả note `null`/`skip`.
- Trạng thái phân loại và nút "Build reading list".
- Thêm "Reading" vào thanh điều hướng (Today, Reading, Topics, Progress, Settings).

### 4.7 Dữ liệu

Thêm vào `state.json` (không đụng vault):

| Khóa | Nội dung |
|---|---|
| `reading.catalog[path]` | `title`, `chars`, `mtime`, `hash`, `topic`, `priority`, `minutes`, `why`, `isSource`, `classifiedHash` |
| `reading.quizzes[path]` | `hash` của note lúc tạo, `questions` (3 câu, mã `r1..r3`, tiêu chí) |
| `reading.progress[path]` | `skipped` (cờ do Khue đặt); `checks`: danh sách lần kiểm tra `{ id, date, kind: 'first' \| 'recheck', quizHash, answers, results, passed, state: 'pending' \| 'graded', appealed?, appeal?, error? }`. `status` (`unread` \| `understood` \| `reread` \| `done`) được suy ra từ `checks` |
| `today.reading` | danh sách note của Reading review đã khóa trong ngày |
| `settings.readingReviewsPerDay` | mặc định 3 |

`next_check` và `status` (trừ `skipped`) được suy ra từ `checks` mỗi khi đọc, không lưu riêng.

### 4.8 Các trường hợp biên (đã quyết)

- **Note bị sửa nội dung:** giữ nguyên `status` và lịch sử `checks`. Mỗi lần kiểm tra lưu `quizHash` (hash của bộ câu hỏi đã dùng). Lần kiểm tra kế tiếp, nếu note đã đổi hash thì tạo bộ câu hỏi mới. Bậc trên lịch không bị reset. Note đã `done` vẫn là `done`.
- **Note bị xóa, đổi tên hoặc dời chỗ:** đường dẫn là danh tính của note. Note không còn trong vault (hoặc vượt 60K ký tự) thì bị **ẩn** khỏi mọi danh sách, nhưng dữ liệu trong `state.json` **không bị xóa**. Note xuất hiện lại ở đúng đường dẫn cũ thì tiếp tục từ chỗ cũ. Không dò note đổi tên: note ở đường dẫn mới được tính là note mới.
- **Bậc trên lịch:** bậc = số lần đạt **liên tiếp** tính từ lần trượt gần nhất (hoặc từ đầu). 1 lần đạt → +7 ngày, 2 lần → +21 ngày, 3 lần → `done`. Trượt → +2 ngày, bậc về 0. `kind` (`first`/`recheck`) chỉ để hiển thị.
- **Đọc lại sau khi trượt (`reread`):** đến hạn thì note hiện với nút "Read again". Khue đọc lại rồi bấm "I've read it", web hỏi bộ câu hỏi đã lưu (tạo mới nếu note đã đổi hash). Lần hỏi lại khi đã `understood` thì hỏi luôn, không bắt đọc. Cả hai dùng chung một luồng kiểm tra.
- **Today và tab Reading:** tab Reading hiện **mọi** note đến hạn. Today chỉ khóa **3** note đầu tiên, theo thứ tự: quá hạn lâu nhất trước, rồi `priority`, rồi đường dẫn. "N / M done" của Today chỉ đếm các note đã khóa trong Today. Kiểm tra một note ngoài danh sách khóa (từ tab Reading) không làm đổi N hay M. Đặt "Reading reviews per day" = 0 thì Today không có phần Reading review, còn tab Reading vẫn hiện đầy đủ.
- **Mốc phỏng vấn:** giống `tutor.py`: `cap = interview_date - interview_buffer_days`, ngày hỏi lại luôn bị chặn `<= cap`, và nếu `cap < today` thì dùng `today`. Nếu nhiều note dồn vào cùng một ngày thì giới hạn 3 note/ngày tự đẩy phần còn lại sang các ngày sau. Không có `interview_date` thì không nén.
- **Không đồng ý với điểm chấm:** giống trang Study. Một bài kiểm tra **chưa đạt** có nút "I think this is right" để chấm lại **một lần** với lý do của Khue (một lần gọi Claude). Kết quả lần chấm lại là kết quả cuối. Trạng thái lịch chỉ tính theo kết quả cuối.
- **Phân loại sai:** mỗi note có nút "Reclassify" (một lần gọi cho riêng note đó). Settings có "Reclassify all" (chạy lại cả catalog theo lô, có hỏi xác nhận vì tốn hạn mức).

## 5. Kiểm thử

- **Server:** quét catalog trên vault tạm (loại `Tutor/`, note > 60K ký tự); phân loại theo lô với Claude giả (lô 10, topic không hợp lệ thành `null`, lỗi hết hạn mức thì dừng và giữ phần đã xong, chạy tiếp được); thứ tự Up next theo mục 4.2; tạo lại câu hỏi khi note đổi hash; chấm một lần cho 3 câu; đạt khi 2/3; lịch 7 → 21 → xong, trượt → 2 ngày, nén theo ngày phỏng vấn; câu trả lời lưu trước khi chấm, lỗi thì không tính trượt; API ảnh từ chối `..`, đường dẫn tuyệt đối, symlink ra ngoài, đuôi không phải ảnh; không có lần ghi nào vào vault.
- **UI:** tab Reading (Up next, Skip, Browse, tiến độ phân loại), trang đọc (ảnh, wikilink, Open in Obsidian), luồng kiểm tra (đạt, chưa đạt, lỗi và Grade again), phần Reading review trong Today và cách đếm "done", Settings "Reading reviews per day".
- **Thử thật:** phân loại cả vault một lần (đếm số lần gọi và thời gian), đọc và kiểm tra 1–2 note, kiểm tra `git status` của vault không có thay đổi nào.

## 6. Để người xây quyết

- Mô tả topic đưa vào prompt phân loại, và quy tắc chọn `priority`.
- Cách hiển thị tiến độ, bố cục trang đọc, cách hiển thị bảng (table) trong Markdown nếu note có bảng.
- Hash nào dùng (ví dụ sha1 của nội dung).

## 7. Các điểm mình (Claude) tự quyết, Khue kiểm tra giúp

- Loại các note dài hơn 60.000 ký tự (bản dump cả sách).
- Phân loại theo lô 10 note, chỉ gửi 1.500 ký tự đầu mỗi note.
- 3 gợi ý trong Up next; note nguồn của point xếp sau.
- Bài kiểm tra 3 câu tự luận, đạt khi đúng 2/3, chấm trong một lần gọi.
- Lịch hỏi lại 7 ngày → 21 ngày → xong; trượt thì đọc lại sau 2 ngày.
- Các trường hợp biên ở mục 4.8 (note bị sửa hoặc xóa, bậc lịch, mốc phỏng vấn, chấm lại một lần, Reclassify).
- Tối đa 3 note Reading review mỗi ngày trong Today; note mới chưa đọc không vào Today.
- Kết quả đọc nằm riêng trong `state.json`, không ghi vào vault hay `tutor.py`.
