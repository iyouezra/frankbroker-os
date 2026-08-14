import { apiError } from "../../../../../lib/api";
import { MONITORING_PERMISSIONS } from "../../../../../lib/frank";
import {
  createOwnPersonalDealingDisclosure,
  getOwnEmployeeConduct,
  recordOwnConductAttestation,
  requestOwnPersonalTradeClearance,
} from "../../../../../lib/monitoring-service";
import { requirePermission } from "../../../../../lib/server-auth";
import { addisYear } from "../../../../../lib/addis-date";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const actor = await requirePermission(request, MONITORING_PERMISSIONS.selfService);
    return Response.json(await getOwnEmployeeConduct(actor));
  } catch (error) { return apiError(error); }
}

export async function POST(request: Request) {
  try {
    const actor = await requirePermission(request, MONITORING_PERMISSIONS.selfService);
    const payload = await request.json() as Record<string, unknown>;
    const action = String(payload.action ?? "");
    if (action === "request_clearance") {
      return Response.json({ clearance: await requestOwnPersonalTradeClearance(actor, {
        instrumentId: String(payload.instrumentId ?? ""),
        side: String(payload.side ?? "buy"),
        maxQuantity: payload.maxQuantity ? Number(payload.maxQuantity) : undefined,
        maxValue: payload.maxValue ? Number(payload.maxValue) : undefined,
      }) }, { status: 201 });
    }
    if (action === "disclose_personal_dealing") {
      const details = payload.details && typeof payload.details === "object" && !Array.isArray(payload.details) ? payload.details as Record<string, unknown> : {};
      return Response.json({ disclosure: await createOwnPersonalDealingDisclosure(actor, { title: String(payload.title ?? "External personal dealing"), details }) }, { status: 201 });
    }
    if (action === "attest") {
      return Response.json({ attestation: await recordOwnConductAttestation(actor, {
        year: Number(payload.year ?? addisYear()),
        statementVersion: String(payload.statementVersion ?? "employee-conduct-1.0"),
        exceptions: payload.exceptions && typeof payload.exceptions === "object" && !Array.isArray(payload.exceptions) ? payload.exceptions as Record<string, unknown> : undefined,
      }) }, { status: 201 });
    }
    return Response.json({ error: "Unsupported employee self-service action." }, { status: 400 });
  } catch (error) { return apiError(error); }
}
