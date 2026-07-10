// SCRUM-094: generates the body text for an HR_SUMMARY document. Kept separate
// from pdf.tsx so it's independently mockable in tests (vi.mock("ai")) — the
// PDF renderer never talks to the model directly.
import { generateText } from "ai";
import { getChatModel } from "@/lib/ai/providers";
import type { DocumentProfile } from "./types";

/**
 * Ask the default chat model for a short, professional summary of an
 * employee's profile. No salary, no protected-characteristic data is passed
 * in — only title/department/tenure/manager, already visible to the
 * requester (self) or HR. Throws on failure; the caller (finalizeGeneration
 * in lib/documents.ts) decides how to handle it.
 */
export async function generateHrSummaryText(
  profile: DocumentProfile,
  language: "French" | "English",
): Promise<string> {
  const tenureYears = (
    (Date.now() - profile.startDate.getTime()) /
    (365.25 * 24 * 3600 * 1000)
  ).toFixed(1);

  const { text } = await generateText({
    model: getChatModel(undefined),
    system: `You write short, professional HR profile summaries for internal use. Respond only in ${language}. 2-3 short paragraphs, neutral and factual tone. Never invent facts beyond what is given. Never mention salary or compensation.`,
    prompt: `Write a professional HR summary for this employee profile:
- Name: ${profile.name}
- Title: ${profile.title}
- Department: ${profile.department}
- Manager: ${profile.managerName ?? "none on file"}
- Tenure: ${tenureYears} years`,
  });

  return text.trim();
}
