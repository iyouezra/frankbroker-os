"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { AppTarget, SearchResult } from "../../../lib/back-office";
import type { Role } from "../../../lib/frank";
import { BROKER_TENANT_ID, Icon, displayLabel } from "./broker-foundation";

export function UniversalSearch({ role, onSelect }: { role: Role; onSelect: (target: AppTarget) => void }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const command = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setOpen(true);
      }
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", command);
    return () => window.removeEventListener("keydown", command);
  }, []);
  useEffect(() => { if (open) window.setTimeout(() => inputRef.current?.focus(), 0); }, [open]);
  useEffect(() => {
    const controller = new AbortController();
    const timeout = window.setTimeout(() => {
      if (query.trim().length < 2) { setResults([]); setLoading(false); return; }
      setLoading(true);
      void fetch(`/api/search?q=${encodeURIComponent(query.trim())}&limit=20`, {
        signal: controller.signal,
        headers: { "x-frank-tenant-id": BROKER_TENANT_ID, "x-frank-demo-role": role },
      })
        .then((response) => response.ok ? response.json() : Promise.reject(new Error("Search unavailable")))
        .then((data: { results: SearchResult[] }) => { setResults(data.results); setActive(0); })
        .catch(() => { if (!controller.signal.aborted) setResults([]); })
        .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    }, 250);
    return () => { window.clearTimeout(timeout); controller.abort(); };
  }, [query, role]);

  const groups = useMemo(() => {
    const grouped = new Map<string, SearchResult[]>();
    for (const result of results) grouped.set(result.entityType, [...(grouped.get(result.entityType) ?? []), result]);
    return [...grouped.entries()];
  }, [results]);
  const choose = (result: SearchResult) => {
    onSelect(result.target);
    setOpen(false);
    setQuery("");
  };
  const keyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "ArrowDown") { event.preventDefault(); setActive((index) => Math.min(results.length - 1, index + 1)); }
    if (event.key === "ArrowUp") { event.preventDefault(); setActive((index) => Math.max(0, index - 1)); }
    if (event.key === "Enter" && results[active]) { event.preventDefault(); choose(results[active]); }
  };

  return <>
    <label className="search" onClick={() => setOpen(true)}><span><Icon name="search" size={17} /></span><input aria-label="Search back office" placeholder="Search clients, orders, conversations…" readOnly value="" /><kbd>⌘ K</kbd></label>
    {open && <div className="command-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setOpen(false); }}>
      <section className="command-palette" role="dialog" aria-modal="true" aria-label="Search back office">
        <label className="command-input"><Icon name="search" size={19} /><input ref={inputRef} value={query} onChange={(event) => setQuery(event.target.value)} onKeyDown={keyDown} placeholder="Search by name, ID, account, symbol, or reference…" /><kbd>ESC</kbd></label>
        <div className="command-results">
          {query.trim().length < 2 ? <p>Enter at least two characters.</p>
            : loading ? <p>Searching…</p>
            : results.length === 0 ? <p>No records found.</p>
            : groups.map(([entityType, rows]) => <section key={entityType}><h3>{displayLabel(entityType)}</h3>{rows.map((result) => {
              const index = results.indexOf(result);
              return <button key={`${result.entityType}:${result.id}`} className={active === index ? "active" : ""} onMouseEnter={() => setActive(index)} onClick={() => choose(result)}>
                <span><b>{result.title}</b><small>{result.context}</small></span><em>{displayLabel(result.status)} · {result.id}</em>
              </button>;
            })}</section>)}
        </div>
      </section>
    </div>}
  </>;
}
