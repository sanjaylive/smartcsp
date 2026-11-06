import 'json.dart';

class Customer {
  const Customer({required this.id, required this.name, this.phone, this.email, required this.phoneMasked, this.notes, required this.outstandingDuePaise, required this.version});
  final String id;
  final String name;
  final String? phone;
  final String? email;
  final bool phoneMasked;
  final String? notes;
  final int outstandingDuePaise;
  final int version;

  factory Customer.fromJson(Json j) => Customer(
        id: str(j, 'id'),
        name: str(j, 'name'),
        phone: strOrNull(j, 'phone'),
        email: strOrNull(j, 'email'),
        phoneMasked: boolOf(j, 'phoneMasked'),
        notes: strOrNull(j, 'notes'),
        outstandingDuePaise: intOf(j, 'outstandingDuePaise'),
        version: intOf(j, 'version'),
      );
}

class FollowUp {
  const FollowUp({required this.id, required this.title, this.notes, required this.dueDate, required this.status, this.recordId, this.customerName, required this.version});
  final String id;
  final String title;
  final String? notes;
  final String dueDate;
  final String status;
  final String? recordId;
  final String? customerName;
  final int version;

  factory FollowUp.fromJson(Json j) => FollowUp(
        id: str(j, 'id'),
        title: str(j, 'title'),
        notes: strOrNull(j, 'notes'),
        dueDate: str(j, 'dueDate'),
        status: str(j, 'status', 'OPEN'),
        recordId: strOrNull(j, 'recordId'),
        customerName: j['customer'] is Map ? strOrNull(asJson(j['customer']), 'name') : null,
        version: intOf(j, 'version'),
      );
}

class DueRecord {
  const DueRecord({required this.id, required this.recordNo, required this.serviceCode, required this.txnDate, required this.amountDuePaise, required this.paymentStatus});
  final String id;
  final int recordNo;
  final String serviceCode;
  final String txnDate;
  final int amountDuePaise;
  final String paymentStatus;

  factory DueRecord.fromJson(Json j) => DueRecord(
        id: str(j, 'id'),
        recordNo: intOf(j, 'recordNo'),
        serviceCode: str(j, 'serviceCode'),
        txnDate: str(j, 'txnDate'),
        amountDuePaise: intOf(j, 'amountDuePaise'),
        paymentStatus: str(j, 'paymentStatus'),
      );
}

class DueGroup {
  const DueGroup({this.customerId, required this.customerName, required this.totalDuePaise, required this.records});
  final String? customerId;
  final String customerName;
  final int totalDuePaise;
  final List<DueRecord> records;

  factory DueGroup.fromJson(Json j) => DueGroup(
        customerId: strOrNull(j, 'customerId'),
        customerName: str(j, 'customerName'),
        totalDuePaise: intOf(j, 'totalDuePaise'),
        records: asJsonList(j['records']).map(DueRecord.fromJson).toList(),
      );
}

class DuesSummary {
  const DuesSummary({required this.items, required this.totalDuePaise});
  final List<DueGroup> items;
  final int totalDuePaise;

  factory DuesSummary.fromJson(Json j) =>
      DuesSummary(items: asJsonList(j['items']).map(DueGroup.fromJson).toList(), totalDuePaise: intOf(j, 'totalDuePaise'));
}

class CollectionResult {
  const CollectionResult({required this.id, required this.receiptNo, required this.amountPaise});
  final String id;
  final String receiptNo;
  final int amountPaise;

  factory CollectionResult.fromJson(Json j) => CollectionResult(id: str(j, 'id'), receiptNo: str(j, 'receiptNo'), amountPaise: intOf(j, 'amountPaise'));
}

class CashbookLine {
  const CashbookLine({
    required this.entryNo,
    required this.type,
    required this.description,
    this.sourceType,
    this.sourceId,
    required this.inPaise,
    required this.outPaise,
    required this.balancePaise,
    this.memo,
    required this.reversed,
    required this.isReversal,
    required this.createdAt,
  });

  final int entryNo;
  final String type;
  final String description;
  final String? sourceType;
  final String? sourceId;
  final int inPaise;
  final int outPaise;
  final int balancePaise;
  final String? memo;
  final bool reversed;
  final bool isReversal;
  final String createdAt;

  factory CashbookLine.fromJson(Json j) => CashbookLine(
        entryNo: intOf(j, 'entryNo'),
        type: str(j, 'type'),
        description: str(j, 'description'),
        sourceType: strOrNull(j, 'sourceType'),
        sourceId: strOrNull(j, 'sourceId'),
        inPaise: intOf(j, 'inPaise'),
        outPaise: intOf(j, 'outPaise'),
        balancePaise: intOf(j, 'balancePaise'),
        memo: strOrNull(j, 'memo'),
        reversed: boolOf(j, 'reversed'),
        isReversal: boolOf(j, 'isReversal'),
        createdAt: str(j, 'createdAt'),
      );
}

class FundBalance {
  const FundBalance({required this.account, required this.name, required this.balancePaise});
  final String account;
  final String name;
  final int balancePaise;

  factory FundBalance.fromJson(Json j) => FundBalance(account: str(j, 'account'), name: str(j, 'name'), balancePaise: intOf(j, 'balancePaise'));
}

class Cashbook {
  const Cashbook({
    required this.date,
    required this.account,
    required this.openingBalancePaise,
    required this.totalInPaise,
    required this.totalOutPaise,
    required this.closingBalancePaise,
    required this.items,
    required this.fundBalances,
    required this.dayStatus,
  });

  final String date;
  final String account;
  final int openingBalancePaise;
  final int totalInPaise;
  final int totalOutPaise;
  final int closingBalancePaise;
  final List<CashbookLine> items;
  final List<FundBalance> fundBalances;
  final String dayStatus;

  factory Cashbook.fromJson(Json j) => Cashbook(
        date: str(j, 'date'),
        account: str(j, 'account'),
        openingBalancePaise: intOf(j, 'openingBalancePaise'),
        totalInPaise: intOf(j, 'totalInPaise'),
        totalOutPaise: intOf(j, 'totalOutPaise'),
        closingBalancePaise: intOf(j, 'closingBalancePaise'),
        items: asJsonList(j['items']).map(CashbookLine.fromJson).toList(),
        fundBalances: asJsonList(j['fundBalances']).map(FundBalance.fromJson).toList(),
        dayStatus: str(j, 'dayStatus', 'OPEN'),
      );
}

class ClosingSummary {
  const ClosingSummary({
    required this.recordsTotal,
    required this.recordsUnposted,
    required this.feeIncomePaise,
    required this.commissionAccruedPaise,
    required this.expensesPaise,
    required this.duesCollectedPaise,
  });

  final int recordsTotal;
  final int recordsUnposted;
  final int feeIncomePaise;
  final int commissionAccruedPaise;
  final int expensesPaise;
  final int duesCollectedPaise;

  factory ClosingSummary.fromJson(Json j) => ClosingSummary(
        recordsTotal: intOf(j, 'recordsTotal'),
        recordsUnposted: intOf(j, 'recordsUnposted'),
        feeIncomePaise: intOf(j, 'feeIncomePaise'),
        commissionAccruedPaise: intOf(j, 'commissionAccruedPaise'),
        expensesPaise: intOf(j, 'expensesPaise'),
        duesCollectedPaise: intOf(j, 'duesCollectedPaise'),
      );
}

class ClosingRecord {
  const ClosingRecord({required this.status, required this.countedCashPaise, required this.variancePaise, this.closedAt, this.notes});
  final String status;
  final int countedCashPaise;
  final int variancePaise;
  final String? closedAt;
  final String? notes;

  factory ClosingRecord.fromJson(Json j) => ClosingRecord(
        status: str(j, 'status'),
        countedCashPaise: intOf(j, 'countedCashPaise'),
        variancePaise: intOf(j, 'variancePaise'),
        closedAt: strOrNull(j, 'closedAt'),
        notes: strOrNull(j, 'notes'),
      );
}

class ClosingPreview {
  const ClosingPreview({
    required this.businessDate,
    required this.status,
    required this.openingCashPaise,
    required this.cashInPaise,
    required this.cashOutPaise,
    required this.expectedCashPaise,
    required this.summary,
    this.closing,
  });

  final String businessDate;
  final String status;
  final int openingCashPaise;
  final int cashInPaise;
  final int cashOutPaise;
  final int expectedCashPaise;
  final ClosingSummary summary;
  final ClosingRecord? closing;

  bool get isClosed => status == 'CLOSED' || status == 'REOPEN_REQUESTED';

  factory ClosingPreview.fromJson(Json j) => ClosingPreview(
        businessDate: str(j, 'businessDate'),
        status: str(j, 'status', 'OPEN'),
        openingCashPaise: intOf(j, 'openingCashPaise'),
        cashInPaise: intOf(j, 'cashInPaise'),
        cashOutPaise: intOf(j, 'cashOutPaise'),
        expectedCashPaise: intOf(j, 'expectedCashPaise'),
        summary: ClosingSummary.fromJson(asJson(j['summary'])),
        closing: j['closing'] is Map ? ClosingRecord.fromJson(asJson(j['closing'])) : null,
      );
}
