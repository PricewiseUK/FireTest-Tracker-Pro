import { useEffect, useState } from "react";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  query,
  where,
} from "firebase/firestore";
import {
  getFunctions,
  httpsCallable,
  connectFunctionsEmulator,
} from "firebase/functions";
import app, { db } from "../firebaseConfig";
import "./AccountingIntegrations.css";

const functions = getFunctions(app, "europe-west2");
if (import.meta.env.VITE_FIREBASE_EMULATORS === "true")
  connectFunctionsEmulator(functions, "127.0.0.1", 5001);
const callable = httpsCallable(functions, "accounting");
const money = (pence) =>
  new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" }).format(
    pence / 100,
  );

export default function AccountingIntegrations({ companyId, canManage }) {
  const [connection, setConnection] = useState("loading");
  const [mode, setMode] = useState("mock");
  const [settings, setSettings] = useState({
    salesAccountCode: "",
    taxTypes: { standard: "", reduced: "", zero: "", exempt: "", outside: "" },
  });
  const [jobs, setJobs] = useState([]);
  const [requests, setRequests] = useState([]);
  const [preview, setPreview] = useState(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const call = async (action, extra = {}) =>
    (await callable({ action, companyId, ...extra })).data;
  async function refresh() {
    const status = await call("status");
    setConnection(status.status);
    setMode(status.mode);
    const [work, queue, config] = await Promise.all([
      getDocs(
        query(
          collection(db, "companies", companyId, "billingJobs"),
          where("status", "==", "completed"),
          limit(100),
        ),
      ),
      getDocs(
        query(
          collection(db, "companies", companyId, "accountingOutbox"),
          limit(100),
        ),
      ),
      getDoc(doc(db, "companies", companyId, "accountingSettings", "xero")),
    ]);
    if (config.exists()) setSettings(config.data());
    setJobs(work.docs.map((d) => ({ ...d.data(), id: d.id })));
    setRequests(queue.docs.map((d) => ({ ...d.data(), id: d.id })));
  }
  async function run(action) {
    setBusy(true);
    setMessage("");
    try {
      await action();
      await refresh();
    } catch (error) {
      setMessage(
        error.code?.startsWith("functions/") &&
          error.code !== "functions/internal"
          ? error.message
          : "Accounting is unavailable. Refresh and try again.",
      );
    } finally {
      setBusy(false);
    }
  }
  useEffect(() => {
    let cancelled = false;
    setConnection("loading");
    setJobs([]);
    setRequests([]);
    setPreview(null);
    if (canManage)
      refresh().catch(() => {
        if (!cancelled)
          setMessage(
            "Unable to load accounting. Check the backend configuration and try Refresh.",
          );
      });
    return () => {
      cancelled = true;
    };
    // All calls are scoped to this mounted workspace. App remounts on workspace changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyId, canManage]);
  if (!canManage)
    return (
      <section className="accounting">
        <h2>Accounting Integrations</h2>
        <p>Your workspace owner must authorise accounting access.</p>
      </section>
    );
  return (
    <section className="accounting">
      <p>Settings / Accounting Integrations</p>
      <h2>Accounting Integrations</h2>
      {mode === "mock" && (
        <p className="accounting-demo">
          no live Xero calls or real invoices. Connections expire after one
          hour.
        </p>
      )}
      {message && <p role="alert">{message}</p>}
      <div className="accounting-providers">
        <article>
          <h3>Xero</h3>
          <p>Connection: {connection}</p>
          <button
            disabled={busy || connection === "loading"}
            onClick={() =>
              run(async () => {
                const result = await call("connect");
                if (result.url) {
                  window.location.assign(result.url);
                  return;
                }
                await call("completeDemo", { state: result.state });
              })
            }
          >
            {connection === "connected" ? "Reconnect Xero" : "Connect Xero"}
            {mode === "mock" ? " demo" : ""}
          </button>
          {connection !== "disconnected" && (
            <button
              disabled={busy}
              onClick={() => run(() => call("disconnect"))}
            >
              Disconnect
            </button>
          )}
        </article>
        {["QuickBooks", "Sage"].map((name) => (
          <article key={name}>
            <h3>{name}</h3>
            <p>Coming soon</p>
            <button disabled>Coming soon</button>
          </article>
        ))}
      </div>
      <h3>Sales account and VAT configuration</h3>
      <p>Enter accounts and tax codes.</p>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          run(() => call("configure", { settings }));
        }}
      >
        <label>
          Sales account code{" "}
          <input
            required
            maxLength={30}
            value={settings.salesAccountCode}
            onChange={(event) =>
              setSettings({ ...settings, salesAccountCode: event.target.value })
            }
          />
        </label>
        {Object.entries(settings.taxTypes).map(([treatment, code]) => (
          <label key={treatment}>
            {treatment} VAT code{" "}
            <input
              required
              maxLength={40}
              value={code}
              onChange={(event) =>
                setSettings({
                  ...settings,
                  taxTypes: {
                    ...settings.taxTypes,
                    [treatment]: event.target.value,
                  },
                })
              }
            />
          </label>
        ))}
        <button disabled={busy}>Save accounting configuration</button>
      </form>
      <h3>Completed work</h3>
      <p>
        Review the billing details and approve the completed work before
        creating a draft invoice.
      </p>
      <button disabled={busy} onClick={() => run(async () => {})}>
        Refresh
      </button>
      {jobs.length === 0 && (
        <p>No synchronised completed work is available for billing.</p>
      )}
      {jobs.map((job) => (
        <div className="accounting-row" key={job.id}>
          <span>
            {job.title || job.id} — {job.approval?.status || "Awaiting review"}
          </span>
          <button
            disabled={busy}
            onClick={() =>
              run(async () =>
                setPreview(await call("preview", { jobId: job.id })),
              )
            }
          >
            Review billing details
          </button>
        </div>
      ))}
      {preview && (
        <section
          aria-labelledby="invoice-confirm-title"
          className="accounting-confirm"
        >
          <h3 id="invoice-confirm-title">Confirm draft invoice in Xero</h3>
          <p>
            Customer: <strong>{preview.customerName}</strong>
          </p>
          <p>Currency: GBP. Amounts exclude VAT.</p>
          <table>
            <thead>
              <tr>
                <th>Description</th>
                <th>Quantity</th>
                <th>Unit price</th>
                <th>VAT treatment</th>
              </tr>
            </thead>
            <tbody>
              {preview.invoice.lines.map((line, i) => (
                <tr key={i}>
                  <td>{line.description}</td>
                  <td>{line.quantity}</td>
                  <td>{money(line.unitPence)}</td>
                  <td>{line.vat}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p>
            Net {money(preview.invoice.netPence)} · VAT{" "}
            {money(preview.invoice.vatPence)} ·{" "}
            <strong>Total {money(preview.invoice.totalPence)}</strong>
          </p>
          {!preview.approved ? (
            <button
              disabled={busy}
              onClick={() =>
                run(async () => {
                  await call("approve", {
                    jobId: preview.jobId,
                    fingerprint: preview.fingerprint,
                  });
                  setPreview(await call("preview", { jobId: preview.jobId }));
                })
              }
            >
              Approve reviewed completed work
            </button>
          ) : (
            <button
              disabled={busy || connection !== "connected"}
              onClick={() =>
                run(async () => {
                  await call("invoice", {
                    jobId: preview.jobId,
                    fingerprint: preview.fingerprint,
                  });
                  setPreview(null);
                })
              }
            >
              Create draft invoice in Xero{mode === "mock" ? " (demo)" : ""}
            </button>
          )}
          <button disabled={busy} onClick={() => setPreview(null)}>
            Cancel
          </button>
        </section>
      )}
      <h3>Invoice sync status</h3>
      {requests.map((request) => (
        <article key={request.id}>
          <p>
            {request.jobId} — {request.status}
          </p>
          {request.error && <p role="alert">{request.error}</p>}
          {request.invoiceId && <p>Draft invoice: {request.invoiceId}</p>}
          {request.url && (
            <a href={request.url} target="_blank" rel="noopener noreferrer">
              Open invoice in Xero{mode === "mock" ? " (demo ID)" : ""}
            </a>
          )}
          {request.status === "failed" && (
            <button
              disabled={busy}
              onClick={() =>
                run(() => call("retry", { requestId: request.id }))
              }
            >
              Retry invoice sync
            </button>
          )}
        </article>
      ))}
    </section>
  );
}
