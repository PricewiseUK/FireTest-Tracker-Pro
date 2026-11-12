import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, Download, FileSpreadsheet, ShieldCheck, Upload } from 'lucide-react';
import { exampleCSV, mappingErrors, previewRecords, SCHEMAS, suggestMapping, summarise, validateFile } from '../imports/importModel.js';
import './AssetImports.css';

const STEPS = ['Upload File', 'Match Columns', 'Preview Records', 'Check Duplicates', 'Review Import'];
const UPCOMING = ['Fire Extinguishers', 'Fire Alarm Equipment', 'Emergency Lighting', 'Fire Doors'];
const PAGE_SIZE = 25;

/** @param {{records: import('../imports/importModel.js').PreviewRecord[], fields: {key: string, label: string}[], duplicatesOnly?: boolean}} props */
function RecordTable({ records, fields, duplicatesOnly = false }) {
  const [page, setPage] = useState(0);
  const [filter, setFilter] = useState('all');
  const filtered = records.filter(r => (!duplicatesOnly || r.duplicates.length) && (filter === 'all' || (filter === 'invalid' ? r.errors.length : !r.errors.length)));
  const pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const current = Math.min(page, pages - 1);
  return <>
    {!duplicatesOnly && <label className="import-filter">Show records <select value={filter} onChange={e => { setFilter(e.target.value); setPage(0); }}><option value="all">All records</option><option value="invalid">Invalid records</option><option value="valid">Valid records</option></select></label>}
    <div className="import-table-scroll" role="region" aria-label={duplicatesOnly ? 'Potential duplicates' : 'Record preview'} tabIndex={0}>
      <table><caption>{duplicatesOnly ? 'Potential duplicates within your file — no records are removed.' : 'Matched values from your file. Row numbers refer to the original spreadsheet.'}</caption>
        <thead><tr><th scope="col">Row</th><th scope="col">Validation</th>{fields.map(f => <th scope="col" key={f.key}>{f.label}</th>)}<th scope="col">Needs attention</th></tr></thead>
        <tbody>{filtered.slice(current * PAGE_SIZE, (current + 1) * PAGE_SIZE).map(r => <tr key={r.sourceRow}>
          <th scope="row">{r.sourceRow}</th><td><span className={`import-pill ${r.errors.length ? 'import-invalid' : 'import-valid'}`}>{r.errors.length ? 'Invalid' : 'Valid'}</span></td>
          {fields.map(f => <td key={f.key}>{r.values[f.key] || <span className="import-empty">Missing</span>}</td>)}
          <td>{r.errors.map(error => <div key={error}>{error}</div>)}{r.duplicateCount > 0 && <div>Potential duplicate of row{r.duplicateCount > 1 ? 's' : ''} {r.duplicates.join(', ')}{r.duplicateCount > 8 ? ` and ${r.duplicateCount - 8} more` : ''}.</div>}{!r.errors.length && !r.duplicateCount && 'None'}</td>
        </tr>)}</tbody>
      </table>
      {!filtered.length && <p className="import-no-results">No records in this view.</p>}
    </div>
    <div className="import-pagination"><span>{filtered.length} records · Page {current + 1} of {pages}</span><div><button type="button" disabled={!current} onClick={() => setPage(current - 1)}>Previous page</button><button type="button" disabled={current + 1 >= pages} onClick={() => setPage(current + 1)}>Next page</button></div></div>
  </>;
}

export default function AssetImports() {
  const [type, setType] = useState(/** @type {import('../imports/importModel.js').ImportType} */ ('customers'));
  const [step, setStep] = useState(0);
  const [data, setData] = useState(/** @type {import('../imports/importModel.js').ImportTable | null} */ (null));
  const [mapping, setMapping] = useState(/** @type {string[]} */ ([]));
  const [filename, setFilename] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [resetPrompt, setResetPrompt] = useState(false);
  const input = useRef(/** @type {HTMLInputElement | null} */ (null));
  const heading = useRef(/** @type {HTMLHeadingElement | null} */ (null));
  const parser = useRef(/** @type {Worker | null} */ (null));
  const timer = useRef(/** @type {ReturnType<typeof setTimeout> | null} */ (null));
  function stopParsing() { parser.current?.terminate(); parser.current = null; clearTimeout(timer.current); }
  useEffect(() => () => { parser.current?.terminate(); clearTimeout(timer.current); }, []);
  useEffect(() => { heading.current?.focus(); }, [step]);
  const fields = SCHEMAS[type].fields;
  const matchErrors = useMemo(() => data ? mappingErrors(mapping, type) : [], [data, mapping, type]);
  const records = useMemo(() => data && !matchErrors.length ? previewRecords(data, mapping, type) : [], [data, mapping, type, matchErrors]);
  const summary = useMemo(() => summarise(records), [records]);

  function reset(nextType = type) {
    stopParsing(); setBusy(false); setData(null); setMapping([]); setFilename(''); setError(''); setStep(0); setResetPrompt(false); setType(nextType);
    if (input.current) input.current.value = '';
  }
  function upload(file) {
    if (!file) return;
    stopParsing(); setError(''); setData(null); setMapping([]); setFilename(''); setStep(0); setBusy(false);
    try { validateFile(file); } catch (e) { setError(e.message); return; }
    setBusy(true);
    try {
      const worker = new Worker(new URL('../imports/import.worker.js', import.meta.url), { type: 'module' });
      parser.current = worker;
      const fail = message => { if (parser.current !== worker) return; stopParsing(); setBusy(false); setError(message); };
      timer.current = setTimeout(() => fail('This file took too long to read. Try a simpler workbook or CSV.'), 15000);
      worker.onerror = () => fail('Unable to read this file. Try saving a new CSV or XLSX file.');
      worker.onmessage = ({ data: response }) => {
        if (parser.current !== worker) return;
        stopParsing(); setBusy(false);
        if (response.error) { setError(response.error); return; }
        setData(response.result); setMapping(suggestMapping(response.result.headers, type)); setFilename(file.name);
      };
      worker.postMessage(file);
    } catch { stopParsing(); setBusy(false); setError('File reading is unavailable in this browser. Try a current browser.'); }
  }
  function downloadTemplate() {
    const url = URL.createObjectURL(new Blob([exampleCSV(type)], { type: 'text/csv;charset=utf-8' }));
    const link = document.createElement('a'); link.href = url; link.download = `instafirepilot-${type}-example.csv`; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  return <section className="import-page" aria-label="Customer data import wizard">
    <div className="import-hero"><div><span className="import-eyebrow">MAKE YOURSELF AT HOME</span><h2>Import Your Existing Records</h2><p>Moving to InstaFirePilot? Bring your existing customers, buildings and equipment records with you.</p></div><span className="import-preview-badge"><ShieldCheck size={18} aria-hidden="true" /> Preview mode</span></div>
    <div className="import-privacy"><ShieldCheck size={22} aria-hidden="true" /><p><strong>Your file stays on this computer.</strong> Review and check your records safely. No records are saved, uploaded or checked against your live database.</p></div>
    <ol className="import-steps" aria-label="Import progress">{STEPS.map((label, i) => <li key={label} aria-current={step === i ? 'step' : undefined} className={step === i ? 'is-current' : step > i ? 'is-complete' : ''}><span>{i + 1}</span><span>{label}</span></li>)}</ol>
    <div className="import-card">
      <div className="import-card-heading"><div><span className="import-eyebrow">STEP {step + 1} OF 5</span><h3 ref={heading} tabIndex={-1}>{STEPS[step]}</h3></div><button type="button" onClick={() => setResetPrompt(true)}>Reset wizard</button></div>
      {resetPrompt && <div className="import-reset" role="group" aria-label="Confirm reset"><p>Clear the selected file, column matches and all preview records?</p><button type="button" onClick={() => reset()}>Clear preview</button><button type="button" onClick={() => setResetPrompt(false)}>Keep working</button></div>}
      {error && <p className="import-error" role="alert">{error}</p>}
      {step === 0 && <>
        <fieldset className="import-types"><legend>What would you like to import?</legend><div>{Object.entries(SCHEMAS).map(([key, schema]) => <label key={key} className={type === key ? 'is-selected' : ''}><input type="radio" name="import-type" value={key} checked={type === key} onChange={() => reset(key === 'customers' ? 'customers' : 'buildings')} />{schema.label}</label>)}</div></fieldset>
        <div className="import-upload"><FileSpreadsheet size={40} aria-hidden="true" /><h4>Start with your {type === 'customers' ? 'customer' : 'building'} spreadsheet</h4><p>Use a header row followed by one record per row.</p>
          <div className="import-actions"><button type="button" className="import-primary" disabled={busy} onClick={() => input.current?.click()}><Upload size={18} aria-hidden="true" />Upload CSV / Excel</button><button type="button" onClick={downloadTemplate}><Download size={18} aria-hidden="true" />Download Example Template</button></div>
          <input ref={input} type="file" accept=".csv,.xlsx" aria-label="Choose CSV or XLSX file" disabled={busy} onChange={e => { upload(e.target.files?.[0]); e.target.value = ''; }} />
          <p className="import-hint">CSV (UTF-8) or Excel (.xlsx) · Maximum 5 MB · 5,000 records · 50 columns</p><p className="import-hint">Excel: one worksheet, plain values, no merged cells. Keep telephone numbers as text.</p>
        </div>
        <div role="status" aria-live="polite">{busy ? <p>Reading your file locally…</p> : data && <p className="import-file-ready">Ready: {filename} · {data.rows.length} records · {data.headers.length} columns{data.sheetName ? ` · Sheet: ${data.sheetName}` : ''}</p>}</div>
        <p className="import-hint">Templates contain fictional examples only. Replace them with your own records before previewing.</p>
        <div className="import-upcoming"><h4>Equipment templates coming next</h4><div>{UPCOMING.map(label => <span key={label}>{label} <small>Upcoming</small></span>)}</div></div>
      </>}
      {step === 1 && <><p>Match each spreadsheet column to a field, or choose Ignore column. Fields marked * are required. Each field can be used once.</p><p className="import-hint">{filename} · {SCHEMAS[type].label} · {data.rows.length} records</p>
        <div className="import-mapping">{data.headers.map((header, i) => <div key={i}><div><label htmlFor={`match-${i}`}>{header}</label><p className="import-sample">Example: {data.rows[0].cells[i] || 'Empty'}</p></div><select id={`match-${i}`} value={mapping[i]} onChange={e => setMapping(previous => previous.map((value, index) => index === i ? e.target.value : value))}><option value="">Ignore column</option>{fields.map(f => <option key={f.key} value={f.key} disabled={mapping.includes(f.key) && mapping[i] !== f.key}>{f.label}{f.required ? ' *' : ''}</option>)}</select></div>)}</div>
        {matchErrors.length > 0 && <div className="import-error" role="status">{matchErrors.map(message => <p key={message}>{message}</p>)}</div>}
      </>}
      {step === 2 && <><p>Check the matched values below. Missing required details and invalid contact details are flagged. To correct values, edit your original file and upload it again.</p><p>{summary.valid} valid · {summary.invalid} invalid. You can continue reviewing even if records need attention.</p><RecordTable key={`preview-${type}`} records={records} fields={fields} /></>}
      {step === 3 && <><p>We compare customer names{type === 'buildings' ? ', building names' : ''} and postcodes, or addresses when a postcode is missing. These are suggestions for review; no records are removed.</p><p><strong>{summary.duplicates} records flagged as potential duplicates.</strong> Live database duplicate checking will be introduced when backend importing is implemented.</p><RecordTable key={`duplicates-${type}`} records={records} fields={fields} duplicatesOnly /></>}
      {step === 4 && <><p>Review complete for <strong>{filename}</strong> · {SCHEMAS[type].label}</p><dl className="import-summary">{[['Total records', summary.total], ['Valid records', summary.valid], ['Invalid records', summary.invalid], ['Potential duplicates', summary.duplicates], ['Records requiring attention', summary.attention]].map(([label, count]) => <div key={label}><dt>{label}</dt><dd>{count}</dd></div>)}</dl><p className="import-hint">Potential duplicates counts all flagged records, including the first record in each group. Records requiring attention counts each affected row once. Valid records may still have duplicates.</p><div className="import-final"><ShieldCheck size={28} aria-hidden="true" /><h4>Preview only — no records have been saved</h4><p>Importing is not enabled yet. Correct any issues in your source spreadsheet before a future import.</p><button type="button" disabled>Import to InstaFirePilot — Not Yet Enabled</button></div></>}
      <div className="import-navigation"><button type="button" disabled={step === 0 || busy} onClick={() => setStep(s => s - 1)}><ArrowLeft size={17} aria-hidden="true" />Back</button>{step < 4 && <button type="button" className="import-primary" disabled={busy || !data || (step === 1 && matchErrors.length > 0)} onClick={() => setStep(s => s + 1)}>Next: {STEPS[step + 1]}<ArrowRight size={17} aria-hidden="true" /></button>}</div>
    </div>
  </section>;
}
