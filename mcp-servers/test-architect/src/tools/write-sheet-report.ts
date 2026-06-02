import { writeSheet, readSheetByName } from '../utils/google-sheets-client.js';

export interface ScenarioRow {
  testName:  string;
  type:      string;
  expected:  string;
  notes?:    string;
}

export interface WriteSheetReportResult {
  sheetUrl:  string;
  sheetName: string;
  rowCount:  number;
}

export interface ReadBackResult {
  rows:      string[][];
  scenarios: ScenarioRow[];
}

export async function writeSheetReport(
  sheetUrl:  string,
  module:    string,
  date:      string,
  scenarios: ScenarioRow[],
): Promise<WriteSheetReportResult> {
  const sheetName = `${module}_${date}`;

  const header = ['Test Name', 'Type', 'Expected', 'Notes'];
  const rows   = [
    header,
    ...scenarios.map(s => [s.testName, s.type, s.expected, s.notes ?? '']),
  ];

  const url = await writeSheet(sheetUrl, sheetName, rows);

  return { sheetUrl: url, sheetName, rowCount: scenarios.length };
}

export async function readBackSheet(
  sheetUrl:  string,
  sheetName: string,
): Promise<ReadBackResult> {
  const rows = await readSheetByName(sheetUrl, sheetName);

  // Bỏ header row, lọc row rỗng
  const dataRows = rows.slice(1).filter(row => row.some(cell => cell?.trim()));

  const scenarios: ScenarioRow[] = dataRows.map(row => ({
    testName: row[0] ?? '',
    type:     row[1] ?? '',
    expected: row[2] ?? '',
    notes:    row[3] ?? '',
  }));

  return { rows: dataRows, scenarios };
}
