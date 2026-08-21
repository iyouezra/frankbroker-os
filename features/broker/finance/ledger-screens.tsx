"use client";

import { useCallback, useEffect, useState } from "react";
import { fetchJsonWithTransientRetry } from "../../../lib/fetch-json";
import { LEDGER_PERMISSIONS, hasPermission, type Role } from "../../../lib/frank";
import { EmptyState, Metric, SectionHeader, displayLabel, etb, fmt } from "../shared/broker-foundation";

/**
 * The finance workspace is deliberately read-only. Every balance here is a
 * consequence of an operational event, so the way to change one is to capture,
 * verify, settle or reverse that event — never to type a journal entry. There
 * is no create affordance anywhere in this file, and that is the point.
 */

type TrialBalanceRow = {
  id: string; role: string; code: string; name: string; accountClass: string; normalBalance: string;
  statementCaption: string; subLedger: string | null; postingEnabled: boolean;
  balance: number; debit: number; credit: number; debitTotal: number; creditTotal: number; entryCount: number;
};
type Tie = { key: string; label: string; detail: string; glBalance: number; subLedgerBalance: number; variance: number; matched: boolean };
type EntrySummary = { id: string; entryDate: string; valueDate: string; sourceType: string; sourceId: string | null; description: string; status: string; totalDebit: number; totalCredit: number; lineCount: number; tradeId: string | null; cashMovementId: string | null; orderId: string | null };
type Position = {
  chartReady: boolean;
  trialBalance: { asAt: string; rows: TrialBalanceRow[]; totalDebit: number; totalCredit: number; variance: number; balanced: boolean };
  protectedClientMoney: Coverage;
  settlementCoverage: Coverage;
  ties: Tie[];
  recentEntries: EntrySummary[];
};
type Coverage = { held: number; owed: number; surplus: number; adequate: boolean; components: Array<{ role: string; code: string; name: string; side: "held" | "owed"; amount: number }> };
type LineRow = { id: string; entryId: string; lineNumber: number; side: string; amount: number; runningBalance: number; memo: string; valueDate: string; entryDate: string; description: string; sourceType: string; sourceId: string | null; status: string; clientAccountNumber: string | null; clientName: string | null };
type AccountStatement = { account: { id: string; role: string; code: string; name: string; accountClass: string; normalBalance: string; statementCaption: string; subLedger: string | null; balance: number; debitTotal: number; creditTotal: number }; lines: LineRow[] };
type EntryDetail = {
  id: string; entryDate: string; valueDate: string; sourceType: string; sourceId: string | null; description: string; status: string; reason: string | null;
  totalDebit: number; totalCredit: number; postedBy: string | null; postedAt: string; approvedBy: string | null;
  reversesEntryId: string | null; reversedByEntryId: string | null;
  orderId: string | null; tradeId: string | null; settlementId: string | null; cashMovementId: string | null;
  lines: Array<{ id: string; lineNumber: number; side: string; amount: number; memo: string; code: string; name: string; role: string; ledgerAccountId: string; clientAccountNumber: string | null; clientName: string | null }>;
};

const CLASS_LABEL: Record<string, string> = {
  asset: "Assets", liability: "Liabilities", equity: "Equity",
  income: "Income", expense: "Expenses", memorandum: "Memorandum",
};
const CLASS_ORDER = ["asset", "liability", "equity", "income", "expense", "memorandum"];
const signed = (value: number) => `${value < 0 ? "−" : ""}${etb(Math.abs(value))}`;

export function FinanceLedgerPage({ role, onOpenSource }: { role: Role; onOpenSource?: (kind: "trade" | "cash_movement" | "order", id: string) => void }) {
  const [position, setPosition] = useState<Position | null>(null);
  const [statement, setStatement] = useState<AccountStatement | null>(null);
  const [entry, setEntry] = useState<EntryDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const canExport = hasPermission(role, LEDGER_PERMISSIONS.export);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setPosition(await fetchJsonWithTransientRetry<Position>("/api/gl?view=position", { cache: "no-store" }, { fallbackMessage: "The ledger could not be read." }));
      setError(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The ledger could not be read.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timeout = window.setTimeout(() => { void load(); }, 0);
    return () => window.clearTimeout(timeout);
  }, [load]);

  const openAccount = async (accountId: string) => {
    setEntry(null);
    try {
      setStatement(await fetchJsonWithTransientRetry<AccountStatement>(`/api/gl?view=account&accountId=${encodeURIComponent(accountId)}`, { cache: "no-store" }, { fallbackMessage: "That account could not be opened." }));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "That account could not be opened.");
    }
  };

  const openEntry = async (entryId: string) => {
    try {
      setEntry(await fetchJsonWithTransientRetry<EntryDetail>(`/api/gl?view=entry&entryId=${encodeURIComponent(entryId)}`, { cache: "no-store" }, { fallbackMessage: "That entry could not be opened." }));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "That entry could not be opened.");
    }
  };

  const exportTrialBalance = () => {
    if (!position) return;
    const header = "code,role,account,ifrs_caption,class,debit,credit\n";
    const body = position.trialBalance.rows
      .map((row) => [row.code, row.role, `"${row.name}"`, `"${row.statementCaption}"`, row.accountClass, row.debit.toFixed(2), row.credit.toFixed(2)].join(","))
      .join("\n");
    const blob = new Blob([header + body], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `trial-balance-${position.trialBalance.asAt}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  if (loading) return <EmptyState title="Reading the ledger" copy="Gathering control account balances." />;
  if (error) return <EmptyState title="The ledger could not be read" copy={error} />;
  if (!position) return <EmptyState title="No ledger data" copy="Nothing has been posted yet." />;

  if (!position.chartReady) {
    return <>
      <SectionHeader eyebrow="GENERAL LEDGER" title="Finance" copy="The broker's own books, derived from what operations already did." />
      <EmptyState title="The chart of accounts has not been opened yet" copy="This broker has no control accounts, so nothing can post. Seed the chart and post the opening balance before trading continues." />
    </>;
  }

  const { trialBalance, protectedClientMoney, settlementCoverage, ties } = position;
  const breaks = ties.filter((tie) => !tie.matched);

  return <>
    <SectionHeader
      eyebrow="GENERAL LEDGER"
      title="Finance"
      copy="The broker's own books, derived from what operations already did. Every balance traces back to the event that caused it."
      action={canExport ? <button className="btn secondary" onClick={exportTrialBalance}>Export trial balance</button> : undefined}
    />

    <section className="metric-grid">
      <Metric
        label="Protected-money surplus"
        value={signed(protectedClientMoney.surplus)}
        note={protectedClientMoney.adequate ? "Confirmed designated cash covers protected balances" : "Confirmed designated cash is short — escalate immediately"}
        tone={protectedClientMoney.adequate ? "success" : "danger"}
      />
      <Metric label="Confirmed client-bank cash" value={etb(protectedClientMoney.held)} note="Designated pooled bank accounts only" tone="purple" />
      <Metric label="Settlement coverage" value={signed(settlementCoverage.surplus)} note="Includes gateway and CSD receivables" tone={settlementCoverage.adequate ? "success" : "warning"} />
      <Metric
        label="Ledger balance"
        value={trialBalance.balanced ? "In balance" : signed(trialBalance.variance)}
        note={trialBalance.balanced ? `Debits equal credits at ${etb(trialBalance.totalDebit)}` : "Debits do not equal credits"}
        tone={trialBalance.balanced ? "success" : "danger"}
      />
    </section>

    <section className="panel">
      <div className="panel-head">
        <div><span className="eyebrow">CONTROL TOTALS</span><h2>Ledger against the sub-ledgers</h2></div>
        <span className="exception-count">{breaks.length ? `${breaks.length} break${breaks.length > 1 ? "s" : ""}` : "All tied"}</span>
      </div>
      {ties.map((tie) => (
        <div className="exception-row" key={tie.key}>
          <span className={`queue-icon ${tie.matched ? "info" : "danger"}`}>{tie.matched ? "✓" : "!"}</span>
          <div><b>{tie.label}</b><small>{tie.detail}</small></div>
          <strong>{tie.matched ? etb(tie.glBalance) : `${signed(tie.variance)} out`}</strong>
        </div>
      ))}
      {breaks.length > 0 && (
        <p className="panel-note">
          The sub-ledger is the system of record. Where these disagree, the ledger has drifted and the difference must be explained before sign-off — never adjusted away.
        </p>
      )}
    </section>

    <section className="panel table-panel">
      <div className="panel-head">
        <div><span className="eyebrow">TRIAL BALANCE</span><h2>Control accounts as at {trialBalance.asAt}</h2></div>
        <span className="exception-count">{trialBalance.rows.length} accounts</span>
      </div>
      <div className="table-scroll">
        <table>
          <thead><tr><th>Code</th><th>Account</th><th>IFRS caption</th><th className="num">Debit</th><th className="num">Credit</th><th className="num">Entries</th></tr></thead>
          <tbody>
            {CLASS_ORDER.flatMap((accountClass) => {
              const rows = trialBalance.rows.filter((row) => row.accountClass === accountClass);
              if (!rows.length) return [];
              return [
                <tr key={`head-${accountClass}`} className="group-row"><td colSpan={6}><b>{CLASS_LABEL[accountClass] ?? accountClass}</b></td></tr>,
                ...rows.map((row) => (
                  <tr key={row.id} onClick={() => void openAccount(row.id)} className={statement?.account.id === row.id ? "focused-record" : ""}>
                    <td><b>{row.code}</b>{!row.postingEnabled && <small>disabled</small>}</td>
                    <td><b>{row.name}</b><small>{row.role}</small></td>
                    <td><small>{row.statementCaption}</small></td>
                    <td className="num">{row.debit ? <b>{fmt.format(row.debit)}</b> : <small>—</small>}</td>
                    <td className="num">{row.credit ? <b>{fmt.format(row.credit)}</b> : <small>—</small>}</td>
                    <td className="num"><small>{row.entryCount || "—"}</small></td>
                  </tr>
                )),
              ];
            })}
          </tbody>
          <tfoot><tr><td colSpan={3}><b>Total</b></td><td className="num"><b>{fmt.format(trialBalance.totalDebit)}</b></td><td className="num"><b>{fmt.format(trialBalance.totalCredit)}</b></td><td /></tr></tfoot>
        </table>
      </div>
    </section>

    {statement && (
      <section className="panel table-panel">
        <div className="panel-head">
          <div><span className="eyebrow">ACCOUNT {statement.account.code}</span><h2>{statement.account.name}</h2></div>
          <button className="btn secondary small" onClick={() => { setStatement(null); setEntry(null); }}>Close</button>
        </div>
        {statement.lines.length ? (
          <div className="table-scroll">
            <table>
              <thead><tr><th>Value date</th><th>Description</th><th>Client</th><th className="num">Debit</th><th className="num">Credit</th><th className="num">Balance</th></tr></thead>
              <tbody>
                {statement.lines.map((line) => (
                  <tr key={line.id} onClick={() => void openEntry(line.entryId)} className={entry?.id === line.entryId ? "focused-record" : ""}>
                    <td><b>{line.valueDate}</b><small>{displayLabel(line.sourceType)}</small></td>
                    <td><b>{line.description}</b><small>{line.memo}</small></td>
                    <td>{line.clientName ? <><b>{line.clientName}</b><small>{line.clientAccountNumber}</small></> : <small>—</small>}</td>
                    <td className="num">{line.side === "debit" ? <b>{fmt.format(line.amount)}</b> : <small>—</small>}</td>
                    <td className="num">{line.side === "credit" ? <b>{fmt.format(line.amount)}</b> : <small>—</small>}</td>
                    <td className="num"><small>{fmt.format(line.runningBalance)}</small></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <EmptyState title="Nothing has posted to this account" copy="It will fill as trades, deposits and settlements happen." />}
      </section>
    )}

    {entry && (
      <section className="panel">
        <div className="panel-head">
          <div><span className="eyebrow">JOURNAL ENTRY · {displayLabel(entry.status)}</span><h2>{entry.id}</h2></div>
          <button className="btn secondary small" onClick={() => setEntry(null)}>Close</button>
        </div>
        <div className="entry-meta">
          <span><small>Value date</small><b>{entry.valueDate}</b></span>
          <span><small>Source</small><b>{displayLabel(entry.sourceType)}</b></span>
          <span><small>Posted by</small><b>{entry.postedBy ?? "System"}</b></span>
          {entry.approvedBy && <span><small>Approved by</small><b>{entry.approvedBy}</b></span>}
        </div>
        <p>{entry.description}</p>
        <div className="table-scroll">
          <table>
            <thead><tr><th>Account</th><th>Memo</th><th className="num">Debit</th><th className="num">Credit</th></tr></thead>
            <tbody>
              {entry.lines.map((line) => (
                <tr key={line.id}>
                  <td><b>{line.code} · {line.name}</b>{line.clientName && <small>{line.clientName} · {line.clientAccountNumber}</small>}</td>
                  <td><small>{line.memo}</small></td>
                  <td className="num">{line.side === "debit" ? <b>{fmt.format(line.amount)}</b> : <small>—</small>}</td>
                  <td className="num">{line.side === "credit" ? <b>{fmt.format(line.amount)}</b> : <small>—</small>}</td>
                </tr>
              ))}
            </tbody>
            <tfoot><tr><td colSpan={2}><b>Total</b></td><td className="num"><b>{fmt.format(entry.totalDebit)}</b></td><td className="num"><b>{fmt.format(entry.totalCredit)}</b></td></tr></tfoot>
          </table>
        </div>
        {/* The drill-through ends at the operational event. A hand-keyed voucher
            has no such origin, which is exactly why we do not have one. */}
        {(entry.tradeId || entry.cashMovementId || entry.orderId) && onOpenSource && (
          <div className="entry-source">
            <small>This entry was caused by</small>
            {entry.tradeId && <button className="btn secondary small" onClick={() => onOpenSource("trade", entry.tradeId!)}>Trade {entry.tradeId}</button>}
            {entry.cashMovementId && <button className="btn secondary small" onClick={() => onOpenSource("cash_movement", entry.cashMovementId!)}>Cash instruction {entry.cashMovementId}</button>}
            {entry.orderId && !entry.tradeId && <button className="btn secondary small" onClick={() => onOpenSource("order", entry.orderId!)}>Order {entry.orderId}</button>}
          </div>
        )}
        {entry.reversedByEntryId && <p className="panel-note">Reversed by <b>{entry.reversedByEntryId}</b>. Entries are never edited or deleted — a correction is always a new, balancing entry.</p>}
        {entry.reversesEntryId && <p className="panel-note">This entry reverses <b>{entry.reversesEntryId}</b>.{entry.reason ? ` ${entry.reason}` : ""}</p>}
      </section>
    )}

    {!statement && (
      <section className="panel table-panel">
        <div className="panel-head"><div><span className="eyebrow">RECENT POSTINGS</span><h2>Latest journal entries</h2></div></div>
        {position.recentEntries.length ? (
          <div className="table-scroll">
            <table>
              <thead><tr><th>Entry</th><th>Description</th><th>Source</th><th className="num">Amount</th></tr></thead>
              <tbody>
                {position.recentEntries.map((item) => (
                  <tr key={item.id} onClick={() => void openEntry(item.id)}>
                    <td><b>{item.id}</b><small>{item.valueDate}</small></td>
                    <td><b>{item.description}</b><small>{item.lineCount} lines · {displayLabel(item.status)}</small></td>
                    <td><small>{displayLabel(item.sourceType)}</small></td>
                    <td className="num"><b>{fmt.format(item.totalDebit)}</b><small>ETB</small></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <EmptyState title="Nothing has posted yet" copy="Entries appear here as trades are captured, deposits verified and settlements confirmed." />}
      </section>
    )}
  </>;
}
