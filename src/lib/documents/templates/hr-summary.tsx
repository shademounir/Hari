import { Text } from "@react-pdf/renderer";
import { DocumentLayout, styles } from "./layout";
import type { TemplateDataByType } from "../types";

const fmt = (d: Date) => d.toLocaleDateString("en-GB", { year: "numeric", month: "long", day: "numeric" });

// The body is AI-generated free text (see lib/documents/ai-summary.ts) — split
// into paragraphs on blank lines so it doesn't render as one dense block.
export function HrSummaryPdf({ profile, summaryText }: TemplateDataByType["HR_SUMMARY"]) {
  const now = new Date();
  const paragraphs = summaryText.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);
  return (
    <DocumentLayout
      title="HR Profile Summary"
      issuedAt={fmt(now)}
      reference={`HR-SUMMARY-${profile.name.replace(/\s+/g, "-").toUpperCase()}`}
    >
      {paragraphs.map((p, i) => (
        <Text key={i} style={styles.paragraph}>
          {p}
        </Text>
      ))}
    </DocumentLayout>
  );
}
