import { useState, useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, ArrowRight, Trash2, Store, Calendar, Coins, Image as ImageIcon, ChevronDown, ChevronUp, Link2, Unlink, ExternalLink, FileText } from "lucide-react";
import { toast } from "sonner";
import { useLiveQuery } from "dexie-react-hooks";
import { format, parseISO } from "date-fns";
import { db, type Receipt, type ReceiptItem, type DiaryEntry } from "@/lib/db";
import { deleteReceipt, getReceiptAttachment, linkReceiptToEntry } from "@/lib/receiptService";
import { useI18n, isRTL } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { LinkEntrySheet } from "@/components/receipts/LinkEntrySheet";
import { cn } from "@/lib/utils";

function ReceiptDetailContent() {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const { language, t } = useI18n();
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [showImage, setShowImage] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [showLinkSheet, setShowLinkSheet] = useState(false);

  const receiptId = id ? parseInt(id, 10) : null;

  // Live query for receipt
  const receipt = useLiveQuery(
    () => (receiptId ? db.receipts.get(receiptId) : undefined),
    [receiptId]
  );

  // Live query for items
  const items = useLiveQuery(
    () => (receiptId ? db.receiptItems.where("receiptId").equals(receiptId).toArray() : []),
    [receiptId]
  );

  // Live query for linked entry
  const linkedEntry = useLiveQuery(
    () => (receipt?.entryId ? db.entries.get(receipt.entryId) : undefined),
    [receipt?.entryId]
  );

  // Load image
  useEffect(() => {
    if (receipt?.attachmentId) {
      getReceiptAttachment(receipt.attachmentId).then((blob) => {
        if (blob) {
          const url = URL.createObjectURL(blob);
          setImageUrl(url);
          return () => URL.revokeObjectURL(url);
        }
      });
    }
  }, [receipt?.attachmentId]);

  // Cleanup image URL
  useEffect(() => {
    return () => {
      if (imageUrl) {
        URL.revokeObjectURL(imageUrl);
      }
    };
  }, [imageUrl]);

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return language === "ru" ? "Дата не указана" : "No date";
    try {
      const date = new Date(dateStr);
      return date.toLocaleDateString(language === "ru" ? "ru-RU" : "en-US", {
        day: "numeric",
        month: "long",
        year: "numeric",
      });
    } catch {
      return dateStr;
    }
  };

  const formatCurrency = (amount: number | null, currency: string | null) => {
    if (amount === null) return "—";
    const curr = currency || "USD";
    try {
      return new Intl.NumberFormat(language === "ru" ? "ru-RU" : "en-US", {
        style: "currency",
        currency: curr,
      }).format(amount);
    } catch {
      return `${amount.toFixed(2)} ${curr}`;
    }
  };

  const handleDelete = async () => {
    if (!receiptId) return;

    setIsDeleting(true);
    try {
      await deleteReceipt(receiptId, true);
      toast.success(language === "ru" ? "Чек удалён" : "Receipt deleted");
      navigate("/receipts");
    } catch (error) {
      console.error("Failed to delete receipt:", error);
      toast.error(language === "ru" ? "Ошибка при удалении" : "Failed to delete");
    } finally {
      setIsDeleting(false);
    }
  };

  const handleLinkEntry = async (entryId: number) => {
    if (!receiptId) return;
    try {
      await linkReceiptToEntry(receiptId, entryId);
      toast.success(language === "ru" ? "Чек привязан к записи" : "Receipt linked to entry");
    } catch (error) {
      console.error("Failed to link receipt:", error);
      toast.error(language === "ru" ? "Ошибка привязки" : "Failed to link");
    }
  };

  const handleUnlinkEntry = async () => {
    if (!receiptId) return;
    try {
      await linkReceiptToEntry(receiptId, null);
      toast.success(language === "ru" ? "Чек отвязан от записи" : "Receipt unlinked");
    } catch (error) {
      console.error("Failed to unlink receipt:", error);
      toast.error(language === "ru" ? "Ошибка отвязки" : "Failed to unlink");
    }
  };

  const truncateText = (text: string, maxLength: number = 80) => {
    if (text.length <= maxLength) return text;
    return text.slice(0, maxLength) + "...";
  };

  if (receipt === undefined) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  if (!receipt) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4">
        <p className="text-muted-foreground">
          {language === "ru" ? "Чек не найден" : "Receipt not found"}
        </p>
        <Button onClick={() => navigate("/receipts")}>
          {language === "ru" ? "К списку чеков" : "Back to receipts"}
        </Button>
      </div>
    );
  }

  return (
    <div className="min-h-screen pb-24 cyber-noise rune-grid">
      <header className="sticky top-0 z-40 bg-background/80 backdrop-blur-xl px-4 py-4 border-b border-border/50">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => navigate("/receipts")}
              className="shrink-0"
            >
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <h1 className="text-lg font-serif font-medium text-foreground truncate">
              {receipt.storeName}
            </h1>
          </div>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="ghost" size="icon" className="text-destructive/70 hover:text-destructive">
                <Trash2 className="h-5 w-5" />
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent className="panel-glass">
              <AlertDialogHeader>
                <AlertDialogTitle>
                  {language === "ru" ? "Удалить чек?" : "Delete receipt?"}
                </AlertDialogTitle>
                <AlertDialogDescription>
                  {language === "ru"
                    ? "Чек и все его данные будут удалены безвозвратно."
                    : "The receipt and all its data will be permanently deleted."}
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>{language === "ru" ? "Отмена" : "Cancel"}</AlertDialogCancel>
                <AlertDialogAction
                  onClick={handleDelete}
                  disabled={isDeleting}
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                >
                  {isDeleting
                    ? language === "ru"
                      ? "Удаление..."
                      : "Deleting..."
                    : language === "ru"
                    ? "Удалить"
                    : "Delete"}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </header>

      <main className="px-4 pt-4 space-y-4">
        {/* Store Info */}
        <Card className="panel-glass border-cyber-glow/20">
          <CardContent className="py-4">
            <div className="flex items-start gap-3">
              <Store className="h-5 w-5 text-cyber-sigil mt-0.5" />
              <div className="flex-1">
                <h2 className="font-medium text-lg">{receipt.storeName}</h2>
                {receipt.storeAddress && (
                  <p className="text-sm text-muted-foreground mt-0.5">{receipt.storeAddress}</p>
                )}
                <div className="flex items-center gap-4 mt-2 text-sm text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <Calendar className="h-3.5 w-3.5" />
                    {formatDate(receipt.date)}
                  </span>
                  <span className="flex items-center gap-1">
                    <Coins className="h-3.5 w-3.5" />
                    {receipt.currency || "—"}
                  </span>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Linked Entry Section */}
        <Card className="panel-glass border-cyber-glow/20">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Link2 className="h-4 w-4 text-cyber-sigil" />
              {t('receipts.linkedEntry')}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {linkedEntry ? (
              <div className="space-y-3">
                <div className="p-3 rounded-lg bg-muted/30 border border-border/30">
                  <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
                    <Calendar className="h-3 w-3" />
                    <span>
                      {format(parseISO(linkedEntry.date), language === "ru" ? "d MMM yyyy" : "MMM d, yyyy")}
                    </span>
                  </div>
                  <p className="text-sm">
                    {truncateText(linkedEntry.text) || (language === "ru" ? "Пустая запись" : "Empty entry")}
                  </p>
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    className="flex-1 gap-2"
                    onClick={() => navigate(`/entry/${linkedEntry.id}`)}
                  >
                    <ExternalLink className="h-3 w-3" />
                    {t('receipts.openEntry')}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="gap-2 text-muted-foreground"
                    onClick={handleUnlinkEntry}
                  >
                    <Unlink className="h-3 w-3" />
                    {t('receipts.unlink')}
                  </Button>
                </div>
              </div>
            ) : (
              <Button
                variant="outline"
                className="w-full gap-2"
                onClick={() => setShowLinkSheet(true)}
              >
                <Link2 className="h-4 w-4" />
                {t('receipts.linkToEntry')}
              </Button>
            )}
          </CardContent>
        </Card>

        {/* Receipt Image */}
        {imageUrl && (
          <Card className="panel-glass border-cyber-glow/20 overflow-hidden">
            <CardHeader
              className="py-3 cursor-pointer"
              onClick={() => setShowImage(!showImage)}
            >
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm flex items-center gap-2">
                  <ImageIcon className="h-4 w-4 text-cyber-sigil" />
                  {language === "ru" ? "Фото чека" : "Receipt Image"}
                </CardTitle>
                {showImage ? (
                  <ChevronUp className="h-4 w-4 text-muted-foreground" />
                ) : (
                  <ChevronDown className="h-4 w-4 text-muted-foreground" />
                )}
              </div>
            </CardHeader>
            {showImage && (
              <CardContent className="pt-0 pb-4">
                <img
                  src={imageUrl}
                  alt="Receipt"
                  className="w-full rounded-lg border border-border/50"
                />
              </CardContent>
            )}
          </Card>
        )}

        {/* Items */}
        <Card className="panel-glass border-cyber-glow/20">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">
              {language === "ru" ? "Товары" : "Items"} ({items?.length || 0})
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {items?.map((item, index) => (
              <div
                key={item.id}
                className={cn(
                  "flex items-center justify-between py-2",
                  index < items.length - 1 && "border-b border-border/30"
                )}
              >
                <div className="flex-1 min-w-0">
                  <p className="font-medium truncate">{item.name}</p>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    {item.qty && <span>{item.qty}x</span>}
                    {item.unitPrice && (
                      <span>{formatCurrency(item.unitPrice, receipt.currency)}/шт</span>
                    )}
                    {item.category && (
                      <span className="px-1.5 py-0.5 rounded bg-muted text-[10px]">
                        {item.category}
                      </span>
                    )}
                  </div>
                </div>
                <div className="text-right">
                  <p className="font-mono font-medium">
                    {formatCurrency(item.totalPrice, receipt.currency)}
                  </p>
                  {item.discount && item.discount > 0 && (
                    <p className="text-xs text-green-500">
                      -{formatCurrency(item.discount, receipt.currency)}
                    </p>
                  )}
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        {/* Totals */}
        <Card className="panel-glass border-cyber-glow/20">
          <CardContent className="py-4 space-y-2">
            {receipt.subtotal !== null && (
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">
                  {language === "ru" ? "Подитог" : "Subtotal"}
                </span>
                <span className="font-mono">{formatCurrency(receipt.subtotal, receipt.currency)}</span>
              </div>
            )}
            {receipt.tax !== null && (
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">
                  {language === "ru" ? "Налог" : "Tax"}
                </span>
                <span className="font-mono">{formatCurrency(receipt.tax, receipt.currency)}</span>
              </div>
            )}
            <div className="flex justify-between text-lg font-medium pt-2 border-t border-border/50">
              <span>{language === "ru" ? "Итого" : "Total"}</span>
              <span className="font-mono">{formatCurrency(receipt.total, receipt.currency)}</span>
            </div>
          </CardContent>
        </Card>

        {/* Metadata */}
        <div className="text-center text-xs text-muted-foreground space-y-1">
          <p>
            {language === "ru" ? "Уверенность: " : "Confidence: "}
            <span
              className={cn(
                "font-medium",
                receipt.confidence === "high" && "text-green-500",
                receipt.confidence === "medium" && "text-yellow-500",
                receipt.confidence === "low" && "text-red-500"
              )}
            >
              {receipt.confidence}
            </span>
          </p>
          <p className="font-mono text-muted-foreground/50">
            {new Date(receipt.createdAt).toLocaleString(language === "ru" ? "ru-RU" : "en-US")}
          </p>
        </div>
      </main>

      {/* Link Entry Sheet */}
      <LinkEntrySheet
        open={showLinkSheet}
        onOpenChange={setShowLinkSheet}
        receiptDate={receipt.date}
        currentEntryId={receipt.entryId}
        onSelect={handleLinkEntry}
      />
    </div>
  );
}

export default function ReceiptDetailPage() {
  return (
    <ErrorBoundary>
      <ReceiptDetailContent />
    </ErrorBoundary>
  );
}
