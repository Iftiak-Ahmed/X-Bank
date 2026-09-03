export const ROLES = ["client", "employee", "compliance_officer", "compliance_manager", "admin"] as const;
export type Role = (typeof ROLES)[number];

// Coarse capability groups used by the rbac middleware.
// Mirrors the permission matrix in the architecture doc (section 07).
export const CAPABILITIES = {
  bankingOwn: ["client"],
  bankingOversight: ["employee", "compliance_officer", "compliance_manager", "admin"],
  complianceRead: ["compliance_officer", "compliance_manager"],
  complianceInvestigate: ["compliance_officer", "compliance_manager"],
  complianceClose: ["compliance_manager"],
  auditRead: ["compliance_officer", "compliance_manager", "admin"],
  adminOnly: ["admin"],
} as const satisfies Record<string, readonly Role[]>;
