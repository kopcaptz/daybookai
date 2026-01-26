import { useState, useEffect, useCallback } from 'react';

export type ThemeMode = 'light' | 'espresso' | 'cyber' | 'system';

const THEME_KEY = 'daybook-theme';

function getSystemPrefersDark(): boolean {
  if (typeof window === 'undefined') return true;
  return window.matchMedia('(prefers-color-scheme: dark)').matches;
}

function applyThemeClasses(mode: ThemeMode) {
  const root = document.documentElement;
  
  // Remove all theme classes first
  root.classList.remove('light', 'dark', 'dark-cyber');
  
  if (mode === 'system') {
    // System mode: use espresso dark when OS prefers dark
    if (getSystemPrefersDark()) {
      root.classList.add('dark');
    } else {
      root.classList.add('light');
    }
  } else if (mode === 'light') {
    root.classList.add('light');
  } else if (mode === 'espresso') {
    root.classList.add('dark');
  } else if (mode === 'cyber') {
    root.classList.add('dark-cyber');
  }
}

export function useTheme() {
  const [theme, setThemeState] = useState<ThemeMode>(() => {
    if (typeof window === 'undefined') return 'system';
    const saved = localStorage.getItem(THEME_KEY) as ThemeMode | null;
    // Validate saved value
    if (saved === 'light' || saved === 'espresso' || saved === 'cyber' || saved === 'system') {
      return saved;
    }
    // Migration: old 'dark' value maps to 'espresso'
    if (saved === 'dark') {
      localStorage.setItem(THEME_KEY, 'espresso');
      return 'espresso';
    }
    return 'system'; // Default to system theme for new users
  });

  const setTheme = useCallback((newTheme: ThemeMode) => {
    setThemeState(newTheme);
    localStorage.setItem(THEME_KEY, newTheme);
    applyThemeClasses(newTheme);
  }, []);

  useEffect(() => {
    applyThemeClasses(theme);

    // Listen for system theme changes only when in system mode
    if (theme === 'system') {
      const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
      const handleChange = () => applyThemeClasses('system');
      mediaQuery.addEventListener('change', handleChange);
      return () => mediaQuery.removeEventListener('change', handleChange);
    }
  }, [theme]);

  return { theme, setTheme };
}
