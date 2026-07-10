import { Text } from "@react-pdf/renderer";
import { DocumentLayout, styles } from "./layout";
import type { TemplateDataByType } from "../types";

const fmt = (d: Date) => d.toLocaleDateString("en-GB", { year: "numeric", month: "long", day: "numeric" });

export function MutationLetterPdf({ profile, effectiveDate }: TemplateDataByType["MUTATION_LETTER"]) {
  const now = new Date();
  return (
    <DocumentLayout
      title="Mutation Letter"
      issuedAt={fmt(now)}
      reference={`MUTATION-${profile.name.replace(/\s+/g, "-").toUpperCase()}`}
    >
      <Text style={styles.paragraph}>
        This letter confirms the internal transfer of{" "}
        <Text style={styles.label}>{profile.name}</Text>, currently{" "}
        <Text style={styles.label}>{profile.title}</Text> in the{" "}
        <Text style={styles.label}>{profile.department}</Text> department, effective{" "}
        <Text style={styles.label}>{fmt(effectiveDate)}</Text>.
      </Text>
      <Text style={styles.paragraph}>
        This transfer has been reviewed and approved by the employee&apos;s manager
        {profile.managerName ? ` (${profile.managerName})` : ""} and by Human Resources.
      </Text>
    </DocumentLayout>
  );
}
