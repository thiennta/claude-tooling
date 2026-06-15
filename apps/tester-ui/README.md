# AI Test Runner (desktop UI)

Giao diện desktop cho tester chạy **AI Test Architect** (`/test-ui`, `/test-api`)
mà không phải gõ flag khô khan. Tester chỉ điền link spec/Figma vào form, bấm
**Run**, rồi tương tác với Claude **y như CLI** — bao gồm đầy đủ các checkpoint —
ngay trong terminal nhúng bên dưới.

## Kiến trúc (Cách 2)

```
┌─────────────────────────────────────────┐
│  Form: project / loại test / spec link / │   ← điền link thay vì gõ flag
│        module / options   [▶ Run]        │
├─────────────────────────────────────────┤
│  Terminal nhúng thật (xterm.js + PTY)    │   ← claude chạy ở đây
│  > checkpoint hiện ra, tester trả lời    │      checkpoint nguyên bản như CLI
└─────────────────────────────────────────┘
```

- **xterm.js** hiển thị terminal, **node-pty** cấp một PTY (ConPTY trên Windows)
  thật → TUI/checkpoint của Claude Code render đúng (textbox thường sẽ làm vỡ).
- Form ghép sẵn lệnh `claude "/test-ui --figma-spec ... --module ..."` rồi bơm vào
  PTY. `claude <prompt>` khởi động phiên **tương tác** với prompt ban đầu.

## Cài đặt

```bash
cd apps/tester-ui
npm install        # tự chạy postinstall để tải prebuilt node-pty cho Electron
npm start
```

Không cần Visual Studio C++ Build Tools — dùng prebuilt binary
(`@homebridge/node-pty-prebuilt-multiarch`). Electron được ghim **29.4.6**
(ABI electron-v121) để khớp prebuilt; nếu nâng Electron, đảm bảo có prebuilt
electron-vXXX tương ứng.

Nếu terminal không mở được (lỗi ABI), chạy lại bước tải binary:

```bash
cd node_modules/@homebridge/node-pty-prebuilt-multiarch
npx prebuild-install -r electron -t 29.4.6 --tag-prefix v
```

## Đóng gói thành .exe — sinh ngay trên máy tester

**Không ship sẵn folder build.** Khi tester chạy `node setup.js` ở repo gốc, nó sẽ
tự `npm install` + `npm run dist` trong thư mục này → tạo
`dist/AI Test Runner-win32-x64/AI Test Runner.exe` **trên máy họ** và tạo luôn
shortcut ngoài Desktop. (Điều kiện: máy đã có Node.js — `setup.js` đã kiểm tra.)

Build thủ công nếu cần:

```bash
npm run dist   # → dist/AI Test Runner-win32-x64/AI Test Runner.exe
```

Dùng `@electron/packager` (`--prune=false` để giữ binary `*.node` của node-pty,
`--asar=false` để xterm load đúng đường dẫn). Không ký số → lần đầu chạy có thể
gặp SmartScreen, bấm *More info → Run anyway*.

## Yêu cầu trên máy tester (giống mọi cách chạy local)

- Node.js + đã `npm install` trong thư mục này
- **Claude Code CLI** đã cài và đăng nhập / có `ANTHROPIC_API_KEY` (gõ `claude` chạy được)
- Project cần test + MCP server `test-architect` (đã cấu hình trong `.claude/`)
- Playwright/Chromium nếu dùng `--run`

## Lưu ý kỹ thuật

- App tự strip biến `ELECTRON_RUN_AS_NODE` khỏi shell con để `claude`/node trong
  terminal chạy bình thường (biến này chỉ xuất hiện khi app được khởi động từ bên
  trong một tiến trình Electron khác, vd Claude Code).
- Giá trị có khoảng trắng được bọc nháy kép; toàn bộ prompt bọc nháy đơn
  PowerShell nên nháy kép bên trong được giữ nguyên khi truyền cho `claude`.
