# Tutor web: học trên trình duyệt (Giai đoạn 2)

Ngày: 2026-10-22. Trạng thái: chờ duyệt.

Tài liệu này nối tiếp [[Tutor/Design/spec|spec giai đoạn 1]]. Những gì giai đoạn 1 đã quyết (mô hình dữ liệu, cách tính mastery, lịch ôn, cổng) giữ nguyên, ở đây chỉ nhắc lại khi cần.

## 1. Vì sao làm

Học bằng chat trong terminal thì được, nhưng thiếu động lực và khó thấy mình đang ở đâu. Khue muốn một trang web để:

- **học và trả lời câu hỏi ngay trên web**, AI chấm và giải thích, kết quả tự ghi vào status, mastery và lịch ôn;
- **thấy tiến độ** mỗi lần mở: hôm nay cần làm gì, đã thuộc bao nhiêu, còn bao nhiêu ngày đến phỏng vấn (2027-01-07);
- mở là dùng được, không phải gõ lệnh.

Mẫu tham khảo là `~/VSCodeProjects/algorithm-learner` (Khue tự làm cho NeetCode 150): giao diện yên tĩnh, Today có mục tiêu nhỏ mỗi ngày, heatmap, streak, bản stable tự chạy khi đăng nhập. Tutor web đi theo cùng tinh thần đó.

**Thành công nghĩa là:** Khue mở `http://localhost:4175` mỗi ngày, học hết hàng đợi hôm nay chỉ bằng web, và Dashboard trong Obsidian hiện đúng cùng kết quả.

## 2. Mục tiêu, ngoài phạm vi, điều không được xảy ra

**Mục tiêu**

- Trang Today: các point đến hạn ôn + point mới của ngày, học lần lượt từng point.
- Luồng học một point theo phương pháp có bằng chứng (mục 5): thử trước, bài giảng ngắn, tự nhớ lại, phản hồi ngay, ôn giãn cách.
- AI chấm bằng Claude Code trên máy (`claude -p`, gói Pro của Khue, không API key).
- Phản hồi tiếng Anh riêng, không ảnh hưởng điểm.
- Trang Topics, Progress, Point detail.
- Bản stable tự chạy khi đăng nhập, port cố định, tự khởi động lại khi crash.

**Ngoài phạm vi**

- Học trên điện thoại hoặc truy cập từ máy khác. Server chỉ nghe `127.0.0.1`.
- Tạo topic mới hoặc sửa đề cương (`init-topic`) từ web. Việc này vẫn làm trong Claude Code ở terminal.
- Đổi thuật toán lịch ôn (ví dụ sang FSRS).
- Trả lời bằng giọng nói.
- Nhiều người dùng, tài khoản, đăng nhập.

**Điều không được xảy ra (làm thì coi như hỏng, dù chạy được)**

- Web tự tính hoặc tự ghi `status`, `mastery`, `box`, `next_review`, `history`. Mọi lần ghi điểm phải đi qua `tutor.py record`.
- Một lần chấm bị lỗi (timeout, hết hạn mức, JSON hỏng) mà lại bị ghi thành trả lời sai.
- Mất câu trả lời Khue đã gõ.
- Web và Obsidian lệch nhau: Dashboard trong Obsidian phải luôn đúng như web.
- Ghi file trong vault ngoài `Tutor/Lessons/`, hoặc gửi nội dung vault đi bất cứ đâu ngoài phiên `claude -p` của Khue.
- AI nói "đã thuộc" khi `record` chưa trả `passed_gate: true`.

## 3. Ràng buộc

- Vault: `/Users/khue/Obsidian/Khue Vault` (git repo). Dữ liệu Tutor có sẵn: 19 topic, 239 point (ngày 2026-10-22: 1 mastered, còn lại new). Chưa có bài giảng nào trong `Tutor/Lessons/`.
- `tutor.py` (`.claude/skills/tutor/scripts/`) là chỗ duy nhất tính điểm và lịch. Chỉ dùng thư viện chuẩn Python. Các lệnh web cần: `export`, `next`, `due`, `status`, `record`. Mọi lệnh in JSON, nhận `--vault` và `--date`.
- `claude` CLI 2.1.304 ở `~/.local/bin/claude`. Đã thử ngày 2026-10-22: `claude -p --model sonnet --tools "" --setting-sources "" --no-session-persistence --output-format json --json-schema '<schema>'` chấm một câu và trả JSON đúng schema trong khoảng 4 giây, đăng nhập bằng gói Pro. **Không dùng `--bare`**: chế độ này bỏ qua keychain, nên mất đăng nhập gói Pro.
- Mỗi lần gọi `claude -p` trừ vào hạn mức gói Pro. Phải gọi ít: trắc nghiệm chấm bằng code, không gọi AI.
- Chỉ chạy trên Mac của Khue. Mac ngủ thì web ngưng; mở máy lên là dùng được lại.
- Nội dung học (bài giảng, câu hỏi, chấm điểm, phản hồi) **bằng tiếng Anh**, giọng câu trả lời phỏng vấn, câu ngắn, từ đơn giản (Khue ở mức TOEIC 500–600). Giữ đúng thuật ngữ kỹ thuật.

## 4. Cách làm (đã quyết)

- **Repo riêng:** `~/VSCodeProjects/tutor-learner`, không đặt trong vault (để `node_modules` không làm Obsidian chậm và không làm bẩn git của vault). Đường dẫn vault ghi trong file config của app.
- **Stack giống algorithm-learner:** Vite 5, React 18, TypeScript, Tailwind, react-router, vitest + Testing Library. Server là plugin Vite cho bản dev và một server Node nhỏ cho bản stable, cùng một bộ handler `/api/*`.
- **Bản stable giống algorithm-learner:** build từ một commit vào `~/stable/tutor-learner`, port **4175**, LaunchAgent `vn.khue.tutor-learner` với `RunAtLoad` + `KeepAlive`, log ở `~/Library/Logs/tutor-learner.log`, dữ liệu riêng của app ở `~/Library/Application Support/tutor-learner`, backup hằng ngày. Plist ghi `PATH` có `~/.local/bin` để tìm `claude` và `python3`. Bản dev chạy port 5175, dữ liệu ở `./.data`.
- **Lịch ôn giữ nguyên `tutor.py`** (Leitner, nén theo ngày phỏng vấn, cổng mastery). Web không có thuật toán lịch riêng.
- **Model:** `sonnet` cho mọi lần gọi AI.

## 5. Luồng học một point

Dựa trên các nguyên tắc: thử trước khi học (pretesting), tự nhớ lại (retrieval practice), phản hồi ngay, ôn giãn cách, trộn topic khi ôn. Luồng này giống bước 2–6 của `SKILL.md`, chỉ chuyển từ chat sang web.

### 5.1 Point mới (`kind: learn`)

1. **Câu hỏi thử.** Một câu ngắn để Khue đoán trước. Có nút "I don't know yet". Câu này **không ghi điểm**. Phản hồi chỉ một dòng.
2. **Bài giảng ngắn** lấy từ note nguồn (`sources`), có link mở note gốc trong Obsidian (`obsidian://open?vault=Khue%20Vault&file=...`). Nếu chưa có thì tạo bài giảng rồi lưu vào `Tutor/Lessons/<Topic>/<tên file point>.md`, đúng quy ước giai đoạn 1 (frontmatter `tutor: lesson`, `point: "[[...]]"`). Nếu đã có thì dùng lại, không gọi AI.
3. **Câu hỏi chính**, tùy theo `type`:
   - `memory`, `procedure`: trắc nghiệm A–D. Mỗi đáp án nhiễu ứng với một hiểu lầm có thật. Chấm bằng code theo đáp án đã lưu.
   - `concept`: Khue tự giải thích bằng lời trong ô văn bản. AI chấm theo tiêu chí đã viết sẵn khi tạo câu hỏi.
4. **Kết quả:** đúng hoặc sai, vì sao, ý còn thiếu, và đoạn bài giảng liên quan khi trả lời sai. Sau đó web gọi `record` và hiện **đúng** những gì `record` trả về (`mastery`, `status`, `passed_gate`, `next_review`).
5. **Phản hồi tiếng Anh** (chỉ cho câu trả lời tự viết): câu Khue viết, bản sửa, 1–3 ghi chú ngắn (ngữ pháp, cách nói tự nhiên hơn trong phỏng vấn). Hiện ở một khung riêng, **không ảnh hưởng `ok`**. Có thể tắt trong Settings.

Point `concept` cần hai câu `q` khác nhau đều đúng mới qua cổng. Vì vậy sau khi đúng câu đầu, web đưa câu thứ hai (một câu khác trong ngân hàng câu hỏi) ở lần học sau hoặc ngay sau đó nếu Khue bấm "One more question".

### 5.2 Point đến hạn ôn (`kind: review`)

Bỏ bước 1 và 2, hỏi luôn. Ưu tiên câu `q` mà Khue chưa trả lời gần đây. Bài giảng chỉ mở khi Khue trả lời sai hoặc tự bấm "Show lesson".

### 5.3 Ngân hàng câu hỏi

Mỗi point có một ngân hàng nhỏ, tạo **một lần** bằng AI rồi lưu lại, để: mã `q` ổn định (cổng `concept` cần hai `q` khác nhau), trắc nghiệm chấm được bằng code, và không tốn hạn mức mỗi lần hỏi lại.

- Mỗi câu gồm: `q` (ví dụ `q1`, `q2`, không trùng trong point), loại (`pretest` | `mcq` | `open`), đề bài; với `mcq`: 4 đáp án, đáp án đúng, hiểu lầm ứng với từng đáp án nhiễu; với `open`: tiêu chí chấm (2–4 ý bắt buộc).
- Số lượng: 1 câu pretest + 3 câu chính mỗi point.
- Lưu ở dữ liệu riêng của app (mục 7), **không** trong vault.
- Có nút "Regenerate questions" cho từng point, phòng khi câu hỏi tệ. Các `q` mới không trùng mã với `q` cũ đã có trong `history`.

### 5.4 Khi Khue không đồng ý với điểm chấm

Có nút "I think this is right". Khue viết lý do, AI chấm lại **một lần** với lý do đó, và kết quả lần này là kết quả cuối. Chỉ ghi `record` sau lần chấm cuối, nên mỗi lần trả lời chỉ có đúng một bản ghi trong `history`.

## 6. Các trang

| Trang | Nội dung |
|---|---|
| **Today** | Ô trên cùng: đếm ngược đến 2027-01-07, streak, mục tiêu hôm nay (vd. "4 / 8 done"). Danh sách: các point đến hạn ôn (theo thứ tự `tutor.py`, tối đa `daily_review_cap`) rồi các point mới. Danh sách được **khóa trong ngày**, không bị xáo trộn khi dữ liệu đổi. Học xong sớm thì có "Study one more". |
| **Study** | Màn hình học một point theo mục 5. Phím tắt: `Cmd+Enter` gửi câu trả lời, `1`–`4` chọn đáp án, `n` sang point tiếp. |
| **Topics** | 19 topic theo `topic_order`: số new/learning/mastered, số point `interview` chưa xong, thanh tiến độ. Bấm vào thì xem danh sách point. |
| **Point detail** | Câu hỏi của point, `history` (ngày, kind, đúng/sai, `why`), mastery, `next_review`, link bài giảng và note nguồn. |
| **Progress** | Heatmap theo ngày (số lần trả lời), streak, mastered / 239, dự báo số point đến hạn 14 ngày tới, tốc độ cần đạt để học hết trước ngày phỏng vấn (số point còn lại chia số ngày còn lại). |
| **Settings** | Số point mới mỗi ngày (mặc định 3), bật/tắt phản hồi tiếng Anh, đường dẫn vault (chỉ đọc), trạng thái `claude` (đăng nhập được không, lần lỗi gần nhất). |

Theme sáng/tối, dùng được từ 360 px (giống algorithm-learner).

**Cách lập danh sách Today** (phải khớp mục 6.5 của spec giai đoạn 1):

- Phần ôn: lấy từ `tutor.py due`, giữ nguyên thứ tự script trả về, cắt ở `daily_review_cap`.
- Phần mới: `tutor.py next` chỉ trả một point, nên web lấy N point tiếp theo từ `export` theo đúng quy tắc của `next`: các point `new` hoặc `learning` chưa mastered, xếp theo `topic_order` (frontmatter của `Tutor/Roadmap.md`), rồi theo `order`, point `interview` đi trước nếu cùng thứ tự. Viết test so point đầu tiên của danh sách này với kết quả `tutor.py next` trên cùng dữ liệu.
- "Hôm nay" là ngày theo lịch giờ máy (Asia/Ho_Chi_Minh), giống `tutor.py`. Không dùng mốc 04:00 như algorithm-learner, để hai bên không lệch ngày.
- Streak và heatmap tính từ các ngày `d` trong `history` của mọi point (lấy từ `export`). Một ngày được tính nếu có ít nhất một bản ghi. Vì vậy học trong terminal cũng được tính.

**Số point mới mỗi ngày mặc định là 3.** Lý do: còn khoảng 238 point, 77 ngày, và tuần 10–13 để dành cho ôn và phỏng vấn thử. 3 point/ngày nghĩa là học hết trong khoảng 11 tuần.

## 7. Dữ liệu: ai giữ cái gì

| Dữ liệu | Ở đâu | Ai ghi |
|---|---|---|
| Trạng thái point (`history` và các trường dẫn xuất) | `Tutor/Points/**` trong vault | Chỉ `tutor.py record` |
| Bài giảng | `Tutor/Lessons/**` trong vault | Server (giống CLI tutor) |
| Ngân hàng câu hỏi, các lần trả lời (câu trả lời, kết quả chấm, phản hồi tiếng Anh, lỗi), danh sách Today đã khóa, settings | `state` của app trong thư mục dữ liệu app | Server |

- **Ghi câu trả lời trước khi chấm.** Lần trả lời được lưu ở trạng thái `pending` ngay khi Khue bấm gửi. Chấm xong thì chuyển sang `graded`, sau khi `record` thành công thì chuyển sang `recorded`. Nếu server khởi động lại giữa chừng, các lần trả lời `pending` hoặc `graded` vẫn còn và web cho chấm lại hoặc ghi lại.
- Ghi file kiểu atomic (ghi file tạm rồi rename). File hỏng thì đổi tên để giữ lại, không ghi đè. Backup hằng ngày giống algorithm-learner.
- Web đọc trạng thái point bằng `tutor.py export` (khoảng 239 point, đủ nhanh). Đọc lại khi cửa sổ được focus và sau mỗi lần `record`, nên khi Khue học trong terminal thì web vẫn thấy.
- Server chạy **từng lệnh `record` một** (hàng đợi trong server) để không có hai lần ghi cùng một file point.

## 8. Gọi AI

Mọi lần gọi đều qua một hàm duy nhất trong server:

- Lệnh: `claude -p --model sonnet --tools "" --setting-sources "" --no-session-persistence --output-format json --json-schema <schema>`, prompt đưa qua stdin, chạy với `cwd` là thư mục dữ liệu app (không phải vault).
- Server tự đọc các note nguồn rồi đưa nội dung vào prompt (AI không có tool đọc file). Wikilink trong `sources` được đổi thành đường dẫn file trong vault. Nếu không tìm thấy note nguồn thì báo rõ trên web, không bịa nội dung.
- Bốn loại việc, mỗi loại một schema JSON: `lesson` (bài giảng markdown), `questions` (ngân hàng câu hỏi, mục 5.3), `grade` (`ok`, `why` một dòng, `missing[]`, `feedback`), `english` (`corrected`, `notes[]`). Với câu tự viết, có thể gộp `grade` và `english` vào một lần gọi để tiết kiệm.
- **Timeout** 90 giây mỗi lần gọi. **Retry** tối đa 3 lần, chờ 2 s, 6 s, 18 s. Không retry khi lỗi là **hết hạn mức** hoặc **chưa đăng nhập**: báo rõ trên web ("Claude usage limit reached, try again later" / "Claude is not logged in") và giữ câu trả lời ở `pending`.
- JSON sai schema thì coi là lỗi (được retry), không bao giờ coi là trả lời sai.
- **Tạo trước:** khi mở Today, server tạo dần ở nền bài giảng và ngân hàng câu hỏi cho các point trong danh sách hôm nay (mỗi lần một point), để lúc học không phải chờ. Việc chấm thì chỉ chạy khi Khue gửi câu trả lời.
- Web hiện trạng thái đang chạy ("Grading…", "Writing lesson…").

`why` gửi vào `record` là một dòng ngắn bằng tiếng Anh, lấy từ `grade.why`.

## 9. An toàn

- Server chỉ nghe `127.0.0.1`. Không mở CORS. Các API ghi chỉ nhận request có header `Origin` đúng với địa chỉ của chính app.
- Server chỉ ghi trong `Tutor/Lessons/` của vault và trong thư mục dữ liệu app. Mọi đường dẫn đều kiểm tra (không `..`, không đường dẫn tuyệt đối, không symlink trỏ ra ngoài), giống quy tắc của `tutor.py`.
- Gọi `tutor.py` và `claude` bằng `spawn` với mảng tham số, không đi qua shell.
- Không telemetry. Nội dung vault chỉ đi tới Anthropic qua `claude -p` của Khue.
- Không tự commit vault. Bài giảng mới và thay đổi điểm hiện trong `git diff` của vault như giai đoạn 1.

## 10. Kiểm thử

- **Server (vitest):** wrapper `tutor.py` chạy trên một vault tạm có vài point giả (ghi qua `record` thật). Wrapper `claude` dùng một file chạy giả thay cho `claude`, để thử: thành công, JSON hỏng, timeout, hết hạn mức, chưa đăng nhập. Trạng thái lần trả lời `pending → graded → recorded` và khôi phục sau khi khởi động lại. Kiểm tra đường dẫn. Header `Origin`. Hàng đợi `record`.
- **Logic (vitest):** khóa danh sách Today, chọn câu `q` khi ôn, đổi wikilink sang đường dẫn, chấm trắc nghiệm, số liệu Progress.
- **UI (Testing Library):** luồng point mới (pretest → bài giảng → câu chính → kết quả), luồng ôn, hiện lỗi và nút chấm lại, tắt phản hồi tiếng Anh.
- **Thử tay:** chạy bản stable qua LaunchAgent, học 2–3 point thật, rồi kiểm tra Dashboard trong Obsidian và `tutor.py validate` không báo lệch. Kiểm tra `claude -p` chạy được từ LaunchAgent (đăng nhập qua keychain trong phiên GUI).

## 11. Để người xây quyết

- Cấu trúc thư mục trong repo, tên component, cách quản lý state phía client.
- Giao diện chi tiết (màu, khoảng cách), miễn là cùng tinh thần yên tĩnh của algorithm-learner.
- Nội dung prompt cho bốn loại việc ở mục 8, miễn là theo quy tắc của `SKILL.md` (dạy từ nguồn, đáp án nhiễu ứng với hiểu lầm thật, tiếng Anh đơn giản).
- Định dạng file `state` của app.

## 12. Các điểm mình (Claude) tự quyết, Khue kiểm tra giúp

- Repo riêng `~/VSCodeProjects/tutor-learner`, port stable 4175, dev 5175.
- Model `sonnet` cho mọi việc.
- 3 point mới mỗi ngày.
- Câu hỏi thử không ghi điểm.
- Ngân hàng câu hỏi lưu ngoài vault, bài giảng lưu trong vault.
- Phản hồi tiếng Anh bật mặc định, tắt được.
- Chấm lại khi không đồng ý: một lần, kết quả lần đó là cuối.
- Không làm học trên điện thoại.
