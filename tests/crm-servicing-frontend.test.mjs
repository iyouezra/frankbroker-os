import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

import { readBrokerFrontend, readInvestorFrontend } from "./frontend-source.mjs";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");

const [broker, investor, foundation, shell, clientDirectory, myTasks, complaints, timeline, officerCard, escalation, threadDetail, globalCss] = await Promise.all([
  readBrokerFrontend(),
  readInvestorFrontend(),
  read("../features/broker/shared/broker-foundation.tsx"),
  read("../app/frankbroker-app.tsx"),
  read("../features/broker/clients/client-directory-screen.tsx"),
  read("../features/broker/crm/my-tasks-screen.tsx"),
  read("../features/broker/crm/complaints-screen.tsx"),
  read("../features/broker/crm/activity-timeline.tsx"),
  read("../features/broker/crm/relationship-officer-card.tsx"),
  read("../features/broker/crm/escalation-drawer.tsx"),
  read("../features/broker/crm/thread-detail.tsx"),
  read("../app/globals.css"),
]);

/** JSX and code only - a comment mentioning a word is not the word shipping. */
const stripComments = (source) => source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

test("the three servicing surfaces sit in their own nav group", () => {
  assert.match(foundation, /label: "Client service"/);
  for (const item of [/id: "crm", label: "Conversations"/, /id: "crm_tasks", label: "My tasks"/, /id: "crm_cases", label: "Complaints"/]) {
    assert.match(foundation, item);
  }
  // Every grouped item needs an icon, or the collapsed sidebar shows a blank row.
  assert.match(foundation, /\n  tasks:/);
  assert.match(foundation, /\n  complaints:/);
});

test("the shell renders each servicing view", () => {
  assert.match(shell, /view === "crm_tasks" && <MyTasksPage/);
  assert.match(shell, /view === "crm_cases" && <ComplaintsPage/);
  assert.match(shell, /import \{ MyTasksPage \}/);
  assert.match(shell, /import \{ ComplaintsPage \}/);
});

test("tasks and complaints render without a database", () => {
  assert.match(myTasks, /fallbackCrmTasks/);
  assert.match(complaints, /fallbackCrmCases/);
  assert.match(foundation, /export const fallbackCrmTasks/);
  assert.match(foundation, /export const fallbackCrmCases/);
});

test("completing a task and resolving a case both demand a written outcome", () => {
  assert.match(myTasks, /Completion note/);
  assert.match(myTasks, /setCompleting\(task\)/, "completing opens a form rather than firing immediately");
  assert.match(complaints, /Resolution summary/);
  assert.match(complaints, /summary\.trim\(\)\.length < 10/, "the resolve button stays disabled until there is a real summary");
});

test("task and case controls are permission-gated in the UI as well as the API", () => {
  assert.match(myTasks, /hasPermission\(role, CRM_PERMISSIONS\.taskComplete\)/);
  assert.match(complaints, /hasPermission\(role, CRM_PERMISSIONS\.caseManage\)/);
  assert.match(officerCard, /hasPermission\(role, CRM_PERMISSIONS\.relationshipAssign\)/);
  assert.match(threadDetail, /hasPermission\(role, CRM_PERMISSIONS\.caseManage\)/);
  // Hidden buttons are a courtesy, not the control - say so where a role is blocked.
  assert.match(complaints, /Your role can view complaints but not manage them\./);
});

test("Client 360 composes the shared servicing components rather than reimplementing them", () => {
  assert.match(clientDirectory, /<ActivityTimeline/);
  assert.match(clientDirectory, /<RelationshipOfficerCard/);
  assert.match(clientDirectory, /<TaskCard/);
  assert.match(clientDirectory, /id: "timeline", label: "Timeline"/);
  // The timeline builds from the Client 360 payload; it must not fetch its own.
  assert.doesNotMatch(timeline, /fetch\(/);
});

test("a conversation can be escalated into a task or a complaint", () => {
  assert.match(threadDetail, /Add follow-up task/);
  assert.match(threadDetail, /Open complaint/);
  assert.match(escalation, /"\/api\/crm\/tasks"/);
  assert.match(escalation, /"\/api\/crm\/cases"/);
  assert.match(escalation, /threadId/, "both escalations link back to the conversation");
});

test("internal findings are labelled as internal wherever they can be typed", () => {
  assert.match(complaints, /never shown to the investor/i);
});

test("Phase 2 styling exists for both themes to inherit", () => {
  for (const selector of [/\.crm-task \{/, /\.crm-task\.overdue/, /\.crm-timeline \{/, /\.crm-officer /, /\.crm-case-controls/, /\.crm-escalated/, /\.crm-linkish/]) {
    assert.match(globalCss, selector);
  }
  // Colour comes from the token layer, so dark mode needs no second ruleset.
  const phase2Block = globalCss.slice(globalCss.indexOf(".crm-detail-actions"), globalCss.indexOf(".user-control {"));
  assert.ok(phase2Block.length > 2000, "the Phase 2 block must be found");
  assert.doesNotMatch(phase2Block, /#[0-9a-f]{3,6}\b/i, "Phase 2 styles must use --fx-* tokens, not literal colours");
});

test("the investor is told who owns their relationship, and nothing more", () => {
  const investorCode = stripComments(investor);
  assert.match(investorCode, /relationshipOfficer/);
  assert.match(investorCode, /Your point of contact is/);
  // Name and job title only: no direct line, no inbox, no employee id.
  assert.doesNotMatch(investorCode, /officer\.(email|phone|extension|mobile)/);
});

test("no servicing vocabulary leaks into the investor portal", () => {
  const investorCode = stripComments(investor);
  for (const forbidden of [/internal note/i, /assignedToUserId/, /escalat/i, /\bcaseManage\b/, /crm\.task/, /crm\.case/]) {
    assert.doesNotMatch(investorCode, forbidden);
  }
});

test("the broker portal stays investor servicing, not sales", () => {
  const brokerCode = stripComments(broker);
  assert.doesNotMatch(brokerCode, /\b(sales pipeline|lead score|prospect|campaign|upsell|quota)\b/i);
});
