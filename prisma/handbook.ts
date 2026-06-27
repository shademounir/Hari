// Tiny employee handbook used as the RAG corpus. Each entry becomes one
// embedded chunk in the HandbookChunk table.
export const HANDBOOK: { section: string; content: string }[] = [
  {
    section: "Paid Time Off (Vacation)",
    content:
      "Full-time employees accrue 20 days of paid vacation per year. Vacation must be requested in advance through the platform and approved by your manager. Unused days roll over up to a maximum of 5 days into the next calendar year. Vacation cannot be taken before it has accrued except with HR approval.",
  },
  {
    section: "Sick Leave",
    content:
      "Employees receive 10 paid sick days per year. Sick leave can be used for personal illness or to care for an immediate family member. For absences longer than three consecutive days, a doctor's note may be required. Sick days do not roll over and are not paid out on termination.",
  },
  {
    section: "Parental Leave",
    content:
      "The company offers 16 weeks of fully paid parental leave for all new parents, including birth, adoption, and foster placement, regardless of gender. Leave must be taken within 12 months of the child's arrival. Employees are eligible after 6 months of employment. Contact HR at least 30 days before your intended start date.",
  },
  {
    section: "Remote Work Policy",
    content:
      "Most roles are eligible for hybrid or fully remote work. Hybrid employees are expected in the office at least two days per week. Remote employees must be reachable during core hours of 10am–4pm in their team's primary time zone. A one-time home-office stipend of $500 is available; request it through Expenses.",
  },
  {
    section: "Working Hours and Overtime",
    content:
      "Standard working hours are 40 per week. Core collaboration hours are 10am–4pm local time. Non-exempt employees are eligible for overtime pay at 1.5x for hours worked beyond 40 in a week, which must be pre-approved by a manager. Flexible start and end times are permitted as long as core hours are covered.",
  },
  {
    section: "Expense Reimbursement",
    content:
      "Business expenses are reimbursed when submitted with a receipt within 30 days. Eligible expenses include travel, client meals (up to $75 per person), software subscriptions, and professional development. Expenses over $1,000 require manager pre-approval. Reimbursements are paid with the next payroll cycle.",
  },
  {
    section: "Health Benefits",
    content:
      "The company covers 100% of the employee premium and 70% of dependent premiums for medical, dental, and vision insurance. Coverage begins on the first day of the month after your start date. Open enrollment occurs each November. A $1,200 annual wellness reimbursement covers gym memberships and mental-health services.",
  },
  {
    section: "Code of Conduct",
    content:
      "All employees are expected to treat colleagues with respect and maintain a harassment-free workplace. Discrimination based on race, gender, age, religion, disability, or sexual orientation is prohibited. Violations should be reported to HR or through the anonymous ethics hotline. Confidential company information must not be shared externally.",
  },
  {
    section: "Performance Reviews",
    content:
      "Formal performance reviews are conducted twice a year, in June and December. Reviews include self-assessment, manager feedback, and goal setting for the next cycle. Compensation adjustments and promotions are typically decided during the December cycle. Continuous feedback is encouraged outside of formal reviews.",
  },
  {
    section: "Equipment and Security",
    content:
      "Each employee is issued a company laptop. Devices must use full-disk encryption and the company password manager. Report lost or stolen equipment to IT immediately. Personal use of company devices should be minimal. Returning equipment is required within 7 days of leaving the company.",
  },
];
