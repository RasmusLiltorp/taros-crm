import { describe, it, expect } from "vitest";
import {
  detectLinkedIn,
  autoMapColumns,
  resolveContactPerson,
  resolveContacted,
} from "./linkedinDetector";

describe("detectLinkedIn", () => {
  it("returns false for 0 signal headers", () => {
    expect(detectLinkedIn(["foo", "bar"])).toBe(false);
  });

  it("returns false for exactly 1 signal header", () => {
    expect(detectLinkedIn(["First Name", "irrelevant"])).toBe(false);
  });

  it("returns true for 2 signal headers", () => {
    expect(detectLinkedIn(["First Name", "Last Name"])).toBe(true);
  });

  it("returns true for 3+ signal headers", () => {
    expect(detectLinkedIn(["First Name", "Last Name", "LinkedIn Profile URL"])).toBe(true);
  });

  it("is case-insensitive", () => {
    expect(detectLinkedIn(["FIRST NAME", "LAST NAME"])).toBe(true);
  });

  it("returns false for empty array", () => {
    expect(detectLinkedIn([])).toBe(false);
  });
});

describe("autoMapColumns", () => {
  it("detects LinkedIn export and maps URL column", () => {
    const headers = ["First Name", "Last Name", "LinkedIn Profile URL", "Company"];
    const result = autoMapColumns(headers);
    expect(result.isLinkedIn).toBe(true);
    expect(result.mapping.url).toBe("LinkedIn Profile URL");
  });

  it("maps URL columns with punctuation/variant labels", () => {
    const headers = ["CONTACT PERSON", "LinkedIn Profile (URL)", "Company Name"];
    const result = autoMapColumns(headers);
    expect(result.mapping.url).toBe("LinkedIn Profile (URL)");
  });

  it("falls back to URL-like headers when alias list does not match exactly", () => {
    const headers = ["Kontaktperson", "LinkedIn profil", "Virksomhed"];
    const result = autoMapColumns(headers);
    expect(result.mapping.url).toBe("LinkedIn profil");
  });

  it("prefers full-name column over first+last", () => {
    const headers = ["Full Name", "First Name", "Last Name", "Company"];
    const result = autoMapColumns(headers);
    expect(result.mapping.contact_person).toBe("Full Name");
    expect(result.mapping.first_name).toBeNull();
    expect(result.mapping.last_name).toBeNull();
  });

  it("falls back to first+last when no full-name column", () => {
    const headers = ["First Name", "Last Name", "Company"];
    const result = autoMapColumns(headers);
    expect(result.mapping.contact_person).toBeNull();
    expect(result.mapping.first_name).toBe("First Name");
    expect(result.mapping.last_name).toBe("Last Name");
  });

  it("returns all null mapping for unrecognised headers", () => {
    const headers = ["Col A", "Col B", "Col C"];
    const result = autoMapColumns(headers);
    expect(result.isLinkedIn).toBe(false);
    expect(result.mapping.url).toBeNull();
    expect(result.mapping.contact_person).toBeNull();
    expect(result.mapping.company_name).toBeNull();
  });

  it("maps Danish headers correctly", () => {
    const headers = ["Kontaktperson", "Virksomhed", "Kanal"];
    const result = autoMapColumns(headers);
    expect(result.mapping.contact_person).toBe("Kontaktperson");
    expect(result.mapping.company_name).toBe("Virksomhed");
    expect(result.mapping.channel).toBe("Kanal");
  });

  it("maps company_name, channel, owner, contacted, notes", () => {
    const headers = ["name", "company", "channel", "owner", "contacted", "notes"];
    const result = autoMapColumns(headers);
    expect(result.mapping.company_name).toBe("company");
    expect(result.mapping.channel).toBe("channel");
    expect(result.mapping.owner).toBe("owner");
    expect(result.mapping.contacted).toBe("contacted");
    expect(result.mapping.notes).toBe("notes");
  });

  it("maps 'Contacted?' header", () => {
    const headers = ["Name", "URL", "Contacted?"];
    const result = autoMapColumns(headers);
    expect(result.mapping.contacted).toBe("Contacted?");
  });
});

describe("resolveContactPerson", () => {
  it("returns the contact_person column value", () => {
    const mapping = {
      url: null, contact_person: "Name", first_name: null, last_name: null,
      company_name: null, channel: null, group_name: null, owner: null, contacted: null, notes: null,
    };
    expect(resolveContactPerson({ Name: "  Alice  " }, mapping)).toBe("Alice");
  });

  it("falls back to first+last join when no contact_person column", () => {
    const mapping = {
      url: null, contact_person: null, first_name: "First Name", last_name: "Last Name",
      company_name: null, channel: null, group_name: null, owner: null, contacted: null, notes: null,
    };
    expect(resolveContactPerson({ "First Name": "John", "Last Name": "Doe" }, mapping)).toBe("John Doe");
  });

  it("returns only first name when last name is absent", () => {
    const mapping = {
      url: null, contact_person: null, first_name: "First Name", last_name: null,
      company_name: null, channel: null, group_name: null, owner: null, contacted: null, notes: null,
    };
    expect(resolveContactPerson({ "First Name": "John" }, mapping)).toBe("John");
  });

  it("returns empty string when all name fields are empty", () => {
    const mapping = {
      url: null, contact_person: null, first_name: "First Name", last_name: "Last Name",
      company_name: null, channel: null, group_name: null, owner: null, contacted: null, notes: null,
    };
    expect(resolveContactPerson({ "First Name": "", "Last Name": "" }, mapping)).toBe("");
  });
});

describe("resolveContacted", () => {
  const makeMapping = (contacted: string | null) => ({
    url: null, contact_person: null, first_name: null, last_name: null,
    company_name: null, channel: null, group_name: null, owner: null, contacted, notes: null,
  });

  it.each(["yes", "true", "1", "ja", "x", "✓"])("returns true for '%s'", (val) => {
    expect(resolveContacted({ Contacted: val }, makeMapping("Contacted"))).toBe(true);
  });

  it.each(["no", "false", "", "nope", "0"])("returns false for '%s'", (val) => {
    expect(resolveContacted({ Contacted: val }, makeMapping("Contacted"))).toBe(false);
  });

  it("returns false when mapping has no contacted column", () => {
    expect(resolveContacted({ Contacted: "yes" }, makeMapping(null))).toBe(false);
  });

  it("is case-insensitive", () => {
    expect(resolveContacted({ Contacted: "YES" }, makeMapping("Contacted"))).toBe(true);
  });
});
