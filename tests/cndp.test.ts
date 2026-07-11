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

  it("detects a national ID", () => {
    const result = detectPersonalData("Mon CIN est AB123456");

    expect(result.hasPersonalData).toBe(true);
    expect(result.categories).toContain("NATIONAL_ID");
    expect(result.requiresReview).toBe(true);
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