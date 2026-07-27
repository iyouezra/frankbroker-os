import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const investorRoute = await readFile(new URL("../app/api/investor/route.ts", import.meta.url), "utf8");
const investorApp = await readFile(new URL("../app/investor/investor-app.tsx", import.meta.url), "utf8");
const profileScreen = await readFile(new URL("../features/investor/profile/profile-screen.tsx", import.meta.url), "utf8");
const clientAction = await readFile(new URL("../app/api/clients/[id]/action/route.ts", import.meta.url), "utf8");
const brokerDocuments = await readFile(new URL("../app/api/clients/[id]/documents/route.ts", import.meta.url), "utf8");
const clientScreen = await readFile(new URL("../features/broker/clients/client-directory-screen.tsx", import.meta.url), "utf8");

test("investor access explains trade and cash restrictions and exposes self-service records", () => {
  assert.match(investorRoute, /canTrade/);
  assert.match(investorRoute, /canMoveCash/);
  assert.match(investorRoute, /broker_restriction/);
  assert.match(investorRoute, /accept_terms/);
  assert.match(investorRoute, /kyc_documents/);
  assert.match(investorApp, /Restricted access/);
  assert.match(profileScreen, /Brokerage agreement/);
  assert.match(profileScreen, /Review your documents/);
});

test("broker restriction resolution is categorized, audited, and supports client document upload", () => {
  for (const category of ["compliance_review", "kyc_overdue", "missing_documents", "suspicious_activity", "legal_regulatory", "client_request", "other"]) {
    assert.match(clientAction, new RegExp(category));
  }
  assert.match(clientAction, /CLIENT_ACCOUNT_RESTRICTED/);
  assert.match(clientAction, /BROKER_RECORDED_TERMS_ACCEPTANCE/);
  assert.match(clientAction, /CLIENT_KYC_REVIEW_COMPLETED/);
  assert.match(brokerDocuments, /requirePermission\(request, "adjust"\)/);
  assert.match(brokerDocuments, /BROKER_KYC_DOCUMENT_UPLOADED/);
  assert.match(clientScreen, /Upload for client/);
  assert.match(clientScreen, /Record witnessed acceptance/);
  assert.match(clientScreen, /Complete KYC review/);
});
