import { describe, expect, it } from "vitest";
import {
  centsInput,
  parisInput,
  parseEuroCents,
  parseParisDate,
} from "./financial-inputs";

describe("saisie des montants comptables", () => {
  it("préserve les centimes français et la borne entière sûre", () => {
    expect(parseEuroCents("1\u202f234,56")).toBe(123456);
    expect(parseEuroCents("0.29")).toBe(29);
    expect(parseEuroCents("-8,00")).toBe(-800);
    expect(parseEuroCents(centsInput(Number.MAX_SAFE_INTEGER))).toBe(
      Number.MAX_SAFE_INTEGER,
    );
    expect(parseEuroCents(centsInput(Number.MIN_SAFE_INTEGER))).toBe(
      Number.MIN_SAFE_INTEGER,
    );
  });

  it("refuse les fractions de centime et les montants non représentables", () => {
    for (const value of [
      "1,005",
      "90071992547409,92",
      "NaN",
      "Infinity",
      "",
      "1e3",
    ]) {
      expect(() => parseEuroCents(value)).toThrow();
    }
  });
});

describe("horodatages financiers de Paris", () => {
  it("préserve les secondes et tient compte de la saison", () => {
    expect(parseParisDate("2026-01-15T12:34:56")).toBe(
      "2026-01-15T11:34:56.000Z",
    );
    expect(parseParisDate("2026-07-15T12:34:56")).toBe(
      "2026-07-15T10:34:56.000Z",
    );
    expect(parisInput("2026-07-15T10:34:56.000Z", true)).toBe(
      "2026-07-15T12:34:56",
    );
  });

  it("refuse les dates invalides, inexistantes ou ambiguës", () => {
    for (const value of [
      "2026-02-30T12:00",
      "2026-03-29T02:30",
      "2026-10-25T02:30",
    ]) {
      expect(() => parseParisDate(value)).toThrow();
    }
  });
});
