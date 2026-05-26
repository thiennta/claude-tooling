# claude-tooling

Shared Claude Code commands và MCP servers cho team NTA.

## Cài đặt (mọi máy Windows/macOS/Linux)

**Yêu cầu:** Node.js 18+

```bash
git clone <repo-url> claude-tooling
cd claude-tooling
node setup.js
```

Sau đó **restart Claude Code** — `/test-architect` sẵn sàng dùng ngay.

## Cập nhật

```bash
cd claude-tooling
git pull
node setup.js
```

---

## Nội dung

| Thành phần | Mô tả |
|------------|-------|
| `commands/test-architect.md` | Slash command `/test-architect` — sinh Playwright E2E tests từ spec |
| `mcp-servers/test-architect/` | MCP server cung cấp các tools phân tích spec, code và sinh test |

---

## Dùng `/test-architect`

```
/test-architect                    # Toàn bộ project
/test-architect --module <tên>     # Chỉ module cụ thể
/test-architect --run              # Sinh test và chạy luôn
/test-architect --coverage         # Chỉ xem gap analysis
```

---

## Luồng hoạt động

```
scan_specs
    └─► parse_markdown_spec (mỗi file)
            └─► detect_spec_conflicts  ← NEW (khi có ≥ 2 spec files)
                    │
                    ▼
            CHECKPOINT 1 — hiển thị requirements + conflicts, đợi confirm
                    │
                    ▼
            detect_framework + scan_code_flows + scan_validation_rules
                    │
                    ▼
            gap_analysis  (safety-net dedup tự động)
                    │
                    ▼
            CHECKPOINT 2 — hiển thị gap report, đợi confirm
                    │
                    ▼
            generate_report → sinh file Playwright .spec.ts
```

---

## MCP Tools

| Tool | Mô tả |
|------|-------|
| `detect_framework` | Phát hiện framework (Next.js, Nuxt, Vite…) và base URL |
| `scan_specs` | Quét các spec/requirement files trong project |
| `parse_markdown_spec` | Trích xuất features, scenarios, expected outcomes từ Markdown spec |
| `detect_spec_conflicts` | **[MỚI]** So sánh cross-file để tìm scenarios trùng lặp (`duplicate`) hoặc mâu thuẫn (`conflict`) giữa nhiều spec files |
| `scan_code_flows` | Quét code để tìm các route/flow đã implement |
| `scan_validation_rules` | Phát hiện validation rules trong code (regex, zod, yup…) |
| `gap_analysis` | So sánh spec requirements vs code flows → matched / missing / undocumented |
| `generate_report` | Sinh file Playwright `.spec.ts` từ kết quả phân tích |
| `setup_playwright` | Cài đặt và cấu hình Playwright nếu chưa có |
| `run_tests` | Chạy Playwright tests và trả về kết quả |
| `classify_results` | Phân loại kết quả test (pass/fail/flaky) |

---

## Phát hiện và giải quyết conflict giữa nhiều spec files

Khi project có **từ 2 spec files trở lên**, `/test-architect` tự động chạy `detect_spec_conflicts` để phát hiện:

- **`conflict`** — cùng scenario (description tương tự nhau), nhưng `expectedText` hoặc `expectedURL` **khác nhau** giữa các file
- **`duplicate`** — cùng scenario, cùng expected outcome (trùng lặp hoàn toàn)

Kết quả được hiển thị tại **CHECKPOINT 1** và user chọn một trong 4 chiến lược resolve:

| Chiến lược | Hành vi |
|------------|---------|
| `[1] first-file-wins` *(mặc định)* | Giữ scenario từ spec file xuất hiện trước, loại bỏ phiên bản sau |
| `[2] last-file-wins` | Giữ scenario từ spec file xuất hiện sau cùng |
| `[3] merge` | Giữ tất cả — duplicate sẽ được dedup bởi `gap_analysis`, conflict giữ cả hai outcomes |
| `[4] manual` | Hỏi từng conflict một (A / B / both); duplicate tự động áp dụng first-file-wins |

> **Safety net:** `gap_analysis` luôn dedup các scenario có description giống hệt nhau trước khi phân tích, bất kể chiến lược nào được chọn.
