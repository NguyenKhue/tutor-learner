# Mock interview: phỏng vấn thử theo vòng như công ty thật

Ngày: 2026-11-04. Trạng thái: chờ duyệt.

Tài liệu này nối tiếp `2026-10-22-tutor-learner-design.md` và `2026-10-24-reading-design.md`. Mọi thứ đã quyết ở đó (ghi điểm chỉ qua `tutor.py`, gọi `claude -p`, server chỉ nghe `127.0.0.1`, an toàn đường dẫn, câu trả lời được lưu trước khi chấm) giữ nguyên.

## 1. Vì sao làm

Ngày 2026-10-30 Khue phỏng vấn vòng HR với EPAM và bị từ chối. Thư nêu 2 lý do: **tiếng Anh giao tiếp** và **kiến thức riêng của vị trí**. Trong buổi đó HR hỏi những câu phải vận dụng, không học thuộc được, ví dụ "làm SDK thì cần làm những gì" và "bạn giao tiếp với đồng nghiệp và khách hàng thế nào".

Trước buổi đó, Khue đã tập thử với Claude trong chat: hỏi từng câu bằng tiếng Anh, nhận xét nội dung và tiếng Anh. Cách này giúp tìm ra 4 lỗi tiếng Anh lặp lại và các câu trả lời quá ngắn, nhưng phải làm tay, không lưu lại, và không giống buổi phỏng vấn thật (nhận xét ngay sau mỗi câu, không có người hỏi sâu thêm).

App đã có gần đủ phần nền: ô trả lời nói hoặc gõ, Whisper chạy trên máy, Claude chấm và nhận xét tiếng Anh, danh mục ghi chú của tab Reading.

**Thành công nghĩa là:** Khue dán JD của một vị trí, chọn level và các vòng, trong khoảng 2 phút đã vào buổi phỏng vấn thử. Người phỏng vấn ảo đọc câu hỏi thành tiếng, Khue trả lời bằng giọng nói, bị hỏi sâu thêm như thật. Cuối buổi có báo cáo nói rõ đạt level chưa, yếu ở đâu và làm gì tiếp. Sau vài tuần, trang điểm yếu cho thấy lỗi nào đã giảm.

## 2. Mục tiêu, ngoài phạm vi, điều không được xảy ra

**Mục tiêu**

- Bước **thiết lập** một buổi: nguồn (JD, email HR hoặc văn bản bất kỳ), **level**, các **vòng**, chủ đề trong vault, có tìm thêm trên web hay không, có đọc to câu hỏi hay không.
- Các **vòng như công ty thật**: HR, kỹ thuật, system design, hành vi/Lead.
- **Câu hỏi vận dụng**: tình huống, cân nhắc lựa chọn, ghép kiến thức nền với Android. Không phải câu hỏi định nghĩa.
- **Người phỏng vấn ảo hỏi sâu thêm** khi câu trả lời còn thiếu hoặc chung chung.
- **Đọc to câu hỏi** để luyện cả nghe; trả lời bằng **ô chung nói hoặc gõ** đang có.
- **Báo cáo cuối buổi**: kết luận theo level, chấm từng câu, điểm yếu kèm ví dụ, câu trả lời mẫu, việc cần làm tiếp.
- **Lịch sử**: lưu thiết lập, toàn bộ hội thoại, câu trả lời (chữ và ghi âm), điểm và báo cáo.
- **Hỏi lại câu yếu** ở các buổi sau, và nút luyện lại ngay một câu.
- **Điểm yếu qua nhiều buổi**: lỗi nào lặp lại, đang giảm hay vẫn còn.
- **Nguồn kiến thức**: ghi chú trong vault là chính, **web** để lấp khoảng trống so với JD và tìm hiểu công ty.

**Ngoài phạm vi**

- Chấm phát âm (vẫn chỉ đọc chữ, như phần luyện nói hiện có).
- Hội thoại giọng nói liên tục, ngắt lời nhau. Buổi phỏng vấn đi theo lượt: hỏi, trả lời, hỏi tiếp.
- Video, camera, chia sẻ màn hình, bảng vẽ cho system design (trả lời bằng lời).
- Tự ghi vào vault hay tự thêm chủ đề vào Tutor. App chỉ gợi ý, Khue tự làm.
- Thay đổi điểm, mastery hay lịch ôn của point.

**Điều không được xảy ra**

- Người phỏng vấn ảo **dạy, gợi ý đáp án hoặc khen chê** giữa buổi.
- Thông tin về công ty lấy từ web được trình bày như sự thật mà không có link nguồn.
- Vòng kỹ thuật toàn câu hỏi trả lời được bằng cách đọc thuộc định nghĩa.
- Một lỗi (Claude hết lượt, timeout, Whisper lỗi, server khởi động lại) làm **mất câu trả lời** hoặc làm hỏng buổi phỏng vấn.
- Nội dung trang web làm Claude làm gì khác ngoài trả về JSON đã định.
- Ghi bất cứ thứ gì vào vault.
- Một buổi gọi Claude không giới hạn (vòng hỏi sâu vô tận).

## 3. Ràng buộc và số liệu

- Claude chạy bằng `claude -p` với gói Pro của Khue. Mỗi lần gọi tính vào lượt dùng.
- **Đã thử (2026-11-04):** `claude -p --tools WebSearch --allowedTools WebSearch` với `--json-schema` chạy được: 22 giây, 5 lượt, 3 lần tìm, trả đúng JSON. Kết quả cũng cho thấy web có thể cũ hoặc thiếu: nó báo Kotlin 2.4.0 là bản mới nhất, trong khi ghi chú của Khue đã nhắc 2.4.21.
- Ước tính (chưa đo): lên kế hoạch không có web khoảng 30 giây, có web 1–2 phút; mỗi lượt hỏi 7–15 giây; báo cáo 30–60 giây; một buổi 45 phút khoảng 20–30 lần gọi.
- Whisper large-v3-turbo trên M4 Max: đoạn 13 giây chuyển xong trong khoảng 2 giây (đã đo).
- Ghi âm: khoảng 0,5 MB mỗi phút (m4a 64 kbps), tự xoá sau 30 ngày.
- Đọc to bằng `speechSynthesis` của trình duyệt, dùng giọng có sẵn của macOS, miễn phí, chạy trên máy.
- Ngôn ngữ buổi phỏng vấn: **tiếng Anh**.

## 4. Cách làm (đã quyết)

### 4.1 Thiết lập một buổi

Trang **New mock interview** có:

- **Nguồn**: một ô văn bản để dán JD, email HR hoặc ghi chú bất kỳ về vị trí. Không bắt buộc, nhưng không có thì câu hỏi chung chung hơn.
- **Level**: Mid, Senior, Lead.
- **Các vòng**: chọn một hoặc nhiều trong HR, Technical, System design, Behavioral/Lead. Chạy theo thứ tự đó, như một quy trình tuyển dụng.
- **Chủ đề trong vault**: mặc định app tự chọn các topic của Roadmap khớp với JD; Khue thêm hoặc bỏ được.
- **Tìm trên web**: tắt / bật. Khi bật, bước lên kế hoạch được phép tìm kiếm (mục 4.3).
- **Đọc to câu hỏi**: bật mặc định.

Bấm **Prepare interview** thì app lên kế hoạch. Khi có tìm trên web, app hiện **phần đã tìm được kèm link** để Khue xem và bỏ mục không đúng, rồi mới bấm **Start**.

### 4.2 Các vòng

| Vòng | Người phỏng vấn | Hỏi về | Số câu chính |
|---|---|---|---|
| HR | Recruiter | Giới thiệu, vì sao đổi việc, vì sao công ty này, kỳ vọng, tiếng Anh, lương và đàm phán | 5 |
| Technical | Senior Android engineer | Câu hỏi vận dụng từ JD và ghi chú: tình huống, gỡ lỗi, cân nhắc lựa chọn, đào xuống tầng dưới | 5 |
| System design | Staff/Lead engineer | Một bài thiết kế mobile, hỏi theo từng bước: yêu cầu, kiến trúc, dữ liệu, mạng, offline, hiệu năng, bảo mật | 1 bài, nhiều câu hỏi nhỏ |
| Behavioral/Lead | Engineering manager | Xung đột, sai lầm, ra quyết định, dẫn dắt; Lead thì thêm mentoring, ưu tiên cho team, làm việc với các team khác | 4 |

Mỗi câu chính được **hỏi sâu thêm tối đa 2 lần**. Sau đó người phỏng vấn sang câu kế tiếp dù câu trả lời chưa đủ.

### 4.3 Nguồn kiến thức

- **JD / văn bản dán vào** luôn đi vào prompt.
- **Vault**: ghi chú lấy từ danh mục của tab Reading (đã phân loại theo topic và mức ưu tiên) và các point Tutor của các topic đã chọn. Chỉ ghép **đoạn liên quan**, có giới hạn tổng độ dài (con số để người xây quyết, mục 6). Ưu tiên ghi chú có mức ưu tiên cao.
- **Web** (khi bật), chỉ ở bước lên kế hoạch:
  - Claude được dùng **duy nhất** công cụ `WebSearch`. Không có công cụ nào khác, không đọc hay ghi file.
  - Tìm 2 thứ: **về công ty và quy trình phỏng vấn** của họ, và **kiến thức** cho các yêu cầu của JD mà vault chưa có.
  - Ưu tiên nguồn chính thức: developer.android.com, kotlinlang.org, source.android.com, blog kỹ thuật của các công ty lớn.
  - Kết quả trả về dạng có cấu trúc, mỗi mục có link. Lưu cùng buổi, buổi sau với cùng nguồn được dùng lại.
- **Mỗi câu hỏi ghi rõ nguồn**: ghi chú nào trong vault, hoặc trang web nào. Barem của câu hỏi dựa trên chính nguồn đó.

### 4.4 Các prompt

Bốn prompt, mỗi prompt trả JSON có schema, viết cùng kiểu với `server/prompts.ts` và `server/reading/prompts.ts`:

1. **Research** (chỉ khi bật web): đầu vào là JD, level, các vòng, danh sách topic vault đã có. Đầu ra: thông tin công ty, quy trình phỏng vấn của họ, các mảng kiến thức JD cần mà vault thiếu, mỗi mục có link.
2. **Plan**: đầu vào là JD, level, các vòng, đoạn ghi chú, kết quả research đã được Khue giữ lại, các câu đã hỏi ở buổi trước (để tránh), các câu yếu đến hạn hỏi lại. Đầu ra: mỗi vòng có vai người phỏng vấn, các năng lực cần đánh giá, danh sách câu chính. Mỗi câu có: lời hỏi, dạng câu (tình huống / lựa chọn / thiết kế / hành vi), nguồn, **barem ẩn theo level** (Mid cần nói gì, Senior thêm gì, Lead thêm gì), và 2–3 hướng hỏi sâu gợi ý.
3. **Turn** (sau mỗi câu trả lời): đầu vào là kế hoạch của vòng hiện tại, hội thoại của vòng đó, câu trả lời vừa có, số lần đã hỏi sâu. Đầu ra: lời người phỏng vấn nói tiếp, và hành động `followup` / `next` / `end_round`. Luôn đúng vai, câu ngắn, tiếng Anh tự nhiên, không dạy, không nhận xét. Server ép giới hạn hỏi sâu: khi đã hỏi 2 lần thì chỉ cho `next` hoặc `end_round`.
4. **Report** (cuối buổi): đầu vào là kế hoạch kèm barem, toàn bộ hội thoại kèm thời lượng từng câu nói, các lỗi tiếng Anh đã ghi ở buổi trước. Đầu ra như mục 4.7.

Câu chuyển giữa các vòng ("Thanks, that's all from my side. Next you'll talk to…") do prompt Turn viết khi trả `end_round`.

Câu trả lời được ghi là văn bản từ giọng nói thì prompt Turn và Report được báo như prompt chấm hiện có: từ có thể bị nghe nhầm, không nhận xét dấu câu.

### 4.5 Một buổi phỏng vấn chạy thế nào

- Trang phỏng vấn hiện: tên vòng và tiến độ ("Technical · question 2 of 5"), lời người phỏng vấn, nút nghe lại, ô trả lời chung, nút **Send answer**. Không có điểm hay nhận xét.
- Câu trả lời được **lưu trước** rồi mới gọi prompt Turn. Nếu gọi lỗi, trang báo lỗi và có nút **Try again**; câu trả lời vẫn còn.
- **Skip question**: bỏ qua câu hiện tại, ghi là đã bỏ qua.
- **End interview**: kết thúc sớm, báo cáo chỉ chấm phần đã trả lời.
- Đóng trình duyệt giữa chừng: mở lại thì tiếp tục đúng chỗ.
- **Nhận xét chỉ ở cuối buổi**, như phỏng vấn thật.

### 4.6 Đọc to câu hỏi

- Dùng `speechSynthesis`, giọng tiếng Anh tốt nhất có trên máy (ưu tiên giọng en-US hoặc en-GB loại "Enhanced" / "Premium" nếu có).
- Tự đọc khi câu hỏi hiện ra; có nút **Play again**. Chữ của câu hỏi vẫn hiện, nhưng Khue có thể bật **Hide text until I answer** để luyện nghe như thật.
- Trình duyệt không có `speechSynthesis` thì chỉ hiện chữ.

### 4.7 Báo cáo và phân tích điểm yếu

**Báo cáo một buổi**

- **Kết luận theo level**: đạt / chưa đạt mức đã chọn, và vì sao (2–3 câu).
- **Từng vòng, từng câu**: câu hỏi, câu trả lời (chữ và ghi âm), điểm 1–4 theo 5 mặt: **suy luận**, **độ sâu**, **cách trình bày**, **tiếng Anh**, **độ dài**; điều còn thiếu so với barem; câu trả lời mẫu.
- **3 điểm cần sửa nhất**, mỗi điểm kèm ví dụ lấy từ chính câu trả lời của Khue.
- **Việc làm tiếp**: link tới ghi chú vault và chủ đề Tutor liên quan; câu mẫu để tập nói to; mảng vault còn thiếu kèm link web để viết ghi chú mới; buổi sau nên tập trung vào đâu.

**Điểm yếu qua nhiều buổi**: trang **Weak spots** gom các điểm yếu theo loại (nội dung, theo level, tiếng Anh, cách nói), đếm số buổi gặp lại, và cho thấy xu hướng (đang giảm / vẫn còn). Một điểm yếu chỉ được coi là lặp lại khi xuất hiện ở ít nhất 2 buổi.

### 4.8 Lịch sử và hỏi lại

- Trang **Mock interview** liệt kê các buổi đã làm (ngày, vị trí, level, các vòng, kết luận), nút **New mock interview** và link tới **Weak spots**.
- Lưu: thiết lập, kết quả research, kế hoạch, toàn bộ hội thoại, câu trả lời (chữ, id ghi âm, thời lượng), báo cáo.
- **Không lặp lại câu cũ**: prompt Plan nhận danh sách câu đã hỏi để tránh.
- **Hỏi lại câu yếu**: câu có điểm suy luận hoặc độ sâu từ 2 trở xuống được đưa vào hàng đợi; sau ít nhất 3 ngày, mỗi buổi cùng loại vòng lấy tối đa 2 câu trong hàng đợi để hỏi lại, bằng chính câu đó hoặc một tình huống khác cùng kiến thức.
- Trong báo cáo, mỗi câu có nút **Practice again**: trả lời lại ngay một câu, được chấm riêng và hiện cạnh lần trước.

### 4.9 Dữ liệu

Các buổi phỏng vấn lưu trong **file riêng `interviews.json`** cạnh `state.json` trong thư mục dữ liệu của app, ghi nguyên tử và có sao lưu hằng ngày như `state.json`, vì hội thoại làm file lớn nhanh.

```ts
interface InterviewSession {
  id: string; created: string // YYYY-MM-DD
  setup: { source: string; level: 'mid' | 'senior' | 'lead'; rounds: RoundKind[]; topics: string[]; web: boolean; readAloud: boolean }
  research?: { items: { kind: 'company' | 'process' | 'knowledge'; text: string; url: string; kept: boolean }[] }
  plan?: { rounds: { kind: RoundKind; persona: string; competencies: string[]; questions: PlannedQuestion[] }[] }
  turns: { round: number; q: string; from: 'interviewer' | 'candidate'; text: string; voice?: Voice; skipped?: boolean; at: string }[]
  state: 'setup' | 'researching' | 'review' | 'planning' | 'running' | 'reporting' | 'done'
  current?: { round: number; q: string; followups: number }
  report?: InterviewReport
  error?: { code: 'limit' | 'auth' | 'failed'; message: string }
}
type RoundKind = 'hr' | 'technical' | 'system_design' | 'behavioral'
interface PlannedQuestion { q: string; prompt: string; type: 'scenario' | 'tradeoff' | 'design' | 'behavioral' | 'hr'
  source: { vault?: string; url?: string }; rubric: { mid: string[]; senior: string[]; lead: string[] }; probes: string[]; reask?: string }
```

Hàng đợi hỏi lại và dữ liệu Weak spots được tính lại từ các báo cáo, không lưu riêng (trừ khi người xây thấy cần cache).

### 4.10 API

| Route | Việc |
|---|---|
| `GET /api/interviews` | danh sách buổi |
| `POST /api/interview` | tạo buổi từ thiết lập; chạy research nếu bật, nếu không thì lên kế hoạch luôn |
| `POST /api/interview/research` | lưu các mục research Khue giữ lại, rồi lên kế hoạch |
| `GET /api/interview?id=` | một buổi |
| `POST /api/interview/answer` | lưu câu trả lời (chữ, voice), gọi prompt Turn |
| `POST /api/interview/skip` | bỏ qua câu hiện tại |
| `POST /api/interview/retry` | chạy lại bước bị lỗi |
| `POST /api/interview/finish` | kết thúc, tạo báo cáo |
| `POST /api/interview/practice` | luyện lại một câu từ báo cáo |
| `GET /api/interview/weak-spots` | điểm yếu qua nhiều buổi |

Cùng quy tắc bảo mật với các route hiện có (chỉ `localhost`, POST phải cùng Origin).

### 4.11 Ghi âm

Ghi âm của câu trả lời trong buổi phỏng vấn dùng `speech.ts` hiện có và **tự xoá sau 30 ngày** như mọi ghi âm khác (Khue chốt 2026-11-04). Chữ, điểm và báo cáo giữ mãi. Báo cáo của buổi cũ hơn 30 ngày vẫn hiện đầy đủ, chỉ không còn nút nghe lại.

### 4.12 Trường hợp biên (đã quyết)

- Không dán nguồn nào: lên kế hoạch từ level, các vòng và topic vault.
- Bật web nhưng tìm lỗi hoặc không ra gì: báo cho Khue và cho tiếp tục không có web.
- Claude hết lượt giữa buổi: dừng ở câu đó, câu trả lời đã lưu, có **Try again**.
- Whisper lỗi: như ô trả lời hiện có (giữ ghi âm, **Try again**, hoặc gõ).
- Câu trả lời trống: không cho gửi; muốn bỏ thì dùng **Skip question**.
- Server khởi động lại khi đang chờ Claude: bước đó bị coi là lỗi, có **Try again**.
- Một buổi đang chạy dở và Khue tạo buổi mới: được, buổi cũ vẫn tiếp tục được.

## 5. Kiểm thử

- Server: dùng Claude giả như các test hiện có. Kiểm tra lưu câu trả lời trước khi gọi Claude, giới hạn 2 lần hỏi sâu, thứ tự các vòng, kết thúc sớm, tiếp tục sau khi khởi động lại, hàng đợi hỏi lại, tránh câu cũ, research chỉ bật `WebSearch`.
- Prompt: test nội dung prompt có đủ phần (JD, level, barem, câu cần tránh, cờ giọng nói).
- UI: luồng thiết lập → phỏng vấn → báo cáo với API giả; đọc to bằng `speechSynthesis` giả.
- Không test nào gọi Claude thật hay chạm vault thật.
- Thử thật cuối cùng: một buổi ngắn 1 vòng với Claude và Whisper thật, trên bản sao dữ liệu.

## 6. Để người xây quyết

- Giới hạn độ dài đoạn ghi chú đưa vào prompt Plan, và cách chọn đoạn liên quan.
- Câu chữ cụ thể của 4 prompt và mô tả vai người phỏng vấn.
- Bố cục chi tiết các trang, theo đúng hướng thiết kế hiện tại của app (một việc chính mỗi màn hình, ô trả lời chung).
- Chọn giọng đọc mặc định trong `speechSynthesis`.
- Có cache dữ liệu Weak spots hay tính lại mỗi lần.
- Cách tách file và hàm trong `server/interview/`.

## 7. Các điểm mình (Claude) tự quyết, Khue kiểm tra giúp

- **Nhận xét chỉ ở cuối buổi**, không nhận xét sau mỗi câu.
- **Các vòng và số câu** ở mục 4.2, và vòng HR có cả **lương và đàm phán**.
- **Các level**: Mid, Senior, Lead.
- **Tối đa 2 lần hỏi sâu** mỗi câu chính.
- **Barem theo level** do prompt Plan viết cho từng câu. Barem chung cho từng level (Senior khác Lead thế nào) sẽ được soạn từ cách các công ty thật đánh giá, Khue duyệt trước khi dùng.
- **Hỏi lại câu yếu**: điểm từ 2 trở xuống, sau ít nhất 3 ngày, tối đa 2 câu mỗi buổi.
- **Lưu riêng `interviews.json`**.
- Buổi phỏng vấn **bằng tiếng Anh**.
- **Menu có thêm mục "Interview"** cạnh Today, Reading, Topics, Progress.
- **Phỏng vấn thử không tính vào Today** và không ảnh hưởng chuỗi ngày học.
- **Prompt Turn được xem barem và hướng hỏi sâu của câu hiện tại** để biết câu trả lời còn thiếu gì, nhưng không bao giờ nói ra barem.
- **Practice again** được chấm bằng một prompt nhỏ dùng cùng 5 mặt điểm của báo cáo, chỉ cho một câu.
- **Danh sách lịch sử** xếp buổi mới nhất lên đầu, kèm link tới Weak spots (Khue chưa nói muốn thấy gì đầu tiên).
- **Barem chung theo level** là việc đầu tiên trong kế hoạch: soạn bản nháp từ nguồn công khai về cách đánh giá Android Senior/Lead, kèm link, để Khue duyệt.
