import { prisma } from "./prisma";
import { hasPermission, type Role } from "./frank";
import { resolveActor } from "./server-auth";

export type BusinessType = "securities_dealer" | "investment_bank" | "securities_investment_adviser";
export type TenantModuleKey = "dealer_operations" | "investor_servicing" | "issuer_advisory";
export type EntitlementKey = "securities_dealing" | "transaction_advisory";

export const MODULE_ENTITLEMENT: Record<TenantModuleKey, EntitlementKey> = {
  dealer_operations: "securities_dealing",
  investor_servicing: "securities_dealing",
  issuer_advisory: "transaction_advisory",
};

export const PROFILE_ROLES: Record<BusinessType, Role[]> = {
  securities_dealer: ["broker_admin", "trader", "operations", "compliance", "settlement", "relationship_officer", "service_officer", "management"],
  investment_bank: ["broker_admin", "trader", "operations", "compliance", "settlement", "relationship_officer", "service_officer", "advisory_lead", "advisory_analyst", "management"],
  securities_investment_adviser: ["broker_admin", "advisory_lead", "advisory_analyst", "compliance", "management"],
};

export type TenantContext = {
  id: string;
  name: string;
  tradingName: string;
  licenseNumber: string;
  primaryColor: string;
  businessType: BusinessType;
  licenses: Array<{ id: string; regulator: string; licenseType: string; licenseNumber: string; status: string; validFrom: string | null; validTo: string | null }>;
  entitlements: EntitlementKey[];
  modules: Record<TenantModuleKey, boolean>;
  checklistPacks: Array<{ templateId: string; code: string; version: string; transactionType: string; marketSegment: string; title: string }>;
  availableRoles: Role[];
};

const knownBusinessType = (value?: string | null): BusinessType =>
  value === "investment_bank" || value === "securities_investment_adviser" ? value : "securities_dealer";

export async function resolveTenantContext(tenantId: string): Promise<TenantContext | null> {
  const tenant = await prisma.broker.findUnique({
    where: { id: tenantId },
    include: {
      settings: true,
      tenantProfile: true,
      tenantLicenses: { orderBy: { createdAt: "asc" } },
      tenantEntitlements: { where: { status: "active" } },
      tenantModules: true,
      tenantChecklistPacks: { where: { enabled: true }, include: { template: true } },
    },
  });
  if (!tenant) return null;

  const businessType = knownBusinessType(tenant.tenantProfile?.businessType);
  const entitlementSet = new Set<EntitlementKey>();
  for (const item of tenant.tenantEntitlements) {
    if (item.activityKey === "securities_dealing" || item.activityKey === "transaction_advisory") entitlementSet.add(item.activityKey);
  }
  // Existing installations remain usable before the additive backfill is run.
  if (!tenant.tenantProfile && tenant.tenantEntitlements.length === 0) entitlementSet.add("securities_dealing");

  const configured = new Map(tenant.tenantModules.map((item) => [item.moduleKey, item.enabled]));
  const modules = {} as Record<TenantModuleKey, boolean>;
  for (const key of Object.keys(MODULE_ENTITLEMENT) as TenantModuleKey[]) {
    const legacyDefault = !tenant.tenantProfile && (key === "dealer_operations" || key === "investor_servicing");
    modules[key] = Boolean((configured.get(key) ?? legacyDefault) && entitlementSet.has(MODULE_ENTITLEMENT[key]));
  }

  return {
    id: tenant.id,
    name: tenant.name,
    tradingName: tenant.settings?.tradingName ?? tenant.name,
    licenseNumber: tenant.licenseNumber,
    primaryColor: tenant.settings?.primaryColor ?? "#0C8189",
    businessType,
    licenses: tenant.tenantLicenses.map((item) => ({
      id: item.id,
      regulator: item.regulator,
      licenseType: item.licenseType,
      licenseNumber: item.licenseNumber,
      status: item.status,
      validFrom: item.validFrom?.toISOString().slice(0, 10) ?? null,
      validTo: item.validTo?.toISOString().slice(0, 10) ?? null,
    })),
    entitlements: [...entitlementSet],
    modules,
    checklistPacks: tenant.tenantChecklistPacks.map(({ template }) => ({
      templateId: template.id,
      code: template.code,
      version: template.version,
      transactionType: template.transactionType,
      marketSegment: template.marketSegment,
      title: template.title,
    })),
    availableRoles: PROFILE_ROLES[businessType],
  };
}

export async function requireTenantModule(request: Request, moduleKey: TenantModuleKey, permission?: string) {
  const actor = resolveActor(request);
  const context = await resolveTenantContext(actor.brokerId);
  if (!context) throw new Response("Tenant not found.", { status: 404 });
  if (!context.modules[moduleKey]) throw new Response("This module is not enabled for the tenant.", { status: 403 });
  if (!context.availableRoles.includes(actor.role)) throw new Response("This role is not available for the tenant.", { status: 403 });
  if (permission && !hasPermission(actor.role, permission)) throw new Response("This role is not permitted to perform that action.", { status: 403 });
  return { actor, context };
}
