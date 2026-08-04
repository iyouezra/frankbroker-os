import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const investorRoute = await readFile(new URL("../app/api/investor/route.ts", import.meta.url), "utf8");
const investorApp = await readFile(new URL("../app/investor/investor-app.tsx", import.meta.url), "utf8");
// Localised investor copy lives in the English dictionary rather than the JSX.
const investorCopy = await readFile(new URL("../lib/i18n/en.ts", import.meta.url), "utf8");
const profileScreen = await readFile(new URL("../features/investor/profile/profile-screen.tsx", import.meta.url), "utf8");
const clientAction = await readFile(new URL("../app/api/clients/[id]/action/route.ts", import.meta.url), "utf8");
const restrictionResolution = await readFile(new URL("../lib/restriction-resolution.ts", import.meta.url), "utf8");
const brokerDocuments = await readFile(new URL("../app/api/clients/[id]/documents/route.ts", import.meta.url), "utf8");
const clientScreen = await readFile(new URL("../features/broker/clients/client-directory-screen.tsx", import.meta.url), "utf8");
const brokerApp = await readFile(new URL("../app/frankbroker-app.tsx", import.meta.url), "utf8");
const rootLayout = await readFile(new URL("../app/layout.tsx", import.meta.url), "utf8");

test("investor access explains trade and cash restrictions and exposes self-service records", () => {
  assert.match(investorRoute, /canTrade/);
  assert.match(investorRoute, /canMoveCash/);
  assert.match(investorRoute, /broker_restriction/);
  assert.match(investorRoute, /accept_terms/);
  assert.match(investorRoute, /kyc_documents/);
  assert.match(investorApp, /restricted\.title/);
  assert.match(investorCopy, /Restricted access/);
  assert.match(profileScreen, /profile\.brokerageAgreement/);
  assert.match(profileScreen, /kycSheet\.title/);
  assert.match(investorCopy, /"profile\.brokerageAgreement": "Brokerage agreement"/);
  assert.match(investorCopy, /"kycSheet\.title": "Review your documents"/);
});

test("broker restriction resolution is categorized, audited, and supports client document upload", () => {
  for (const category of ["compliance_review", "kyc_overdue", "missing_documents", "suspicious_activity", "legal_regulatory", "client_request", "other"]) {
    assert.match(restrictionResolution, new RegExp(category));
  }
  assert.match(clientAction, /CLIENT_ACCOUNT_RESTRICTED/);
  assert.match(clientAction, /CLIENT_ACCOUNT_RESTORED/);
  assert.match(clientAction, /evaluateRestorationControls/);
  assert.match(clientAction, /resolutionEvidence/);
  assert.match(clientAction, /restrictionReason: originalRestriction/);
  assert.match(clientAction, /BROKER_RECORDED_TERMS_ACCEPTANCE/);
  assert.match(clientAction, /CLIENT_KYC_REVIEW_COMPLETED/);
  assert.match(brokerDocuments, /requirePermission\(request, "adjust"\)/);
  assert.match(brokerDocuments, /BROKER_KYC_DOCUMENT_UPLOADED/);
  assert.match(clientScreen, /Upload for client/);
  assert.match(clientScreen, /Record witnessed acceptance/);
  assert.match(clientScreen, /Complete KYC review/);
  assert.match(clientScreen, /CONTROLLED ACCOUNT RESTORATION/);
  assert.match(clientScreen, /Understand the restriction/);
  assert.match(clientScreen, /Verify resolution controls/);
  assert.match(clientScreen, /Record the restoration decision/);
});

test("broker theme hydrates consistently in light mode", () => {
  assert.match(brokerApp, /useState<"light" \| "dark">\("light"\)/);
  assert.doesNotMatch(rootLayout, /frank-theme|dangerouslySetInnerHTML/);
  assert.doesNotMatch(brokerApp, /localStorage\.setItem\("frank-theme"/);
});
