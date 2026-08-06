import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { evaluateClientReadiness, isOrderEligibleClient } from "../lib/client-readiness.ts";
import { hasPermission } from "../lib/frank.ts";
import { requirePermission } from "../lib/server-auth.ts";
import { readBrokerFrontend } from "./frontend-source.mjs";

const readyClient = {
  kycStatus: "approved",
  clientStatus: "active",
  accountStatus: "active",
  proofOfAddressStatus: "received",
  institutional: false,
  businessRegistrationNumber: null,
  authorizedRepresentativeName: null,
  signatoryAuthorityConfirmed: false,
  currentLegalVersion: "1.0",
  acceptedLegalVersion: "1.0",
  csdReference: "CSD-ET-10041",
  availableCash: 100_000,
  availableHoldings: 200,
  restrictionReason: null,
};

test("broker and read-only users can view Client 360, while unknown roles are rejected", async () => {
  assert.equal((await requirePermission(new Request("http://localhost/api/clients/cli_meron", { headers: { "x-frank-demo-role": "broker_admin" } }), "report")).role, "broker_admin");
  assert.equal((await requirePermission(new Request("http://localhost/api/clients/cli_meron", { headers: { "x-frank-demo-role": "management" } }), "report")).role, "management");
  await assert.rejects(
    () => requirePermission(new Request("http://localhost/api/clients/cli_meron", { headers: { "x-frank-demo-role": "unauthorized" } }), "report"),
    (error) => error instanceof Response && error.status === 403,
  );
});

test("missing consent blocks trading readiness", () => {
  const result = evaluateClientReadiness({ ...readyClient, acceptedLegalVersion: null });
  assert.equal(result.canTrade, false);
  assert.equal(result.consentReady, false);
  assert.match(result.blockingReasons.join(" "), /terms are not accepted/);
  assert.equal(result.items.find((item) => item.key === "consent")?.state, "fail");
});

test("restricted accounts are not trade-ready", () => {
  const result = evaluateClientReadiness({
    ...readyClient,
    clientStatus: "restricted",
    accountStatus: "restricted",
    restrictionReason: "Compliance review required",
  });
  assert.equal(result.canBuy, false);
  assert.equal(result.canSell, false);
  assert.equal(result.unrestricted, false);
  assert.match(result.blockingReasons.join(" "), /Compliance review required/);
});

test("ready clients can buy and sell when cash and holdings are available", () => {
  const result = evaluateClientReadiness(readyClient);
  assert.equal(result.canTrade, true);
  assert.equal(result.canBuy, true);
  assert.equal(result.canSell, true);
  assert.equal(result.items.find((item) => item.key === "cash")?.state, "pass");
});

test("missing sanctions and PEP screening evidence blocks trading", () => {
  const result = evaluateClientReadiness({ ...readyClient, screeningStatus: null });
  assert.equal(result.canTrade, false);
  assert.match(result.blockingReasons.join(" "), /screening evidence is required/i);
  assert.equal(result.items.find((item) => item.key === "screening")?.state, "fail");
});

test("read-only management cannot create notes or change restrictions", () => {
  assert.equal(hasPermission("management", "report"), true);
  assert.equal(hasPermission("management", "adjust"), false);
});

test("new-order eligibility begins only after client and account approval", () => {
  const pending = {
    tradeEligible: false,
    status: "pending_approval",
    kyc: "pending_review",
    accountStatus: "pending_approval",
    accountId: "acc_pending",
    termsAcceptedVersion: "1.0",
    restrictionReason: "Awaiting client onboarding approval",
  };
  assert.equal(isOrderEligibleClient(pending), false);
  assert.equal(isOrderEligibleClient({
    ...pending,
    tradeEligible: true,
    status: "active",
    kyc: "approved",
    accountStatus: "active",
    restrictionReason: null,
  }), true);
});

test("read-only users cannot create or approve clients", () => {
  assert.equal(hasPermission("management", "create"), false);
  assert.equal(hasPermission("management", "approve"), false);
  assert.equal(hasPermission("trader", "create"), true);
  assert.equal(hasPermission("compliance", "approve"), true);
});

test("Client 360 surfaces cash, holdings, orders, ledgers, settlements, documents, notes, and audit data", async () => {
  const root = new URL("../", import.meta.url);
  const [ui, route, action, schema] = await Promise.all([
    readBrokerFrontend(),
    readFile(new URL("app/api/clients/[id]/route.ts", root), "utf8"),
    readFile(new URL("app/api/clients/[id]/action/route.ts", root), "utf8"),
    readFile(new URL("prisma/schema.prisma", root), "utf8"),
  ]);
  assert.match(ui, /CLIENT 360/);
  assert.match(ui, /Cash & holdings/);
  assert.match(ui, /Open and recent orders/);
  assert.match(ui, /Transaction history/);
  assert.match(ui, /Settlement items/);
  assert.match(ui, /Accepted agreements/);
  assert.match(ui, /Internal notes/);
  assert.match(ui, /CLIENT CONTROL RECORD/);
  assert.match(route, /availableQuantity/);
  assert.match(route, /blockedQuantity/);
  assert.match(route, /unsettledQuantity/);
  assert.match(route, /availableCash/);
  assert.match(route, /blockedCash/);
  assert.match(route, /unsettledCash/);
  assert.match(route, /remainingQuantity/);
  assert.match(route, /cashLedgerEntries/);
  assert.match(route, /securitiesLedgerEntries/);
  assert.match(action, /CLIENT_INTERNAL_NOTE_ADDED/);
  assert.match(schema, /model ClientNote/);
});

test("broker onboarding is wired through approval into the New Order client list", async () => {
  const root = new URL("../", import.meta.url);
  const [ui, clientsRoute, actionRoute, service, styles, migration] = await Promise.all([
    readBrokerFrontend(),
    readFile(new URL("app/api/clients/route.ts", root), "utf8"),
    readFile(new URL("app/api/clients/[id]/action/route.ts", root), "utf8"),
    readFile(new URL("lib/client-service.ts", root), "utf8"),
    readFile(new URL("app/globals.css", root), "utf8"),
    readFile(new URL("prisma/migrations/20260716170000_client_onboarding_workflow/migration.sql", root), "utf8"),
  ]);
  assert.match(ui, /CONTROLLED CLIENT ONBOARDING/);
  assert.match(ui, /Submit for approval/);
  assert.match(ui, /eligibleClients/);
  assert.match(ui, /Review application/);
  assert.match(ui, /CONTROLLED ONBOARDING REVIEW/);
  assert.match(ui, /Approve and activate/);
  assert.doesNotMatch(ui, /window\.confirm|window\.prompt/);
  assert.match(clientsRoute, /createClientForApproval/);
  assert.match(actionRoute, /approveClient/);
  assert.match(actionRoute, /rejectClient/);
  assert.match(service, /Four-eyes control/);
  assert.match(service, /status: "pending_approval"/);
  assert.match(service, /status: "active"/);
  assert.match(service, /CLIENT_SUBMITTED_FOR_APPROVAL/);
  assert.match(service, /CLIENT_APPROVED/);
  assert.match(styles, /Branded dropdown treatment/);
  assert.match(styles, /select:not\(\[multiple\]\)/);
  assert.match(migration, /clients_created_by_fkey/);
});

test("client accounts use a paginated directory with distinct client categories", async () => {
  const root = new URL("../", import.meta.url);
  const [ui, directoryRoute, service, styles] = await Promise.all([
    readBrokerFrontend(),
    readFile(new URL("app/api/clients/directory/route.ts", root), "utf8"),
    readFile(new URL("lib/client-service.ts", root), "utf8"),
    readFile(new URL("app/globals.css", root), "utf8"),
  ]);
  assert.match(ui, /Client Directory/);
  assert.match(ui, /Client 360 Workspace/);
  assert.match(ui, /setWorkspaceView\("client360"\)/);
  assert.match(ui, /openClientWorkspace\(client\)/);
  assert.match(ui, /Search name, client code, or account/);
  assert.match(ui, /All clients/);
  assert.match(ui, /Individual/);
  assert.match(ui, /Corporate/);
  assert.match(ui, /Institutional/);
  assert.match(ui, /Rows<BrandSelect/);
  assert.doesNotMatch(ui, /className="client-picker"/);
  assert.match(directoryRoute, /pageSize/);
  assert.match(directoryRoute, /skip: \(page - 1\) \* pageSize/);
  assert.match(directoryRoute, /take: pageSize/);
  assert.match(directoryRoute, /accountNumber: \{ contains: query/);
  assert.match(directoryRoute, /clientType: requestedType/);
  assert.match(service, /"individual" \| "corporate" \| "institution"/);
  assert.match(styles, /\.client-directory-table/);
  assert.match(styles, /\.client-page-tabs/);
  assert.match(styles, /\.client-type-badge\.type-corporate/);
  assert.match(styles, /\.segmented\.three/);
});
