import type { ComplianceSnapshot, ComplaintsSnapshot, MonthlyTransactionSnapshot, ReportValidation } from "./compliance-service";
import { createXlsx, type WorkbookCell } from "./simple-xlsx";

const header = (ref: string, value: string): WorkbookCell => ({ ref, value, style: 1 });
const label = (ref: string, value: string): WorkbookCell => ({ ref, value, style: 2 });
const text = (ref: string, value: string): WorkbookCell => ({ ref, value, style: 4 });
const number = (ref: string, value: number): WorkbookCell => ({ ref, value, style: 3 });

function monthlyWorkbook(snapshot: MonthlyTransactionSnapshot) {
  const cells: WorkbookCell[] = [
    header("B2", "Template - Monthly Transaction Report for Securities Brokers, Dealers and Investment Banks"),
    header("B4", "S/N"), header("C4", "Transaction Category"), header("D4", "Domestic Investors (Birr)"), header("G4", "Foreign Investors (Birr)"), header("J4", "Total"),
    header("D5", "Retail"), header("E5", "Institutional"), header("F5", "Sub-Total"), header("G5", "Retail"), header("H5", "Institutional"), header("I5", "Sub-Total"), header("J5", "Total (Birr)"), header("K5", "Domestic (%)"), header("L5", "Foreign (%)"),
    label("B19", "Corporate Profile"), label("B20", "Reporting CMSP:"), text("D20", snapshot.brokerName), label("B21", "Reporting Month:"), text("D21", snapshot.month), label("B22", "Reporting Year:"), number("D22", snapshot.year),
  ];
  snapshot.rows.forEach((row, index) => {
    const r = index + 6;
    const domestic = row.domesticRetail + row.domesticInstitutional;
    const foreign = row.foreignRetail + row.foreignInstitutional;
    const total = domestic + foreign;
    cells.push(
      number(`B${r}`, index + 1), text(`C${r}`, row.category),
      number(`D${r}`, row.domesticRetail), number(`E${r}`, row.domesticInstitutional), { ref: `F${r}`, formula: `SUM(D${r}:E${r})`, value: domestic, style: 3 },
      number(`G${r}`, row.foreignRetail), number(`H${r}`, row.foreignInstitutional), { ref: `I${r}`, formula: `SUM(G${r}:H${r})`, value: foreign, style: 3 },
      { ref: `J${r}`, formula: `F${r}+I${r}`, value: total, style: 3 },
      { ref: `K${r}`, formula: `IF(J${r}=0,0,F${r}/J${r})`, value: total ? domestic / total : 0, style: 5 },
      { ref: `L${r}`, formula: `IF(J${r}=0,0,I${r}/J${r})`, value: total ? foreign / total : 0, style: 5 },
    );
  });
  return createXlsx([{ name: "Sheet1", cells, merges: ["B2:L2", "B4:B5", "C4:C5", "D4:F4", "G4:I4", "J4:L4", "B19:G19", "B20:C20", "D20:G20", "B21:C21", "D21:G21", "B22:C22", "D22:G22"], widths: [5, 5, 18, 18, 18, 18, 18, 18, 18, 18, 14, 14] }]);
}

const splitDate = (value: string | null) => value ? [Number(value.slice(8, 10)), Number(value.slice(5, 7)), Number(value.slice(0, 4))] : ["", "", ""];

function complaintsWorkbook(snapshot: ComplaintsSnapshot) {
  const overview: WorkbookCell[] = [
    header("B2", "Template - CMSPs Quarterly Complaints Management Report"),
    label("B4", "Corporate Profile"), label("B5", "Reporting CMSP:"), text("D5", snapshot.brokerName), label("B6", "Type(s) of License(s)"), text("D6", "Securities Broker"), label("B7", "Reporting Quarter:"), text("D7", snapshot.quarter), label("B8", "Reporting Year:"), number("D8", snapshot.year),
    label("B10", "Summary"),
  ];
  const summaryRows: Array<[string, number]> = [
    ["No. of Complaints Brought Forward from Previous Quarter", snapshot.summary.broughtForward],
    ["No. of New Complaints Received During the Reporting Quarter", snapshot.summary.newComplaints],
    ["Total No. of Complaints Under Review During the Reporting Quarter", snapshot.summary.totalUnderReview],
    ["No. of Complaints Resolved During the Reporting Quarter", snapshot.summary.resolved],
    ["No. of Complaints Referred to the SRO During the Reporting Quarter", snapshot.summary.referredSro],
    ["No. of Complaints Referred to ECMA During the Reporting Quarter", snapshot.summary.referredEcma],
    ["No. of Complaints Closed During the Reporting Quarter", snapshot.summary.closed],
    ["Total No. of Pending Complaints as at the End of the Reporting Quarter", snapshot.summary.pending],
  ];
  summaryRows.forEach(([description, value], index) => overview.push(number(`B${index + 11}`, index + 1), text(`C${index + 11}`, description), number(`E${index + 11}`, value)));

  const report: WorkbookCell[] = [
    header("B2", "Template - CMSPs Quarterly Complaints Management Report"),
    header("B5", "S/N"), header("C5", "Complainant"), header("D5", "Category of Complainant (i.e., Retail or Institutional)"), header("E5", "Type (i.e., Brought Forward or New)"), header("F5", "Date Received"), header("I5", "Details of the Complaint"), header("J5", "Status of Complaint (Resolved, Closed, Referred to SRO, Referred to ECMA, or Pending)"), header("K5", "Date Resolved/ Closed/ Referred"), header("N5", "Comment (e.g., reason for status and description of action taken)"),
    header("F6", "Day"), header("G6", "Month"), header("H6", "Year"), header("K6", "Day"), header("L6", "Month"), header("M6", "Year"),
  ];
  const rowCount = Math.max(20, snapshot.complaints.length);
  for (let index = 0; index < rowCount; index += 1) {
    const r = index + 7;
    const item = snapshot.complaints[index];
    report.push(number(`B${r}`, index + 1));
    if (!item) continue;
    const received = splitDate(item.dateReceived);
    const statusDate = splitDate(item.statusDate);
    report.push(
      text(`C${r}`, item.complainant), text(`D${r}`, item.complainantCategory), text(`E${r}`, item.type),
      text(`F${r}`, String(received[0])), text(`G${r}`, String(received[1])), text(`H${r}`, String(received[2])),
      text(`I${r}`, item.details), text(`J${r}`, item.status),
      text(`K${r}`, String(statusDate[0])), text(`L${r}`, String(statusDate[1])), text(`M${r}`, String(statusDate[2])), text(`N${r}`, item.comment),
    );
  }
  return createXlsx([
    { name: "Overview", cells: overview, merges: ["B2:H2", "B4:E4", "B5:C5", "D5:E5", "B6:C6", "D6:E6", "B7:C7", "D7:E7", "B8:C8", "D8:E8", "B10:E10", ...Array.from({ length: 8 }, (_, index) => `C${index + 11}:D${index + 11}`)], widths: [5, 5, 18, 55, 14, 5, 18, 18] },
    { name: "Report", cells: report, merges: ["B2:N2", "B5:B6", "C5:C6", "D5:D6", "E5:E6", "F5:H5", "I5:I6", "J5:J6", "K5:M5", "N5:N6"], widths: [5, 5, 24, 16, 14, 9, 9, 9, 27, 23, 9, 9, 9, 44] },
  ]);
}

function clientStatementWorkbook(snapshot: Extract<ComplianceSnapshot, { kind: "client_statement" }>) {
  const summary: WorkbookCell[] = [
    header("A1", `${snapshot.brokerName} Client Account Statement`),
    label("A3", "Client"), text("B3", snapshot.client.name), label("A4", "Client code"), text("B4", snapshot.client.code), label("A5", "Account"), text("B5", snapshot.client.accountNumber), label("A6", "Period"), text("B6", `${snapshot.periodStart} to ${snapshot.periodEnd}`), label("A8", "Opening cash"), number("B8", snapshot.openingCash), label("A9", "Closing cash"), number("B9", snapshot.closingCash), label("A11", "Trades"), number("B11", snapshot.trades.length), label("A12", "Holdings"), number("B12", snapshot.holdings.length),
  ];
  const transactions: WorkbookCell[] = ["Date", "Type", "Reference", "Debit", "Credit", "Running balance", "Description"].map((value, index) => header(`${String.fromCharCode(65 + index)}1`, value));
  snapshot.transactions.forEach((item, index) => {
    const r = index + 2;
    transactions.push(text(`A${r}`, item.date), text(`B${r}`, item.type), text(`C${r}`, item.reference), number(`D${r}`, item.debit), number(`E${r}`, item.credit), number(`F${r}`, item.runningBalance), text(`G${r}`, item.description));
  });
  const holdings: WorkbookCell[] = [header("A1", "Symbol"), header("B1", "Security"), header("C1", "Quantity")];
  snapshot.holdings.forEach((item, index) => holdings.push(text(`A${index + 2}`, item.symbol), text(`B${index + 2}`, item.name), number(`C${index + 2}`, item.quantity)));
  const trades: WorkbookCell[] = ["Trade ID", "Order ID", "Trade date", "Symbol", "Side", "Quantity", "Price", "Gross", "Fees", "Net", "Settlement date"].map((value, index) => header(`${String.fromCharCode(65 + index)}1`, value));
  snapshot.trades.forEach((item, index) => {
    const r = index + 2;
    trades.push(text(`A${r}`, item.tradeId), text(`B${r}`, item.orderId), text(`C${r}`, item.tradeDate), text(`D${r}`, item.symbol), text(`E${r}`, item.side.toUpperCase()), number(`F${r}`, item.quantity), number(`G${r}`, item.price), number(`H${r}`, item.gross), number(`I${r}`, item.fees), number(`J${r}`, item.net), text(`K${r}`, item.settlementDate));
  });
  return createXlsx([
    { name: "Statement", cells: summary, merges: ["A1:D1"], widths: [22, 34, 18, 18] },
    { name: "Transactions", cells: transactions, widths: [14, 20, 22, 16, 16, 18, 48] },
    { name: "Trades", cells: trades, widths: [18, 18, 14, 12, 10, 14, 14, 16, 14, 16, 16] },
    { name: "Holdings", cells: holdings, widths: [14, 36, 18] },
  ]);
}

export function complianceWorkbook(snapshot: ComplianceSnapshot) {
  if (snapshot.kind === "monthly_transactions") return monthlyWorkbook(snapshot);
  if (snapshot.kind === "quarterly_complaints") return complaintsWorkbook(snapshot);
  return clientStatementWorkbook(snapshot);
}

export function complianceWorkbookName(snapshot: ComplianceSnapshot) {
  if (snapshot.kind === "monthly_transactions") return `ecma-monthly-transactions-${snapshot.year}-${snapshot.month.toLowerCase()}.xlsx`;
  if (snapshot.kind === "quarterly_complaints") return `ecma-quarterly-complaints-${snapshot.year}-${snapshot.quarter.toLowerCase()}.xlsx`;
  return `client-statement-${snapshot.client.code}-${snapshot.periodStart}-${snapshot.periodEnd}.xlsx`;
}

export function validationFrom(value: unknown): ReportValidation {
  const validation = value as Partial<ReportValidation> | null;
  return { blocking: Array.isArray(validation?.blocking) ? validation.blocking : [], notices: Array.isArray(validation?.notices) ? validation.notices : [] };
}
