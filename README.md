# claude-tooling

Shared Claude Code commands và MCP servers cho team NTA.

## Cài đặt

**Yêu cầu:** Node.js 18+

```bash
git clone <repo-url> claude-tooling
cd claude-tooling

# (Tùy chọn) Đặt file client_secret.json vào thư mục này nếu dùng Google Sheets
node setup.js
```

Restart Claude Code — các commands sẵn sàng dùng ngay.

> **Google Sheets:** Nếu có `client_secret.json`, `setup.js` sẽ tự cấu hình OAuth và mở browser để login Google (một lần duy nhất per máy).

## Cập nhật

```bash
cd claude-tooling && git pull && node setup.js
```

---

## Commands

| Command | Dùng cho |
|---------|----------|
| `/test-ui` | Sinh Playwright **UI/E2E tests** từ spec + source FE |
| `/test-api` | Sinh Playwright **API tests** từ spec + source BE |

### `/test-ui` — UI/E2E tests

Chạy trên **frontend** project. Dùng Playwright `page` fixture (browser).

```
/test-ui                              # Toàn bộ project
/test-ui --module <tên>               # Chỉ module cụ thể
/test-ui --project <path>             # Chỉ định FE project path
/test-ui --spec <path>                # Chỉ định spec file hoặc thư mục
/test-ui --run                        # Sinh test và chạy luôn
/test-ui --coverage                   # Chỉ xem gap analysis, không sinh file

# Google Sheets
/test-ui --sheet-spec <url>           # Đọc spec từ Google Sheet
/test-ui --sheet-report <url>         # Ghi test scenarios ra Sheet để tester review
/test-ui --sheet-spec <url> --sheet-report <url> --run   # Đầy đủ
```

### `/test-api` — API tests

Chạy trên **backend** project. Dùng Playwright `request` fixture (no browser).  
BE server phải đang chạy trước khi test (`reuseExistingServer: true`).

```
/test-api                             # Toàn bộ project
/test-api --module <tên>              # Chỉ module cụ thể
/test-api --project <path>            # Chỉ định BE project path
/test-api --run                       # Sinh test và chạy luôn

# Google Sheets
/test-api --sheet-spec <url>          # Đọc spec từ Google Sheet
/test-api --sheet-report <url>        # Ghi test scenarios ra Sheet để tester review
```

---

## Google Sheets Integration

Cho phép đọc spec từ Google Sheet và ghi test scenarios ra Sheet để tester review trước khi chạy.

### Setup (một lần per máy)

1. Liên hệ team lead để nhận file `client_secret.json`
2. Đặt file vào thư mục `claude-tooling/`
3. Chạy `node setup.js` → tự mở browser để login Google
4. Restart Claude Code

### Đọc spec từ Sheet (`--sheet-spec`)

Sheet không yêu cầu format cố định — Claude tự đọc hiểu nội dung bất kể format.  
URL hỗ trợ `#gid=` để chỉ đúng tab:

```
/test-ui --sheet-spec "https://docs.google.com/spreadsheets/d/...#gid=919104215"
```

CHECKPOINT 1 sẽ hiển thị những gì Claude hiểu từ Sheet để confirm trước khi tiếp tục.

### Ghi kịch bản ra Sheet (`--sheet-report`)

Sau khi sinh test, Claude ghi scenarios ra một tab mới trong Sheet và **dừng lại** chờ tester review.

Tester có thể:
- **Xóa row** → test case đó sẽ bị `test.skip()`
- **Sửa nội dung** (Expected, Test Name) → Claude update assertion tương ứng
- Ghi chú vào cột `Notes` (Claude không đọc cột này)

Sau khi nhấn Enter → Claude đọc lại Sheet và sync test file theo nội dung đã review.

| Column | Mô tả |
|--------|-------|
| Test Name | Tên test case |
| Type | `happy_path` / `error_case` / `validation` / `missing` |
| Expected | Expected text hoặc URL |
| Notes | Ghi chú tester (không ảnh hưởng test) |
| Result | Kết quả sau khi chạy (`--run`): `✅ PASS` / `❌ FAIL` / `⊘ SKIP`, fail kèm category |

Khi chạy với `--sheet-report --run`: sau khi test xong, kết quả được ghi **ngược lại chính tab đó** ở cột **Result** (match theo Test Name) — đồng thời vẫn có HTML report đầy đủ kèm evidence.

---

## Report

Đường dẫn: `test-architect-reports/<module>_<timestamp>.html`

Report bao gồm:
- Summary: requirements, tests generated, expected pass/fail
- Selector Stability: stable / medium / fragile / skipped
- Gap Analysis: matched / missing / undocumented
- Test Results: danh sách tất cả test cases (pass ✓ / fail ✗ / skip ○) với filter bar
- Evidence: screenshot nhúng trực tiếp khi test fail

---

## MCP Tools

### Shared — dùng cho cả UI và API

| Tool | Mô tả |
|------|-------|
| `scan_specs` | Tìm spec/requirement files (markdown) trong project |
| `parse_markdown_spec` | Extract features, scenarios, expected outcomes từ Markdown spec |
| `detect_spec_conflicts` | Phát hiện scenarios trùng lặp hoặc mâu thuẫn giữa nhiều spec files |
| `gap_analysis` | So sánh spec vs code → matched / missing / undocumented |
| `setup_playwright` | Cài đặt và cấu hình Playwright (tự patch `screenshot: only-on-failure`) |
| `run_tests` | Chạy Playwright tests, trả về kết quả đầy đủ kèm screenshots |
| `classify_results` | Phân loại test failures: `missing_testid` / `needs_mock` / `real_bug` / `timeout` |
| `generate_report` | Sinh HTML report với test list + evidence |

### UI-only — chỉ dùng cho `/test-ui`

| Tool | Mô tả |
|------|-------|
| `detect_ui_framework` | Detect FE framework (Nuxt, Next.js, Vue, React...) và base URL |
| `scan_ui_flows` | Scan pages/components để build flow map với UI element selectors |
| `scan_ui_validation` | Scan form validation rules (Zod, Yup, VeeValidate, HTML attrs) |

### API/BE-only — chỉ dùng cho `/test-api`

| Tool | Mô tả |
|------|-------|
| `detect_be_framework` | Detect BE framework (NestJS, Express, Laravel...) + DB client/type |
| `scan_api_routes` | Scan route/controller files → danh sách endpoints |
| `scan_api_flows` | Scan service layer → business flows với DB operations |

### Google Sheets — dùng khi có `--sheet-spec` / `--sheet-report`

| Tool | Mô tả |
|------|-------|
| `read_sheet_spec` | Đọc raw content từ Google Sheet (hỗ trợ `#gid=`) |
| `write_sheet_report` | Ghi test scenarios ra tab Sheet (có cột Result); gọi lại sau `--run` để điền kết quả |
| `read_back_sheet` | Đọc lại Sheet sau khi tester review (gồm cột Result) |

---

## Luồng hoạt động

### `/test-ui`
```
detect_ui_framework + scan_specs (hoặc read_sheet_spec)
        ↓
scan_ui_flows + scan_ui_validation + parse_markdown_spec
        ↓
detect_spec_conflicts  (nếu ≥ 2 spec files)
        ↓
CHECKPOINT 1 — xác nhận requirements + resolve conflicts
        ↓
gap_analysis
        ↓
CHECKPOINT 2 — conflict check với file test cũ
        ↓
sinh tests/feature/<module>.spec.ts → generate_report
        ↓ (nếu --sheet-report)
write_sheet_report → DỪNG chờ tester review → read_back_sheet → sync test file
        ↓ (nếu --run)
run_tests → classify_results → generate_report
        ↓ (nếu --sheet-report + --run)
write_sheet_report (điền cột Result vào tab cũ)
```

### `/test-api`
```
detect_be_framework + scan_specs (hoặc read_sheet_spec)
        ↓
scan_api_routes + scan_api_flows + parse_markdown_spec
        ↓
detect_spec_conflicts  (nếu ≥ 2 spec files)
        ↓
CHECKPOINT 1 — xác nhận BE info + resolve conflicts
        ↓
gap_analysis
        ↓
CHECKPOINT 2 — conflict check với file test cũ
        ↓
sinh e2e/api/<module>.api.spec.ts → generate_report
        ↓ (nếu --sheet-report)
write_sheet_report → DỪNG chờ tester review → read_back_sheet → sync test file
        ↓ (nếu --run)
run_tests → classify_results → generate_report
        ↓ (nếu --sheet-report + --run)
write_sheet_report (điền cột Result vào tab cũ)
```

---

## Spec conflict resolution

Khi có **≥ 2 spec files**, tool tự động detect và cho user chọn chiến lược tại CHECKPOINT 1:

| Chiến lược | Hành vi |
|------------|---------|
| `[1] first-file-wins` *(mặc định)* | Giữ scenario từ file tìm được trước |
| `[2] last-file-wins` | Giữ scenario từ file tìm được sau |
| `[3] merge` | Giữ tất cả — `gap_analysis` tự dedup exact duplicates |
| `[4] manual` | Hỏi từng conflict một (A / B / both) |
