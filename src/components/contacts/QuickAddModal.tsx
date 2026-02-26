"use client";

import { useEffect, useState } from "react";
import type { Contact } from "@/lib/types";
import { type FieldDef, splitContactData, getSheetTemplate } from "@/lib/sheetTemplates";

interface QuickAddModalProps {
  onClose: () => void;
  onAdd: (data: Partial<Contact>) => Promise<Contact>;
  fields: FieldDef[];
  activeSheetName?: string | null;
  sheetTemplateId?: string | null;
}

export default function QuickAddModal({
  onClose,
  onAdd,
  fields,
  activeSheetName,
  sheetTemplateId,
}: QuickAddModalProps) {
  const activeTemplate = getSheetTemplate(sheetTemplateId);

  // Build initial form from field definitions
  const buildInitialForm = () => {
    const form: Record<string, unknown> = {};
    for (const f of fields) {
      if (f.type === "checkbox") {
        form[f.key] = false;
      } else if (f.key === "channel") {
        form[f.key] = activeTemplate.defaultChannel ?? "";
      } else if (f.key === "group_name") {
        form[f.key] = activeTemplate.defaultGroup ?? "";
      } else {
        form[f.key] = "";
      }
    }
    return form;
  };

  const [form, setForm] = useState<Record<string, unknown>>(buildInitialForm);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function set(key: string, value: unknown) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  useEffect(() => {
    setForm((prev) => ({
      ...prev,
      channel: prev.channel || activeTemplate.defaultChannel || "",
      group_name: prev.group_name || activeTemplate.defaultGroup || "",
    }));
  }, [activeTemplate.defaultChannel, activeTemplate.defaultGroup]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);
    try {
      const data = splitContactData(form, fields);
      await onAdd(data as Partial<Contact>);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add contact.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-24 bg-black/10"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md bg-white border border-[#e5e5e5] max-h-[80vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#e5e5e5]">
          <div>
            <h2 className="text-sm font-medium">Add contact</h2>
            {activeSheetName && (
              <p className="text-xs text-[#737373] mt-1">
                {activeSheetName} · {activeTemplate.name}
              </p>
            )}
          </div>
          <button
            onClick={onClose}
            className="text-xs text-[#737373] hover:text-black transition-none"
          >
            Cancel
          </button>
        </div>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4 px-6 py-5">
          {fields.map((f) => {
            if (f.type === "checkbox") {
              return (
                <div key={f.key} className="flex items-center gap-2">
                  <input
                    id={`quick-add-${f.key}`}
                    type="checkbox"
                    checked={!!form[f.key]}
                    onChange={(e) => set(f.key, e.target.checked)}
                    className="w-3.5 h-3.5 accent-black"
                  />
                  <label
                    htmlFor={`quick-add-${f.key}`}
                    className="text-xs text-[#737373] cursor-pointer"
                  >
                    {f.label}
                  </label>
                </div>
              );
            }

            return (
              <div key={f.key} className="flex flex-col gap-1.5">
                <label className="text-xs text-[#737373]">
                  {f.label}{f.required ? " *" : ""}
                </label>
                <input
                  type={f.key === "email" ? "email" : "text"}
                  required={f.required}
                  autoFocus={f === fields[0] || (f === fields.find(fl => fl.type !== "checkbox"))}
                  value={String(form[f.key] ?? "")}
                  onChange={(e) => set(f.key, e.target.value)}
                  placeholder={f.type === "url" ? "Any text" : ""}
                  className="border border-[#e5e5e5] px-3 py-2 text-sm outline-none focus:border-black placeholder:text-[#d4d4d4]"
                />
              </div>
            );
          })}

          {error && <p className="text-xs text-[#cc0000]">{error}</p>}
          <div className="flex justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="text-xs border border-[#e5e5e5] px-3 py-1.5 hover:border-black transition-none"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="text-xs border border-black bg-black text-white px-3 py-1.5 hover:bg-white hover:text-black transition-none disabled:opacity-50"
            >
              {saving ? "Adding..." : "Add contact"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
