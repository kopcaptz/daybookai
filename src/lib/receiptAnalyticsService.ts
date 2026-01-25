import { db, type Receipt, type ReceiptItem } from "./db";
import { startOfDay, endOfDay, subDays, startOfMonth, endOfMonth, subMonths, format, parseISO, isValid } from "date-fns";

// Date range presets
export type DateRangePreset = "7d" | "30d" | "thisMonth" | "lastMonth" | "custom";

export interface DateRange {
  start: Date;
  end: Date;
}

export function getDateRangeFromPreset(preset: DateRangePreset, customRange?: DateRange): DateRange {
  const now = new Date();
  
  switch (preset) {
    case "7d":
      return { start: startOfDay(subDays(now, 6)), end: endOfDay(now) };
    case "30d":
      return { start: startOfDay(subDays(now, 29)), end: endOfDay(now) };
    case "thisMonth":
      return { start: startOfMonth(now), end: endOfDay(now) };
    case "lastMonth": {
      const lastMonth = subMonths(now, 1);
      return { start: startOfMonth(lastMonth), end: endOfMonth(lastMonth) };
    }
    case "custom":
      return customRange || { start: startOfDay(subDays(now, 29)), end: endOfDay(now) };
    default:
      return { start: startOfDay(subDays(now, 29)), end: endOfDay(now) };
  }
}

// Get date from receipt (fallback to createdAt)
function getReceiptDate(receipt: Receipt): Date {
  if (receipt.date) {
    const parsed = parseISO(receipt.date);
    if (isValid(parsed)) return parsed;
  }
  return new Date(receipt.createdAt);
}

// Filter receipts by date range and currency
export interface ReceiptFilters {
  dateRange: DateRange;
  currency?: string;
}

export async function getFilteredReceipts(filters: ReceiptFilters): Promise<Receipt[]> {
  const allReceipts = await db.receipts.toArray();
  
  return allReceipts.filter(receipt => {
    const receiptDate = getReceiptDate(receipt);
    const inRange = receiptDate >= filters.dateRange.start && receiptDate <= filters.dateRange.end;
    
    if (filters.currency && filters.currency !== "all") {
      return inRange && receipt.currency === filters.currency;
    }
    
    return inRange;
  });
}

// Get all unique currencies from receipts
export async function getUniqueCurrencies(): Promise<string[]> {
  const receipts = await db.receipts.toArray();
  const currencies = new Set<string>();
  
  receipts.forEach(r => {
    if (r.currency) currencies.add(r.currency);
  });
  
  return Array.from(currencies).sort();
}

// Check if multiple currencies exist in filtered data
export function hasMultipleCurrencies(receipts: Receipt[]): boolean {
  const currencies = new Set<string>();
  receipts.forEach(r => {
    if (r.currency) currencies.add(r.currency);
  });
  return currencies.size > 1;
}

// Analytics aggregation results
export interface SpendingSummary {
  totalSpend: number;
  receiptCount: number;
  avgPerReceipt: number;
  currency: string | null;
}

export interface CategoryBreakdown {
  category: string;
  total: number;
  itemCount: number;
  percentage: number;
}

export interface StoreBreakdown {
  storeName: string;
  total: number;
  receiptCount: number;
}

export interface DailyTrend {
  date: string; // YYYY-MM-DD
  total: number;
  receiptCount: number;
}

// Calculate total spending
export function calculateTotalSpend(receipts: Receipt[]): SpendingSummary {
  const currency = receipts.length > 0 ? receipts[0].currency : null;
  const totalSpend = receipts.reduce((sum, r) => sum + (r.total || 0), 0);
  const receiptCount = receipts.length;
  const avgPerReceipt = receiptCount > 0 ? totalSpend / receiptCount : 0;
  
  return { totalSpend, receiptCount, avgPerReceipt, currency };
}

// Calculate spending by category (from receiptItems)
export async function calculateCategoryBreakdown(receipts: Receipt[]): Promise<CategoryBreakdown[]> {
  if (receipts.length === 0) return [];
  
  const receiptIds = receipts.map(r => r.id!);
  const allItems = await db.receiptItems.toArray();
  const filteredItems = allItems.filter(item => receiptIds.includes(item.receiptId));
  
  const categoryTotals = new Map<string, { total: number; count: number }>();
  let grandTotal = 0;
  
  filteredItems.forEach(item => {
    const category = item.category || "other";
    const itemTotal = item.totalPrice || (item.unitPrice || 0) * (item.qty || 1);
    grandTotal += itemTotal;
    
    const current = categoryTotals.get(category) || { total: 0, count: 0 };
    categoryTotals.set(category, {
      total: current.total + itemTotal,
      count: current.count + 1,
    });
  });
  
  const breakdown: CategoryBreakdown[] = [];
  categoryTotals.forEach((value, category) => {
    breakdown.push({
      category,
      total: value.total,
      itemCount: value.count,
      percentage: grandTotal > 0 ? (value.total / grandTotal) * 100 : 0,
    });
  });
  
  return breakdown.sort((a, b) => b.total - a.total);
}

// Calculate top stores by spending
export function calculateStoreBreakdown(receipts: Receipt[]): StoreBreakdown[] {
  const storeTotals = new Map<string, { total: number; count: number }>();
  
  receipts.forEach(receipt => {
    const store = receipt.storeName || "Unknown";
    const current = storeTotals.get(store) || { total: 0, count: 0 };
    storeTotals.set(store, {
      total: current.total + (receipt.total || 0),
      count: current.count + 1,
    });
  });
  
  const breakdown: StoreBreakdown[] = [];
  storeTotals.forEach((value, storeName) => {
    breakdown.push({
      storeName,
      total: value.total,
      receiptCount: value.count,
    });
  });
  
  return breakdown.sort((a, b) => b.total - a.total);
}

// Calculate daily spending trend
export function calculateDailyTrend(receipts: Receipt[], dateRange: DateRange): DailyTrend[] {
  const dailyTotals = new Map<string, { total: number; count: number }>();
  
  // Initialize all days in range with zero
  let currentDate = new Date(dateRange.start);
  while (currentDate <= dateRange.end) {
    const dateKey = format(currentDate, "yyyy-MM-dd");
    dailyTotals.set(dateKey, { total: 0, count: 0 });
    currentDate = new Date(currentDate.getTime() + 24 * 60 * 60 * 1000);
  }
  
  // Sum up receipts by day
  receipts.forEach(receipt => {
    const receiptDate = getReceiptDate(receipt);
    const dateKey = format(receiptDate, "yyyy-MM-dd");
    const current = dailyTotals.get(dateKey) || { total: 0, count: 0 };
    dailyTotals.set(dateKey, {
      total: current.total + (receipt.total || 0),
      count: current.count + 1,
    });
  });
  
  const trend: DailyTrend[] = [];
  dailyTotals.forEach((value, date) => {
    trend.push({
      date,
      total: value.total,
      receiptCount: value.count,
    });
  });
  
  return trend.sort((a, b) => a.date.localeCompare(b.date));
}

// Full analytics bundle
export interface ReceiptAnalytics {
  summary: SpendingSummary;
  categoryBreakdown: CategoryBreakdown[];
  storeBreakdown: StoreBreakdown[];
  dailyTrend: DailyTrend[];
  multipleCurrencies: boolean;
  currencies: string[];
}

export async function calculateAnalytics(filters: ReceiptFilters): Promise<ReceiptAnalytics> {
  const receipts = await getFilteredReceipts(filters);
  const allCurrencies = await getUniqueCurrencies();
  
  return {
    summary: calculateTotalSpend(receipts),
    categoryBreakdown: await calculateCategoryBreakdown(receipts),
    storeBreakdown: calculateStoreBreakdown(receipts),
    dailyTrend: calculateDailyTrend(receipts, filters.dateRange),
    multipleCurrencies: hasMultipleCurrencies(receipts),
    currencies: allCurrencies,
  };
}
