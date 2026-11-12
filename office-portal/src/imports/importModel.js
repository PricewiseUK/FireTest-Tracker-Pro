/** @typedef {'customers' | 'buildings'} ImportType */
/** @typedef {{ headers: string[], rows: { sourceRow: number, cells: string[] }[], sheetName?: string }} ImportTable */
/** @typedef {{ sourceRow: number, values: Record<string, string>, errors: string[], duplicates: number[], duplicateCount: number }} PreviewRecord */
export const LIMITS = { bytes: 5 * 1024 * 1024, rows: 5000, columns: 50, cell: 2000, expandedBytes: 25 * 1024 * 1024 };

const common = [
  { key: 'postcode', label: 'Postcode', aliases: ['postalcode', 'zipcode'] },
  { key: 'contactName', label: 'Contact Name', aliases: ['contact'] },
  { key: 'contactEmail', label: 'Email', aliases: ['email', 'emailaddress'] },
  { key: 'contactPhone', label: 'Telephone', aliases: ['phone', 'telephone', 'contacttelephone'] },
  { key: 'reference', label: 'Reference', aliases: ['customerreference', 'sitereference'] },
];
export const SCHEMAS = {
  customers: { label: 'Customers', fields: [
    { key: 'customerName', label: 'Customer Name', required: true, aliases: ['customer', 'name', 'company', 'companyname'] },
    { key: 'address', label: 'Customer Address', required: true, aliases: ['address', 'customeraddress', 'billingaddress'] }, ...common,
  ] },
  buildings: { label: 'Buildings / Sites', fields: [
    { key: 'customerName', label: 'Customer Name', required: true, aliases: ['customer', 'company', 'companyname'] },
    { key: 'name', label: 'Building Name', required: true, aliases: ['name', 'building', 'sitename', 'site'] },
    { key: 'address', label: 'Building Address', required: true, aliases: ['address', 'siteaddress'] }, ...common,
  ] },
};
const normal = value => String(value).normalize('NFKC').trim().toLowerCase().replace(/[^a-z0-9]/g, '');
/** @param {string[]} headers @param {ImportType} type */
export function suggestMapping(headers, type) {
  const used = new Set();
  return headers.map(header => {
    const field = SCHEMAS[type].fields.find(f => !used.has(f.key) && [f.key, f.label, ...f.aliases].some(a => normal(a) === normal(header)));
    if (field) used.add(field.key);
    return field?.key || '';
  });
}
/** @param {string[]} mapping @param {ImportType} type */
export function mappingErrors(mapping, type) {
  const fields = SCHEMAS[type].fields;
  const selected = mapping.filter(Boolean);
  return [
    ...fields.filter(f => f.required && !selected.includes(f.key)).map(f => `Match a column to ${f.label}.`),
    ...(new Set(selected).size !== selected.length ? ['Each field can only be matched once.'] : []),
    ...(selected.some(key => !fields.some(f => f.key === key)) ? ['Choose a supported field.'] : []),
  ];
}
/** @param {ImportTable} data @param {string[]} mapping @param {ImportType} type @returns {PreviewRecord[]} */
export function previewRecords(data, mapping, type) {
  if (mapping.length !== data.headers.length || mappingErrors(mapping, type).length) throw new Error('Complete column matching first.');
  const records = data.rows.map(({ cells, sourceRow }) => {
    const values = Object.fromEntries(SCHEMAS[type].fields.map(f => [f.key, '']));
    mapping.forEach((key, i) => { if (key) values[key] = String(cells[i] ?? '').trim(); });
    const errors = SCHEMAS[type].fields.filter(f => f.required && !values[f.key]).map(f => `${f.label} is required.`);
    if (values.contactEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values.contactEmail)) errors.push('Email address is invalid.');
    if (values.contactPhone && (!/^[+\d\s().\-ext#]+$/i.test(values.contactPhone) || values.contactPhone.replace(/\D/g, '').length < 7)) errors.push('Telephone must contain at least 7 digits and valid phone characters.');
    return { sourceRow, values, errors, duplicates: [], duplicateCount: 0 };
  });
  // Compare only rows with a real customer/building identity. Postcodes are optional:
  // without one, require the full address to avoid flagging every same-name customer.
  const groups = new Map();
  records.forEach(record => {
    const v = record.values;
    if (!v.customerName || (type === 'buildings' && !v.name) || (!v.postcode && !v.address)) return;
    const key = JSON.stringify([normal(v.customerName), type === 'buildings' ? normal(v.name) : '', v.postcode ? normal(v.postcode) : normal(v.address)]);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(record);
  });
  for (const group of groups.values()) if (group.length > 1) {
    const rows = group.map(r => r.sourceRow);
    group.forEach(r => { r.duplicateCount = rows.length - 1; r.duplicates = rows.slice(0, 9).filter(row => row !== r.sourceRow).slice(0, 8); });
  }
  return records;
}
/** @param {PreviewRecord[]} records */
export function summarise(records) {
  return {
    total: records.length,
    valid: records.filter(r => !r.errors.length).length,
    invalid: records.filter(r => r.errors.length).length,
    duplicates: records.filter(r => r.duplicates.length).length,
    attention: records.filter(r => r.errors.length || r.duplicates.length).length,
  };
}
/** @param {{name: string, size: number}} file */
export function validateFile(file) {
  if (!/\.(csv|xlsx)$/i.test(file.name)) throw new Error('Choose a CSV or Excel (.xlsx) file.');
  if (!file.size) throw new Error('This file is empty.');
  if (file.size > LIMITS.bytes) throw new Error('Choose a file smaller than 5 MB.');
}
/** @param {unknown[][]} matrix @returns {ImportTable} */
export function tableFromRows(matrix) {
  if (!matrix.length) throw new Error('This file is empty.');
  const headers = matrix[0].map(v => String(v ?? '').trim());
  if (!headers.length || headers.length > LIMITS.columns) throw new Error('Use between 1 and 50 columns.');
  if (headers.some(h => !h) || new Set(headers.map(normal)).size !== headers.length) throw new Error('The first row must contain non-empty, unique column headings.');
  if (headers.some(h => h.length > 120)) throw new Error('Column headings must be no longer than 120 characters.');
  const rows = [];
  matrix.slice(1).forEach((row, i) => {
    if (!row.some(v => String(v ?? '').trim())) return;
    if (row.length > headers.length) throw new Error(`Row ${i + 2} has more cells than the headings.`);
    const cells = headers.map((_, index) => String(row[index] ?? ''));
    if (cells.some(v => v.length > LIMITS.cell || [...v].some(c => c.charCodeAt(0) < 32 && !['\t', '\r', '\n'].includes(c)))) throw new Error(`Row ${i + 2} contains an oversized cell or unsupported control characters.`);
    rows.push({ sourceRow: i + 2, cells });
    if (rows.length > LIMITS.rows) throw new Error('Use no more than 5,000 records per file.');
  });
  if (!rows.length) throw new Error('Add at least one record below the column headings.');
  return { headers, rows };
}
/** @param {string} text @returns {ImportTable} */
export function parseCSV(text) {
  if (!text.trim()) throw new Error('This file is empty.');
  const rows = []; let row = []; let cell = ''; let quoted = false; let closed = false;
  const pushCell = () => { row.push(cell); cell = ''; closed = false; if (row.length > LIMITS.columns) throw new Error('Use no more than 50 columns.'); };
  const pushRow = () => { pushCell(); rows.push(row); row = []; if (rows.length > LIMITS.rows + 1) throw new Error('Use no more than 5,000 rows below the headings.'); };
  text = text.replace(/^\uFEFF/, '');
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else { quoted = false; closed = true; } }
      else cell += c;
    } else if (c === ',') pushCell();
    else if (c === '\r' || c === '\n') { if (c === '\r' && text[i + 1] === '\n') i++; pushRow(); }
    else if (c === '"' && !cell && !closed) quoted = true;
    else { if (c === '"' || closed) throw new Error('Malformed CSV: check quotes and commas.'); cell += c; }
    if (cell.length > LIMITS.cell) throw new Error('A cell exceeds the 2,000 character limit.');
  }
  if (quoted) throw new Error('Malformed CSV: a quoted cell is not closed.');
  if (cell || row.length || closed) pushRow();
  return tableFromRows(rows);
}

/** @param {unknown[][]} rows */
export function safeCSV(rows) {
  return '\uFEFF' + rows.map(row => row.map(value => {
    let text = String(value ?? '');
    const firstVisible = [...text].find(c => c.charCodeAt(0) > 32 && !/\s/.test(c));
    if (['=', '+', '-', '@'].includes(firstVisible) || /^[\t\r\n]/.test(text)) text = "'" + text;
    return '"' + text.replaceAll('"', '""') + '"';
  }).join(',')).join('\r\n') + '\r\n';
}
/** @param {ImportType} type */
export function exampleCSV(type) {
  const examples = type === 'customers' ? [
    ['Emberfield Estates (Fictional)', '10 Example Lane, Sampleton', 'ZZ1 1ZZ', 'Office Team', 'office@example.com', '01632 960001', 'EXAMPLE-C01'],
    ['Beacon Court Management (Fictional)', '20 Example Road, Sampleton', 'ZZ2 2ZZ', 'Facilities Team', 'facilities@example.org', '01632 960002', 'EXAMPLE-C02'],
  ] : [
    ['Emberfield Estates (Fictional)', 'Example House', '10 Example Lane, Sampleton', 'ZZ1 1ZZ', 'Office Team', 'office@example.com', '01632 960001', 'EXAMPLE-B01'],
    ['Emberfield Estates (Fictional)', 'Example Annex', '12 Example Lane, Sampleton', 'ZZ1 1ZZ', 'Office Team', 'office@example.com', '01632 960001', 'EXAMPLE-B02'],
    ['Beacon Court Management (Fictional)', 'Example Court', '20 Example Road, Sampleton', 'ZZ2 2ZZ', 'Facilities Team', 'facilities@example.org', '01632 960002', 'EXAMPLE-B03'],
  ];
  return safeCSV([SCHEMAS[type].fields.map(f => f.label), ...examples]);
}
