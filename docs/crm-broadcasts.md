# Broker broadcasts and message receipts

Conversations has a second tab, **Broadcasts**, instead of a new sidebar section.
The composer asks for an audience, an optional company/security or event link,
and the message. A review step shows the recipient count, sample and exact copy
before the user sends. Recipients never see one another.

## Audiences

All queries use the authenticated broker. Closed and rejected clients are
excluded; restricted clients remain contactable. Choices are all current clients,
retail clients, institutional/corporate clients, current holders of one security,
or clients with a positive recorded entitlement to a corporate-action event.
Client-level relation filters deduplicate investors with multiple accounts.

Current holdings use positive total quantity, including blocked holdings. Event
eligibility uses positive `eligibleQuantity` from the event's saved record-date
entitlements, so selling later does not remove someone from that event audience.
Company links reference existing accessible instruments. Corporate-action links
are tenant-validated; an optional named event also supports updates such as an AGM.

The audience token covers the normalized message and sorted recipient IDs. The
server recomputes it at send time; changes require another review. The committed
private threads are the immutable recipient snapshot, not a live segment query.

## Delivery and status

In-app is the connected channel. SMS/email options are visibly disabled and the
API rejects them. The existing OTP connector is not a general messaging provider.
Enabling external channels requires a real provider integration, per-recipient
outbox processing and authenticated delivery callbacks. SMS does not provide
message-read receipts; email opens are not reliable proof of human reading.

A new shared message is **delivered** when it is persisted to the recipient's
in-app inbox, not when a device receives a push notification. **Read** means the
visible conversation acknowledged the specific displayed message IDs. Inbox lists,
notification reads, and GET requests do not generate read receipts. Staff reads
cannot mark broker-sent messages as read by investors. Internal notes never carry
receipts. Historical delivery/read timestamps remain unknown until an actual read.

Only the initial broadcast message is counted toward its delivery/read totals.
Replies are ordinary private CRM messages and cannot inflate those totals.
Repeated acknowledgements preserve the first read time. Open views refresh at
15-second intervals while the page is visible.

## Persistence and failure handling

`CommunicationBroadcast` stores the message, segment/context, original count and
send reference. Its threads and initial messages carry nullable `broadcastId`
relations. The send transaction writes all private threads, initial messages,
notifications and an audit entry together, using batches of 500 rows. A failure
rolls the entire broadcast back; there is no partly delivered in-app campaign.

A broker-scoped unique request key, advisory lock and payload hash make retries
idempotent. The browser retains the key after an uncertain response and offers a
safe retry instead of creating a second send. Serialization conflicts retry up
to twice. The transaction timeout is 60 seconds; route duration is 90 seconds.

Unanswered broadcast copies stay out of the main conversation list and its
assigned-to-me count. They remain in Client 360 and broadcast recipient details.
A reply brings the private conversation into the regular inbox.

## Permissions and release

Sending uses `crm.broadcast.send`, granted to broker admins, service officers,
relationship officers and the existing super-admin role. CRM viewers can inspect
broadcast history and per-recipient status within their tenant.

Apply `20260917140000_crm_broadcasts_and_receipts` before running the updated app.
It adds a table, nullable message receipt fields, links and indexes. It has been
applied and tested on the isolated Neon branch `codex/crm-broadcasts-test-20260917`,
which expires after one day. It was then applied successfully to the configured
live database on September 18, 2026.

Validation includes the existing CRM tests, new validation/permission tests and
an opt-in database integration test covering holder deduplication, event eligibility,
foreign-tenant rejection, concurrent retries, atomic rollback, observed-message
receipts, and an audience of 505 clients. Run the integration test only against a
disposable branch, setting `DATABASE_URL` and `FRANK_BROADCAST_TEST_HOST` to its
host. It creates test fixtures in fresh tenants and never sends SMS/email.
