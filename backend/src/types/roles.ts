export const ROLES = ["client", "employee", "compliance_officer", "admin"] as const;
export type Role = (typeof ROLES)[number];

// Coarse capability groups used by the rbac middleware.
// Mirrors the permission matrix in the architecture doc (section 07).
export const CAPABILITIES = {
  bankingOwn: ["client"],
  bankingOversight: ["employee", "compliance_officer", "admin"],
  complianceRead: ["compliance_officer"],
  complianceInvestigate: ["compliance_officer"],
  complianceClose: ["compliance_officer"],
  auditRead: ["compliance_officer", "admin"],
  adminOnly: ["admin"],
} as const satisfies Record<string, readonly Role[]>;
