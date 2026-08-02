import { prisma } from "../../../lib/prisma";
import { apiError } from "../../../lib/api";
import { identityProvider } from "../../../lib/identity-provider";
import { resolveActor } from "../../../lib/server-auth";
import { isBrokerAssignableRole } from "../../../lib/user-access";

export const runtime = "nodejs";

const accessDate = () => new Date(Date.now() + 90 * 24 * 60 * 60 * 1000);
const inviteExpiry = () => new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
const allowedReader = (role: string) => role === "access_admin" || role === "broker_admin";
const clean = (value: unknown) => String(value ?? "").trim();
const validEmployeeId = (value: string) => /^[A-Za-z0-9][A-Za-z0-9._/-]{1,39}$/.test(value);

function view(user: {
  id: string; employeeId: string | null; fullName: string; email: string; jobTitle: string | null; department: string | null;
  role: string; status: string; mfaEnabled: boolean; authProvider: string; lastLoginAt: Date | null; invitedAt: Date | null;
  invitationExpiresAt: Date | null; passwordResetRequired: boolean; passwordResetRequestedAt: Date | null; accessReviewDueAt: Date | null;
}) {
  return {
    id: user.id, employeeId: user.employeeId ?? "—", fullName: user.fullName, email: user.email,
    jobTitle: user.jobTitle ?? "", department: user.department ?? "", role: user.role, status: user.status,
    mfaEnabled: user.mfaEnabled, authProvider: user.authProvider,
    lastLoginAt: user.lastLoginAt?.toISOString() ?? null, invitedAt: user.invitedAt?.toISOString() ?? null,
    invitationExpiresAt: user.invitationExpiresAt?.toISOString() ?? null,
    passwordResetRequired: user.passwordResetRequired,
    passwordResetRequestedAt: user.passwordResetRequestedAt?.toISOString() ?? null,
    accessReviewDueAt: user.accessReviewDueAt?.toISOString() ?? null,
  };
}

export async function GET(request: Request) {
  try {
    const actor = resolveActor(request);
    if (!allowedReader(actor.role)) return Response.json({ error: "Broker access administration is required." }, { status: 403 });
    const users = await prisma.user.findMany({ where: { brokerId: actor.brokerId }, orderBy: [{ status: "asc" }, { fullName: "asc" }] });
    return Response.json({ users: users.map(view), canManage: actor.role === "access_admin" });
  } catch (error) { return apiError(error); }
}

export async function POST(request: Request) {
  try {
    const actor = resolveActor(request);
    if (actor.role !== "access_admin") return Response.json({ error: "Broker access administrator access is required." }, { status: 403 });
    const data = await request.json() as Record<string, unknown>;
    const employeeId = clean(data.employeeId).toUpperCase();
    const fullName = clean(data.fullName);
    const email = clean(data.email).toLowerCase();
    const jobTitle = clean(data.jobTitle);
    const department = clean(data.department);
    const role = data.role;
    if (!validEmployeeId(employeeId) || fullName.length < 3 || !email.includes("@") || !jobTitle || !department || !isBrokerAssignableRole(role)) {
      return Response.json({ error: "Employee ID, name, work email, job title, department, and a valid broker role are required." }, { status: 400 });
    }
    const expiresAt = inviteExpiry();
    const auditActor = await prisma.user.findFirst({ where: { id: actor.id, brokerId: actor.brokerId }, select: { id: true } });
    const user = await prisma.$transaction(async (tx) => {
      const created = await tx.user.create({ data: {
        id: `usr_${crypto.randomUUID().slice(0, 12)}`, brokerId: actor.brokerId, employeeId, fullName, email,
        jobTitle, department, role, status: "invited", invitedAt: new Date(), invitationExpiresAt: expiresAt,
        accessReviewDueAt: accessDate(), authProvider: "pending",
      } });
      await tx.auditLog.create({ data: {
        id: crypto.randomUUID(), brokerId: actor.brokerId, actorId: auditActor?.id ?? null, action: "BROKER_USER_INVITED",
        entityType: "user", entityId: created.id, summary: `${fullName} (${employeeId}) invited as ${role}`,
        reason: clean(data.reason) || "New employee access", newValue: JSON.stringify({ employeeId, email, role, department }),
      } });
      return created;
    });
    const delivery = await identityProvider.inviteUser({ userId: user.id, email: user.email, expiresAt });
    return Response.json({ user: view(user), delivery }, { status: 201 });
  } catch (error) { return apiError(error); }
}

export async function PATCH(request: Request) {
  try {
    const actor = resolveActor(request);
    if (actor.role !== "access_admin") return Response.json({ error: "Broker access administrator access is required." }, { status: 403 });
    const data = await request.json() as Record<string, unknown>;
    const id = clean(data.id);
    const action = clean(data.action);
    const reason = clean(data.reason);
    const target = await prisma.user.findFirst({ where: { id, brokerId: actor.brokerId } });
    if (!target) return Response.json({ error: "Broker employee not found." }, { status: 404 });
    if (["suspend", "restore", "change_role", "reset_password"].includes(action) && reason.length < 5) {
      return Response.json({ error: "Record a reason of at least five characters for this access change." }, { status: 400 });
    }
    if (id === actor.id && action === "suspend") return Response.json({ error: "You cannot suspend your own access." }, { status: 409 });
    if (target.role === "access_admin" && ["suspend", "restore", "change_role"].includes(action)) {
      return Response.json({ error: "Access administrator changes require Frank's audited bootstrap or recovery workflow." }, { status: 409 });
    }

    const now = new Date();
    const auditActor = await prisma.user.findFirst({ where: { id: actor.id, brokerId: actor.brokerId }, select: { id: true } });
    let update: Record<string, unknown>;
    let auditAction: string;
    let summary: string;
    if (action === "reset_password") {
      update = { passwordResetRequired: true, passwordResetRequestedAt: now };
      auditAction = "PASSWORD_RESET_REQUESTED"; summary = `Password reset requested for ${target.fullName}`;
    } else if (action === "suspend") {
      update = { status: "suspended", deactivatedAt: now };
      auditAction = "BROKER_USER_SUSPENDED"; summary = `${target.fullName} access suspended`;
    } else if (action === "restore") {
      update = { status: "active", deactivatedAt: null, accessReviewDueAt: accessDate() };
      auditAction = "BROKER_USER_RESTORED"; summary = `${target.fullName} access restored`;
    } else if (action === "change_role") {
      if (!isBrokerAssignableRole(data.role)) return Response.json({ error: "Select a valid broker role." }, { status: 400 });
      update = { role: data.role, accessReviewDueAt: accessDate() };
      auditAction = "BROKER_USER_ROLE_CHANGED"; summary = `${target.fullName} role changed from ${target.role} to ${data.role}`;
    } else if (action === "resend_invite") {
      if (target.status !== "invited") return Response.json({ error: "Only pending invitations can be resent." }, { status: 409 });
      update = { invitedAt: now, invitationExpiresAt: inviteExpiry() };
      auditAction = "BROKER_USER_INVITE_RESENT"; summary = `Invitation renewed for ${target.fullName}`;
    } else {
      return Response.json({ error: "Unsupported access action." }, { status: 400 });
    }

    const user = await prisma.$transaction(async (tx) => {
      const changed = await tx.user.update({ where: { id }, data: update });
      await tx.auditLog.create({ data: {
        id: crypto.randomUUID(), brokerId: actor.brokerId, actorId: auditActor?.id ?? null, action: auditAction,
        entityType: "user", entityId: id, summary, reason: reason || "Invitation renewed",
        previousValue: JSON.stringify({ role: target.role, status: target.status }), newValue: JSON.stringify(update),
      } });
      return changed;
    });
    const delivery = action === "reset_password"
      ? (await identityProvider.requestPasswordReset({ userId: user.id, email: user.email })).delivery
      : action === "resend_invite" && user.invitationExpiresAt
        ? (await identityProvider.inviteUser({ userId: user.id, email: user.email, expiresAt: user.invitationExpiresAt })).delivery
        : undefined;
    return Response.json({ user: view(user), delivery });
  } catch (error) { return apiError(error); }
}
