import { Text } from "@react-pdf/renderer";
import { DocumentLayout, styles } from "./layout";
import type { TemplateDataByType } from "../types";

const fmt = (d: Date) => d.toLocaleDateString("en-GB", { year: "numeric", month: "long", day: "numeric" });

function tenureYears(startDate: Date, now: Date): number {
  return Math.max(0, Math.floor((now.getTime() - startDate.getTime()) / (365.25 * 24 * 3600 * 1000)));
}

export function RecommendationLetterPdf({ profile }: TemplateDataByType["RECOMMENDATION_LETTER"]) {
  const now = new Date();
  const years = tenureYears(profile.startDate, now);
  return (
    <DocumentLayout
      title="Letter of Recommendation"
      issuedAt={fmt(now)}
      reference={`RECOMMENDATION-${profile.name.replace(/\s+/g, "-").toUpperCase()}`}
    >
      <Text style={styles.paragraph}>To whom it may concern,</Text>
      <Text style={styles.paragraph}>
        I am pleased to recommend <Text style={styles.label}>{profile.name}</Text>, who has
        served as <Text style={styles.label}>{profile.title}</Text> in our{" "}
        <Text style={styles.label}>{profile.department}</Text> department for{" "}
        {years > 0 ? `${years} year${years > 1 ? "s" : ""}` : "the past year"}.
      </Text>
      <Text style={styles.paragraph}>
        Throughout this time, {profile.name} has demonstrated strong professional skills and a
        reliable, positive contribution to the team. I recommend them without reservation.
      </Text>
    </DocumentLayout>
  );
}
