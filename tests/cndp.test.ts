import { describe, expect, it } from "vitest";

import { detectPersonalData } from "@/lib/ai/cndp";

describe("CNDP personal data detection", () => {
  it("detects an email address", () => {
    const result = detectPersonalData("Mon email est test@example.com");

    expect(result.hasPersonalData).toBe(true);
    expect(result.categories).toContain("EMAIL");
    expect(result.requiresReview).toBe(false);
  });

  it("detects a Moroccan phone number", () => {
    const result = detectPersonalData("Appelez-moi au +212612345678");

    expect(result.hasPersonalData).toBe(true);
    expect(result.categories).toContain("PHONE");
  });

  it("detects a national ID (CIN) without flagging it as a passport", () => {
    const result = detectPersonalData("Mon CIN est AB123456");

    expect(result.hasPersonalData).toBe(true);
    expect(result.categories).toContain("NATIONAL_ID");
    expect(result.categories).not.toContain("PASSPORT");
    expect(result.requiresReview).toBe(true);
  });

  it("detects a passport distinctly from a CIN by its longer numeric tail", () => {
    const result = detectPersonalData("Passeport: AB1234567");

    expect(result.categories).toContain("PASSPORT");
    expect(result.categories).not.toContain("NATIONAL_ID");
    expect(result.requiresReview).toBe(true);
  });

  it("detects a CNSS number only when explicitly labelled", () => {
    const result = detectPersonalData("Numéro CNSS 123456789");

    expect(result.categories).toContain("CNSS");
    expect(result.requiresReview).toBe(true);
  });

  it("does not treat a bare number as a CNSS identifier", () => {
    const result = detectPersonalData("Commande n° 1234567 confirmée");

    expect(result.categories).not.toContain("CNSS");
    expect(result.requiresReview).toBe(false);
  });

  it("does not flag a local phone number as a CNSS number", () => {
    const result = detectPersonalData("Mon numéro est 0612345678");

    expect(result.categories).toContain("PHONE");
    expect(result.categories).not.toContain("CNSS");
  });

  it("returns no match for ordinary text", () => {
    const result = detectPersonalData(
      "Bonjour, je souhaite poser une question sur mes congés.",
    );

    expect(result.hasPersonalData).toBe(false);
    expect(result.categories).toEqual([]);
    expect(result.requiresReview).toBe(false);
  });

  it("does not expose detected values", () => {
    const result = detectPersonalData(
      "Email: test@example.com, CIN: AB123456",
    );

    expect(result).not.toHaveProperty("email");
    expect(result).not.toHaveProperty("cin");
    expect(result).not.toHaveProperty("value");
  });
});
