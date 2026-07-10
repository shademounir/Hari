// Shared shapes fed into the PDF templates (src/lib/documents/templates/) and
// resolved by lib/documents.ts from Employee/User rows before rendering.

/** Who the document is about. */
export type DocumentProfile = {
  name: string;
  title: string;
  department: string;
  managerName: string | null;
  startDate: Date;
};

export type TemplateDataByType = {
  WORK_CERTIFICATE: { profile: DocumentProfile };
  LEAVE_CONFIRMATION: {
    profile: DocumentProfile;
    leaveType: string;
    startDate: Date;
    endDate: Date;
    days: number;
  };
  MUTATION_LETTER: { profile: DocumentProfile; effectiveDate: Date };
  RECOMMENDATION_LETTER: { profile: DocumentProfile };
  HR_SUMMARY: { profile: DocumentProfile; summaryText: string };
};
