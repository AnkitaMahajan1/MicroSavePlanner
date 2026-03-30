import { useState } from "react";
import { API_BASE_URL, api } from "./api";
import type {
  FilterRequest,
  KPeriod,
  PPeriod,
  QPeriod,
  ReturnsRequest,
  TransactionInput,
  TransactionWithCalculated,
} from "./types";

type Mode = "transactions" | "returns";
type TransactionTool = "parse" | "validate" | "filter";
type ReturnsTool = "nps" | "index";
type Page = "home" | "planner" | "documentation";

type TransactionRow = { date: string; amount: string };
type QRow = { start: string; end: string; fixed: string };
type PRow = { start: string; end: string; extra: string };
type KRow = { start: string; end: string };

function todayDateInput(): string {
  return new Date().toISOString().slice(0, 10);
}

function toApiDateTime(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return "";
  return trimmed.includes(" ") ? trimmed : `${trimmed} 00:00:00`;
}

function fmt(value: number): string {
  return new Intl.NumberFormat("en-IN", { maximumFractionDigits: 2 }).format(value);
}

function transactionToolLabel(tool: TransactionTool): string {
  if (tool === "parse") return "Calculate Savings";
  if (tool === "validate") return "Validate";
  return "Filter";
}

export default function App() {
  const [page, setPage] = useState<Page>("home");
  const [mode, setMode] = useState<Mode>("transactions");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const [transactionTool, setTransactionTool] = useState<TransactionTool>("parse");
  const [returnsTool, setReturnsTool] = useState<ReturnsTool>("nps");

  const [wage, setWage] = useState("1200000");
  const [age, setAge] = useState("30");
  const [inflation, setInflation] = useState("5");

  const [transactionsRows, setTransactionsRows] = useState<TransactionRow[]>([{ date: todayDateInput(), amount: "123.5" }]);
  const [qRows, setQRows] = useState<QRow[]>([]);
  const [pRows, setPRows] = useState<PRow[]>([]);
  const [kRows, setKRows] = useState<KRow[]>([{ start: "2026-02-01", end: "2026-02-28" }]);

  const [resultData, setResultData] = useState<unknown>(null);

  function txFromRows(rows: TransactionRow[]): TransactionInput[] {
    const data = rows
      .map((row) => ({ date: toApiDateTime(row.date), amount: Number(row.amount) }))
      .filter((row) => row.date || !Number.isNaN(row.amount));
    if (data.length === 0) throw new Error("Add at least one transaction.");
    if (data.some((x) => !x.date || Number.isNaN(x.amount))) throw new Error("Each transaction needs a date and amount.");
    return data;
  }

  function qFromRows(rows: QRow[]): QPeriod[] {
    return rows
      .map((row) => ({ start: toApiDateTime(row.start), end: toApiDateTime(row.end), fixed: Number(row.fixed) }))
      .filter((x) => x.start || x.end || !Number.isNaN(x.fixed));
  }
  function pFromRows(rows: PRow[]): PPeriod[] {
    return rows
      .map((row) => ({ start: toApiDateTime(row.start), end: toApiDateTime(row.end), extra: Number(row.extra) }))
      .filter((x) => x.start || x.end || !Number.isNaN(x.extra));
  }
  function kFromRows(rows: KRow[]): KPeriod[] {
    return rows.map((row) => ({ start: toApiDateTime(row.start), end: toApiDateTime(row.end) })).filter((x) => x.start || x.end);
  }

  function getInput() {
    return { transactions: txFromRows(transactionsRows), q: qFromRows(qRows), p: pFromRows(pRows), k: kFromRows(kRows) };
  }

  async function runTransactionAction() {
    setBusy(true);
    setError("");
    try {
      const { transactions, q, p, k } = getInput();
      if (transactionTool === "parse") {
        setResultData(await api.parseTransactions(transactions));
      } else if (transactionTool === "validate") {
        const parsed = await api.parseTransactions(transactions);
        const response = await api.validateTransactions({ wage: Number(wage), transactions: parsed.transactions as TransactionWithCalculated[] });
        setResultData(response);
      } else {
        const payload: FilterRequest = { wage: Number(wage), transactions, q, p, k };
        setResultData(await api.filterTransactions(payload));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unexpected error");
    } finally {
      setBusy(false);
    }
  }

  async function runReturnsAction() {
    setBusy(true);
    setError("");
    try {
      if (!age.trim() || Number(age) <= 0) throw new Error("Age is required.");
      if (!wage.trim() || Number(wage) <= 0) throw new Error("Wage is required.");
      if (!inflation.trim() || Number(inflation) < 0) throw new Error("Inflation is required.");
      const { transactions, q, p, k } = getInput();
      if (k.length === 0 || k.some((x) => !x.start || !x.end)) throw new Error("Add at least one valid Evaluation Window.");
      const payload: ReturnsRequest = { age: Number(age), wage: Number(wage), inflation: Number(inflation), transactions, q, p, k };
      const response = returnsTool === "nps" ? await api.calculateNpsReturns(payload) : await api.calculateIndexReturns(payload);
      setResultData(response);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unexpected error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="appShell">
      <header className="topNav">
        <div className="brand">💰 MicroSave Planner</div>
        <nav className="navLinks">
          <button className={page === "home" ? "active" : ""} onClick={() => setPage("home")}>🏠 Home</button>
          <button className={page === "planner" ? "active" : ""} onClick={() => setPage("planner")}>📊 Planner</button>
          <button className={page === "documentation" ? "active" : ""} onClick={() => setPage("documentation")}>📘 Documentation</button>
        </nav>
      </header>

      {page !== "planner" && (
        <header className="hero">
          <h1>MicroSave Planner</h1>
          <p>
            Most people fail to save because investing feels like a big monthly decision.
            This app turns that into small automatic decisions tied to your daily spending.
          </p>
          <p className="heroPitch">
            Bought a coffee for 123.5? We can automatically push the extra 76.5 toward your future instead of losing it.
          </p>
          <div className="heroMeta">
            <span>API: {API_BASE_URL}</span>
            <span>Date input: YYYY-MM-DD</span>
            <span>Micro-savings with every transaction</span>
          </div>
        </header>
      )}

      {page === "home" && (
        <section className="card">
          <h2>Why This Matters</h2>
          <p className="sub">
            Traditional saving fails because it depends on motivation and perfect timing. Our approach is different:
            every transaction becomes an opportunity to save a small amount automatically.
          </p>
          <div className="storyGrid">
            <div className="storyCard">
              <h3>☕ Coffee Example</h3>
              <p className="sub">Spend 123.5 on coffee -&gt; round-up ceiling 200 -&gt; save 76.5 instantly.</p>
            </div>
            <div className="storyCard">
              <h3>🛒 Grocery Example</h3>
              <p className="sub">Spend 417.2 on groceries -&gt; ceiling 500 -&gt; save 82.8 for long-term goals.</p>
            </div>
            <div className="storyCard">
              <h3>📈 Wealth Habit</h3>
              <p className="sub">Small savings from daily expenses compound into meaningful retirement outcomes.</p>
            </div>
          </div>
          <div className="stats">
            <Stat label="Step 1" value="Track Spend" />
            <Stat label="Step 2" value="Auto Save Smartly" />
            <Stat label="Step 3" value="Grow for Retirement" />
          </div>
        </section>
      )}

      {page === "planner" && (
        <>
          <nav className="tabs">
            <button className={mode === "transactions" ? "active" : ""} onClick={() => setMode("transactions")}>Transactions</button>
            <button className={mode === "returns" ? "active" : ""} onClick={() => setMode("returns")}>Returns</button>
          </nav>

          <main className="content">
            <section className="card left">
              {mode === "transactions" ? (
                <>
                  <h2>Transaction Processing</h2>
                  <p className="sub">Use this to parse, validate, or filter transactions before returns.</p>
                  <div className="tabs compact">
                    <button className={transactionTool === "parse" ? "active" : ""} onClick={() => setTransactionTool("parse")}>Calculate Savings</button>
                    <button className={transactionTool === "validate" ? "active" : ""} onClick={() => setTransactionTool("validate")}>Validate</button>
                    <button className={transactionTool === "filter" ? "active" : ""} onClick={() => setTransactionTool("filter")}>Filter</button>
                  </div>
                  <Editors
                    transactionsRows={transactionsRows}
                    setTransactionsRows={setTransactionsRows}
                    qRows={qRows}
                    setQRows={setQRows}
                    pRows={pRows}
                    setPRows={setPRows}
                    kRows={kRows}
                    setKRows={setKRows}
                    showRules={transactionTool === "filter"}
                  />
                  {(transactionTool === "validate" || transactionTool === "filter") && (
                    <div className="group">
                      <label>Wage</label>
                      <input type="number" value={wage} onChange={(e) => setWage(e.target.value)} />
                    </div>
                  )}
                  <button className="primary" disabled={busy} onClick={runTransactionAction}>
                    {busy ? "Processing..." : `Run ${transactionToolLabel(transactionTool)}`}
                  </button>
                </>
              ) : (
                <>
                  <h2>Returns Simulation</h2>
                  <p className="sub">Estimate long-term outcome by grouping savings into evaluation windows.</p>
                  <div className="tabs compact">
                    <button className={returnsTool === "nps" ? "active" : ""} onClick={() => setReturnsTool("nps")}>NPS</button>
                    <button className={returnsTool === "index" ? "active" : ""} onClick={() => setReturnsTool("index")}>Index</button>
                  </div>
                  <div className="profile">
                    <div><label>Age <span className="required">*</span></label><input type="number" value={age} onChange={(e) => setAge(e.target.value)} /></div>
                    <div><label>Wage (monthly) <span className="required">*</span></label><input type="number" value={wage} onChange={(e) => setWage(e.target.value)} /></div>
                    <div><label>Inflation % <span className="required">*</span></label><input type="number" value={inflation} onChange={(e) => setInflation(e.target.value)} /></div>
                  </div>
                  <Editors
                    transactionsRows={transactionsRows}
                    setTransactionsRows={setTransactionsRows}
                    qRows={qRows}
                    setQRows={setQRows}
                    pRows={pRows}
                    setPRows={setPRows}
                    kRows={kRows}
                    setKRows={setKRows}
                    showRules
                  />
                  <button className="primary" disabled={busy} onClick={runReturnsAction}>{busy ? "Calculating..." : `Run ${returnsTool.toUpperCase()} returns`}</button>
                </>
              )}
            </section>

            <section className="card right">
              <h2>Results</h2>
              {error ? <div className="error">{error}</div> : <ResultView data={resultData} mode={mode} returnsTool={returnsTool} />}
            </section>
          </main>
        </>
      )}

      {page === "documentation" && (
        <section className="card docs">
          <h2>How To Use</h2>
          <div className="docBanner">
            <strong>Core Idea:</strong> save small amounts from each transaction instead of waiting for a large monthly deposit.
          </div>
          <div className="docBlock">
            <h3>1) Start in Planner</h3>
            <p className="sub">Go to <strong>Planner</strong> tab and add one or more transactions with date and amount.</p>
          </div>
          <div className="docBlock">
            <h3>2) Transactions Workflow</h3>
            <p className="sub"><strong>Calculate Savings</strong> computes ceiling and savings remainder. <strong>Validate</strong> checks invalid entries. <strong>Filter</strong> applies optional rule windows.</p>
          </div>
          <div className="docBlock">
            <h3>3) Returns Workflow</h3>
            <p className="sub">Set Age, Wage, Inflation and keep at least one <strong>Evaluation Window</strong>. Then compare <strong>NPS</strong> vs <strong>Index</strong> returns.</p>
          </div>
          <div className="docBlock">
            <h3>Project Purpose</h3>
            <p className="sub">This project helps users who struggle to save consistently by converting everyday spending into automatic, disciplined, long-term savings.</p>
          </div>
          <div className="docBlock">
            <h3>Simple Example</h3>
            <p className="sub">
              If you buy a coffee for <strong>123.5</strong>, the system can round up and save the difference.
              That means you keep your lifestyle while building wealth in the background.
            </p>
          </div>
        </section>
      )}
    </div>
  );
}

function Editors(props: {
  transactionsRows: TransactionRow[];
  setTransactionsRows: React.Dispatch<React.SetStateAction<TransactionRow[]>>;
  qRows: QRow[];
  setQRows: React.Dispatch<React.SetStateAction<QRow[]>>;
  pRows: PRow[];
  setPRows: React.Dispatch<React.SetStateAction<PRow[]>>;
  kRows: KRow[];
  setKRows: React.Dispatch<React.SetStateAction<KRow[]>>;
  showRules: boolean;
}) {
  const { transactionsRows, setTransactionsRows, qRows, setQRows, pRows, setPRows, kRows, setKRows, showRules } = props;
  return (
    <>
      <Block title="Transactions" addLabel="+ Add transaction" onAdd={() => setTransactionsRows((p) => [...p, { date: todayDateInput(), amount: "" }])} hint="Each transaction contributes to savings calculation.">
        {transactionsRows.map((row, i) => (
          <div className="rowGrid tx" key={`tx-${i}`}>
            <input type="date" value={row.date} onChange={(e) => setTransactionsRows((p) => p.map((x, idx) => (idx === i ? { ...x, date: e.target.value } : x)))} />
            <input type="number" placeholder="Amount" value={row.amount} onChange={(e) => setTransactionsRows((p) => p.map((x, idx) => (idx === i ? { ...x, amount: e.target.value } : x)))} />
            <button className="ghost danger" onClick={() => setTransactionsRows((p) => p.filter((_, idx) => idx !== i))}>Remove</button>
          </div>
        ))}
      </Block>

      {showRules && (
        <>
          <Block title="Fixed Savings Override Windows" addLabel="+ Add override window" onAdd={() => setQRows((p) => [...p, { start: "", end: "", fixed: "" }])} hint="For this range, set savings to a fixed amount.">
            {qRows.map((row, i) => (
              <div className="rowGrid period3" key={`q-${i}`}>
                <input type="date" value={row.start} onChange={(e) => setQRows((p) => p.map((x, idx) => (idx === i ? { ...x, start: e.target.value } : x)))} />
                <input type="date" value={row.end} onChange={(e) => setQRows((p) => p.map((x, idx) => (idx === i ? { ...x, end: e.target.value } : x)))} />
                <input type="number" placeholder="Fixed amount" value={row.fixed} onChange={(e) => setQRows((p) => p.map((x, idx) => (idx === i ? { ...x, fixed: e.target.value } : x)))} />
                <button className="ghost danger" onClick={() => setQRows((p) => p.filter((_, idx) => idx !== i))}>Remove</button>
              </div>
            ))}
          </Block>

          <Block title="Bonus Top-up Windows" addLabel="+ Add top-up window" onAdd={() => setPRows((p) => [...p, { start: "", end: "", extra: "" }])} hint="For this range, add an extra savings amount.">
            {pRows.map((row, i) => (
              <div className="rowGrid period3" key={`p-${i}`}>
                <input type="date" value={row.start} onChange={(e) => setPRows((p) => p.map((x, idx) => (idx === i ? { ...x, start: e.target.value } : x)))} />
                <input type="date" value={row.end} onChange={(e) => setPRows((p) => p.map((x, idx) => (idx === i ? { ...x, end: e.target.value } : x)))} />
                <input type="number" placeholder="Top-up amount" value={row.extra} onChange={(e) => setPRows((p) => p.map((x, idx) => (idx === i ? { ...x, extra: e.target.value } : x)))} />
                <button className="ghost danger" onClick={() => setPRows((p) => p.filter((_, idx) => idx !== i))}>Remove</button>
              </div>
            ))}
          </Block>

          <Block title="Evaluation Windows" addLabel="+ Add evaluation window" onAdd={() => setKRows((p) => [...p, { start: "", end: "" }])} hint="Required for returns breakdown." required>
            {kRows.map((row, i) => (
              <div className="rowGrid period2" key={`k-${i}`}>
                <input type="date" value={row.start} onChange={(e) => setKRows((p) => p.map((x, idx) => (idx === i ? { ...x, start: e.target.value } : x)))} />
                <input type="date" value={row.end} onChange={(e) => setKRows((p) => p.map((x, idx) => (idx === i ? { ...x, end: e.target.value } : x)))} />
                <button className="ghost danger" onClick={() => setKRows((p) => p.filter((_, idx) => idx !== i))}>Remove</button>
              </div>
            ))}
          </Block>
        </>
      )}
    </>
  );
}

function Block(props: { title: string; addLabel: string; hint: string; required?: boolean; onAdd: () => void; children: React.ReactNode }) {
  return (
    <div className="group">
      <div className="groupHead">
        <h3>{props.title} {props.required ? <span className="required">*</span> : null}</h3>
        <button className="ghost" onClick={props.onAdd}>{props.addLabel}</button>
      </div>
      <p className="sub">{props.hint}</p>
      {props.children}
    </div>
  );
}

function ResultView({ data, mode, returnsTool }: { data: unknown; mode: Mode; returnsTool: ReturnsTool }) {
  if (!data) return <p className="sub">Run an action to see user-friendly output here.</p>;

  const anyData = data as Record<string, unknown>;

  if (Array.isArray(anyData.transactions)) {
    const rows = anyData.transactions as Array<Record<string, unknown>>;
    return (
      <div>
        <h3>Parsed Transactions</h3>
        <table><thead><tr><th>Date</th><th>Amount</th><th>Ceiling</th><th>Savings</th></tr></thead><tbody>
          {rows.map((r, i) => <tr key={i}><td>{String(r.date)}</td><td>{fmt(Number(r.amount || 0))}</td><td>{fmt(Number(r.ceiling || 0))}</td><td>{fmt(Number(r.remanent || 0))}</td></tr>)}
        </tbody></table>
      </div>
    );
  }

  if (Array.isArray(anyData.valid) || Array.isArray(anyData.invalid)) {
    const valid = (anyData.valid as Array<Record<string, unknown>>) ?? [];
    const invalid = (anyData.invalid as Array<Record<string, unknown>>) ?? [];
    return (
      <div className="stats">
        <Stat label="Valid" value={String(valid.length)} />
        <Stat label="Invalid" value={String(invalid.length)} />
        {valid.length > 0 && <p className="sub">First valid date: {String(valid[0].date)}</p>}
        {invalid.length > 0 && <p className="sub">Issue: {String(invalid[0].message)}</p>}
      </div>
    );
  }

  if (Array.isArray(anyData.savingsByDates)) {
    const rows = anyData.savingsByDates as Array<Record<string, unknown>>;
    const retirementMessage = String(anyData.responseMessage || "");
    const returnsThemeClass = mode === "returns" && returnsTool === "nps" ? "returnsTheme npsTheme" : "returnsTheme indexTheme";
    return (
      <div className={returnsThemeClass}>
        {retirementMessage && <div className="docBanner"><strong>Retirement Projection:</strong> {retirementMessage}</div>}
        <div className="stats">
          <Stat label="Total Spent" value={fmt(Number(anyData.transactionsTotalAmount || 0))} />
          <Stat label="Total Ceiling" value={fmt(Number(anyData.transactionsTotalCeiling || 0))} />
          <Stat label="Total Invested" value={fmt(Number(anyData.totalInvestedAmount || 0))} />
          <Stat label="Corpus At 60" value={fmt(Number(anyData.retirementCorpusAt60 || 0))} />
          <Stat label="Horizon (Years)" value={String(anyData.investmentHorizonYears || 0)} />
          <Stat label="Windows" value={String(rows.length)} />
        </div>
        <table><thead><tr><th>Window</th><th>Savings</th><th>Profit</th><th>Corpus At 60</th><th>Tax Benefit</th></tr></thead><tbody>
          {rows.map((r, i) => <tr key={i}><td>{String(r.start)} to {String(r.end)}</td><td>{fmt(Number(r.amount || 0))}</td><td>{fmt(Number(r.profit || 0))}</td><td>{fmt(Number(r.projectedCorpusAt60 || 0))}</td><td>{fmt(Number(r.taxBenefit || 0))}</td></tr>)}
        </tbody></table>
      </div>
    );
  }

  return <pre>{JSON.stringify(data, null, 2)}</pre>;
}

function Stat({ label, value }: { label: string; value: string }) {
  return <div className="stat"><small>{label}</small><strong>{value}</strong></div>;
}
