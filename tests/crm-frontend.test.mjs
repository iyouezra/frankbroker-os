import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

import { readBrokerFrontend, readInvestorFrontend } from "./frontend-source.mjs";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");

const [broker, investor, foundation, clientDirectory, globalCss, investorCss, supportScreen, supportThreadScreen, newRequestSheet] = await Promise.all([
  readBrokerFrontend(),
  readInvestorFrontend(),
  read("../features/broker/shared/broker-foundation.tsx"),
  read("../features/broker/clients/client-directory-screen.tsx"),
  read("../app/globals.css"),
  read("../app/investor/investor.module.css"),
  read("../features/investor/support/support-screen.tsx"),
  read("../features/investor/support/support-thread-screen.tsx"),
  read("../features/investor/support/new-request-sheet.tsx"),
]);

test("the broker portal exposes conversations with role-gated actions", () => {
  assert.match(foundation, /id: "crm", label: "Conversations"/);
  assert.match(foundation, /conversations:/, "the nav icon path must exist");
  assert.match(foundation, /relationship_officer: "/);
  assert.match(foundation, /service_officer: "/);
  assert.match(broker, /CLIENT CONVERSATIONS/);
  assert.match(broker, /\/api\/crm\/threads/);
  assert.match(broker, /fallbackCrmThreads/, "the inbox must render without a database");
  assert.match(broker, /CRM_PERMISSIONS\.reply/);
  assert.match(broker, /CRM_PERMISSIONS\.note/);
});

test("internal notes are visually and verbally distinguished for the broker", () => {
  assert.match(broker, /Internal note/);
  assert.match(broker, /Only your team can see internal notes/);
  assert.match(broker, /data-visibility=\{message\.visibility\}/);
  assert.match(globalCss, /\.crm-bubble\[data-visibility="internal"\]/);
  assert.match(globalCss, /\.crm-messages/);
  assert.match(globalCss, /\.crm-split/);
});

test("the split view collapses to list-to-detail navigation on small screens", () => {
  assert.match(broker, /data-pane=/);
  assert.match(broker, /All conversations/, "a way back is required once the panes collapse");
  assert.match(globalCss, /\.crm-split\[data-pane="list"\] \.crm-pane-detail \{ display: none; \}/);
  assert.match(globalCss, /\.crm-split\[data-pane="detail"\] \.crm-pane-list \{ display: none; \}/);
});

test("Client 360 composes the shared conversation components rather than reimplementing them", async () => {
  assert.match(clientDirectory, /ClientConversationsTab/);
  assert.match(clientDirectory, /id: "conversations", label: "Conversations"/);
  const tab = await read("../features/broker/crm/client-conversations-tab.tsx");
  assert.match(tab, /import \{ ThreadList \}/);
  assert.match(tab, /import \{ ThreadDetail/);
  assert.doesNotMatch(tab, /fetch\(/, "the tab must reuse the shared data hooks, not its own fetches");
});

test("the investor portal reaches support without consuming a bottom-nav slot", () => {
  assert.match(investor, /Messages &amp; support/);
  assert.match(investor, /support_thread_create/);
  assert.match(investor, /support_thread_reply/);
  assert.match(investor, /support_thread_read/);
  assert.match(investor, /\/api\/investor\/support/);
  assert.match(investor, /fallbackSupportThreads/);
  assert.match(investorCss, /\.msgBubble/);
  assert.match(investorCss, /\.msgComposer/);
  // The bottom nav is a fixed five-column grid; support must not be a sixth tab.
  assert.doesNotMatch(investor, /id: "support", label:/);
});

test("investor support screens contain no broker-internal vocabulary at all", () => {
  // Strip comments so the guard checks code and rendered copy, not prose about it.
  const stripComments = (source) => source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  const supportSource = [supportScreen, supportThreadScreen, newRequestSheet].map(stripComments).join("\n");
  assert.doesNotMatch(supportSource, /internal/i, "investor screens must not mention internal notes");
  assert.doesNotMatch(supportSource, /assignedTo/);
  assert.doesNotMatch(supportSource, /priority/i);
  assert.doesNotMatch(supportSource, /escalat/i);
  assert.doesNotMatch(supportSource, /SLA/);
  assert.match(supportThreadScreen, /This conversation is closed/);
});

test("investor-facing status wording avoids broker operations terminology", async () => {
  assert.match(investor, /Waiting for broker|Waiting for you/);
  const status = await read("../lib/crm/status.ts");
  assert.match(status, /INVESTOR_STATUS_LABELS/);
  assert.match(status, /pending_client: "Waiting for you"/);
});
