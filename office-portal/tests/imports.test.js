// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { File } from 'node:buffer';
import { utils, write } from 'xlsx';
import { exampleCSV, LIMITS, mappingErrors, parseCSV, previewRecords, safeCSV, SCHEMAS, suggestMapping, summarise, validateFile } from '../src/imports/importModel.js';
import { inspectXlsxZip, parseFile } from '../src/imports/parseFile.js';

const csvFile = text => new File([text], 'records.csv');
function workbookFile(matrix, modify = () => {}) {
  const book = utils.book_new();
  utils.book_append_sheet(book, utils.aoa_to_sheet(matrix), 'Records');
  modify(book);
  return new File([write(book, { type: 'buffer', bookType: 'xlsx', compression: true })], 'records.xlsx');
}
describe('local file parsing', () => {
  it('reads CSV with BOM, quoted commas, newlines, escaped quotes and leading zero phone numbers', async () => {
    const data = await parseFile(csvFile('\uFEFFCustomer,Address,Telephone\r\n"Example, Ltd","10 ""Example"" Lane\nSampleton",01632960001\r\n'));
    expect(data.rows).toEqual([{ sourceRow: 2, cells: ['Example, Ltd', '10 "Example" Lane\nSampleton', '01632960001'] }]);
  });
  it('reads a real XLSX workbook and preserves formatted text', async () => {
    const data = await parseFile(workbookFile([['Customer Name', 'Customer Address', 'Telephone'], ['Example Ltd', '10 Example Lane', '01632960001']]));
    expect(data.sheetName).toBe('Records');
    expect(data.rows[0].cells).toEqual(['Example Ltd', '10 Example Lane', '01632960001']);
  });
  it('rejects empty files and header-only files', async () => {
    await expect(parseFile(csvFile(''))).rejects.toThrow(/empty/);
    expect(() => parseCSV('Customer,Address\n')).toThrow(/at least one/);
    await expect(parseFile(workbookFile([]))).rejects.toThrow(/empty/);
  });
  it('rejects missing and duplicate headers', () => {
    for (const text of ['Customer,,Address\na,b,c', 'Customer,customer\na,b', ',\na,b']) expect(() => parseCSV(text)).toThrow(/headings/);
  });
  it('leaves unknown headers unmapped for staff to correct', () => {
    const data = parseCSV('Unknown,Other\na,b');
    expect(suggestMapping(data.headers, 'customers')).toEqual(['', '']);
    expect(mappingErrors(['', ''], 'customers')).toHaveLength(2);
  });
  it('rejects malformed CSV, extra cells and invalid UTF-8', async () => {
    for (const text of ['Name,Address\n"unclosed,Example', 'Name,Address\n"Closed"oops,Example', 'Name,Address\na,b,c', 'Name,Address\na"b,c']) expect(() => parseCSV(text)).toThrow();
    await expect(parseFile(new File([new Uint8Array([0xff, 0xfe])], 'bad.csv'))).rejects.toThrow(/UTF-8/);
  });
  it('enforces extension, size, row, column and cell limits', () => {
    expect(() => validateFile({ name: 'a.xls', size: 12 })).toThrow(/CSV/);
    expect(() => validateFile({ name: 'a.csv', size: LIMITS.bytes + 1 })).toThrow(/5 MB/);
    expect(() => parseCSV('Name\n' + 'a\n'.repeat(LIMITS.rows + 1))).toThrow(/5,000/);
    expect(parseCSV('Name\n' + 'a\n'.repeat(LIMITS.rows)).rows).toHaveLength(LIMITS.rows);
    expect(() => parseCSV(Array.from({ length: 51 }, (_, i) => `Col${i}`).join(',') + '\na')).toThrow(/50/);
    expect(() => parseCSV('Name\n' + 'a'.repeat(LIMITS.cell + 1))).toThrow(/2,000/);
  });
  it('rejects damaged XLSX and renamed text files', async () => {
    await expect(parseFile(new File(['Name,Address\na,b'], 'renamed.xlsx'))).rejects.toThrow(/valid XLSX/);
    const bytes = new Uint8Array(await workbookFile([['Name'], ['Example']]).arrayBuffer());
    await expect(parseFile(new File([bytes.slice(0, -25)], 'broken.xlsx'))).rejects.toThrow(/damaged/);
  });
  it('rejects formulas, cached formula values, errors, merged cells and multiple worksheets', async () => {
    await expect(parseFile(workbookFile([['Name'], ['Example']], book => { book.Sheets.Records.A2 = { t: 'n', f: '1+1', v: 2 }; }))).rejects.toThrow(/formula/);
    await expect(parseFile(workbookFile([['Name'], ['Example']], book => { book.Sheets.Records.A2 = { t: 'e', v: 7 }; }))).rejects.toThrow(/spreadsheet error/);
    await expect(parseFile(workbookFile([['Name', 'Address'], ['Example', 'Lane']], book => { book.Sheets.Records['!merges'] = [utils.decode_range('A2:B2')]; }))).rejects.toThrow(/Unmerge/);
    await expect(parseFile(workbookFile([['Name'], ['Example']], book => utils.book_append_sheet(book, utils.aoa_to_sheet([['Other']]), 'Other')))).rejects.toThrow(/one worksheet/);
  });
  it('enforces XLSX row and column limits without accepting a truncated preview', async () => {
    await expect(parseFile(workbookFile([['Name'], ['Example']], book => { book.Sheets.Records['!ref'] = 'A1:A5002'; book.Sheets.Records.A5002 = { t: 's', v: 'Last' }; }))).rejects.toThrow(/5,000/);
    await expect(parseFile(workbookFile([Array.from({ length: 51 }, (_, i) => 'Col' + i), ['Example']]))).rejects.toThrow(/50 columns/);
  });
  it('rejects excessive ZIP expansion before parsing', async () => {
    const buffer = await workbookFile([['Name'], ['Example']]).arrayBuffer();
    const view = new DataView(buffer);
    for (let i = 0; i < view.byteLength - 46; i++) if (view.getUint32(i, true) === 0x02014b50) { view.setUint32(i + 24, LIMITS.expandedBytes + 1, true); break; }
    expect(() => inspectXlsxZip(buffer)).toThrow(/25 MB/);
  });
});
describe('mapping, preview, duplicates and templates', () => {
  it('suggests unique matches and supports ignoring columns', () => {
    expect(suggestMapping(['Customer', 'Customer Name', 'Address', 'Ignore me'], 'customers')).toEqual(['customerName', '', 'address', '']);
    expect(mappingErrors(['customerName', 'customerName', 'address'], 'customers')).toContain('Each field can only be matched once.');
    expect(mappingErrors(['customerName', 'address', 'uid'], 'customers')).toContain('Choose a supported field.');
  });
  it('previews exact values without inventing missing customer information', () => {
    const data = parseCSV('Customer,Site Name,Address,Email,Telephone,Ignored\n,Example House,10 Example Lane,bad,abc,Secret\nEmberfield,Annex,12 Example Lane,office@example.com,01632960001,Secret');
    const records = previewRecords(data, suggestMapping(data.headers, 'buildings'), 'buildings');
    expect(records[0].values.customerName).toBe('');
    expect(records[0].errors).toHaveLength(3);
    expect(records[1].errors).toEqual([]);
    expect(records[1].values.name).toBe('Annex');
    expect(JSON.stringify(records)).not.toContain('Secret');
    expect(summarise(records)).toEqual({ total: 2, valid: 1, invalid: 1, duplicates: 0, attention: 1 });
  });
  it('flags duplicates in both directions, preserves them and counts attention once', () => {
    const data = parseCSV('Customer,Site Name,Address,Postcode\nEmberfield,Example House,10 Lane,ZZ1 1ZZ\nEMBERFIELD,Example House,10 Lane,zz11zz\nEmberfield,Annex,12 Lane,ZZ1 1ZZ');
    const records = previewRecords(data, suggestMapping(data.headers, 'buildings'), 'buildings');
    expect(records[0].duplicates).toEqual([3]);
    expect(records[1].duplicates).toEqual([2]);
    expect(summarise(records)).toEqual({ total: 3, valid: 3, invalid: 0, duplicates: 2, attention: 2 });
  });
  it('uses addresses when postcodes are absent and skips empty identities', () => {
    const data = parseCSV('Customer,Address\nExample,10 Lane\nExample,10 Lane\nExample,20 Lane\n,10 Lane\n,10 Lane');
    expect(summarise(previewRecords(data, suggestMapping(data.headers, 'customers'), 'customers'))).toEqual({ total: 5, valid: 3, invalid: 2, duplicates: 2, attention: 4 });
  });
  it('bounds duplicate details for large repeated files while retaining every record', () => {
    const data = parseCSV('Customer,Address\n' + 'Example,10 Lane\n'.repeat(5000));
    const records = previewRecords(data, suggestMapping(data.headers, 'customers'), 'customers');
    expect(records).toHaveLength(5000);
    expect(records.every(r => r.duplicates.length === 8 && r.duplicateCount === 4999)).toBe(true);
    expect(summarise(records).duplicates).toBe(5000);
  });
  it('round-trips both fictional templates with valid fields and linked customer names', () => {
    const names = new Set();
    for (const type of ['customers', 'buildings']) {
      const data = parseCSV(exampleCSV(type));
      const records = previewRecords(data, suggestMapping(data.headers, type), type);
      expect(data.headers).toEqual(SCHEMAS[type].fields.map(f => f.label));
      expect(records.every(r => !r.errors.length)).toBe(true);
      records.forEach(r => type === 'customers' ? names.add(r.values.customerName) : expect(names.has(r.values.customerName)).toBe(true));
    }
  });
  it('treats HTML and JavaScript as plain text and neutralises CSV formula injection', () => {
    const text = '<img src=x onerror=alert(1)>';
    expect(parseCSV(`Customer,Address\n${text},javascript:alert(1)`).rows[0].cells).toEqual([text, 'javascript:alert(1)']);
    const result = parseCSV(safeCSV([['Cell'], ['=1+1'], [' +SUM(A1)'], ['-1'], ['@SUM(A1)'], ['\tDanger'], ['ordinary']]));
    expect(result.rows.slice(0, 5).every(r => r.cells[0].startsWith("'"))).toBe(true);
    expect(result.rows[5].cells[0]).toBe('ordinary');
  });
});
