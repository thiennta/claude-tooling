import { readSheet } from '../utils/google-sheets-client.js';

export interface SheetSpecResult {
  sheetUrl:  string;
  sheetName: string;
  rows:      string[][];
  rowCount:  number;
}

export async function readSheetSpec(
  sheetUrl:  string,
  sheetName?: string,
): Promise<SheetSpecResult> {
  const result = await readSheet(sheetUrl, sheetName);

  // Lọc bỏ rows rỗng hoàn toàn
  const rows = result.rows.filter(row => row.some(cell => cell?.trim()));

  return {
    sheetUrl,
    sheetName: result.sheetName,
    rows,
    rowCount:  rows.length,
  };
}
