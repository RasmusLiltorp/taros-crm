"use client";

import { useState } from "react";
import type { Contact, ContactSheet } from "@/lib/types";
import {
  type FieldDef,
  getContactFieldValue,
  splitContactData,
} from "@/lib/sheetTemplates";

interface ContactPanelProps {
  contact: Contact;
  sheets: ContactSheet[];
  fields: FieldDef[];
  onClose: () => void;
  onUpdate: (id: string, data: Partial<Contact>) => Promise<Contact>;
  onDelete: (id: string) => Promise<void>;
}

export default function ContactPanel({
  contact,
  sheets,
  fields,
  onClose,
  onUpdate,
  onDelete,
}: ContactPanelProps) {
  // Build initial form state from field definitions
  const initialForm: Record<string, unknown> = { sheet: contact.sheet ?? "" };
  for (const f of fields) {
    initialForm[f.key] = getContactFieldValue(contact, f.key) ?? (f.type === "checkbox" ? false : "");
  }

  const [form, setForm] = useState<Record<string, unknown>>(initialForm);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  function set(key: string, value: unknown) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function save() {
    setSaveError(null);
    setSaving(true);
    try {
      const data = splitContactData(form, fields);
      await onUpdate(contact.id, data as Partial<Contact>);
      onClose();
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Failed to save contact.");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!confirmDelete) {
      setConfirmDelete(true);
      return;
    }
    setDeleteError(null);
    setDeleting(true);
    try {
      await onDelete(contact.id);
      onClose();
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : "Failed to delete contact.");
      setDeleting(false);
      setConfirmDelete(false);
    }
  }

  return (
    <div className="fixed inset-0 z-40 flex justify-end" onClick={onClose}>
      <div
        className="relative w-full max-w-md bg-white border-l border-[#e5e5e5] h-full overflow-y-auto flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#e5e5e5]">
          <h2 className="text-sm font-medium">Edit contact</h2>
          <button
            onClick={onClose}
            className="text-xs text-[#737373] hover:text-black transition-none"
          >
            Close
          </button>
        </div>

        {/* Fields */}
        <div className="flex-1 flex flex-col gap-5 px-6 py-6">
          {/* Spreadsheet selector (always shown) */}
          <Field label="Spreadsheet">
            <select
              value={String(form.sheet ?? "")}
              onChange={(e) => set("sheet", e.target.value || null)}
              className="w-full border border-[#e5e5e5] px-3 py-2 text-sm outline-none focus:border-black bg-white"
            >
              <option value="">Unassigned</option>
              {sheets.map((sheet) => (
                <option key={sheet.id} value={sheet.id}>
                  {sheet.name}
                </option>
              ))}
            </select>
          </Field>

          {/* Dynamic fields */}
          {fields.map((f) => {
            if (f.type === "checkbox") {
              return (
                <Field key={f.key} label={f.label}>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={!!form[f.key]}
                      onChange={(e) => set(f.key, e.target.checked)}
                      className="w-3.5 h-3.5 accent-black"
                    />
                    <span className="text-sm">{form[f.key] ? "Yes" : "No"}</span>
                  </label>
                </Field>
              );
            }

            return (
              <Field key={f.key} label={f.label}>
                {f.key === "notes" ? (
                  <textarea
                    value={String(form[f.key] ?? "")}
                    onChange={(e) => set(f.key, e.target.value)}
                    rows={4}
                    className="w-full border border-[#e5e5e5] px-3 py-2 text-sm outline-none focus:border-black resize-none"
                  />
                ) : (
                  <input
                    type={f.key === "email" ? "email" : "text"}
                    value={String(form[f.key] ?? "")}
                    onChange={(e) => set(f.key, e.target.value)}
                    className="w-full border border-[#e5e5e5] px-3 py-2 text-sm outline-none focus:border-black"
                  />
                )}
              </Field>
            );
          })}
        </div>

        {/* Actions */}
        <div className="px-6 py-4 border-t border-[#e5e5e5] flex flex-col gap-2">
          {(saveError || deleteError) && (
            <p className="text-xs text-[#cc0000]">{saveError ?? deleteError}</p>
          )}
          <div className="flex items-center justify-between">
            <button
              onClick={handleDelete}
              disabled={deleting}
              className="text-xs text-[#737373] hover:text-[#cc0000] transition-none"
            >
              {confirmDelete ? "Click again to confirm" : "Delete"}
            </button>
            <div className="flex gap-2">
              <button
                onClick={onClose}
                className="text-xs border border-[#e5e5e5] px-3 py-1.5 hover:border-black transition-none"
              >
                Cancel
              </button>
              <button
                onClick={save}
                disabled={saving}
                className="text-xs border border-black bg-black text-white px-3 py-1.5 hover:bg-white hover:text-black transition-none disabled:opacity-50"
              >
                {saving ? "Saving..." : "Save"}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-xs text-[#737373]">{label}</label>
      {children}
    </div>
  );
}
