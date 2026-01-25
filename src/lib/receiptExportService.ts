import { format } from "date-fns";
import { db, type Receipt, type ReceiptItem } from "./db";
import { createCsvContent, downloadCsv, formatDateForFilename } from "./csvExport";
import { type DateRange, getFilteredReceipts, type ReceiptFilters } from "./receiptAnalyticsService";

// CSV column headers
const RECEIPT_HEADERS = [
  "receiptId",
  "date",
  "storeName",
  "storeAddress",
  "currency",
  "subtotal",
  "tax",
  "total",
  "confidence",
  "warnings",
  "entryId",
  "createdAt",
  "updatedAt",
];

const RECEIPT_ITEM_HEADERS = [
  "receiptId",
  "itemId",
  "date",
  "storeName",
  "currency",
  "itemName",
  "qty",
  "unitPrice",
  "totalPrice",
  "discount",
  "category",
];

/**
 * Get date from receipt for CSV (fallback to createdAt)
 */
function getReceiptDateString(receipt: Receipt): string {
  if (receipt.date) return receipt.date;
  return format(new Date(receipt.createdAt), "yyyy-MM-dd");
}

/**
 * Format timestamp to ISO string for CSV
 */
function formatTimestamp(timestamp: number): string {
  return new Date(timestamp).toISOString();
}

/**
 * Convert receipt to CSV row values
 */
function receiptToRow(receipt: Receipt): (string | number | null)[] {
  return [
    receipt.id ?? null,
    getReceiptDateString(receipt),
    receipt.storeName,
    receipt.storeAddress,
    receipt.currency,
    receipt.subtotal,
    receipt.tax,
    receipt.total,
    receipt.confidence,
    receipt.warnings.join("; "),
    receipt.entryId,
    formatTimestamp(receipt.createdAt),
    formatTimestamp(receipt.updatedAt),
  ];
}

/**
 * Convert receipt item to CSV row values (with receipt context)
 */
function receiptItemToRow(item: ReceiptItem, receipt: Receipt): (string | number | null)[] {
  return [
    item.receiptId,
    item.id ?? null,
    getReceiptDateString(receipt),
    receipt.storeName,
    receipt.currency,
    item.name,
    item.qty,
    item.unitPrice,
    item.totalPrice,
    item.discount,
    item.category,
  ];
}

/**
 * Export all receipts to CSV
 */
export async function exportAllReceiptsCsv(): Promise<void> {
  const receipts = await db.receipts.orderBy("createdAt").reverse().toArray();
  
  if (receipts.length === 0) {
    throw new Error("No receipts to export");
  }
  
  const rows = receipts.map(receiptToRow);
  const csv = createCsvContent(RECEIPT_HEADERS, rows);
  
  const filename = `receipts_all_${formatDateForFilename(new Date())}.csv`;
  downloadCsv(filename, csv);
}

/**
 * Export all receipt items to CSV
 */
export async function exportAllReceiptItemsCsv(): Promise<void> {
  const receipts = await db.receipts.orderBy("createdAt").reverse().toArray();
  const allItems = await db.receiptItems.toArray();
  
  if (receipts.length === 0) {
    throw new Error("No receipts to export");
  }
  
  // Create a map of receipt by ID for quick lookup
  const receiptMap = new Map<number, Receipt>();
  receipts.forEach(r => {
    if (r.id !== undefined) {
      receiptMap.set(r.id, r);
    }
  });
  
  // Build rows with receipt context
  const rows: (string | number | null)[][] = [];
  for (const item of allItems) {
    const receipt = receiptMap.get(item.receiptId);
    if (receipt) {
      rows.push(receiptItemToRow(item, receipt));
    }
  }
  
  if (rows.length === 0) {
    throw new Error("No items to export");
  }
  
  const csv = createCsvContent(RECEIPT_ITEM_HEADERS, rows);
  
  const filename = `receipt_items_all_${formatDateForFilename(new Date())}.csv`;
  downloadCsv(filename, csv);
}

/**
 * Export filtered receipts to CSV
 */
export async function exportFilteredReceiptsCsv(filters: ReceiptFilters): Promise<void> {
  const receipts = await getFilteredReceipts(filters);
  
  // Sort by createdAt descending
  receipts.sort((a, b) => b.createdAt - a.createdAt);
  
  if (receipts.length === 0) {
    throw new Error("No receipts to export");
  }
  
  const rows = receipts.map(receiptToRow);
  const csv = createCsvContent(RECEIPT_HEADERS, rows);
  
  const startDate = formatDateForFilename(filters.dateRange.start);
  const endDate = formatDateForFilename(filters.dateRange.end);
  const filename = `receipts_${startDate}_to_${endDate}.csv`;
  
  downloadCsv(filename, csv);
}

/**
 * Export filtered receipt items to CSV
 */
export async function exportFilteredReceiptItemsCsv(filters: ReceiptFilters): Promise<void> {
  const receipts = await getFilteredReceipts(filters);
  
  if (receipts.length === 0) {
    throw new Error("No receipts to export");
  }
  
  // Get receipt IDs
  const receiptIds = receipts.map(r => r.id!).filter(id => id !== undefined);
  
  // Create a map of receipt by ID
  const receiptMap = new Map<number, Receipt>();
  receipts.forEach(r => {
    if (r.id !== undefined) {
      receiptMap.set(r.id, r);
    }
  });
  
  // Get all items for these receipts
  const allItems = await db.receiptItems.toArray();
  const filteredItems = allItems.filter(item => receiptIds.includes(item.receiptId));
  
  if (filteredItems.length === 0) {
    throw new Error("No items to export");
  }
  
  // Build rows with receipt context
  const rows: (string | number | null)[][] = [];
  for (const item of filteredItems) {
    const receipt = receiptMap.get(item.receiptId);
    if (receipt) {
      rows.push(receiptItemToRow(item, receipt));
    }
  }
  
  const csv = createCsvContent(RECEIPT_ITEM_HEADERS, rows);
  
  const startDate = formatDateForFilename(filters.dateRange.start);
  const endDate = formatDateForFilename(filters.dateRange.end);
  const filename = `receipt_items_${startDate}_to_${endDate}.csv`;
  
  downloadCsv(filename, csv);
}
