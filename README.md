# claude-tooling

Shared Claude Code commands và MCP servers cho team NTA.

## Cài đặt

**Yêu cầu:** Node.js 18+

```bash
git clone <repo-url> claude-tooling
cd claude-tooling
node setup.js
```

Restart Claude Code — các commands sẵn sàng dùng ngay.

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
/test-ui                        # Toàn bộ project
/test-ui --module <tên>         # Chỉ module cụ thể
/test-ui --project <path>       # Chỉ định FE project path
/test-ui --run                  # Sinh test và chạy luôn
/test-ui --coverage             # Chỉ xem gap analysis, không sinh file
```

### `/test-api` — API tests

Chạy trên **backend** project. Dùng Playwright `request` fixture (no browser).  
BE server phải đang chạy trước khi test (`reuseExistingServer: true`).

```
/test-api                       # Toàn bộ project
/test-api --module <tên>        # Chỉ module cụ thể
/test-api --project <path>      # Chỉ định BE project path (thường khác FE)
/test-api --run                 # Sinh test và chạy luôn
```

---

## MCP Tools

### Shared — dùng cho cả UI và API

| Tool | Mô tả |
|------|-------|
| `scan_specs` | Tìm spec/requirement files (markdown) trong project |
| `parse_markdown_spec` | Extract features, scenarios, expected outcomes từ Markdown spec |
| `detect_spec_conflicts` | Phát hiện scenarios trùng lặp (`duplicate`) hoặc mâu thuẫn (`conflict`) giữa nhiều spec files |
| `gap_analysis` | So sánh spec vs code → matched / missing / undocumented |
| `setup_playwright` | Cài đặt và cấu hình Playwright nếu chưa có |
| `run_tests` | Chạy Playwright tests, trả về kết quả có cấu trúc |
| `classify_results` | Phân loại test failures: `missing_testid` / `needs_mock` / `real_bug` / `timeout` |
| `generate_report` | Sinh HTML report tổng hợp kết quả phân tích |

### UI-only — chỉ dùng cho `/test-ui`

| Tool | Mô tả |
|------|-------|
| `detect_ui_framework` | Detect FE framework (Nuxt, Next.js, Vue, React...) và base URL |
| `scan_ui_flows` | Scan pages/components để build flow map với UI element selectors |
| `scan_ui_validation` | Scan form validation rules (Zod, Yup, VeeValidate, HTML attrs) |

### API/BE-only — chỉ dùng cho `/test-api`

| Tool | Mô tả |
|------|-------|
| `detect_be_framework` | Detect BE framework (NestJS, Express, Laravel, Rails, Spring Boot, FastAPI, Django...) + DB client/type |
| `scan_api_routes` | Scan route/controller files → danh sách endpoints với method, path, auth hint |
| `scan_api_flows` | Scan service layer → business flows với DB operations (dùng lại cho `/test-db` sau này) |

---

## Luồng hoạt động

### `/test-ui`
```
detect_ui_framework + scan_specs
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
sinh tests/feature/<module>.spec.ts  →  generate_report
        ↓ (nếu --run)
run_tests → classify_results → generate_report
```

### `/test-api`
```
detect_be_framework + scan_specs
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
sinh e2e/api/<module>.api.spec.ts  →  generate_report
        ↓ (nếu --run)
run_tests → classify_results → generate_report
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
