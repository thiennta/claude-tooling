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

  // Tạo tab mới nếu chưa có
  const meta       = await sheets.spreadsheets.get({ spreadsheetId });
  const existingTab = meta.data.sheets?.find(
    s => s.properties?.title === sheetName
  );

  if (!existingTab) {
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId,
      requestBody: {
        requests: [{ addSheet: { properties: { title: sheetName } } }],
      },
    });
  }

  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range:            `${sheetName}!A1`,
    valueInputOption: 'RAW',
    requestBody:      { values: rows },
  });

  return `${sheetUrl}#gid=${existingTab?.properties?.sheetId ?? 0}`;
}

export async function readSheetByName(
  sheetUrl: string,
  sheetName: string,
): Promise<string[][]> {
  const { rows } = await readSheet(sheetUrl, sheetName);
  return rows;
}
