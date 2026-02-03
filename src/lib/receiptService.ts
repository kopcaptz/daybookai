import { supabase } from "@/integrations/supabase/client";
import { db, Receipt, ReceiptItem, addAttachment } from "./db";
import { compressImage } from "./mediaUtils";
import { getAIToken, isAITokenValid } from "./aiTokenService";
import { 
  createAIAuthError, 
  requestPinDialog,
  getErrorMessage,
  isAuthError,
} from "./aiAuthRecovery";
import { Language, getBaseLanguage } from "./i18n";

// Receipt scanning limits (optimized for mobile + OCR)
export const RECEIPT_LIMITS = {
  maxImageSize: 1.5 * 1024 * 1024, // 1.5MB hard limit after compression
  maxDimension: 1600,              // Optimal for OCR, saves bandwidth
  targetSize: 400 * 1024,          // 400KB target for fast upload
  minDimension: 600,               // Minimum to ensure readable text
};

// Scan modes
export type ScanMode = "accurate" | "fast";
export const SCAN_MODELS: Record<ScanMode, string> = {
  accurate: "google/gemini-2.5-pro",
  fast: "google/gemini-2.5-flash",
};

// API response types
export interface ReceiptScanResult {
  store: { name: string; address: string | null };
  date: string | null;
  currency: string | null;
  items: Array<{
    name: string;
    qty: number | null;
    unit_price: number | null;
    total_price: number | null;
    discount: number | null;
    category: string | null;
  }>;
  subtotal: number | null;
  tax: number | null;
  total: number | null;
  confidence: "high" | "medium" | "low";
  warnings: string[];
}

export interface ReceiptScanError {
  error: "unreadable" | "not_receipt" | "invalid_json" | "validation_error" | "service_error";
  hint: string;
  requestId: string;
}

export type ReceiptScanResponse = ReceiptScanResult | ReceiptScanError;

function isReceiptError(response: ReceiptScanResponse): response is ReceiptScanError {
  return "error" in response;
}

/**
 * Apply OCR-optimized preprocessing to image canvas
 * - Grayscale for cleaner text
 * - Contrast boost for better edge detection
 */
function applyOcrPreprocessing(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number
): void {
  const imageData = ctx.getImageData(0, 0, width, height);
  const data = imageData.data;
  
  // Apply grayscale + contrast boost (1.2x)
  const contrast = 1.2;
  const factor = (259 * (contrast * 128 + 255)) / (255 * (259 - contrast * 128));
  
  for (let i = 0; i < data.length; i += 4) {
    // Convert to grayscale (luminance formula)
    const gray = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
    
    // Apply contrast
    const adjusted = Math.max(0, Math.min(255, factor * (gray - 128) + 128));
    
    data[i] = adjusted;     // R
    data[i + 1] = adjusted; // G
    data[i + 2] = adjusted; // B
    // Alpha unchanged
  }
  
  ctx.putImageData(imageData, 0, 0);
}

/**
 * Compress image for receipt scanning (optimized for OCR)
 * @param blob - Original image blob
 * @param preprocess - Apply grayscale + contrast for better OCR (default: true)
 */
export async function compressReceiptImage(
  blob: Blob,
  preprocess: boolean = true
): Promise<{ blob: Blob; base64: string }> {
  const { maxDimension, targetSize, maxImageSize } = RECEIPT_LIMITS;
  
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(blob);
    
    img.onload = async () => {
      URL.revokeObjectURL(url);
      
      let { width, height } = img;
      
      // Scale down if needed
      if (width > maxDimension || height > maxDimension) {
        if (width > height) {
          height = Math.round((height * maxDimension) / width);
          width = maxDimension;
        } else {
          width = Math.round((width * maxDimension) / height);
          height = maxDimension;
        }
      }
      
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        reject(new Error("Failed to get canvas context"));
        return;
      }
      
      ctx.drawImage(img, 0, 0, width, height);
      
      // Apply preprocessing for OCR if enabled
      if (preprocess) {
        applyOcrPreprocessing(ctx, width, height);
      }
      
      // Compress with decreasing quality until target size
      const tryCompress = (quality: number): Promise<Blob> => {
        return new Promise((res, rej) => {
          canvas.toBlob(
            (b) => (b ? res(b) : rej(new Error("Failed to create blob"))),
            "image/jpeg",
            quality
          );
        });
      };
      
      try {
        let quality = 0.85;
        let compressed = await tryCompress(quality);
        
        // Reduce quality until under target
        while (compressed.size > targetSize && quality > 0.5) {
          quality -= 0.1;
          compressed = await tryCompress(quality);
        }
        
        // Check hard limit
        if (compressed.size > maxImageSize) {
          reject(new Error("image_too_large"));
          return;
        }
        
        // Convert to base64
        const reader = new FileReader();
        reader.onload = () => {
          const base64 = reader.result as string;
          resolve({ blob: compressed, base64 });
        };
        reader.onerror = () => reject(new Error("Failed to read image"));
        reader.readAsDataURL(compressed);
      } catch (err) {
        reject(err);
      }
    };
    
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Failed to load image"));
    };
    
    img.src = url;
  });
}

/**
 * Call the receipt scanning edge function (with auto-PIN retry)
 */
export async function scanReceipt(
  imageBase64: string,
  language: Language,
  options?: {
    currencyHint?: string;
    timezone?: string;
    mode?: ScanMode;
  },
  _isRetry: boolean = false
): Promise<ReceiptScanResponse & { model?: string }> {
  const requestId = crypto.randomUUID();
  const mode = options?.mode || "accurate";
  const model = SCAN_MODELS[mode];
  const baseLang = getBaseLanguage(language);
  
  // Check token before making request (only on first attempt)
  if (!_isRetry && !isAITokenValid()) {
    // Try to get a PIN first
    try {
      await requestPinDialog(requestId, "ai_token_required");
    } catch {
      return {
        error: "service_error",
        hint: getErrorMessage("pin_cancelled", baseLang),
        requestId,
      };
    }
  }
  
  // Get token for header
  const tokenData = getAIToken();
  const aiTokenHeader = tokenData?.token ? { "X-AI-Token": tokenData.token } : {};

  const { data, error } = await supabase.functions.invoke<ReceiptScanResponse>("ai-receipt", {
    body: {
      imageBase64,
      language: baseLang,
      timezone: options?.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone,
      currencyHint: options?.currencyHint,
      model,
    },
    headers: {
      "X-Request-Id": requestId,
      ...aiTokenHeader,
    },
  });

  // Handle 401 with auto-retry (supabase.functions.invoke returns error object)
  if (error) {
    console.error("[Receipt] Scan error:", error);
    
    // Check if this is a 401 auth error that can be retried
    const errorMessage = error.message || "";
    const isAuthErrorCode = isAuthError(errorMessage) || 
      errorMessage.includes("401") || 
      errorMessage.includes("ai_token");
    
    if (isAuthErrorCode && !_isRetry) {
      try {
        await requestPinDialog(requestId, "ai_token_required");
        // Retry once after successful PIN
        return scanReceipt(imageBase64, language, options, true);
      } catch {
        return {
          error: "service_error",
          hint: getErrorMessage("pin_cancelled", baseLang),
          requestId,
        };
      }
    }
    
    return {
      error: "service_error",
      hint: error.message || "Failed to scan receipt",
      requestId,
    };
  }

  if (!data) {
    return {
      error: "service_error",
      hint: "Empty response from service",
      requestId,
    };
  }

  // Check if the response itself is a 401 error
  if (isReceiptError(data) && isAuthError(data.error) && !_isRetry) {
    try {
      await requestPinDialog(data.requestId, data.error);
      // Retry once after successful PIN
      return scanReceipt(imageBase64, language, options, true);
    } catch {
      return {
        error: "service_error",
        hint: getErrorMessage("pin_cancelled", baseLang),
        requestId: data.requestId,
      };
    }
  }

  // Attach model info for diagnostics
  return { ...data, model };
}

/**
 * Save a scanned receipt with its items (atomic transaction)
 */
export async function saveReceipt(
  result: ReceiptScanResult,
  imageBlob: Blob
): Promise<number> {
  const now = Date.now();

  // Use atomic transaction to prevent partial saves
  return await db.transaction("rw", [db.attachments, db.receipts, db.receiptItems], async () => {
    // Save image as attachment first
    // Note: entryId=0 is used for standalone attachments not linked to diary entries
    const attachmentId = await db.attachments.add({
      entryId: 0, // 0 = standalone attachment (not linked to diary entry)
      kind: "image",
      mimeType: imageBlob.type || "image/jpeg",
      size: imageBlob.size,
      blob: imageBlob,
      createdAt: now,
    });

    // Save receipt
    const receiptId = await db.receipts.add({
      date: result.date,
      storeName: result.store.name,
      storeAddress: result.store.address,
      total: result.total,
      subtotal: result.subtotal,
      tax: result.tax,
      currency: result.currency,
      confidence: result.confidence,
      warnings: result.warnings,
      attachmentId,
      entryId: null,
      createdAt: now,
      updatedAt: now,
    });

    // Save receipt items
    for (const item of result.items) {
      await db.receiptItems.add({
        receiptId,
        name: item.name,
        qty: item.qty,
        unitPrice: item.unit_price,
        totalPrice: item.total_price,
        discount: item.discount,
        category: item.category,
      });
    }

    return receiptId;
  });
}

/**
 * Link or unlink a receipt to a diary entry
 */
export async function linkReceiptToEntry(receiptId: number, entryId: number | null): Promise<void> {
  await db.receipts.update(receiptId, {
    entryId,
    updatedAt: Date.now(),
  });
}

/**
 * Update an existing receipt
 */
export async function updateReceipt(
  receiptId: number,
  updates: Partial<Omit<Receipt, "id" | "createdAt">>,
  items?: Array<Omit<ReceiptItem, "id" | "receiptId">>
): Promise<void> {
  const now = Date.now();

  await db.transaction("rw", [db.receipts, db.receiptItems], async () => {
    // Update receipt
    await db.receipts.update(receiptId, {
      ...updates,
      updatedAt: now,
    });

    // Update items if provided
    if (items) {
      // Delete existing items
      await db.receiptItems.where("receiptId").equals(receiptId).delete();

      // Add new items
      for (const item of items) {
        await db.receiptItems.add({
          receiptId,
          name: item.name,
          qty: item.qty,
          unitPrice: item.unitPrice,
          totalPrice: item.totalPrice,
          discount: item.discount,
          category: item.category,
        });
      }
    }
  });
}

/**
 * Delete a receipt and its items (cascade)
 */
export async function deleteReceipt(receiptId: number, deleteAttachment = false): Promise<void> {
  await db.transaction("rw", [db.receipts, db.receiptItems, db.attachments], async () => {
    // Get receipt to find attachment
    const receipt = await db.receipts.get(receiptId);
    
    // Delete items
    await db.receiptItems.where("receiptId").equals(receiptId).delete();
    
    // Delete receipt
    await db.receipts.delete(receiptId);
    
    // Optionally delete attachment
    if (deleteAttachment && receipt?.attachmentId) {
      await db.attachments.delete(receipt.attachmentId);
    }
  });
}

/**
 * Get a receipt with its items
 */
export async function getReceiptWithItems(receiptId: number): Promise<{
  receipt: Receipt;
  items: ReceiptItem[];
} | null> {
  const receipt = await db.receipts.get(receiptId);
  if (!receipt) return null;

  const items = await db.receiptItems.where("receiptId").equals(receiptId).toArray();
  
  return { receipt, items };
}

/**
 * Get all receipts (sorted by date, newest first)
 */
export async function getAllReceipts(): Promise<Receipt[]> {
  return await db.receipts.orderBy("createdAt").reverse().toArray();
}

/**
 * Get receipt attachment blob
 */
export async function getReceiptAttachment(attachmentId: number): Promise<Blob | null> {
  const attachment = await db.attachments.get(attachmentId);
  return attachment?.blob || null;
}

/**
 * Check if receipt scanning is available based on settings
 */
export function isReceiptScanningAvailable(): {
  available: boolean;
  reason?: string;
} {
  // Check strict privacy setting
  const aiSettings = localStorage.getItem("daybook-ai-settings");
  if (aiSettings) {
    try {
      const parsed = JSON.parse(aiSettings);
      if (parsed.strictPrivacy) {
        return {
          available: false,
          reason: "strictPrivacy",
        };
      }
    } catch {
      // Ignore parse errors
    }
  }

  return { available: true };
}
