import type { ComplianceSnapshot, ComplaintsSnapshot, MonthlyTransactionSnapshot, ReportValidation } from "./compliance-service";
import { createXlsx, type WorkbookCell } from "./simple-xlsx";

const header = (ref: string, value: string): WorkbookCell => ({ ref, value, style: 1 });
const label = (ref: string, value: string): WorkbookCell => ({ ref, value, style: 2 });
const text = (ref: string, value: string): WorkbookCell => ({ ref, value, style: 4 });
const number = (ref: string, value: number): WorkbookCell => ({ ref, value, style: 3 });
const ecmaTitle = (ref: string, value: string): WorkbookCell => ({ ref, value, style: 6 });
const ecmaHeader = (ref: string, value: string): WorkbookCell => ({ ref, value, style: 7 });
const ecmaProfileHeader = (ref: string, value: string): WorkbookCell => ({ ref, value, style: 8 });
const ecmaProfileLabel = (ref: string, value: string): WorkbookCell => ({ ref, value, style: 9 });
const ecmaProfileValue = (ref: string, value: string | number): WorkbookCell => ({ ref, value, style: 10 });
const ecmaNote = (ref: string, value: string): WorkbookCell => ({ ref, value, style: 11 });
const ecmaNumber = (ref: string, value: number): WorkbookCell => ({ ref, value, style: 12 });
const ecmaPercent = (ref: string, formula: string, value: number): WorkbookCell => ({ ref, formula, value, style: 13 });
const ecmaText = (ref: string, value: string): WorkbookCell => ({ ref, value, style: 14 });
const ecmaSummaryLabel = (ref: string, value: string): WorkbookCell => ({ ref, value, style: 15 });
const ecmaSummaryNumber = (ref: string, value: number, formula?: string): WorkbookCell => ({ ref, value, formula, style: 16 });
const ecmaNotesBlock = (ref: string, value: string): WorkbookCell => ({ ref, value, style: 17 });
const ecmaDatePart = (ref: string, value: number | ""): WorkbookCell => ({ ref, value, style: 18 });
const ecmaSerial = (ref: string, value: number): WorkbookCell => ({ ref, value, style: 19 });

function monthlyWorkbook(snapshot: MonthlyTransactionSnapshot) {
  const cells: WorkbookCell[] = [
    ecmaTitle("B2", "MONTHLY TRANSACTION REPORT (SECURITIES BROKERS, SECURITIES DEALERS AND APPLICABLE INVESTMENT BANKS)"),
    ecmaHeader("B4", "S/N"), ecmaHeader("C4", "Transaction Category"), ecmaHeader("D4", "Domestic Investors (Birr)"), ecmaHeader("G4", "Foreign Investors (Birr)"), ecmaHeader("J4", "Total"),
    ecmaHeader("D5", "Retail"), ecmaHeader("E5", "Institutional"), ecmaHeader("F5", "Sub-Total"), ecmaHeader("G5", "Retail"), ecmaHeader("H5", "Institutional"), ecmaHeader("I5", "Sub-Total"), ecmaHeader("J5", "Total (Birr)"), ecmaHeader("K5", "Domestic (%)"), ecmaHeader("L5", "Foreign (%)"),
    ecmaNote("B17", "Note: The CMSP's proprietary trades are to be recorded as part of Domestic Institutional transactions."),
    ecmaProfileHeader("B19", "Corporate Profile"), ecmaProfileLabel("B20", "Reporting CMSP:"), ecmaProfileValue("D20", snapshot.brokerName), ecmaProfileLabel("B21", "Reporting Month:"), ecmaProfileValue("D21", snapshot.month), ecmaProfileLabel("B22", "Reporting Year:"), ecmaProfileValue("D22", snapshot.year),
  ];
  snapshot.rows.forEach((row, index) => {
    const r = index + 6;
    const domestic = row.domesticRetail + row.domesticInstitutional;
    const foreign = row.foreignRetail + row.foreignInstitutional;
    const total = domestic + foreign;
    cells.push(
      ecmaSerial(`B${r}`, index + 1), ecmaText(`C${r}`, row.category),
      ecmaNumber(`D${r}`, row.domesticRetail), ecmaNumber(`E${r}`, row.domesticInstitutional), { ref: `F${r}`, formula: `SUM(D${r}:E${r})`, value: domestic, style: 12 },
      ecmaNumber(`G${r}`, row.foreignRetail), ecmaNumber(`H${r}`, row.foreignInstitutional), { ref: `I${r}`, formula: `SUM(G${r}:H${r})`, value: foreign, style: 12 },
      { ref: `J${r}`, formula: `F${r}+I${r}`, value: total, style: 12 },
      ecmaPercent(`K${r}`, `IF(J${r}=0,0,F${r}/J${r})`, total ? domestic / total : 0),
      ecmaPercent(`L${r}`, `IF(J${r}=0,0,I${r}/J${r})`, total ? foreign / total : 0),
    );
  });
  return createXlsx([{ name: "Sheet1", cells, merges: ["B2:L2", "B4:B5", "C4:C5", "D4:F4", "G4:I4", "J4:L4", "B17:L17", "B19:G19", "B20:C20", "D20:G20", "B21:C21", "D21:G21", "B22:C22", "D22:G22"], widths: [5.57, 4.57, 15.86, 18.86, 18.86, 18.86, 18.86, 18.86, 18.86, 18.86, 13.57, 13.57], hideGridLines: true, freeze: { columns: 3, rows: 5, topLeftCell: "D6" } }]);
}

const splitDate = (value: string | null): [number | "", number | "", number | ""] => value ? [Number(value.slice(8, 10)), Number(value.slice(5, 7)), Number(value.slice(0, 4))] : ["", "", ""];

function complaintsWorkbook(snapshot: ComplaintsSnapshot) {
  const overview: WorkbookCell[] = [
    ecmaTitle("B2", "COMPLAINTS MANAGEMENT REPORT (CAPITAL MARKET SERVICE PROVIDERS)"),
    ecmaProfileHeader("B4", "Corporate Profile"), ecmaProfileLabel("B5", "Reporting CMSP:"), ecmaProfileValue("D5", snapshot.brokerName), ecmaProfileLabel("B6", "Type(s) of License(s)"), ecmaProfileValue("D6", snapshot.licenseTypes?.join(", ") || "Securities Broker"), ecmaProfileLabel("B7", "Reporting Quarter:"), ecmaProfileValue("D7", snapshot.quarter), ecmaProfileLabel("B8", "Reporting Year:"), ecmaProfileValue("D8", snapshot.year),
    ecmaProfileHeader("B10", "Summary"),
    ecmaNotesBlock("G4", "Notes:\n\n1. The report must be organized in chronological order, based on the date each complaint was received.\n\n2. When listing individuals' names, the first name should appear first, with the surname stated last.\n\n3. A \"Closed\" complaint is a complaint which falls outside the operational scope of the CMSP (e.g., matters related to an Issuer's activities or another regulated entity). Upon thorough review, the complainant has been duly informed that the CMSP does not have the authority to act on the matter, and where applicable, guidance has been provided on the appropriate channel for escalation or resolution. As a result, the complaint is closed within the CMSP's records."),
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
  summaryRows.forEach(([description, value], index) => {
    const row = index + 11;
    const formula = row === 13 ? "E11+E12" : row === 18 ? "E13-SUM(E14:E17)" : undefined;
    overview.push(ecmaSerial(`B${row}`, index + 1), ecmaSummaryLabel(`C${row}`, description), ecmaSummaryNumber(`E${row}`, value, formula));
  });

  const report: WorkbookCell[] = [
    ecmaTitle("B2", "COMPLAINTS MANAGEMENT REPORT (CAPITAL MARKET SERVICE PROVIDERS)"),
    ecmaHeader("B5", "S/N"), ecmaHeader("C5", "Complainant"), ecmaHeader("D5", "Category of Complainant\n(i.e., Retail or Institutional)"), ecmaHeader("E5", "Type\n(i.e., Brought Forward or New)"), ecmaHeader("F5", "Date Received"), ecmaHeader("I5", "Details of the Complaint"), ecmaHeader("J5", "Status of Complaint\n(Resolved, Closed, Referred to SRO, Referred to ECMA, or Pending)"), ecmaHeader("K5", "Date Resolved/ Closed/ Referred)"), ecmaHeader("N5", "Comment\n(e.g., reason for status and description of action taken)"),
    ecmaHeader("F6", "Day"), ecmaHeader("G6", "Month"), ecmaHeader("H6", "Year"), ecmaHeader("K6", "Day"), ecmaHeader("L6", "Month"), ecmaHeader("M6", "Year"),
  ];
  const rowCount = Math.max(20, snapshot.complaints.length);
  for (let index = 0; index < rowCount; index += 1) {
    const r = index + 7;
    const item = snapshot.complaints[index];
    const received = splitDate(item?.dateReceived ?? null);
    const statusDate = splitDate(item?.statusDate ?? null);
    report.push(
      ecmaSerial(`B${r}`, index + 1), ecmaText(`C${r}`, item?.complainant ?? ""), ecmaText(`D${r}`, item?.complainantCategory ?? ""), ecmaText(`E${r}`, item?.type ?? ""),
      ecmaDatePart(`F${r}`, received[0]), ecmaDatePart(`G${r}`, received[1]), ecmaDatePart(`H${r}`, received[2]),
      ecmaText(`I${r}`, item?.details ?? ""), ecmaText(`J${r}`, item?.status ?? ""),
      ecmaDatePart(`K${r}`, statusDate[0]), ecmaDatePart(`L${r}`, statusDate[1]), ecmaDatePart(`M${r}`, statusDate[2]), ecmaText(`N${r}`, item?.comment ?? ""),
    );
  }
  return createXlsx([
    { name: "Overview", cells: overview, merges: ["B2:H2", "B4:E4", "B5:C5", "D5:E5", "B6:C6", "D6:E6", "B7:C7", "D7:E7", "B8:C8", "D8:E8", "B10:E10", "G4:I18", ...Array.from({ length: 8 }, (_, index) => `C${index + 11}:D${index + 11}`)], widths: [5.57, 4.57, 18, 54.86, 30.57, 4.71, 18.86, 18.86, 9.14], hideGridLines: true },
    { name: "Report", cells: report, merges: ["B2:N2", "B5:B6", "C5:C6", "D5:D6", "E5:E6", "F5:H5", "I5:I6", "J5:J6", "K5:M5", "N5:N6", "B28:N28"], widths: [5.57, 4.57, 23.29, 14.29, 12, 8.14, 8.14, 8.14, 26, 21.43, 8.14, 8.14, 8.14, 44.14], rowHeights: { 5: 61.5, 6: 20.25 }, hideGridLines: true, freeze: { columns: 3, rows: 6, topLeftCell: "D7" } },
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
