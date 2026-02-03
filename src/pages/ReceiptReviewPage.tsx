import { useState, useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { ArrowLeft, ArrowRight, Plus, Trash2, Save, Store, Calendar, Coins, AlertTriangle, Zap, Target } from "lucide-react";
import { toast } from "sonner";
import { useI18n, isRTL } from "@/lib/i18n";
import { saveReceipt, type ReceiptScanResult, type ScanMode } from "@/lib/receiptService";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { cn } from "@/lib/utils";

interface EditableItem {
  id: string;
  name: string;
  qty: string;
  unitPrice: string;
  totalPrice: string;
  discount: string;
  category: string;
}

const CATEGORIES = {
  ru: ["еда", "напитки", "бытовое", "гигиена", "другое"],
  en: ["food", "drinks", "household", "hygiene", "other"],
};

const CURRENCIES = ["ILS", "USD", "EUR", "RUB", "GBP", "UAH"];

function ReceiptReviewContent() {
  const navigate = useNavigate();
  const location = useLocation();
  const { language, t } = useI18n();

  // Get data from navigation state
  const scanResult = location.state?.scanResult as ReceiptScanResult | undefined;
  const imageBlob = location.state?.imageBlob as Blob | undefined;
  const scanMode = (location.state?.scanMode as ScanMode) || "accurate";
  const usedModel = location.state?.model as string | undefined;

  // Form state
  const [storeName, setStoreName] = useState("");
  const [storeAddress, setStoreAddress] = useState("");
  const [date, setDate] = useState("");
  const [currency, setCurrency] = useState("ILS");
  const [subtotal, setSubtotal] = useState("");
  const [tax, setTax] = useState("");
  const [total, setTotal] = useState("");
  const [items, setItems] = useState<EditableItem[]>([]);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [isSaving, setIsSaving] = useState(false);

  // Initialize form from scan result
  useEffect(() => {
    if (!scanResult) {
      navigate("/receipts/scan");
      return;
    }

    setStoreName(scanResult.store.name || "");
    setStoreAddress(scanResult.store.address || "");
    setDate(scanResult.date || new Date().toISOString().slice(0, 10));
    setCurrency(scanResult.currency || "ILS");
    setSubtotal(scanResult.subtotal?.toString() || "");
    setTax(scanResult.tax?.toString() || "");
    setTotal(scanResult.total?.toString() || "");
    setWarnings(scanResult.warnings || []);

    setItems(
      scanResult.items.map((item, index) => ({
        id: `item-${index}`,
        name: item.name,
        qty: item.qty?.toString() || "1",
        unitPrice: item.unit_price?.toString() || "",
        totalPrice: item.total_price?.toString() || "",
        discount: item.discount?.toString() || "",
        category: item.category || "",
      }))
    );
  }, [scanResult, navigate]);

  const handleItemChange = (id: string, field: keyof EditableItem, value: string) => {
    setItems((prev) =>
      prev.map((item) => (item.id === id ? { ...item, [field]: value } : item))
    );
  };

  const handleAddItem = () => {
    setItems((prev) => [
      ...prev,
      {
        id: `item-${Date.now()}`,
        name: "",
        qty: "1",
        unitPrice: "",
        totalPrice: "",
        discount: "",
        category: "",
      },
    ]);
  };

  const handleRemoveItem = (id: string) => {
    setItems((prev) => prev.filter((item) => item.id !== id));
  };

  const handleSave = async () => {
    if (!storeName.trim()) {
      toast.error(language === "ru" ? "Укажите название магазина" : "Store name is required");
      return;
    }

    if (items.length === 0) {
      toast.error(language === "ru" ? "Добавьте хотя бы один товар" : "Add at least one item");
      return;
    }

    if (!imageBlob) {
      toast.error(language === "ru" ? "Изображение чека не найдено" : "Receipt image not found");
      return;
    }

    setIsSaving(true);

    try {
      const result: ReceiptScanResult = {
        store: { name: storeName, address: storeAddress || null },
        date: date || null,
        currency: currency || null,
        items: items.map((item) => ({
          name: item.name,
          qty: item.qty ? parseFloat(item.qty) : null,
          unit_price: item.unitPrice ? parseFloat(item.unitPrice) : null,
          total_price: item.totalPrice ? parseFloat(item.totalPrice) : null,
          discount: item.discount ? parseFloat(item.discount) : null,
          category: item.category || null,
        })),
        subtotal: subtotal ? parseFloat(subtotal) : null,
        tax: tax ? parseFloat(tax) : null,
        total: total ? parseFloat(total) : null,
        confidence: scanResult?.confidence || "medium",
        warnings: warnings,
      };

      const receiptId = await saveReceipt(result, imageBlob);

      toast.success(language === "ru" ? "Чек сохранён" : "Receipt saved");
      navigate(`/receipts/${receiptId}`);
    } catch (error) {
      console.error("Failed to save receipt:", error);
      toast.error(language === "ru" ? "Ошибка при сохранении" : "Failed to save");
    } finally {
      setIsSaving(false);
    }
  };

  if (!scanResult) {
    return null;
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
            <h1 className="text-lg font-serif font-medium text-foreground">
              {language === "ru" ? "Проверка чека" : "Review Receipt"}
            </h1>
          </div>
          <Button onClick={handleSave} disabled={isSaving} className="gap-2">
            <Save className="h-4 w-4" />
            {isSaving
              ? language === "ru"
                ? "Сохранение..."
                : "Saving..."
              : language === "ru"
              ? "Сохранить"
              : "Save"}
          </Button>
        </div>
      </header>

      <main className="px-4 pt-4 space-y-4">
        {/* Warnings */}
        {warnings.length > 0 && (
          <Card className="panel-glass border-yellow-500/30">
            <CardContent className="py-3">
              <div className="flex items-start gap-2">
                <AlertTriangle className="h-4 w-4 text-yellow-500 mt-0.5 flex-shrink-0" />
                <div className="text-sm text-muted-foreground">
                  {warnings.map((warning, index) => (
                    <p key={index}>{warning}</p>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Store Info */}
        <Card className="panel-glass border-cyber-glow/20">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <Store className="h-4 w-4 text-cyber-sigil" />
              {language === "ru" ? "Магазин" : "Store"}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div>
              <Label className="text-xs text-muted-foreground">
                {language === "ru" ? "Название" : "Name"}
              </Label>
              <Input
                value={storeName}
                onChange={(e) => setStoreName(e.target.value)}
                placeholder={language === "ru" ? "Название магазина" : "Store name"}
                className="mt-1"
              />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">
                {language === "ru" ? "Адрес" : "Address"}
              </Label>
              <Input
                value={storeAddress}
                onChange={(e) => setStoreAddress(e.target.value)}
                placeholder={language === "ru" ? "Адрес (опционально)" : "Address (optional)"}
                className="mt-1"
              />
            </div>
          </CardContent>
        </Card>

        {/* Date & Currency */}
        <Card className="panel-glass border-cyber-glow/20">
          <CardContent className="py-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs text-muted-foreground flex items-center gap-1">
                  <Calendar className="h-3 w-3" />
                  {language === "ru" ? "Дата" : "Date"}
                </Label>
                <Input
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  className="mt-1"
                />
              </div>
              <div>
                <Label className="text-xs text-muted-foreground flex items-center gap-1">
                  <Coins className="h-3 w-3" />
                  {language === "ru" ? "Валюта" : "Currency"}
                </Label>
                <Select value={currency} onValueChange={setCurrency}>
                  <SelectTrigger className="mt-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CURRENCIES.map((curr) => (
                      <SelectItem key={curr} value={curr}>
                        {curr}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Items */}
        <Card className="panel-glass border-cyber-glow/20">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm">
                {language === "ru" ? "Товары" : "Items"} ({items.length})
              </CardTitle>
              <Button variant="ghost" size="sm" onClick={handleAddItem} className="gap-1 h-8">
                <Plus className="h-3 w-3" />
                {language === "ru" ? "Добавить" : "Add"}
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {items.map((item, index) => (
              <div key={item.id} className="space-y-2 p-3 rounded-lg bg-muted/30 border border-border/30">
                <div className="flex items-start justify-between">
                  <span className="text-xs text-muted-foreground">#{index + 1}</span>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6 text-destructive/70 hover:text-destructive"
                    onClick={() => handleRemoveItem(item.id)}
                  >
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
                <Input
                  value={item.name}
                  onChange={(e) => handleItemChange(item.id, "name", e.target.value)}
                  placeholder={language === "ru" ? "Название товара" : "Item name"}
                  className="font-medium"
                />
                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <Label className="text-[10px] text-muted-foreground">
                      {language === "ru" ? "Кол-во" : "Qty"}
                    </Label>
                    <Input
                      value={item.qty}
                      onChange={(e) => handleItemChange(item.id, "qty", e.target.value)}
                      placeholder="1"
                      type="number"
                      step="0.01"
                      className="mt-0.5"
                    />
                  </div>
                  <div>
                    <Label className="text-[10px] text-muted-foreground">
                      {language === "ru" ? "Цена" : "Price"}
                    </Label>
                    <Input
                      value={item.unitPrice}
                      onChange={(e) => handleItemChange(item.id, "unitPrice", e.target.value)}
                      placeholder="0.00"
                      type="number"
                      step="0.01"
                      className="mt-0.5"
                    />
                  </div>
                  <div>
                    <Label className="text-[10px] text-muted-foreground">
                      {language === "ru" ? "Итого" : "Total"}
                    </Label>
                    <Input
                      value={item.totalPrice}
                      onChange={(e) => handleItemChange(item.id, "totalPrice", e.target.value)}
                      placeholder="0.00"
                      type="number"
                      step="0.01"
                      className="mt-0.5"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <Label className="text-[10px] text-muted-foreground">
                      {language === "ru" ? "Скидка" : "Discount"}
                    </Label>
                    <Input
                      value={item.discount}
                      onChange={(e) => handleItemChange(item.id, "discount", e.target.value)}
                      placeholder="0"
                      type="number"
                      step="0.01"
                      className="mt-0.5"
                    />
                  </div>
                  <div>
                    <Label className="text-[10px] text-muted-foreground">
                      {language === "ru" ? "Категория" : "Category"}
                    </Label>
                    <Select
                      value={item.category}
                      onValueChange={(value) => handleItemChange(item.id, "category", value)}
                    >
                      <SelectTrigger className="mt-0.5">
                        <SelectValue placeholder="—" />
                      </SelectTrigger>
                      <SelectContent>
                        {CATEGORIES[language].map((cat) => (
                          <SelectItem key={cat} value={cat}>
                            {cat}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        {/* Totals */}
        <Card className="panel-glass border-cyber-glow/20">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">
              {language === "ru" ? "Итоги" : "Totals"}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-3 gap-3">
              <div>
                <Label className="text-xs text-muted-foreground">
                  {language === "ru" ? "Подитог" : "Subtotal"}
                </Label>
                <Input
                  value={subtotal}
                  onChange={(e) => setSubtotal(e.target.value)}
                  placeholder="0.00"
                  type="number"
                  step="0.01"
                  className="mt-1"
                />
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">
                  {language === "ru" ? "Налог" : "Tax"}
                </Label>
                <Input
                  value={tax}
                  onChange={(e) => setTax(e.target.value)}
                  placeholder="0.00"
                  type="number"
                  step="0.01"
                  className="mt-1"
                />
              </div>
              <div>
                <Label className="text-xs text-muted-foreground font-medium">
                  {language === "ru" ? "Итого" : "Total"}
                </Label>
                <Input
                  value={total}
                  onChange={(e) => setTotal(e.target.value)}
                  placeholder="0.00"
                  type="number"
                  step="0.01"
                  className="mt-1 font-medium"
                />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Scan info: confidence and model badge */}
        <div className="flex items-center justify-center gap-4 text-xs text-muted-foreground flex-wrap">
          {/* Model badge */}
          <Badge 
            variant="outline" 
            className={cn(
              "gap-1",
              scanMode === "accurate" 
                ? "border-primary/50 text-primary" 
                : "border-yellow-500/50 text-yellow-600"
            )}
          >
            {scanMode === "accurate" ? (
              <Target className="h-3 w-3" />
            ) : (
              <Zap className="h-3 w-3" />
            )}
            {t('receipts.scannedWith')}: {scanMode === "accurate" ? t('receipts.modelPro') : t('receipts.modelFlash')}
          </Badge>
          
          {/* Confidence */}
          <span>
            {language === "ru" ? "Уверенность: " : "Confidence: "}
            <span
              className={cn(
                "font-medium",
                scanResult.confidence === "high" && "text-green-500",
                scanResult.confidence === "medium" && "text-yellow-500",
                scanResult.confidence === "low" && "text-red-500"
              )}
            >
              {scanResult.confidence === "high"
                ? language === "ru"
                  ? "высокая"
                  : "high"
                : scanResult.confidence === "medium"
                ? language === "ru"
                  ? "средняя"
                  : "medium"
                : language === "ru"
                ? "низкая"
                : "low"}
            </span>
          </span>
        </div>
      </main>
    </div>
  );
}

export default function ReceiptReviewPage() {
  return (
    <ErrorBoundary>
      <ReceiptReviewContent />
    </ErrorBoundary>
  );
}
