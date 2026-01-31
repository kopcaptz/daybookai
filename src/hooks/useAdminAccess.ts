import { useState, useCallback, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { 
  getAdminToken, 
  setAdminToken, 
  clearAdminToken, 
  isAdminAuthenticated,
  AdminTokenData 
} from '@/lib/adminTokenService';

interface UseAdminAccessResult {
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;
  tokenData: AdminTokenData | null;
  verifyPin: (pin: string) => Promise<boolean>;
  logout: () => void;
}

export function useAdminAccess(): UseAdminAccessResult {
  const [isAuthenticated, setIsAuthenticated] = useState(isAdminAuthenticated);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tokenData, setTokenData] = useState<AdminTokenData | null>(getAdminToken);

  // Check token validity on mount
  useEffect(() => {
    const token = getAdminToken();
    setIsAuthenticated(!!token);
    setTokenData(token);
  }, []);

  const verifyPin = useCallback(async (pin: string): Promise<boolean> => {
    setIsLoading(true);
    setError(null);

    try {
      const { data, error: invokeError } = await supabase.functions.invoke('admin-pin-verify', {
        body: { pin },
      });

      if (invokeError) {
        throw new Error(invokeError.message);
      }

      if (!data?.success) {
        if (data?.error === 'invalid_pin') {
          setError('Неверный PIN-код');
        } else {
          setError('Ошибка авторизации');
        }
        return false;
      }

      // Store token
      setAdminToken(data.token, data.expiresAt);
      setTokenData({ token: data.token, expiresAt: data.expiresAt });
      setIsAuthenticated(true);
      return true;
    } catch (err) {
      console.error('Admin PIN verify error:', err);
      setError('Не удалось проверить PIN');
      return false;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const logout = useCallback(() => {
    clearAdminToken();
    setTokenData(null);
    setIsAuthenticated(false);
    setError(null);
  }, []);

  return {
    isAuthenticated,
    isLoading,
    error,
    tokenData,
    verifyPin,
    logout,
  };
}
