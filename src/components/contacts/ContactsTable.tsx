"use client";

import { useState, useMemo } from "react";
import type { Contact } from "@/lib/types";
import { type FieldDef, getContactFieldValue } from "@/lib/sheetTemplates";

const PAGE_SIZE = 100;

interface ContactsTableProps {
  contacts: Contact[];
  fields: FieldDef[];
  onRowClick: (contact: Contact) => void;
  onToggleContacted: (id: string, val: boolean) => void;
}

function parseDateTime(value: unknown): number | null {
  if (value instanceof Date) {
    const ts = value.getTime();
    return Number.isNaN(ts) ? null : ts;
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    // Support both seconds and milliseconds epoch values.
    return value < 1_000_000_000_000 ? value * 1000 : value;
  }
  if (typeof value !== "string") return null;

  const raw = value.trim();
  if (!raw) return null;

  // Handle PocketBase datetime strings like "YYYY-MM-DD HH:mm:ss.SSSZ"
  const normalized = raw.includes(" ") ? raw.replace(" ", "T") : raw;
  const parsed = Date.parse(normalized);
  if (!Number.isNaN(parsed)) return parsed;

  const numeric = Number(raw);
  if (Number.isFinite(numeric)) {
    return numeric < 1_000_000_000_000 ? numeric * 1000 : numeric;
  }
  return null;
}

function getAddedTimestamp(contact: Contact): number | null {
  const record = contact as Record<string, unknown>;
  const primaryCandidates = [
    record.created,
    record.created_at,
    record.createdAt,
    record["@created"],
    record._created,
  ];

  for (const candidate of primaryCandidates) {
    const parsed = parseDateTime(candidate);
    if (parsed !== null) return parsed;
  }

  // Last-resort: scan any key containing "created" for a parseable timestamp.
  for (const [key, candidate] of Object.entries(record)) {
    if (!/created/i.test(key)) continue;
    const parsed = parseDateTime(candidate);
    if (parsed !== null) return parsed;
  }

  return null;
}

function formatAddedDateTime(contact: Contact): string {
  const ts = getAddedTimestamp(contact);
  if (ts === null) return "—";
  const d = new Date(ts);
  return d.toLocaleString("en-GB", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function ContactsTable({
  contacts,
  fields,
  onRowClick,
  onToggleContacted,
}: ContactsTableProps) {
  const [search, setSearch] = useState("");
  const [filterChannel, setFilterChannel] = useState("");
  const [filterOwner, setFilterOwner] = useState("");
  const [sortKey, setSortKey] = useState<string>("created");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [page, setPage] = useState(1);

  // Always show the "Added" column at the end
  const cols = useMemo(() => {
    const fieldCols = fields.map((f) => ({
      key: f.key,
      label: f.label,
      type: f.type,
      width: f.key === "contacted" ? "w-24" : f.type === "url" ? "w-64" : undefined,
    }));
    // Add "Added" date column if not already a field
    if (!fields.some((f) => f.key === "created")) {
      fieldCols.push({ key: "created", label: "Added", type: "text" as const, width: "w-28" });
    }
    return fieldCols;
  }, [fields]);

  const owners = useMemo(() => {
    const set = new Set(contacts.map((c) => c.owner).filter(Boolean));
    return Array.from(set).sort();
  }, [contacts]);

  // Can we filter by channel/owner given the current fields?
  const hasChannel = fields.some((f) => f.key === "channel");
  const hasOwner = fields.some((f) => f.key === "owner");

  const filtered = useMemo(() => {
    let list = contacts;
    if (search) {
      const q = search.toLowerCase();
      list = list.filter((c) => {
        // Search across all visible fields
        for (const f of fields) {
          const v = getContactFieldValue(c, f.key);
          if (v && String(v).toLowerCase().includes(q)) return true;
        }
        return false;
      });
    }
    if (filterChannel && hasChannel)
      list = list.filter((c) => c.channel?.toLowerCase().includes(filterChannel.toLowerCase()));
    if (filterOwner && hasOwner)
      list = list.filter((c) => c.owner === filterOwner);

    list = [...list].sort((a, b) => {
      if (sortKey === "created") {
        const at = getAddedTimestamp(a);
        const bt = getAddedTimestamp(b);
        const aSafe = at ?? 0;
        const bSafe = bt ?? 0;
        return sortDir === "asc" ? aSafe - bSafe : bSafe - aSafe;
      }

      const av = getContactFieldValue(a, sortKey) ?? "";
      const bv = getContactFieldValue(b, sortKey) ?? "";
      const cmp = String(av).localeCompare(String(bv));
      return sortDir === "asc" ? cmp : -cmp;
    });
    return list;
  }, [contacts, search, filterChannel, filterOwner, sortKey, sortDir, fields, hasChannel, hasOwner]);

  function handleSort(key: string) {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
    setPage(1);
  }

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const paginated = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  function renderCellValue(contact: Contact, col: { key: string; type: string }) {
    if (col.key === "contacted" || col.type === "checkbox") {
      const value = getContactFieldValue(contact, col.key);
      return (
        <input
          type="checkbox"
          checked={!!value}
          onChange={(e) => onToggleContacted(contact.id, e.target.checked)}
          className="w-3.5 h-3.5 accent-black cursor-pointer"
        />
      );
    }

    if (col.key === "created") {
      return formatAddedDateTime(contact);
    }

    const value = getContactFieldValue(contact, col.key);

    if (col.type === "url" && value) {
      const href = String(value).startsWith("http") ? String(value) : `https://${value}`;
      return (
        <a
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => e.stopPropagation()}
          className="text-xs text-black underline underline-offset-2 truncate block max-w-[240px]"
        >
          {String(value)}
        </a>
      );
    }

    return value ? (
      String(value)
    ) : (
      <span className="text-[#d4d4d4]">—</span>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="flex items-center gap-3 px-6 py-3 border-b border-[#e5e5e5]">
        <input
          type="text"
          placeholder="Search..."
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(1); }}
          className="border border-[#e5e5e5] px-3 py-1.5 text-xs outline-none focus:border-black w-48 placeholder:text-[#d4d4d4]"
        />
        {hasChannel && (
          <input
            type="text"
            placeholder="Filter channel..."
            value={filterChannel}
            onChange={(e) => { setFilterChannel(e.target.value); setPage(1); }}
            className="border border-[#e5e5e5] px-2 py-1.5 text-xs outline-none focus:border-black w-32 placeholder:text-[#d4d4d4]"
          />
        )}
        {hasOwner && owners.length > 0 && (
          <select
            value={filterOwner}
            onChange={(e) => { setFilterOwner(e.target.value); setPage(1); }}
            className="border border-[#e5e5e5] px-2 py-1.5 text-xs outline-none focus:border-black bg-white"
          >
            <option value="">All owners</option>
            {owners.map((o) => (
              <option key={o} value={o}>
                {o}
              </option>
            ))}
          </select>
        )}
        <span className="ml-auto text-xs text-[#737373]">
          {filtered.length} contact{filtered.length !== 1 ? "s" : ""}
        </span>
        {totalPages > 1 && (
          <div className="flex items-center gap-1">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
              className="text-xs border border-[#e5e5e5] px-2 py-1 hover:border-black transition-none disabled:opacity-30"
            >
              ←
            </button>
            <span className="text-xs text-[#737373]">{page} / {totalPages}</span>
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
              className="text-xs border border-[#e5e5e5] px-2 py-1 hover:border-black transition-none disabled:opacity-30"
            >
              →
            </button>
          </div>
        )}
      </div>

      {/* Table */}
      <div className="overflow-auto flex-1">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="border-b border-[#e5e5e5] bg-[#fafafa]">
              {cols.map((col) => (
                <th
                  key={col.key}
                  onClick={() => handleSort(col.key)}
                  className={`text-left px-4 py-2.5 text-xs font-medium text-[#737373] cursor-pointer hover:text-black select-none whitespace-nowrap ${col.width ?? ""}`}
                >
                  {col.label}
                  {sortKey === col.key && (
                    <span className="ml-1">{sortDir === "asc" ? "↑" : "↓"}</span>
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr>
                <td
                  colSpan={cols.length}
                  className="px-4 py-12 text-xs text-[#737373] text-center"
                >
                  No contacts yet.
                </td>
              </tr>
            )}
            {paginated.map((contact) => (
              <tr
                key={contact.id}
                className="border-b border-[#e5e5e5] hover:bg-[#fafafa] cursor-pointer"
                onClick={() => onRowClick(contact)}
              >
                {cols.map((col) => (
                  <td
                    key={col.key}
                    className={`px-4 py-2.5 text-xs ${col.key === "contacted" || col.type === "checkbox" ? "" : "text-[#737373]"
                      } ${col.type === "url" ? "max-w-xs" : ""}`}
                    onClick={
                      col.key === "contacted" || col.type === "checkbox" || col.type === "url"
                        ? (e) => e.stopPropagation()
                        : undefined
                    }
                  >
                    {renderCellValue(contact, col)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
