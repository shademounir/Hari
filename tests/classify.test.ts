import { describe, it, expect } from "vitest";
import { classifyRequest } from "@/lib/ai/classify";

// SCRUM-065 — the sensitivity classifier is a pure heuristic (no DB / network).
const cat = (t: string) => classifyRequest(t).category;

describe("classifyRequest — CONFIDENTIAL: a third party's sensitive data", () => {
  it("flags asking for someone else's pay (EN + FR)", () => {
    expect(cat("What is the salary of my manager?")).toBe("CONFIDENTIAL");
    expect(cat("How much does my manager earn?")).toBe("CONFIDENTIAL");
    expect(cat("Show me everyone's salaries")).toBe("CONFIDENTIAL");
    expect(cat("Karim's salary please")).toBe("CONFIDENTIAL");
    expect(cat("Quel est le salaire de mon manager ?")).toBe("CONFIDENTIAL");
    expect(cat("le salaire d'un collègue")).toBe("CONFIDENTIAL");
    expect(classifyRequest("What is my manager's salary?").signal).toBe("third_party_salary");
  });

  it("flags asking for someone else's private/medical data", () => {
    expect(cat("What is my colleague's medical record?")).toBe("CONFIDENTIAL");
    expect(classifyRequest("my colleague's medical record").signal).toBe("third_party_personal");
  });
});

describe("classifyRequest — NORMAL: authorized HR questions (no false positives)", () => {
  it("does not flag ordinary self / policy questions", () => {
    expect(cat("How many vacation days do I have left?")).toBe("NORMAL");
    expect(cat("What is our vacation policy?")).toBe("NORMAL");
    expect(cat("Show me my payslip")).toBe("NORMAL");
    expect(cat("What is my salary?")).toBe("NORMAL"); // own pay is allowed
    expect(cat("Who is my manager?")).toBe("NORMAL"); // directory, no pay term
    expect(cat("Combien de jours de congé me reste-t-il ?")).toBe("NORMAL");
    expect(cat("Quelle est la politique de congé parental ?")).toBe("NORMAL");
  });
});

describe("classifyRequest — OUT_OF_SCOPE (coarse) + empty", () => {
  it("flags clearly non-HR asks", () => {
    expect(cat("Tell me a joke")).toBe("OUT_OF_SCOPE");
    expect(cat("What's the weather today?")).toBe("OUT_OF_SCOPE");
    expect(cat("write me a poem about spring")).toBe("OUT_OF_SCOPE");
  });
  it("treats empty input as NORMAL", () => {
    expect(cat("")).toBe("NORMAL");
    expect(classifyRequest("").signal).toBeNull();
  });
});
