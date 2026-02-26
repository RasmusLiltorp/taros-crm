"use client";

import { useState } from "react";
import {
  CREATABLE_CONTACT_SHEET_TEMPLATES,
  DEFAULT_SHEET_TEMPLATE,
  DEFAULT_CUSTOM_FIELDS,
  getSheetTemplate,
  type ContactSheetTemplateId,
  type FieldDef,
} from "@/lib/sheetTemplates";
import type { ContactSheet } from "@/lib/types";

interface CreateSheetModalProps {
  onClose: () => void;
  onCreate: (input: {
    name: string;
    template: ContactSheetTemplateId;
    fields?: FieldDef[];
    description?: string;
  }) => Promise<ContactSheet>;
}

export default function CreateSheetModal({ onClose, onCreate }: CreateSheetModalProps) {
  const [name, setName] = useState("");
  const [template, setTemplate] = useState<ContactSheetTemplateId>(DEFAULT_SHEET_TEMPLATE);
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Custom fields editor state
  const [customFields, setCustomFields] = useState<FieldDef[]>([...DEFAULT_CUSTOM_FIELDS]);

  const selectedTemplate = getSheetTemplate(template);
  const isCustom = template === "custom";

  function addField() {
    const index = customFields.length + 1;
    setCustomFields((prev) => [
      ...prev,
      { key: `field_${index}`, label: "", type: "text" },
    ]);
  }

  function removeField(index: number) {
    setCustomFields((prev) => prev.filter((_, i) => i !== index));
  }

  function updateField(index: number, updates: Partial<FieldDef>) {
    setCustomFields((prev) =>
      prev.map((f, i) => {
        if (i !== index) return f;
        const updated = { ...f, ...updates };
        // Auto-generate key from label
        if (updates.label !== undefined) {
          updated.key = updates.label
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, "_")
            .replace(/^_|_$/g, "") || `field_${index + 1}`;
        }
        return updated;
      })
    );
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);

    // Validate custom fields
    if (isCustom) {
      const nonEmpty = customFields.filter((f) => f.label.trim());
      if (nonEmpty.length === 0) {
        setError("Add at least one field.");
        setSaving(false);
        return;
      }
    }

    try {
      const fields = isCustom
        ? customFields.filter((f) => f.label.trim())
        : selectedTemplate.fields;

      await onCreate({
        name,
        template,
        fields,
        description,
      });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create spreadsheet.");
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
          <h2 className="text-sm font-medium">Create spreadsheet</h2>
          <button
            onClick={onClose}
            className="text-xs text-[#737373] hover:text-black transition-none"
          >
            Cancel
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4 px-6 py-5">
          <div className="flex flex-col gap-1.5">
            <label className="text-xs text-[#737373]">Name *</label>
            <input
              required
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Community leads"
              className="border border-[#e5e5e5] px-3 py-2 text-sm outline-none focus:border-black placeholder:text-[#d4d4d4]"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-xs text-[#737373]">Template</label>
            <select
              value={template}
              onChange={(e) => setTemplate(e.target.value as ContactSheetTemplateId)}
              className="border border-[#e5e5e5] px-3 py-2 text-sm outline-none focus:border-black bg-white"
            >
              {CREATABLE_CONTACT_SHEET_TEMPLATES.map((entry) => (
                <option key={entry.id} value={entry.id}>
                  {entry.name}
                </option>
              ))}
            </select>
          </div>

          <div className="border border-[#e5e5e5] bg-[#fafafa] px-3 py-2">
            <p className="text-xs text-[#737373]">{selectedTemplate.purpose}</p>
          </div>

          {/* Field editor / preview */}
          <div className="flex flex-col gap-2">
            <label className="text-xs text-[#737373]">
              {isCustom ? "Fields" : "Included fields"}
            </label>

            {isCustom ? (
              /* Editable field list */
              <div className="flex flex-col gap-2">
                {customFields.map((field, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <input
                      type="text"
                      value={field.label}
                      onChange={(e) => updateField(i, { label: e.target.value })}
                      placeholder="Field name"
                      className="flex-1 border border-[#e5e5e5] px-2 py-1.5 text-xs outline-none focus:border-black placeholder:text-[#d4d4d4]"
                    />
                    <select
                      value={field.type}
                      onChange={(e) =>
                        updateField(i, {
                          type: e.target.value as FieldDef["type"],
                        })
                      }
                      className="border border-[#e5e5e5] px-2 py-1.5 text-xs outline-none focus:border-black bg-white w-24"
                    >
                      <option value="text">Text</option>
                      <option value="url">URL</option>
                      <option value="checkbox">Checkbox</option>
                    </select>
                    <button
                      type="button"
                      onClick={() => removeField(i)}
                      className="text-xs text-[#737373] hover:text-[#cc0000] transition-none px-1"
                    >
                      ✕
                    </button>
                  </div>
                ))}
                <button
                  type="button"
                  onClick={addField}
                  className="text-xs text-[#737373] hover:text-black transition-none text-left"
                >
                  + Add field
                </button>
              </div>
            ) : (
              /* Read-only field preview for templates */
              <div className="flex flex-wrap gap-1">
                {selectedTemplate.fields.map((f) => (
                  <span
                    key={f.key}
                    className="text-xs border border-[#e5e5e5] px-2 py-0.5 bg-white"
                  >
                    {f.label}
                  </span>
                ))}
              </div>
            )}
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-xs text-[#737373]">Description (optional)</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              className="border border-[#e5e5e5] px-3 py-2 text-sm outline-none focus:border-black resize-none"
              placeholder="What this spreadsheet is for"
            />
          </div>

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
              {saving ? "Creating..." : "Create"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
