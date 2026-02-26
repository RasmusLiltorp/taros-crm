"use client";

import { useState, useCallback, useMemo } from "react";
import Papa from "papaparse";
import { autoMapColumns, resolveContactPerson, resolveContacted } from "@/lib/linkedinDetector";
import { isSameUrl } from "@/lib/csvNormalize";
import type { ColumnMapping } from "@/lib/linkedinDetector";
import type { Contact } from "@/lib/types";
import { getPocketBase } from "@/lib/pocketbase";
import { getSheetTemplate, splitContactData, type FieldDef } from "@/lib/sheetTemplates";

type Step = "upload" | "map" | "review" | "done";

interface ParsedRow {
  raw: Record<string, string>;
  resolved: Record<string, unknown>;
}

interface DuplicateAction {
  rowIndex: number;
  action: "skip" | "overwrite" | "import";
  existingId?: string;
}

interface ImportWizardProps {
  teamId: string;
  sheetId: string;
  sheetTemplateId?: string | null;
  sheetFields: FieldDef[];
  existingContacts: Contact[];
  onImportDone: () => void;
}

function isDelimiterOnlyRow(line: string): boolean {
  return line.replace(/[\s,;"']/g, "") === "";
}

function stripLeadingEmptyCsvRows(raw: string): string {
  const lines = raw.split(/\r?\n/);
  while (lines.length > 0 && isDelimiterOnlyRow(lines[0] ?? "")) {
    lines.shift();
  }
  return lines.join("\n");
}

export default function ImportWizard({
  teamId,
  sheetId,
  sheetTemplateId,
  sheetFields,
  existingContacts,
  onImportDone,
}: ImportWizardProps) {
  const activeTemplate = useMemo(
    () => getSheetTemplate(sheetTemplateId),
    [sheetTemplateId]
  );
  const [step, setStep] = useState<Step>("upload");
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<Record<string, string>[]>([]);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [isLinkedIn, setIsLinkedIn] = useState(false);
  const [mapping, setMapping] = useState<ColumnMapping>({
    url: null,
    contact_person: null,
    first_name: null,
    last_name: null,
    company_name: null,
    channel: null,
    group_name: null,
    owner: null,
    contacted: null,
    notes: null,
  });

  // Batch values applied to every imported row
  const [batchChannel, setBatchChannel] = useState(activeTemplate.defaultChannel ?? "");
  const [batchGroup, setBatchGroup] = useState(activeTemplate.defaultGroup ?? "");
  const [batchOwner, setBatchOwner] = useState("");
  const [batchNotes, setBatchNotes] = useState("");
  const [batchContactedMode, setBatchContactedMode] = useState<
    "from_csv" | "yes" | "no"
  >("from_csv");

  const [parsedRows, setParsedRows] = useState<ParsedRow[]>([]);
  const [duplicateActions, setDuplicateActions] = useState<
    Record<number, DuplicateAction["action"]>
  >({});
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<{
    imported: number;
    skipped: number;
    overwritten: number;
    failed: number;
    failedRows: { index: number; url: string; error: string }[];
  } | null>(null);

  // Step 1: Upload
  const CSV_ROW_LIMIT = 5000;

  const handleFile = useCallback((file: File) => {
    setUploadError(null);
    const reader = new FileReader();
    reader.onload = (e) => {
      const raw = e.target?.result as string;
      // Strip leading rows that are empty or delimiter-only (e.g. ",,,,,")
      // so the real header row is used for auto-mapping.
      const stripped = stripLeadingEmptyCsvRows(raw);
      if (!stripped.trim()) {
        setUploadError("CSV file appears empty.");
        return;
      }

      Papa.parse<Record<string, string>>(stripped, {
        header: true,
        skipEmptyLines: true,
        complete: (result) => {
          const hdrs = result.meta.fields ?? [];
          const data = result.data;

          // Cap row count to prevent unbounded PocketBase creates
          if (data.length > CSV_ROW_LIMIT) {
            setUploadError(
              `CSV contains ${data.length.toLocaleString()} rows — the maximum allowed is ${CSV_ROW_LIMIT.toLocaleString()}. Split the file and import in batches.`
            );
            return;
          }

          setHeaders(hdrs);
          setRows(data);
          const { isLinkedIn: li, mapping: autoMap } = autoMapColumns(hdrs);
          setIsLinkedIn(li);
          setMapping(autoMap);
          // Pre-fill channel with "LinkedIn" if detected
          if (li) setBatchChannel("LinkedIn");
          setStep("map");
        },
      });
    };
    reader.readAsText(file);
  }, []);

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  }

  function handleFileInput(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
  }

  // Step 2 → Step 3: resolve rows
  function buildParsedRows() {
    const resolved: ParsedRow[] = rows.map((row) => ({
      raw: row,
      resolved: {
        url: mapping.url ? (row[mapping.url] ?? "").trim() : "",
        contact_person: resolveContactPerson(row, mapping),
        company_name: mapping.company_name ? (row[mapping.company_name] ?? "") : "",
        channel: (batchChannel || (mapping.channel ? (row[mapping.channel] ?? "") : "")).trim(),
        group_name: (batchGroup || (mapping.group_name ? (row[mapping.group_name] ?? "") : "")).trim(),
        owner: (batchOwner || (mapping.owner ? (row[mapping.owner] ?? "") : "")).trim(),
        contacted:
          batchContactedMode === "yes"
            ? true
            : batchContactedMode === "no"
              ? false
              : resolveContacted(row, mapping),
        notes: batchNotes || (mapping.notes ? (row[mapping.notes] ?? "") : ""),
      },
    }));
    setParsedRows(resolved);

    // Pre-set duplicate actions
    const actions: Record<number, DuplicateAction["action"]> = {};
    resolved.forEach((pr, i) => {
      const existing = existingContacts.find((ec) =>
        isSameUrl(ec.url, String(pr.resolved.url ?? ""))
      );
      if (existing) {
        actions[i] = "skip"; // default: skip duplicates
      }
    });
    setDuplicateActions(actions);
    setStep("review");
  }

  // Step 3: import
  async function runImport() {
    setImporting(true);
    const pb = getPocketBase();
    let imported = 0;
    let skipped = 0;
    let overwritten = 0;
    let failed = 0;
    const failedRows: { index: number; url: string; error: string }[] = [];

    for (let i = 0; i < parsedRows.length; i++) {
      const pr = parsedRows[i];
      if (!pr) continue;
      const action = duplicateActions[i];
      const existing = existingContacts.find((ec) =>
        isSameUrl(ec.url, String(pr.resolved.url ?? ""))
      );

      if (existing && action === "skip") {
        skipped++;
        continue;
      }

      try {
        const data = splitContactData(pr.resolved, sheetFields);
        if (existing && action === "overwrite") {
          await pb.collection("contacts").update(existing.id, {
            ...data,
            team: teamId,
            sheet: existing.sheet ?? sheetId,
          });
          overwritten++;
        } else {
          await pb.collection("contacts").create({
            ...data,
            team: teamId,
            sheet: sheetId,
            created_by: pb.authStore.record?.id,
          });
          imported++;
        }
      } catch (err) {
        failed++;
        failedRows.push({
          index: i + 1,
          url: String(pr.resolved.url ?? "") || "(no url)",
          error: err instanceof Error ? err.message : "Unknown error",
        });
      }
    }

    setImportResult({ imported, skipped, overwritten, failed, failedRows });
    setImporting(false);
    setStep("done");
  }

  // Bulk duplicate actions
  function setBulkDuplicateAction(action: "skip" | "overwrite") {
    setDuplicateActions((prev) => {
      const next = { ...prev };
      Object.keys(next).forEach((k) => {
        next[Number(k)] = action;
      });
      return next;
    });
  }

  const duplicateCount = Object.keys(duplicateActions).length;
  const newCount = parsedRows.length - duplicateCount;

  function updateParsedRow(
    index: number,
    patch: Partial<ParsedRow["resolved"]>
  ) {
    setParsedRows((prev) => {
      const next = [...prev];
      const current = next[index];
      if (!current) return prev;
      next[index] = {
        ...current,
        resolved: {
          ...current.resolved,
          ...patch,
        },
      };
      return next;
    });

    if (patch.url !== undefined) {
      const nextUrl = String(patch.url ?? "").trim();
      const hasDupe = existingContacts.some((ec) =>
        isSameUrl(ec.url, nextUrl)
      );
      setDuplicateActions((prev) => {
        const next = { ...prev };
        if (hasDupe) {
          next[index] = next[index] ?? "skip";
        } else {
          delete next[index];
        }
        return next;
      });
    }
  }

  function exportNewRowsCsv() {
    const exportRows = parsedRows
      .filter((_, i) => duplicateActions[i] !== "skip")
      .map((pr) => pr.raw);

    if (exportRows.length === 0) return;

    const csvStr = Papa.unparse(exportRows);
    const blob = new Blob([csvStr], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute("download", `non_duplicates_${new Date().toISOString().split("T")[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  // ---- RENDER ----

  if (step === "upload") {
    return (
      <div className="max-w-xl">
        <h2 className="text-sm font-medium mb-1">Import contacts</h2>
        <p className="text-xs text-[#737373] mb-2">
          Template: {activeTemplate.name}
        </p>
        <p className="text-xs text-[#737373] mb-6">
          Upload a CSV file. LinkedIn Sales Navigator exports (via Evaboot, Scrupp, Phantombuster,
          etc.) are auto-detected and pre-mapped.
        </p>
        <p className="text-xs text-[#737373] mb-6">
          Required field: URL. If auto-detection misses columns, you can map them manually in the next step.
        </p>
        <div
          onDrop={handleDrop}
          onDragOver={(e) => e.preventDefault()}
          className="border border-dashed border-[#e5e5e5] p-12 text-center hover:border-black transition-none cursor-pointer"
        >
          <p className="text-xs text-[#737373] mb-3">
            Drag a CSV file here, or
          </p>
          <label className="text-xs border border-black px-3 py-1.5 cursor-pointer hover:bg-black hover:text-white transition-none">
            Choose file
            <input
              type="file"
              accept=".csv"
              className="hidden"
              onChange={handleFileInput}
            />
          </label>
        </div>
        {uploadError && (
          <p className="text-xs text-[#cc0000] mt-3">{uploadError}</p>
        )}
      </div>
    );
  }

  if (step === "map") {
    const columnMappingFields: {
      key: keyof Pick<
        ColumnMapping,
        "url" | "contact_person" | "first_name" | "last_name" | "company_name" | "channel" | "group_name" | "owner" | "contacted" | "notes"
      >;
      label: string;
      note?: string;
    }[] = [
        { key: "url", label: "URL *" },
        {
          key: "contact_person",
          label: "Contact person",
          note: "or use First name + Last name below",
        },
        { key: "first_name", label: "First name (split)" },
        { key: "last_name", label: "Last name (split)" },
        { key: "company_name", label: "Company name" },
        { key: "channel", label: "Channel (from CSV)" },
        { key: "group_name", label: "Group (from CSV)" },
        { key: "owner", label: "Owner (from CSV)" },
        { key: "contacted", label: "Contacted? (from CSV)" },
        { key: "notes", label: "Notes (from CSV)" },
      ];

    return (
      <div className="max-w-xl">
        <div className="flex items-center justify-between mb-1">
          <h2 className="text-sm font-medium">Map columns</h2>
          {isLinkedIn && (
            <span className="text-xs border border-[#e5e5e5] px-2 py-0.5 text-[#737373]">
              LinkedIn export detected
            </span>
          )}
        </div>
        <p className="text-xs text-[#737373] mb-6">
          {rows.length} rows found in CSV with {headers.length} columns.
        </p>
        {!mapping.url && (
          <p className="text-xs text-[#cc0000] mb-4">
            No URL column was auto-detected. Select your URL column manually to continue.
          </p>
        )}

        {/* CSV column mappings */}
        <div className="border border-[#e5e5e5] mb-6">
          {columnMappingFields.map((f, i) => (
            <div
              key={f.key}
              className={`flex items-center gap-4 px-4 py-3 ${i < columnMappingFields.length - 1 ? "border-b border-[#e5e5e5]" : ""}`}
            >
              <div className="w-40 shrink-0">
                <p className="text-xs font-medium">{f.label}</p>
                {f.note && (
                  <p className="text-xs text-[#737373]">{f.note}</p>
                )}
              </div>
              <select
                value={mapping[f.key] ?? ""}
                onChange={(e) =>
                  setMapping((prev) => ({
                    ...prev,
                    [f.key]: e.target.value || null,
                  }))
                }
                className="flex-1 border border-[#e5e5e5] px-2 py-1.5 text-xs outline-none focus:border-black bg-white"
              >
                <option value="">— skip —</option>
                {headers.map((h) => (
                  <option key={h} value={h}>
                    {h}
                  </option>
                ))}
              </select>
            </div>
          ))}
        </div>

        {/* Batch values applied to all rows */}
        <p className="text-xs font-medium mb-3">Apply to all imported rows</p>
        <div className="border border-[#e5e5e5] mb-6">
          <div className="flex items-center gap-4 px-4 py-3 border-b border-[#e5e5e5]">
            <label className="w-40 shrink-0 text-xs font-medium">Channel</label>
            <input
              type="text"
              value={batchChannel}
              onChange={(e) => setBatchChannel(e.target.value)}
              placeholder="e.g. LinkedIn"
              className="flex-1 border border-[#e5e5e5] px-2 py-1.5 text-xs outline-none focus:border-black placeholder:text-[#d4d4d4]"
            />
          </div>
          <div className="flex items-center gap-4 px-4 py-3 border-b border-[#e5e5e5]">
            <label className="w-40 shrink-0 text-xs font-medium">Owner</label>
            <input
              type="text"
              value={batchOwner}
              onChange={(e) => setBatchOwner(e.target.value)}
              placeholder="e.g. Alice"
              className="flex-1 border border-[#e5e5e5] px-2 py-1.5 text-xs outline-none focus:border-black placeholder:text-[#d4d4d4]"
            />
          </div>
          <div className="flex items-center gap-4 px-4 py-3 border-b border-[#e5e5e5]">
            <label className="w-40 shrink-0 text-xs font-medium">Group</label>
            <input
              type="text"
              value={batchGroup}
              onChange={(e) => setBatchGroup(e.target.value)}
              placeholder="e.g. Q1 leads"
              className="flex-1 border border-[#e5e5e5] px-2 py-1.5 text-xs outline-none focus:border-black placeholder:text-[#d4d4d4]"
            />
          </div>
          <div className="flex items-center gap-4 px-4 py-3 border-b border-[#e5e5e5]">
            <div className="w-40 shrink-0">
              <p className="text-xs font-medium">Contacted?</p>
              <p className="text-xs text-[#737373]">set for every imported row</p>
            </div>
            <select
              value={batchContactedMode}
              onChange={(e) => setBatchContactedMode(e.target.value as "from_csv" | "yes" | "no")}
              className="flex-1 border border-[#e5e5e5] px-2 py-1.5 text-xs outline-none focus:border-black bg-white"
            >
              <option value="from_csv">Use CSV values</option>
              <option value="yes">Mark all as Yes</option>
              <option value="no">Mark all as No</option>
            </select>
          </div>
          <div className="flex items-center gap-4 px-4 py-3">
            <div className="w-40 shrink-0">
              <p className="text-xs font-medium">Notes override</p>
              <p className="text-xs text-[#737373]">overrides CSV notes column</p>
            </div>
            <input
              type="text"
              value={batchNotes}
              onChange={(e) => setBatchNotes(e.target.value)}
              placeholder="optional"
              className="flex-1 border border-[#e5e5e5] px-2 py-1.5 text-xs outline-none focus:border-black placeholder:text-[#d4d4d4]"
            />
          </div>
        </div>

        {/* Preview */}
        <div className="border border-[#e5e5e5] overflow-x-auto">
          <table className="w-full text-xs border-collapse">
            <thead>
              <tr className="border-b border-[#e5e5e5] bg-[#fafafa]">
                <th className="px-3 py-2 text-left font-medium text-[#737373]">URL</th>
                <th className="px-3 py-2 text-left font-medium text-[#737373]">Contact person</th>
                <th className="px-3 py-2 text-left font-medium text-[#737373]">Company</th>
                <th className="px-3 py-2 text-left font-medium text-[#737373]">Channel</th>
                <th className="px-3 py-2 text-left font-medium text-[#737373]">Group</th>
                <th className="px-3 py-2 text-left font-medium text-[#737373]">Contacted?</th>
              </tr>
            </thead>
            <tbody>
              {rows.slice(0, 3).map((row, i) => {
                const cp = resolveContactPerson(row, mapping);
                const url = mapping.url ? row[mapping.url] ?? "" : "";
                const co = mapping.company_name ? row[mapping.company_name] ?? "" : "";
                const channel = batchChannel || (mapping.channel ? row[mapping.channel] ?? "" : "");
                const group = batchGroup || (mapping.group_name ? row[mapping.group_name] ?? "" : "");
                const contacted = batchContactedMode === "yes"
                  ? true
                  : batchContactedMode === "no"
                    ? false
                    : resolveContacted(row, mapping);
                return (
                  <tr key={i} className="border-b border-[#e5e5e5]">
                    <td className="px-3 py-2 text-[#737373] max-w-[160px] truncate">{url}</td>
                    <td className="px-3 py-2">{cp}</td>
                    <td className="px-3 py-2 text-[#737373]">{co}</td>
                    <td className="px-3 py-2 text-[#737373]">{channel || <span className="text-[#d4d4d4]">—</span>}</td>
                    <td className="px-3 py-2 text-[#737373]">{group || <span className="text-[#d4d4d4]">—</span>}</td>
                    <td className="px-3 py-2 text-[#737373]">{contacted ? "Yes" : "No"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {rows.length > 3 && (
            <p className="px-3 py-2 text-xs text-[#737373] border-t border-[#e5e5e5]">
              + {rows.length - 3} more rows
            </p>
          )}
        </div>

        <div className="flex justify-between mt-6">
          <button
            onClick={() => setStep("upload")}
            className="text-xs border border-[#e5e5e5] px-3 py-1.5 hover:border-black transition-none"
          >
            ← Back
          </button>
          <button
            onClick={buildParsedRows}
            disabled={!mapping.url}
            className="text-xs border border-black bg-black text-white px-4 py-1.5 hover:bg-white hover:text-black transition-none disabled:opacity-40"
          >
            Review {rows.length} rows →
          </button>
        </div>
      </div>
    );
  }

  if (step === "review") {
    return (
      <div className="max-w-3xl">
        <div className="flex items-center justify-between mb-1">
          <h2 className="text-sm font-medium">Review & import</h2>
          <div className="flex items-center gap-3 text-xs text-[#737373]">
            <span>{newCount} new</span>
            {duplicateCount > 0 && (
              <span className="text-[#cc0000]">{duplicateCount} duplicates</span>
            )}
          </div>
        </div>
        <p className="text-xs text-[#737373] mb-4">
          Duplicates are matched by URL (normalized).
        </p>
        <p className="text-xs text-[#737373] mb-4">
          You can edit each row inline before importing.
        </p>

        {duplicateCount > 0 && (
          <div className="flex items-center gap-3 mb-4 p-3 border border-[#e5e5e5] bg-[#fafafa]">
            <span className="text-xs text-[#737373]">Bulk action for all duplicates:</span>
            <button
              onClick={() => setBulkDuplicateAction("skip")}
              className="text-xs border border-[#e5e5e5] px-2 py-1 hover:border-black transition-none"
            >
              Skip all
            </button>
            <button
              onClick={() => setBulkDuplicateAction("overwrite")}
              className="text-xs border border-[#e5e5e5] px-2 py-1 hover:border-black transition-none"
            >
              Overwrite all
            </button>
          </div>
        )}

        <div className="border border-[#e5e5e5] overflow-x-auto max-h-[50vh] overflow-y-auto">
          <table className="w-full text-xs border-collapse">
            <thead className="sticky top-0 bg-[#fafafa]">
              <tr className="border-b border-[#e5e5e5]">
                <th className="px-3 py-2 text-left font-medium text-[#737373]">URL</th>
                <th className="px-3 py-2 text-left font-medium text-[#737373]">Contact person</th>
                <th className="px-3 py-2 text-left font-medium text-[#737373]">Company</th>
                <th className="px-3 py-2 text-left font-medium text-[#737373]">Channel</th>
                <th className="px-3 py-2 text-left font-medium text-[#737373]">Group</th>
                <th className="px-3 py-2 text-left font-medium text-[#737373]">Owner</th>
                <th className="px-3 py-2 text-left font-medium text-[#737373]">Contacted?</th>
                <th className="px-3 py-2 text-left font-medium text-[#737373]">Action</th>
              </tr>
            </thead>
            <tbody>
              {parsedRows.map((pr, i) => {
                const isDupe = i in duplicateActions;
                return (
                  <tr
                    key={i}
                    className={`border-b border-[#e5e5e5] ${isDupe ? "border-l-2 border-l-[#737373]" : ""}`}
                  >
                    <td className="px-3 py-2 min-w-[220px]">
                      <input
                        type="text"
                        value={String(pr.resolved.url ?? "")}
                        onChange={(e) =>
                          updateParsedRow(i, { url: e.target.value })
                        }
                        className="w-full border border-[#e5e5e5] px-2 py-1 text-xs outline-none focus:border-black"
                      />
                    </td>
                    <td className="px-3 py-2 min-w-[150px]">
                      <input
                        type="text"
                        value={String(pr.resolved.contact_person ?? "")}
                        onChange={(e) =>
                          updateParsedRow(i, { contact_person: e.target.value })
                        }
                        className="w-full border border-[#e5e5e5] px-2 py-1 text-xs outline-none focus:border-black"
                      />
                    </td>
                    <td className="px-3 py-2 min-w-[150px]">
                      <input
                        type="text"
                        value={String(pr.resolved.company_name ?? "")}
                        onChange={(e) =>
                          updateParsedRow(i, { company_name: e.target.value })
                        }
                        className="w-full border border-[#e5e5e5] px-2 py-1 text-xs outline-none focus:border-black"
                      />
                    </td>
                    <td className="px-3 py-2 min-w-[110px]">
                      <input
                        type="text"
                        value={String(pr.resolved.channel ?? "")}
                        onChange={(e) =>
                          updateParsedRow(i, { channel: e.target.value })
                        }
                        className="w-full border border-[#e5e5e5] px-2 py-1 text-xs outline-none focus:border-black"
                      />
                    </td>
                    <td className="px-3 py-2 min-w-[130px]">
                      <input
                        type="text"
                        value={String(pr.resolved.group_name ?? "")}
                        onChange={(e) =>
                          updateParsedRow(i, { group_name: e.target.value })
                        }
                        className="w-full border border-[#e5e5e5] px-2 py-1 text-xs outline-none focus:border-black"
                      />
                    </td>
                    <td className="px-3 py-2 min-w-[110px]">
                      <input
                        type="text"
                        value={String(pr.resolved.owner ?? "")}
                        onChange={(e) =>
                          updateParsedRow(i, { owner: e.target.value })
                        }
                        className="w-full border border-[#e5e5e5] px-2 py-1 text-xs outline-none focus:border-black"
                      />
                    </td>
                    <td className="px-3 py-2 min-w-[100px]">
                      <select
                        value={pr.resolved.contacted ? "yes" : "no"}
                        onChange={(e) =>
                          updateParsedRow(i, {
                            contacted: e.target.value === "yes",
                          })
                        }
                        className="w-full border border-[#e5e5e5] px-1.5 py-0.5 text-xs bg-white outline-none focus:border-black"
                      >
                        <option value="yes">Yes</option>
                        <option value="no">No</option>
                      </select>
                    </td>
                    <td className="px-3 py-2">
                      {isDupe ? (
                        <select
                          value={duplicateActions[i]}
                          onChange={(e) =>
                            setDuplicateActions((prev) => ({
                              ...prev,
                              [i]: e.target.value as DuplicateAction["action"],
                            }))
                          }
                          className="border border-[#e5e5e5] px-1.5 py-0.5 text-xs bg-white outline-none focus:border-black"
                        >
                          <option value="skip">Skip</option>
                          <option value="overwrite">Overwrite</option>
                          <option value="import">Import as new</option>
                        </select>
                      ) : (
                        <span className="text-[#737373]">Import</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className="flex justify-between mt-6">
          <button
            onClick={() => setStep("map")}
            className="text-xs border border-[#e5e5e5] px-3 py-1.5 hover:border-black transition-none"
          >
            ← Back
          </button>
          <div className="flex gap-3">
            <button
              onClick={exportNewRowsCsv}
              disabled={importing}
              className="text-xs border border-[#e5e5e5] px-4 py-1.5 hover:border-black transition-none disabled:opacity-50"
            >
              Export new to CSV
            </button>
            <button
              onClick={runImport}
              disabled={importing}
              className="text-xs border border-black bg-black text-white px-4 py-1.5 hover:bg-white hover:text-black transition-none disabled:opacity-50"
            >
              {importing ? "Importing..." : `Import ${parsedRows.length} rows`}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Done
  return (
    <div className="max-w-sm">
      <h2 className="text-sm font-medium mb-4">Import complete</h2>
      <div className="border border-[#e5e5e5] divide-y divide-[#e5e5e5]">
        <div className="flex justify-between px-4 py-3 text-xs">
          <span className="text-[#737373]">Imported</span>
          <span className="font-medium">{importResult?.imported}</span>
        </div>
        <div className="flex justify-between px-4 py-3 text-xs">
          <span className="text-[#737373]">Overwritten</span>
          <span className="font-medium">{importResult?.overwritten}</span>
        </div>
        <div className="flex justify-between px-4 py-3 text-xs">
          <span className="text-[#737373]">Skipped</span>
          <span className="font-medium">{importResult?.skipped}</span>
        </div>
        {(importResult?.failed ?? 0) > 0 && (
          <div className="flex justify-between px-4 py-3 text-xs">
            <span className="text-[#cc0000]">Failed</span>
            <span className="font-medium text-[#cc0000]">{importResult?.failed}</span>
          </div>
        )}
      </div>
      {(importResult?.failedRows?.length ?? 0) > 0 && (
        <div className="mt-3 border border-[#e5e5e5] max-h-40 overflow-y-auto">
          <p className="px-3 py-2 text-xs text-[#737373] border-b border-[#e5e5e5]">Failed rows</p>
          {importResult!.failedRows.map((r) => (
            <div key={r.index} className="px-3 py-2 border-b border-[#e5e5e5] last:border-0">
              <p className="text-xs font-medium truncate">{r.url}</p>
              <p className="text-xs text-[#cc0000]">{r.error}</p>
            </div>
          ))}
        </div>
      )}
      <button
        onClick={onImportDone}
        className="mt-6 text-xs border border-black bg-black text-white px-4 py-2 hover:bg-white hover:text-black transition-none w-full"
      >
        Go to contacts →
      </button>
    </div>
  );
}
