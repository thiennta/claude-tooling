import { google } from 'googleapis';
import { getAuthClient } from './google-auth.js';

function parseSpreadsheetId(sheetUrl: string): string {
  const match = sheetUrl.match(/\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/);
  if (!match) throw new Error(`URL không hợp lệ: ${sheetUrl}`);
  return match[1];
}

// Parse gid từ URL fragment (#gid=919104215) hoặc query param (?gid=...)
function parseGid(sheetUrl: string): number | null {
  const hashMatch  = sheetUrl.match(/[#&?]gid=(\d+)/);
  return hashMatch ? parseInt(hashMatch[1], 10) : null;
}

export async function readSheet(
  sheetUrl: string,
  sheetName?: string,
): Promise<{ spreadsheetId: string; sheetName: string; rows: string[][] }> {
  const spreadsheetId = parseSpreadsheetId(sheetUrl);
  const auth   = await getAuthClient();
  const sheets = google.sheets({ version: 'v4', auth });

  let resolvedSheetName = sheetName;

  if (!resolvedSheetName) {
    // Luôn lấy metadata để resolve gid hoặc lấy tab đầu tiên
    const meta       = await sheets.spreadsheets.get({ spreadsheetId });
    const allSheets  = meta.data.sheets ?? [];
    const gid        = parseGid(sheetUrl);

    if (gid !== null) {
      // Tìm tab theo gid
      const matched = allSheets.find(s => s.properties?.sheetId === gid);
      if (matched?.properties?.title) {
        resolvedSheetName = matched.properties.title;
      } else {
        throw new Error(`Không tìm thấy tab với gid=${gid} trong spreadsheet.`);
      }
    } else {
      // Không có gid → dùng tab đầu tiên
      resolvedSheetName = allSheets[0]?.properties?.title ?? 'Sheet1';
    }
  }

  const range = `${resolvedSheetName}!A1:Z1000`;
  const res   = await sheets.spreadsheets.values.get({ spreadsheetId, range });

  return {
    spreadsheetId,
    sheetName: resolvedSheetName,
    rows: (res.data.values as string[][] | null) ?? [],
  };
}

export async function writeSheet(
  sheetUrl: string,
  sheetName: string,
  rows: string[][],
): Promise<string> {
  const spreadsheetId = parseSpreadsheetId(sheetUrl);
  const auth   = await getAuthClient();
  const sheets = google.sheets({ version: 'v4', auth });

  // Tạo tab mới nếu chưa có — và lấy sheetId (cần cho phần format)
  const meta        = await sheets.spreadsheets.get({ spreadsheetId });
  const existingTab = meta.data.sheets?.find(s => s.properties?.title === sheetName);

  let sheetId = existingTab?.properties?.sheetId ?? null;
  if (sheetId === null) {
    const added = await sheets.spreadsheets.batchUpdate({
      spreadsheetId,
      requestBody: { requests: [{ addSheet: { properties: { title: sheetName } } }] },
    });
    sheetId = added.data.replies?.[0]?.addSheet?.properties?.sheetId ?? 0;
  }

  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range:            `${sheetName}!A1`,
    valueInputOption: 'RAW',
    requestBody:      { values: rows },
  });

  await formatSheet(sheets, spreadsheetId, sheetId, rows.length, rows[0]?.length ?? 1);

  // Cắt bỏ #gid=... và ?gid=... cũ trong sheetUrl (nếu có) trước khi nối gid của tab vừa ghi,
  // tránh link bị lặp gid (vd: ...edit?gid=0#gid=0#gid=123).
  const baseUrl = sheetUrl.split('#')[0].replace(/[?&]gid=\d+$/, '');
  return `${baseUrl}#gid=${sheetId}`;
}

// Kẻ ô + bôi đậm header + đóng băng header + auto-resize cột + tô màu cột Result cho dễ nhìn.
async function formatSheet(
  sheets: ReturnType<typeof google.sheets>,
  spreadsheetId: string,
  sheetId: number,
  numRows: number,
  numCols: number,
): Promise<void> {
  if (numRows < 1 || numCols < 1) return;

  const border = { style: 'SOLID' as const, width: 1, color: { red: 0.7, green: 0.7, blue: 0.7 } };
  const fullRange = { sheetId, startRowIndex: 0, endRowIndex: numRows, startColumnIndex: 0, endColumnIndex: numCols };

  // Số conditional format rule đang có trên sheet này — xóa hết trước khi thêm lại,
  // tránh chồng rule khi writeSheet được gọi nhiều lần (STEP 3b ghi scenario, STEP 5d ghi lại Result).
  const meta = await sheets.spreadsheets.get({
    spreadsheetId,
    fields: 'sheets(properties.sheetId,conditionalFormats)',
  });
  const existingRuleCount = meta.data.sheets?.find(s => s.properties?.sheetId === sheetId)
    ?.conditionalFormats?.length ?? 0;

  const resultColIndex = numCols - 1;
  const resultRange = {
    sheetId,
    startRowIndex: 1, endRowIndex: numRows,
    startColumnIndex: resultColIndex, endColumnIndex: resultColIndex + 1,
  };

  const conditionRule = (text: string, color: { red: number; green: number; blue: number }) => ({
    addConditionalFormatRule: {
      rule: {
        ranges: [resultRange],
        booleanRule: {
          condition: { type: 'TEXT_CONTAINS' as const, values: [{ userEnteredValue: text }] },
          format: { backgroundColor: color },
        },
      },
      index: 0,
    },
  });

  await sheets.spreadsheets.batchUpdate({
    spreadsheetId,
    requestBody: {
      requests: [
        // Header: in đậm + nền xanh nhạt + canh giữa dọc
        {
          repeatCell: {
            range: { sheetId, startRowIndex: 0, endRowIndex: 1, startColumnIndex: 0, endColumnIndex: numCols },
            cell: {
              userEnteredFormat: {
                textFormat: { bold: true },
                backgroundColor: { red: 0.85, green: 0.91, blue: 0.97 },
                verticalAlignment: 'MIDDLE',
              },
            },
            fields: 'userEnteredFormat(textFormat,backgroundColor,verticalAlignment)',
          },
        },
        // Kẻ ô toàn bộ vùng dữ liệu (viền ngoài + lưới trong)
        {
          updateBorders: {
            range: fullRange,
            top: border, bottom: border, left: border, right: border,
            innerHorizontal: border, innerVertical: border,
          },
        },
        // Đóng băng dòng header
        {
          updateSheetProperties: {
            properties: { sheetId, gridProperties: { frozenRowCount: 1 } },
            fields: 'gridProperties.frozenRowCount',
          },
        },
        // Auto-resize cột cho vừa nội dung (cột enum ngắn: Result)
        {
          autoResizeDimensions: {
            dimensions: { sheetId, dimension: 'COLUMNS', startIndex: 0, endIndex: numCols },
          },
        },
        // Test Name / Type / Expected / Notes / Result chứa văn bản dài hoặc dễ bị ngắt giữa từ
        // — đặt độ rộng cố định thay vì auto-resize (sẽ làm cột quá khổ hoặc chữ bị che), kèm wrap text để xuống dòng trong ô.
        ...[
          { col: 0, width: 380 }, // Test Name
          { col: 1, width: 200 }, // Type
          { col: 2, width: 400 }, // Expected
          { col: 3, width: 200 }, // Notes
          { col: 4, width: 200 }, // Result
        ]
          .filter(({ col }) => col < numCols)
          .map(({ col, width }) => ({
            updateDimensionProperties: {
              range: { sheetId, dimension: 'COLUMNS' as const, startIndex: col, endIndex: col + 1 },
              properties: { pixelSize: width },
              fields: 'pixelSize',
            },
          })),
        {
          repeatCell: {
            range: { sheetId, startRowIndex: 0, endRowIndex: numRows, startColumnIndex: 0, endColumnIndex: numCols },
            cell: { userEnteredFormat: { wrapStrategy: 'WRAP' } },
            fields: 'userEnteredFormat.wrapStrategy',
          },
        },
        // Xóa rule cũ (nếu có) rồi thêm lại rule tô màu Result: PASS xanh / FAIL đỏ / SKIP xám
        ...Array.from({ length: existingRuleCount }, () => ({ deleteConditionalFormatRule: { sheetId, index: 0 } })),
        conditionRule('FAIL', { red: 0.96, green: 0.80, blue: 0.80 }),
        conditionRule('SKIP', { red: 0.93, green: 0.93, blue: 0.93 }),
        conditionRule('PASS', { red: 0.80, green: 0.94, blue: 0.80 }),
      ],
    },
  });
}

export async function readSheetByName(
  sheetUrl: string,
  sheetName: string,
): Promise<string[][]> {
  const { rows } = await readSheet(sheetUrl, sheetName);
  return rows;
}
