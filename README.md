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

## Nội dung

| Thành phần | Mô tả |
|------------|-------|
| `commands/test-architect.md` | Slash command `/test-architect` — sinh Playwright E2E tests từ spec |
| `mcp-servers/test-architect/` | MCP server cung cấp tools: detect_framework, scan_specs, scan_code_flows, ... |

## Dùng `/test-architect`

```
/test-architect --module <tên>     # Chỉ module cụ thể
/test-architect --run              # Sinh test và chạy luôn
/test-architect --coverage         # Chỉ xem gap analysis
/test-architect                    # Toàn bộ project
```
