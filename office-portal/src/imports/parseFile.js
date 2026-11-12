import { LIMITS, parseCSV, tableFromRows, validateFile } from './importModel.js';

// Bound the ZIP container before handing it to the XLSX parser. No extraction,
// filesystem writes, external relationships or network requests are performed.
/** @param {ArrayBuffer} buffer */
export function inspectXlsxZip(buffer) {
  const view = new DataView(buffer);
  if (view.byteLength < 22 || view.getUint32(0, true) !== 0x04034b50) throw new Error('This is not a valid XLSX workbook.');
  let end = -1;
  for (let i = view.byteLength - 22; i >= Math.max(0, view.byteLength - 65557); i--) {
    if (view.getUint32(i, true) === 0x06054b50 && i + 22 + view.getUint16(i + 20, true) === view.byteLength) { end = i; break; }
  }
  if (end < 0) throw new Error('The XLSX file is damaged or incomplete.');
  const count = view.getUint16(end + 10, true);
  const offset = view.getUint32(end + 16, true);
  const length = view.getUint32(end + 12, true);
  if (view.getUint32(end + 4, true) !== 0 || view.getUint16(end + 8, true) !== count || count > 200 || offset + length !== end) throw new Error('This workbook is too complex or uses an unsupported ZIP format.');
  let pos = offset; let expanded = 0; const names = new Set();
  for (let i = 0; i < count; i++) {
    if (pos + 46 > end || view.getUint32(pos, true) !== 0x02014b50) throw new Error('The XLSX archive is malformed.');
    const flags = view.getUint16(pos + 8, true);
    const method = view.getUint16(pos + 10, true);
    const size = view.getUint32(pos + 24, true);
    const compressed = view.getUint32(pos + 20, true);
    const nameLength = view.getUint16(pos + 28, true);
    const next = pos + 46 + nameLength + view.getUint16(pos + 30, true) + view.getUint16(pos + 32, true);
    const local = view.getUint32(pos + 42, true);
    if (next > end || flags & 1 || ![0, 8].includes(method) || local + 30 > offset || view.getUint32(local, true) !== 0x04034b50) throw new Error('Encrypted or malformed workbooks are not supported.');
    const name = new TextDecoder().decode(new Uint8Array(buffer, pos + 46, nameLength));
    const localNameLength = view.getUint16(local + 26, true);
    if (local + 30 + localNameLength + view.getUint16(local + 28, true) + compressed > offset || names.has(name) || /(^\/|\.\.|vbaProject|externalLinks)/i.test(name)) throw new Error('This workbook contains unsupported or unsafe content.');
    names.add(name); expanded += size;
    if (expanded > LIMITS.expandedBytes || size > LIMITS.expandedBytes) throw new Error('The expanded workbook exceeds the 25 MB safety limit. Save a simpler workbook or CSV.');
    pos = next;
  }
  if (pos !== end || !names.has('[Content_Types].xml') || !names.has('xl/workbook.xml')) throw new Error('Choose a standard .xlsx workbook.');
}

/** @param {File} file @returns {Promise<import('./importModel.js').ImportTable>} */
export async function parseFile(file) {
  validateFile(file);
  const buffer = await file.arrayBuffer();
  if (buffer.byteLength > LIMITS.bytes) throw new Error('Choose a file smaller than 5 MB.');
  if (/\.csv$/i.test(file.name)) {
    let text;
    try { text = new TextDecoder('utf-8', { fatal: true }).decode(buffer); }
    catch { throw new Error('Save the CSV using UTF-8 encoding and try again.'); }
    return { ...parseCSV(text), sheetName: '' };
  }
  inspectXlsxZip(buffer);
  const { read, utils } = await import('xlsx');
  let workbook;
  try {
    workbook = read(buffer, { type: 'array', cellFormula: true, cellHTML: false, cellStyles: false, bookVBA: false, sheetRows: LIMITS.rows + 2, sheets: 0 });
  } catch { throw new Error('Unable to read this workbook. Save a new .xlsx file and try again.'); }
  if (workbook.SheetNames.length !== 1) throw new Error('Use a workbook with one worksheet. Copy the records you need into a new workbook.');
  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  if (!sheet || !sheet['!ref']) throw new Error('The worksheet is empty.');
  const range = utils.decode_range(sheet['!fullref'] || sheet['!ref']);
  if (range.e.r > LIMITS.rows || range.e.c >= LIMITS.columns) throw new Error('Use no more than 5,000 rows below the headings and 50 columns.');
  if (sheet['!merges']?.length) throw new Error('Unmerge cells before importing this workbook.');
  const matrix = [];
  for (let r = 0; r <= range.e.r; r++) {
    const row = [];
    for (let c = 0; c <= range.e.c; c++) {
      const cell = sheet[utils.encode_cell({ r, c })];
      if (cell?.f !== undefined || cell?.F !== undefined || cell?.t === 'e') throw new Error(`Row ${r + 1} contains a formula or spreadsheet error. Replace formulas with plain values before importing.`);
      row.push(cell ? String(cell.w ?? cell.v ?? '') : '');
    }
    matrix.push(row);
  }
  return { ...tableFromRows(matrix), sheetName };
}
