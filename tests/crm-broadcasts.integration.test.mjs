import assert from "node:assert/strict";
import test from "node:test";

// This opt-in test writes only disposable fixtures on an explicitly selected
// test branch. It never sends SMS/email or runs against the normal database.
const enabled = Boolean(process.env.FRANK_BROADCAST_TEST_HOST);
test("broadcast audiences, atomic delivery, isolation, retries and receipts", { skip: !enabled, timeout: 180_000 }, async () => {
  assert.equal(new URL(process.env.DATABASE_URL).hostname, process.env.FRANK_BROADCAST_TEST_HOST);
  assert.notEqual(process.env.FRANK_BROADCAST_TEST_HOST, "ep-dawn-flower-ax16nsyi.c-4.us-east-2.aws.neon.tech");
  const { prisma } = await import("../lib/prisma.ts");
  const { previewBroadcast, sendBroadcast, listBroadcasts, broadcastRecipients } = await import("../lib/crm/broadcast-service.ts");
  const { getInvestorThread, markThreadReadByInvestor, postBrokerMessage, postInvestorMessage, markThreadReadByBroker, addInternalNote, listThreads } = await import("../lib/crm/thread-service.ts");
  const suffix = crypto.randomUUID().slice(0, 8);
  const key = (name) => `bct-test-${suffix}-${name}`;
  const brokerId = key("broker"), otherBroker = key("other");
  const actor = { brokerId, id: key("user"), email: `${suffix}@example.invalid`, role: "broker_admin" };
  const clientA = key("a"), clientB = key("b"), clientC = key("c");
  const input = { subject: "Test issuer notice", body: "Integration test on an isolated branch.", segment: "all", channel: "in_app" };
  const expectStatus = (status) => (error) => error instanceof Response && error.status === status;
  try {
    await prisma.broker.createMany({ data: [brokerId, otherBroker].map((id) => ({ id, name: "Disposable broadcast test", licenseNumber: id })) });
    await prisma.user.create({ data: { id: actor.id, brokerId, email: actor.email, fullName: "Test sender", role: actor.role } });
    await prisma.client.createMany({ data: [
      { id: clientA, brokerId, clientCode: key("ca"), fullName: "Retail holder", clientType: "individual" },
      { id: clientB, brokerId, clientCode: key("cb"), fullName: "Institution entitlement", clientType: "institution" },
      { id: clientC, brokerId, clientCode: key("cc"), fullName: "Retail no holding", clientType: "individual" },
      { id: key("closed"), brokerId, clientCode: key("cd"), fullName: "Closed client", status: "closed" },
      { id: key("foreign"), brokerId: otherBroker, clientCode: key("cf"), fullName: "Foreign client" },
    ] });
    await prisma.account.createMany({ data: [["a1", clientA], ["a2", clientA], ["b1", clientB], ["foreign", key("foreign")]].map(([name, clientId]) => ({ id: key(`acc-${name}`), clientId, accountNumber: key(`number-${name}`) })) });
    await prisma.instrument.create({ data: { id: key("security"), symbol: key("symbol"), name: "Test company", issuer: "Test company", assetClass: "equity" } });
    await prisma.brokerInstrument.create({ data: { id: key("access"), brokerId, instrumentId: key("security") } });
    await prisma.holding.createMany({ data: ["a1", "a2", "b1", "foreign"].map((name) => ({ id: key(`holding-${name}`), accountId: key(`acc-${name}`), instrumentId: key("security"), totalQuantity: name === "b1" ? 0 : 5, availableQuantity: name === "b1" ? 0 : 5 })) });
    await prisma.corporateAction.create({ data: { id: key("event"), brokerId, instrumentId: key("security"), actionType: "dividend", recordDate: new Date("2026-09-01"), paymentDate: new Date("2026-09-20"), sourceReference: key("event-ref"), createdBy: actor.id } });
    await prisma.corporateActionEntitlement.create({ data: { id: key("entitlement"), corporateActionId: key("event"), accountId: key("acc-b1"), ledgerQuantity: 5, eligibleQuantity: 5, positionSource: "ledger" } });
    assert.equal((await previewBroadcast(actor, input)).count, 3);
    assert.equal((await previewBroadcast(actor, { ...input, segment: "retail" })).count, 2);
    assert.equal((await previewBroadcast(actor, { ...input, segment: "institutions" })).count, 1);
    assert.equal((await previewBroadcast(actor, { ...input, segment: "event_entitlements", corporateActionId: key("event") })).sample[0].id, clientB);
    await assert.rejects(previewBroadcast({ ...actor, brokerId: otherBroker }, { ...input, corporateActionId: key("event") }), expectStatus(404));
    const holders = { ...input, segment: "holders", instrumentId: key("security") };
    const preview = await previewBroadcast(actor, holders);
    assert.equal(preview.count, 1, "multi-account investors receive one copy; zero holdings and other tenants excluded");
    const request = { ...holders, audienceToken: preview.token, requestKey: crypto.randomUUID() };
    await assert.rejects(sendBroadcast({ ...actor, role: "management" }, request), expectStatus(403));
    const [sent, retried] = await Promise.all([sendBroadcast(actor, request), sendBroadcast(actor, request)]);
    assert.equal(sent.id, retried.id, "concurrent duplicate sends are idempotent");
    assert.equal(await prisma.communicationThread.count({ where: { broadcastId: sent.id } }), 1);
    assert.equal(await prisma.notification.count({ where: { brokerId, clientId: clientA } }), 1);
    assert.equal((await listThreads(actor, { page: 1, pageSize: 25 })).threads.length, 0, "broadcasts do not flood the inbox");
    assert.equal((await listThreads(actor, { page: 1, pageSize: 25, clientId: clientA })).threads.length, 1);
    const counts = async () => (await listBroadcasts(actor)).broadcasts.find((item) => item.id === sent.id);
    assert.equal((await counts()).delivered, 1);
    assert.equal((await counts()).read, 0);
    const recipients = await broadcastRecipients(actor, sent.id);
    const threadId = recipients.recipients[0].threadId;
    await assert.rejects(broadcastRecipients({ ...actor, brokerId: otherBroker }, sent.id), expectStatus(404));
    const context = { brokerId, clientId: clientA };
    const detail = await getInvestorThread(context, threadId);
    assert.equal((await counts()).read, 0, "fetching does not manufacture read receipts");
    const messageId = detail.thread.messages[0].id;
    await assert.rejects(markThreadReadByInvestor({ brokerId, clientId: clientB }, threadId, [messageId]), expectStatus(404));
    await markThreadReadByInvestor(context, threadId, ["unseen-message"]);
    assert.equal((await counts()).read, 0);
    await markThreadReadByInvestor(context, threadId, [messageId]);
    const firstRead = (await prisma.communicationMessage.findUnique({ where: { id: messageId } })).readAt;
    await markThreadReadByInvestor(context, threadId, [messageId]);
    assert.equal((await counts()).read, 1);
    assert.equal((await prisma.communicationMessage.findUnique({ where: { id: messageId } })).readAt.toISOString(), firstRead.toISOString());
    await postBrokerMessage(actor, threadId, "A later reply must not be marked by the old receipt.");
    await markThreadReadByInvestor(context, threadId, [messageId]);
    assert.equal((await prisma.communicationThread.findUnique({ where: { id: threadId } })).investorUnreadCount, 1);
    assert.equal((await counts()).delivered, 1, "replies never inflate bulk counts");
    await addInternalNote(actor, threadId, "Private staff note");
    const investorView = await getInvestorThread(context, threadId);
    assert.ok(investorView.thread.messages.every((message) => !message.body.includes("Private staff")));
    const response = await postInvestorMessage(context, threadId, "Thank you for the update");
    await markThreadReadByBroker(actor, threadId, [response.messageId]);
    assert.ok((await prisma.communicationMessage.findUnique({ where: { id: response.messageId } })).readAt);
    assert.equal((await listThreads(actor, { page: 1, pageSize: 25 })).threads.length, 1, "replies enter the ordinary inbox");
    const stale = await previewBroadcast(actor, input);
    await prisma.client.create({ data: { id: key("new"), brokerId, clientCode: key("new-code"), fullName: "New client" } });
    await assert.rejects(sendBroadcast(actor, { ...input, audienceToken: stale.token, requestKey: crypto.randomUUID() }), expectStatus(409));
    const fresh = await previewBroadcast(actor, input);
    await assert.rejects(sendBroadcast({ ...actor, id: "missing-sender" }, { ...input, audienceToken: fresh.token, requestKey: crypto.randomUUID() }));
    assert.equal(await prisma.communicationBroadcast.count({ where: { brokerId } }), 1, "failed fan-out rolls back the entire broadcast");
    await prisma.client.createMany({ data: Array.from({ length: 501 }, (_, index) => ({ id: key(`bulk-${index}`), brokerId, clientCode: key(`bulk-code-${index}`), fullName: `Bulk test ${index}` })) });
    const large = await previewBroadcast(actor, input);
    const largeSend = await sendBroadcast(actor, { ...input, audienceToken: large.token, requestKey: crypto.randomUUID() });
    assert.equal(largeSend.recipientCount, 505);
    assert.equal(await prisma.communicationMessage.count({ where: { broadcastId: largeSend.id } }), 505, "all batches are delivered without truncation");
  } finally { await prisma.$disconnect(); }
});

test("historical unknown receipts do not reintroduce old unread messages", { skip: !enabled, timeout: 60_000 }, async () => {
  assert.equal(new URL(process.env.DATABASE_URL).hostname, process.env.FRANK_BROADCAST_TEST_HOST);
  assert.notEqual(process.env.FRANK_BROADCAST_TEST_HOST, "ep-dawn-flower-ax16nsyi.c-4.us-east-2.aws.neon.tech");
  const { prisma } = await import("../lib/prisma.ts");
  const { markThreadReadByInvestor } = await import("../lib/crm/thread-service.ts");
  const suffix = crypto.randomUUID();
  const key = (name) => `receipt-test-${suffix}-${name}`;
  try {
    await prisma.broker.create({ data: { id: key("broker"), name: "Receipt test", licenseNumber: key("license") } });
    await prisma.client.create({ data: { id: key("client"), brokerId: key("broker"), clientCode: key("code"), fullName: "Receipt test client" } });
    await prisma.communicationThread.create({ data: { id: key("thread"), brokerId: key("broker"), clientId: key("client"), subject: "Old and new messages", messageCount: 3, investorUnreadCount: 2 } });
    await prisma.communicationMessage.createMany({ data: [
      { id: key("legacy"), threadId: key("thread"), authorType: "broker", body: "Old receipt unknown" },
      { id: key("displayed"), threadId: key("thread"), authorType: "broker", body: "Displayed message", deliveredAt: new Date() },
      { id: key("unseen"), threadId: key("thread"), authorType: "broker", body: "Not yet displayed", deliveredAt: new Date() },
    ] });
    await markThreadReadByInvestor({ brokerId: key("broker"), clientId: key("client") }, key("thread"), [key("displayed")]);
    assert.equal((await prisma.communicationThread.findUnique({ where: { id: key("thread") } })).investorUnreadCount, 1);
    assert.equal((await prisma.communicationMessage.findUnique({ where: { id: key("legacy") } })).readAt, null);
    assert.equal((await prisma.communicationMessage.findUnique({ where: { id: key("unseen") } })).readAt, null);
  } finally { await prisma.$disconnect(); }
});
