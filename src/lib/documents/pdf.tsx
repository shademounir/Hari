// SCRUM-081/094: renders a GeneratedDocument to a PDF buffer via React
// components (@react-pdf/renderer — no headless browser, safe in serverless).
// Server-only: imports React elements built from templates/*.tsx.
import { renderToBuffer } from "@react-pdf/renderer";
import type { GeneratedDocumentType } from "@prisma/client";
import { WorkCertificatePdf } from "./templates/work-certificate";
import { LeaveConfirmationPdf } from "./templates/leave-confirmation";
import { MutationLetterPdf } from "./templates/mutation-letter";
import { RecommendationLetterPdf } from "./templates/recommendation-letter";
import { HrSummaryPdf } from "./templates/hr-summary";
import type { TemplateDataByType } from "./types";

/** Render `type`'s template with `data` to a PDF byte buffer. */
export async function renderDocumentPdf<T extends GeneratedDocumentType>(
  type: T,
  data: TemplateDataByType[T],
): Promise<Buffer> {
  switch (type) {
    case "WORK_CERTIFICATE":
      return renderToBuffer(<WorkCertificatePdf {...(data as TemplateDataByType["WORK_CERTIFICATE"])} />);
    case "LEAVE_CONFIRMATION":
      return renderToBuffer(
        <LeaveConfirmationPdf {...(data as TemplateDataByType["LEAVE_CONFIRMATION"])} />,
      );
    case "MUTATION_LETTER":
      return renderToBuffer(<MutationLetterPdf {...(data as TemplateDataByType["MUTATION_LETTER"])} />);
    case "RECOMMENDATION_LETTER":
      return renderToBuffer(
        <RecommendationLetterPdf {...(data as TemplateDataByType["RECOMMENDATION_LETTER"])} />,
      );
    case "HR_SUMMARY":
      return renderToBuffer(<HrSummaryPdf {...(data as TemplateDataByType["HR_SUMMARY"])} />);
    default: {
      const _exhaustive: never = type;
      throw new Error(`No PDF template for document type: ${_exhaustive}`);
    }
  }
}
