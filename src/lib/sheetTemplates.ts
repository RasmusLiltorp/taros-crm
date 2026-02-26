// ─── Field Definitions ────────────────────────────────────────────────────────

export interface FieldDef {
  key: string;
  label: string;
  type: "text" | "checkbox" | "url";
  required?: boolean;
}

// ─── Template IDs ─────────────────────────────────────────────────────────────

export type ContactSheetTemplateId =
  | "simple_leads"
  | "crm_recommendation"
  | "client_projects"
  | "follow_up_focus"
  | "custom";

export interface ContactSheetTemplate {
  id: ContactSheetTemplateId;
  name: string;
  purpose: string;
  fields: FieldDef[];
  defaultChannel?: string;
  defaultGroup?: string;
  enabledByDefault?: boolean;
}

// ─── Built-in field sets ──────────────────────────────────────────────────────

/** Core fields shared by all premade templates */
const CORE_FIELDS: FieldDef[] = [
  { key: "contacted", label: "Contacted?", type: "checkbox" },
  { key: "url", label: "URL", type: "url" },
  { key: "contact_person", label: "Contact person", type: "text" },
  { key: "company_name", label: "Company", type: "text" },
  { key: "email", label: "Email", type: "text" },
  { key: "phone", label: "Phone", type: "text" },
  { key: "title", label: "Job title", type: "text" },
  { key: "country", label: "Country", type: "text" },
  { key: "company_size", label: "Company size", type: "text" },
  { key: "channel", label: "Channel", type: "text" },
  { key: "group_name", label: "Group", type: "text" },
  { key: "owner", label: "Owner", type: "text" },
  { key: "notes", label: "Notes", type: "text" },
];

/** Default fields for a blank custom sheet */
export const DEFAULT_CUSTOM_FIELDS: FieldDef[] = [
  { key: "url", label: "URL", type: "url", required: true },
  { key: "contact_person", label: "Contact person", type: "text" },
  { key: "notes", label: "Notes", type: "text" },
];

/** Fields currently enabled by default in the product */
const SIMPLE_LEADS_FIELDS: FieldDef[] = [
  { key: "contacted", label: "Contacted?", type: "checkbox" },
  { key: "url", label: "URL", type: "url" },
  { key: "contact_person", label: "Contact person", type: "text" },
  { key: "channel", label: "Channel", type: "text" },
  { key: "owner", label: "Owner", type: "text" },
  { key: "notes", label: "Notes", type: "text" },
];

// ─── Templates ────────────────────────────────────────────────────────────────

export const DEFAULT_SHEET_TEMPLATE: ContactSheetTemplateId = "simple_leads";

export const CONTACT_SHEET_TEMPLATES: ContactSheetTemplate[] = [
  {
    id: "simple_leads",
    name: "Simple Leads",
    purpose: "Track leads, owner, and follow-up status with minimal setup.",
    fields: SIMPLE_LEADS_FIELDS,
    defaultGroup: "New leads",
    enabledByDefault: true,
  },
  {
    id: "crm_recommendation",
    name: "CRM Recommendation Requests",
    purpose: "People asking for beginner-friendly or free CRM suggestions.",
    fields: CORE_FIELDS,
    defaultChannel: "Community",
    defaultGroup: "CRM shoppers",
    enabledByDefault: false,
  },
  {
    id: "client_projects",
    name: "Client Projects",
    purpose: "Service business projects and client check-ins while scaling.",
    fields: CORE_FIELDS,
    defaultGroup: "Active clients",
    enabledByDefault: false,
  },
  {
    id: "follow_up_focus",
    name: "Follow-Up Focus",
    purpose: "Prioritize daily follow-ups and keep response loops tight.",
    fields: CORE_FIELDS,
    defaultGroup: "Needs follow-up",
    enabledByDefault: false,
  },
  {
    id: "custom",
    name: "Custom",
    purpose: "Start blank and define your own fields.",
    fields: DEFAULT_CUSTOM_FIELDS,
    enabledByDefault: true,
  },
];

export const CREATABLE_CONTACT_SHEET_TEMPLATES = CONTACT_SHEET_TEMPLATES.filter(
  (template) => template.enabledByDefault || template.id === "custom"
);

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** List of keys that map to real PocketBase columns (not custom_data) */
export const BUILTIN_FIELD_KEYS = new Set([
  "url", "contact_person", "company_name", "group_name",
  "email", "phone", "title", "country", "company_size",
  "channel", "owner", "contacted", "notes",
]);

export function getSheetTemplate(templateId?: string | null): ContactSheetTemplate {
  if (!templateId) {
    return CONTACT_SHEET_TEMPLATES[0]!;
  }
  return (
    CONTACT_SHEET_TEMPLATES.find((template) => template.id === templateId) ??
    CONTACT_SHEET_TEMPLATES[0]!
  );
}

function isFieldType(value: unknown): value is FieldDef["type"] {
  return value === "text" || value === "checkbox" || value === "url";
}

function normalizeFieldList(input: unknown): FieldDef[] {
  if (!Array.isArray(input)) return [];

  const out: FieldDef[] = [];
  for (const item of input) {
    if (!item || typeof item !== "object") continue;
    const row = item as Record<string, unknown>;
    const key = typeof row.key === "string" ? row.key.trim() : "";
    const label = typeof row.label === "string" ? row.label.trim() : "";
    const type = row.type;
    if (!key || !label || !isFieldType(type)) continue;
    out.push({
      key,
      label,
      type,
      required: row.required === true,
    });
  }
  return out;
}

/**
 * Parse the sheet fields from PocketBase JSON column values or legacy JSON strings.
 * Falls back to the template's default field set.
 */
export function parseSheetFields(
  fieldsValue: unknown,
  templateId?: string | null,
): FieldDef[] {
  const direct = normalizeFieldList(fieldsValue);
  if (direct.length > 0) return direct;

  if (typeof fieldsValue === "string" && fieldsValue.trim()) {
    try {
      const parsed = JSON.parse(fieldsValue);
      const firstPass = normalizeFieldList(parsed);
      if (firstPass.length > 0) return firstPass;

      // Handle double-encoded legacy values.
      if (typeof parsed === "string" && parsed.trim()) {
        const parsedAgain = JSON.parse(parsed);
        const secondPass = normalizeFieldList(parsedAgain);
        if (secondPass.length > 0) return secondPass;
      }
    } catch {
      // fall through to template defaults
    }
  }

  return getSheetTemplate(templateId).fields;
}

/**
 * Read a field value from a contact record, checking both built-in columns
 * and the `custom_data` JSON bag.
 */
export function getContactFieldValue(
  contact: Record<string, unknown>,
  key: string,
): unknown {
  if (BUILTIN_FIELD_KEYS.has(key)) return contact[key];
  const custom = contact.custom_data as Record<string, unknown> | undefined;
  return custom?.[key];
}

/**
 * Split form data into built-in fields vs custom_data for PocketBase writes.
 */
export function splitContactData(
  data: Record<string, unknown>,
  fields: FieldDef[],
): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  const customData: Record<string, unknown> = {};

  for (const field of fields) {
    const value = data[field.key];
    if (BUILTIN_FIELD_KEYS.has(field.key)) {
      result[field.key] = value;
    } else {
      customData[field.key] = value;
    }
  }

  // Preserve any built-in keys not in the field list but present in data
  // (e.g. team, sheet, created_by)
  for (const [key, value] of Object.entries(data)) {
    if (!(key in result) && !fields.some(f => f.key === key)) {
      result[key] = value;
    }
  }

  if (Object.keys(customData).length > 0) {
    result.custom_data = customData;
  }

  return result;
}
