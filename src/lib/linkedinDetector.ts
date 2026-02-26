/** Known LinkedIn Sales Navigator export column aliases (from Evaboot, Scrupp, Phantombuster, Wiza, etc.) */
const URL_ALIASES = [
  "linkedin profile url",
  "linkedin url",
  "profile url",
  "linkedin link",
  "profile link",
  "profil link",
  "profil url",
  "linkedin profil url",
  "linkedin profil",
  "linkedin profile",
  "profileurl",
  "linkedinurl",
  "url",
  "website",
  "webadresse",
  "company website",
  "linkedin company url",
];

const FIRST_NAME_ALIASES = ["first name", "firstname", "first_name"];
const LAST_NAME_ALIASES = ["last name", "lastname", "last_name"];
const FULL_NAME_ALIASES = [
  "full name",
  "fullname",
  "full_name",
  "name",
  "contact name",
  "contact",
  // Danish
  "kontaktperson",
  "navn",
];
const COMPANY_NAME_ALIASES = [
  "company",
  "company name",
  "company_name",
  "organization",
  "organisation",
  "employer",
  "current company",
  "account name",
  // Danish
  "virksomhed",
  "virksomhedsnavn",
  "firma",
];
const CHANNEL_ALIASES = [
  "channel",
  "kanal",
  // common export variants
  "source",
  "kilde",
];
const OWNER_ALIASES = [
  "owner",
  "assigned to",
  "assignee",
  // Danish
  "hvem har?",
  "hvem har",
  "ejer",
  "ansvarlig",
];
const CONTACTED_ALIASES = [
  "contacted",
  "contacted?",
  "kontaktet?",
  "kontaktet",
  "reached out",
  "status",
];
const NOTES_ALIASES = [
  "notes",
  "note",
  "message",
  "headline",
  "title",
  "job title",
  "jobtitle",
  // Danish
  "relevant info?",
  "relevant info",
  "noter",
  "kommentar",
  "kommentarer",
  "beskrivelse",
];

/** LinkedIn detection: if at least 2 of these headers are present, it's likely a LinkedIn export */
const LINKEDIN_SIGNAL_HEADERS = [
  "first name",
  "last name",
  "linkedin profile url",
  "linkedin url",
  "profile url",
  "headline",
  "job title",
  "company",
  "connection degree",
];

export interface ColumnMapping {
  url: string | null;
  contact_person: string | null;
  /** special case: combine first + last */
  first_name: string | null;
  last_name: string | null;
  company_name: string | null;
  channel: string | null;
  group_name: string | null;
  owner: string | null;
  contacted: string | null;
  notes: string | null;
}

export interface DetectionResult {
  isLinkedIn: boolean;
  mapping: ColumnMapping;
}

function normalize(s: string): string {
  return s
    .trim()
    .toLowerCase()
    .replace(/[_-]+/g, " ")
    .replace(/[^\p{L}\p{N}\s?]+/gu, " ")
    .replace(/\s+/g, " ");
}

function matchAlias(header: string, aliases: string[]): boolean {
  const normalized = normalize(header);
  const normalizedAliases = new Set(aliases.map(normalize));
  return normalizedAliases.has(normalized);
}

function findColumn(headers: string[], aliases: string[]): string | null {
  return headers.find((h) => matchAlias(h, aliases)) ?? null;
}

function isLikelyUrlColumn(header: string): boolean {
  const h = normalize(header);
  const hasUrlLikeToken =
    /\burl\b/.test(h) ||
    /\blink\b/.test(h) ||
    /\bwebsite\b/.test(h) ||
    /\bweb adresse\b/.test(h) ||
    /\bwebadresse\b/.test(h);
  const linkedinProfileOnly =
    /\blinkedin\b/.test(h) && /\b(profile|profil)\b/.test(h);

  return hasUrlLikeToken || linkedinProfileOnly;
}

function findUrlColumn(headers: string[]): string | null {
  const exact = findColumn(headers, URL_ALIASES);
  if (exact) return exact;

  const candidates = headers.filter(isLikelyUrlColumn);
  if (candidates.length === 0) return null;

  return (
    candidates.find((h) => /\blinkedin\b/.test(normalize(h))) ??
    candidates.find((h) => /\b(profile|profil)\b/.test(normalize(h))) ??
    candidates[0] ??
    null
  );
}

export function detectLinkedIn(headers: string[]): boolean {
  const normalizedHeaders = headers.map(normalize);
  const normalizedSignals = LINKEDIN_SIGNAL_HEADERS.map(normalize);
  const matches = normalizedSignals.filter((s) =>
    normalizedHeaders.includes(s)
  );
  return matches.length >= 2;
}

export function autoMapColumns(headers: string[]): DetectionResult {
  const isLinkedIn = detectLinkedIn(headers);

  const urlCol = findUrlColumn(headers);
  const firstNameCol = findColumn(headers, FIRST_NAME_ALIASES);
  const lastNameCol = findColumn(headers, LAST_NAME_ALIASES);
  const fullNameCol = findColumn(headers, FULL_NAME_ALIASES);
  const companyCol = findColumn(headers, COMPANY_NAME_ALIASES);
  const channelCol = findColumn(headers, CHANNEL_ALIASES);
  const ownerCol = findColumn(headers, OWNER_ALIASES);
  const contactedCol = findColumn(headers, CONTACTED_ALIASES);
  const notesCol = findColumn(headers, NOTES_ALIASES);

  // Contact person: prefer full name, fall back to first+last split
  const contactPersonCol: string | null = fullNameCol;
  let firstNameSplit: string | null = null;
  let lastNameSplit: string | null = null;

  if (!contactPersonCol && (firstNameCol || lastNameCol)) {
    firstNameSplit = firstNameCol;
    lastNameSplit = lastNameCol;
  }

  const mapping: ColumnMapping = {
    url: urlCol,
    contact_person: contactPersonCol,
    first_name: firstNameSplit,
    last_name: lastNameSplit,
    company_name: companyCol,
    channel: channelCol,
    group_name: null,
    owner: ownerCol,
    contacted: contactedCol,
    notes: notesCol,
  };

  return { isLinkedIn, mapping };
}

export function resolveContactPerson(
  row: Record<string, string>,
  mapping: ColumnMapping
): string {
  if (mapping.contact_person && row[mapping.contact_person]) {
    return (row[mapping.contact_person] ?? "").trim();
  }
  const first = mapping.first_name ? (row[mapping.first_name] ?? "").trim() : "";
  const last = mapping.last_name ? (row[mapping.last_name] ?? "").trim() : "";
  return [first, last].filter(Boolean).join(" ");
}

/** Resolve a CSV cell value to a boolean contacted flag.
 *  Handles English (yes/true/1) and Danish (ja) affirmative values. */
export function resolveContacted(
  row: Record<string, string>,
  mapping: ColumnMapping
): boolean {
  if (!mapping.contacted) return false;
  const val = (row[mapping.contacted] ?? "").trim().toLowerCase();
  return ["yes", "true", "1", "ja", "x", "✓"].includes(val);
}
