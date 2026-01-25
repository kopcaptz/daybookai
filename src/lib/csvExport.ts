/**
 * CSV Export utilities with Excel-compatible UTF-8 encoding
 */

/**
 * Escape a CSV field value properly
 * - Wrap in quotes if contains comma, quote, or newline
 * - Double quotes inside fields
 */
function escapeField(value: string | number | null | undefined): string {
  if (value === null || value === undefined) {
    return "";
  }
  
  const str = String(value);
  
  // Check if escaping needed
  if (str.includes(",") || str.includes('"') || str.includes("\n") || str.includes("\r")) {
    // Double quotes and wrap in quotes
    return `"${str.replace(/"/g, '""')}"`;
  }
  
  return str;
}

/**
 * Convert array of values to a CSV row
 */
export function toCsvRow(values: (string | number | null | undefined)[]): string {
  return values.map(escapeField).join(",");
}

/**
 * Create a complete CSV string with header and rows
 * Prepends UTF-8 BOM for Excel compatibility
 */
export function createCsvContent(header: string[], rows: (string | number | null | undefined)[][]): string {
  const headerRow = toCsvRow(header);
  const dataRows = rows.map(row => toCsvRow(row));
  
  // UTF-8 BOM for Excel compatibility
  const BOM = "\uFEFF";
  
  return BOM + [headerRow, ...dataRows].join("\n");
}

/**
 * Download a CSV file to the user's device
 */
export function downloadCsv(filename: string, csvText: string): void {
  const blob = new Blob([csvText], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.style.display = "none";
  
  document.body.appendChild(link);
  link.click();
  
  // Cleanup
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/**
 * Format date for filename (YYYY-MM-DD)
 */
export function formatDateForFilename(date: Date): string {
  return date.toISOString().slice(0, 10);
}
