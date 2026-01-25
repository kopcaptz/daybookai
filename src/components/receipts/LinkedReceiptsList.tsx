import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Receipt, Unlink, Camera, ExternalLink } from 'lucide-react';
import { useI18n } from '@/lib/i18n';
import { getReceiptsByEntryId, Receipt as ReceiptType } from '@/lib/db';
import { linkReceiptToEntry, isReceiptScanningAvailable } from '@/lib/receiptService';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';

interface LinkedReceiptsListProps {
  entryId: number;
  entryDate: string;
}

export function LinkedReceiptsList({ entryId, entryDate }: LinkedReceiptsListProps) {
  const { t, language } = useI18n();
  const navigate = useNavigate();
  const [receipts, setReceipts] = useState<ReceiptType[]>([]);
  const [loading, setLoading] = useState(true);

  const loadReceipts = async () => {
    try {
      const linked = await getReceiptsByEntryId(entryId);
      setReceipts(linked);
    } catch (error) {
      console.error('Failed to load linked receipts:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadReceipts();
  }, [entryId]);

  const handleUnlink = async (receiptId: number) => {
    try {
      await linkReceiptToEntry(receiptId, null);
      setReceipts(prev => prev.filter(r => r.id !== receiptId));
      toast.success(language === 'ru' ? 'Чек отвязан' : 'Receipt unlinked');
    } catch (error) {
      console.error('Failed to unlink receipt:', error);
      toast.error(language === 'ru' ? 'Ошибка' : 'Error');
    }
  };

  const handleScanAndLink = () => {
    // Navigate to scan with the entry context stored
    sessionStorage.setItem('linkToEntryId', entryId.toString());
    sessionStorage.setItem('linkToEntryDate', entryDate);
    navigate('/receipts/scan');
  };

  // Group by currency
  const totalsByCurrency: Record<string, number> = {};
  receipts.forEach(r => {
    const currency = r.currency || '?';
    totalsByCurrency[currency] = (totalsByCurrency[currency] || 0) + (r.total || 0);
  });

  const canScan = isReceiptScanningAvailable().available;

  if (loading) {
    return null;
  }

  return (
    <div className="panel-glass p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Receipt className="h-4 w-4 text-cyber-sigil" />
          <h3 className="text-sm font-medium">{t('receipts.linkedReceipts')}</h3>
        </div>
        {canScan && (
          <Button 
            variant="ghost" 
            size="sm" 
            onClick={handleScanAndLink}
            className="text-xs gap-1.5 h-7"
          >
            <Camera className="h-3.5 w-3.5" />
            {t('receipts.scanAndLink')}
          </Button>
        )}
      </div>

      {receipts.length === 0 ? (
        <p className="text-xs text-muted-foreground">{t('receipts.noLinkedReceipts')}</p>
      ) : (
        <div className="space-y-2">
          {receipts.map(receipt => (
            <div 
              key={receipt.id} 
              className="flex items-center justify-between py-2 px-3 rounded-md bg-muted/30 hover:bg-muted/50 transition-colors"
            >
              <div className="flex-1 min-w-0">
                <Link 
                  to={`/receipts/${receipt.id}`}
                  className="flex items-center gap-2 group"
                >
                  <span className="text-sm font-medium truncate group-hover:text-primary transition-colors">
                    {receipt.storeName}
                  </span>
                  <ExternalLink className="h-3 w-3 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                </Link>
                <p className="text-xs text-muted-foreground">
                  {receipt.total !== null 
                    ? `${receipt.total.toFixed(2)} ${receipt.currency || ''}`
                    : (language === 'ru' ? 'Сумма не указана' : 'No total')}
                </p>
              </div>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 text-muted-foreground hover:text-destructive"
                onClick={() => handleUnlink(receipt.id!)}
              >
                <Unlink className="h-3.5 w-3.5" />
              </Button>
            </div>
          ))}

          {/* Totals by currency */}
          {Object.keys(totalsByCurrency).length > 0 && (
            <div className="pt-2 border-t border-border/50">
              <div className="flex flex-wrap gap-2">
                {Object.entries(totalsByCurrency).map(([currency, total]) => (
                  <span key={currency} className="text-xs font-medium text-primary">
                    {total.toFixed(2)} {currency}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
