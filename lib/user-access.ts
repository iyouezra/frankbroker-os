import type { Role } from "./frank";

export const BROKER_ASSIGNABLE_ROLES = [
  "broker_admin",
  "trader",
  "operations",
  "compliance",
  "settlement",
  "relationship_officer",
  "service_officer",
  "management",
] as const satisfies readonly Role[];

export type BrokerAssignableRole = (typeof BROKER_ASSIGNABLE_ROLES)[number];
export type BrokerUserStatus = "active" | "invited" | "suspended";

export type BrokerUserAccess = {
  id: string;
  employeeId: string;
  fullName: string;
  email: string;
  jobTitle: string;
  department: string;
  role: Exclude<Role, "super_admin">;
  status: BrokerUserStatus;
  mfaEnabled: boolean;
  authProvider: string;
  lastLoginAt: string | null;
  invitedAt: string | null;
  invitationExpiresAt: string | null;
  passwordResetRequired: boolean;
  passwordResetRequestedAt: string | null;
  accessReviewDueAt: string | null;
};

export const brokerUserRoleOptions = BROKER_ASSIGNABLE_ROLES.map((role) => ({ value: role, label: role }));

export const isBrokerAssignableRole = (value: unknown): value is BrokerAssignableRole =>
  typeof value === "string" && (BROKER_ASSIGNABLE_ROLES as readonly string[]).includes(value);

export const formatAccessDate = (value: string | null) => value
  ? new Date(value).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })
  : "Not yet";

export const fallbackBrokerUsers: BrokerUserAccess[] = [
  { id: "usr_access_admin", employeeId: "ABS-0012", fullName: "Sara Alemayehu", email: "access.admin@frankbroker.et", jobTitle: "People Operations Lead", department: "People & Operations", role: "access_admin", status: "active", mfaEnabled: true, authProvider: "pending", lastLoginAt: "2026-07-31T08:42:00Z", invitedAt: null, invitationExpiresAt: null, passwordResetRequired: false, passwordResetRequestedAt: null, accessReviewDueAt: "2026-10-01T00:00:00Z" },
  { id: "usr_access_admin_backup", employeeId: "ABS-0031", fullName: "Nahom Bekele", email: "access.backup@frankbroker.et", jobTitle: "Information Security Lead", department: "Technology", role: "access_admin", status: "active", mfaEnabled: true, authProvider: "pending", lastLoginAt: "2026-07-30T13:18:00Z", invitedAt: null, invitationExpiresAt: null, passwordResetRequired: false, passwordResetRequestedAt: null, accessReviewDueAt: "2026-10-01T00:00:00Z" },
  { id: "usr_demo_admin", employeeId: "ABS-0004", fullName: "Mekdes Tadesse", email: "demo.admin@frankbroker.et", jobTitle: "Brokerage Operations Director", department: "Operations", role: "broker_admin", status: "active", mfaEnabled: true, authProvider: "pending", lastLoginAt: "2026-08-02T06:41:00Z", invitedAt: null, invitationExpiresAt: null, passwordResetRequired: false, passwordResetRequestedAt: null, accessReviewDueAt: "2026-10-01T00:00:00Z" },
  { id: "usr_trader", employeeId: "ABS-0107", fullName: "Dawit Alemu", email: "dawit@frankbroker.et", jobTitle: "Senior Trader", department: "Trading", role: "trader", status: "active", mfaEnabled: true, authProvider: "pending", lastLoginAt: "2026-08-02T06:29:00Z", invitedAt: null, invitationExpiresAt: null, passwordResetRequired: false, passwordResetRequestedAt: null, accessReviewDueAt: "2026-10-01T00:00:00Z" },
  { id: "usr_operations", employeeId: "ABS-0142", fullName: "Hana Kebede", email: "hana@frankbroker.et", jobTitle: "Operations Officer", department: "Operations", role: "operations", status: "active", mfaEnabled: false, authProvider: "pending", lastLoginAt: "2026-08-01T14:10:00Z", invitedAt: null, invitationExpiresAt: null, passwordResetRequired: false, passwordResetRequestedAt: null, accessReviewDueAt: "2026-10-01T00:00:00Z" },
  { id: "usr_compliance", employeeId: "ABS-0063", fullName: "Liya Girma", email: "liya@frankbroker.et", jobTitle: "Compliance Officer", department: "Compliance", role: "compliance", status: "active", mfaEnabled: true, authProvider: "pending", lastLoginAt: "2026-08-01T12:45:00Z", invitedAt: null, invitationExpiresAt: null, passwordResetRequired: false, passwordResetRequestedAt: null, accessReviewDueAt: "2026-10-01T00:00:00Z" },
  { id: "usr_settlement", employeeId: "ABS-0088", fullName: "Rahel Getachew", email: "rahel@frankbroker.et", jobTitle: "Settlement Officer", department: "Post-trade", role: "settlement", status: "active", mfaEnabled: false, authProvider: "pending", lastLoginAt: "2026-08-01T11:03:00Z", invitedAt: null, invitationExpiresAt: null, passwordResetRequired: false, passwordResetRequestedAt: null, accessReviewDueAt: "2026-10-01T00:00:00Z" },
  { id: "usr_relationship", employeeId: "ABS-0164", fullName: "Kalkidan Alemu", email: "kalkidan@frankbroker.et", jobTitle: "Relationship Officer", department: "Client Services", role: "relationship_officer", status: "active", mfaEnabled: false, authProvider: "pending", lastLoginAt: "2026-07-31T15:37:00Z", invitedAt: null, invitationExpiresAt: null, passwordResetRequired: false, passwordResetRequestedAt: null, accessReviewDueAt: "2026-10-01T00:00:00Z" },
  { id: "usr_service", employeeId: "ABS-0171", fullName: "Bethel Tesfaye", email: "bethel@frankbroker.et", jobTitle: "Client Service Officer", department: "Client Services", role: "service_officer", status: "invited", mfaEnabled: false, authProvider: "pending", lastLoginAt: null, invitedAt: "2026-08-01T09:00:00Z", invitationExpiresAt: "2026-08-08T09:00:00Z", passwordResetRequired: false, passwordResetRequestedAt: null, accessReviewDueAt: "2026-10-30T00:00:00Z" },
];
