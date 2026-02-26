import { describe, it, expect } from "vitest";
import { normalizeUrl, isSameUrl } from "./csvNormalize";

describe("normalizeUrl", () => {
  it("strips https://", () => {
    expect(normalizeUrl("https://example.com")).toBe("example.com");
  });

  it("strips http://", () => {
    expect(normalizeUrl("http://example.com")).toBe("example.com");
  });

  it("strips www.", () => {
    expect(normalizeUrl("www.example.com")).toBe("example.com");
  });

  it("strips trailing slash", () => {
    expect(normalizeUrl("example.com/")).toBe("example.com");
  });

  it("lowercases", () => {
    expect(normalizeUrl("EXAMPLE.COM")).toBe("example.com");
  });

  it("applies all transforms together", () => {
    expect(normalizeUrl("HTTPS://WWW.EXAMPLE.COM/")).toBe("example.com");
  });

  it("returns empty string for empty input", () => {
    expect(normalizeUrl("")).toBe("");
  });

  it("preserves path and query after normalisation", () => {
    expect(normalizeUrl("https://example.com/path?q=1")).toBe("example.com/path?q=1");
  });

  it("strips www. when combined with protocol", () => {
    expect(normalizeUrl("http://www.example.com/")).toBe("example.com");
  });
});

describe("isSameUrl", () => {
  it("returns true for same URL with different protocols", () => {
    expect(isSameUrl("https://example.com", "http://example.com")).toBe(true);
  });

  it("returns true when one has a trailing slash", () => {
    expect(isSameUrl("example.com", "example.com/")).toBe(true);
  });

  it("returns true for identical URLs", () => {
    expect(isSameUrl("example.com", "example.com")).toBe(true);
  });

  it("returns false for different domains", () => {
    expect(isSameUrl("example.com", "other.com")).toBe(false);
  });

  it("returns false for different paths", () => {
    expect(isSameUrl("example.com/a", "example.com/b")).toBe(false);
  });

  it("returns true for www vs non-www", () => {
    expect(isSameUrl("www.example.com", "example.com")).toBe(true);
  });
});
