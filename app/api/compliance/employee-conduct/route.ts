import { apiError } from "../../../../lib/api";
import { MONITORING_PERMISSIONS } from "../../../../lib/frank";
import {
  addRestrictedSecurity,
  createEmployeeDisclosure,
  decidePersonalTradeClearance,
  enrollEmployeeConductProfile,
  listEmployeeConduct,
  requestPersonalTradeClearance,
  recordConductAttestation,
  recordSensitiveInformationAccess,
  releaseSensitiveInformationAccess,
} from "../../../../lib/monitoring-service";
import { requirePermission } from "../../../../lib/server-auth";
import { addisYear } from "../../../../lib/addis-date";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const actor = await requirePermission(request, MONITORING_PERMISSIONS.sensitive);
    return Response.json(await listEmployeeConduct(actor));
  } catch (error) { return apiError(error); }
}

export async function POST(request: Request) {
  try {
    const payload = await request.json() as Record<string, unknown>;
    const action = String(payload.action ?? "");
    if (action === "enroll") {
      const actor = await requirePermission(request, MONITORING_PERMISSIONS.employeeConductManage);
      return Response.json({ profile: await enrollEmployeeConductProfile(actor, { userId: String(payload.userId ?? ""), faydaId: String(payload.faydaId ?? ""), sensitiveMarketAccess: Boolean(payload.sensitiveMarketAccess) }) }, { status: 201 });
    }
    if (action === "request_clearance") {
      const actor = await requirePermission(request, MONITORING_PERMISSIONS.clearanceRequest);
      return Response.json({ clearance: await requestPersonalTradeClearance(actor, { employeeProfileId: String(payload.employeeProfileId ?? ""), instrumentId: String(payload.instrumentId ?? ""), side: String(payload.side ?? "buy"), maxQuantity: payload.maxQuantity ? Number(payload.maxQuantity) : undefined, maxValue: payload.maxValue ? Number(payload.maxValue) : undefined }) }, { status: 201 });
    }
    if (action === "decide_clearance") {
      const actor = await requirePermission(request, MONITORING_PERMISSIONS.clearanceApprove);
      return Response.json({ clearance: await decidePersonalTradeClearance(actor, String(payload.clearanceId ?? ""), { decision: String(payload.decision ?? "rejected"), reason: String(payload.reason ?? "") }) });
    }
    if (action === "disclose") {
      const actor = await requirePermission(request, MONITORING_PERMISSIONS.clearanceRequest);
      return Response.json({ disclosure: await createEmployeeDisclosure(actor, { employeeProfileId: String(payload.employeeProfileId ?? ""), disclosureType: String(payload.disclosureType ?? ""), title: String(payload.title ?? ""), details: payload.details && typeof payload.details === "object" ? payload.details as Record<string, unknown> : {} }) }, { status: 201 });
    }
    if (action === "restrict_security") {
      const actor = await requirePermission(request, MONITORING_PERMISSIONS.restrictionManage);
      return Response.json({ restriction: await addRestrictedSecurity(actor, { instrumentId: String(payload.instrumentId ?? ""), classification: String(payload.classification ?? "watch"), reason: String(payload.reason ?? ""), effectiveFrom: payload.effectiveFrom ? String(payload.effectiveFrom) : undefined, effectiveTo: payload.effectiveTo ? String(payload.effectiveTo) : undefined }) }, { status: 201 });
    }
    if (action === "sensitive_information") {
      const actor = await requirePermission(request, MONITORING_PERMISSIONS.employeeConductManage);
      return Response.json({ access: await recordSensitiveInformationAccess(actor, { employeeProfileId: String(payload.employeeProfileId ?? ""), instrumentId: String(payload.instrumentId ?? ""), reason: String(payload.reason ?? ""), receivedAt: payload.receivedAt ? String(payload.receivedAt) : undefined }) }, { status: 201 });
    }
    if (action === "release_sensitive_information") {
      const actor = await requirePermission(request, MONITORING_PERMISSIONS.employeeConductManage);
      return Response.json({ access: await releaseSensitiveInformationAccess(actor, String(payload.accessId ?? "")) });
    }
    if (action === "attest") {
      const actor = await requirePermission(request, MONITORING_PERMISSIONS.clearanceRequest);
      return Response.json({ attestation: await recordConductAttestation(actor, { employeeProfileId: String(payload.employeeProfileId ?? ""), year: Number(payload.year ?? addisYear()), statementVersion: String(payload.statementVersion ?? "1.0"), exceptions: payload.exceptions && typeof payload.exceptions === "object" ? payload.exceptions as Record<string, unknown> : undefined }) }, { status: 201 });
    }
    return Response.json({ error: "Unsupported employee-conduct action." }, { status: 400 });
  } catch (error) { return apiError(error); }
}
