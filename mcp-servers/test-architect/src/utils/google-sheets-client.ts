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

  return `${sheetUrl}#gid=${sheetId}`;
}

// Kẻ ô + bôi đậm header + đóng băng header + auto-resize cột cho dễ nhìn.
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
        // Auto-resize cột cho vừa nội dung
        {
          autoResizeDimensions: {
            dimensions: { sheetId, dimension: 'COLUMNS', startIndex: 0, endIndex: numCols },
          },
        },
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
