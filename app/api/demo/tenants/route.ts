import { apiError } from "../../../../lib/api";
import { prisma } from "../../../../lib/prisma";
import { resolveTenantContext } from "../../../../lib/tenant-capabilities";

export const runtime = "nodejs";

export async function GET() {
  try {
    const rows = await prisma.broker.findMany({ where: { status: { not: "suspended" } }, select: { id: true }, orderBy: { name: "asc" } });
    const contexts = (await Promise.all(rows.map((row) => resolveTenantContext(row.id)))).filter((item) => item !== null);
    return Response.json({ tenants: contexts.map((item) => ({
      id: item.id,
      tradingName: item.tradingName,
      licenseNumber: item.licenseNumber,
      primaryColor: item.primaryColor,
      businessType: item.businessType,
      modules: item.modules,
      availableRoles: item.availableRoles,
    })) });
  } catch (error) { return apiError(error); }
}
