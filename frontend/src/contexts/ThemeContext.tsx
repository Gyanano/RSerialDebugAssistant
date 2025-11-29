import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';

export type ThemeMode = 'light' | 'dark';

interface ThemeColors {
  // Background colors
  bgMain: string;
  bgSidebar: string;
  bgHeader: string;
  bgSurface: string;
  bgInput: string;
  bgHover: string;
  
  // Text colors
  textPrimary: string;
  textSecondary: string;
  textTertiary: string;
  textPlaceholder: string;
  
  // Border colors
  border: string;
  borderLight: string;
  borderDark: string;
  
  // Accent colors (same for both themes)
  accent: string;
  accentHover: string;
  success: string;
  danger: string;
  warning: string;
  
  // Component-specific
  buttonSecondaryBg: string;
  buttonSecondaryHover: string;
  logSentBg: string;
  logReceivedBg: string;
}

const lightTheme: ThemeColors = {
  bgMain: '#f5f5f7',
  bgSidebar: '#ffffff',
  bgHeader: '#f5f5f7',
  bgSurface: '#ffffff',
  bgInput: '#ffffff',
  bgHover: 'rgba(0, 0, 0, 0.05)',
  
  textPrimary: '#1d1d1f',
  textSecondary: '#6e6e73',
  textTertiary: '#86868b',
  textPlaceholder: '#aeaeb2',
  
  border: 'rgba(0, 0, 0, 0.1)',
  borderLight: 'rgba(0, 0, 0, 0.05)',
  borderDark: 'rgba(0, 0, 0, 0.2)',
  
  accent: '#0A84FF',
  accentHover: '#0071e3',
  success: '#30D158',
  danger: '#FF453A',
  warning: '#FFD60A',
  
  buttonSecondaryBg: 'rgba(0, 0, 0, 0.05)',
  buttonSecondaryHover: 'rgba(0, 0, 0, 0.1)',
  logSentBg: 'rgba(10, 132, 255, 0.05)',
  logReceivedBg: 'rgba(48, 209, 88, 0.05)',
};

const darkTheme: ThemeColors = {
  bgMain: '#1e1e1e',
  bgSidebar: '#262626',
  bgHeader: '#2d2d2d',
  bgSurface: '#333333',
  bgInput: 'rgba(255, 255, 255, 0.1)',
  bgHover: 'rgba(255, 255, 255, 0.1)',
  
  textPrimary: '#ffffff',
  textSecondary: '#a0a0a0',
  textTertiary: '#707070',
  textPlaceholder: '#606060',
  
  border: 'rgba(255, 255, 255, 0.1)',
  borderLight: 'rgba(255, 255, 255, 0.05)',
  borderDark: 'rgba(0, 0, 0, 0.4)',
  
  accent: '#0A84FF',
  accentHover: '#0071e3',
  success: '#30D158',
  danger: '#FF453A',
  warning: '#FFD60A',
  
  buttonSecondaryBg: 'rgba(255, 255, 255, 0.05)',
  buttonSecondaryHover: 'rgba(255, 255, 255, 0.1)',
  logSentBg: 'rgba(10, 132, 255, 0.05)',
  logReceivedBg: 'rgba(48, 209, 88, 0.05)',
};

interface ThemeContextType {
  themeMode: ThemeMode;
  colors: ThemeColors;
  setThemeMode: (mode: ThemeMode) => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

interface ThemeProviderProps {
  children: ReactNode;
}

export const ThemeProvider: React.FC<ThemeProviderProps> = ({ children }) => {
  const [themeMode, setThemeModeState] = useState<ThemeMode>('dark');

  // Load saved theme from localStorage on mount
  useEffect(() => {
    const savedTheme = localStorage.getItem('serialDebug_theme') as ThemeMode | null;
    if (savedTheme && (savedTheme === 'light' || savedTheme === 'dark')) {
      setThemeModeState(savedTheme);
    }
  }, []);

  // Apply theme to document root
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', themeMode);
  }, [themeMode]);

  const setThemeMode = (mode: ThemeMode) => {
    setThemeModeState(mode);
    localStorage.setItem('serialDebug_theme', mode);
  };

  const colors = themeMode === 'light' ? lightTheme : darkTheme;

  return (
    <ThemeContext.Provider value={{ themeMode, colors, setThemeMode }}>
      {children}
    </ThemeContext.Provider>
  );
};

export const useTheme = (): ThemeContextType => {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
};
