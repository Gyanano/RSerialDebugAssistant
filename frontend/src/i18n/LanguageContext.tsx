import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import en from './translations/en.json';
import zhCN from './translations/zh-CN.json';

export type Language = 'en' | 'zh-CN';

interface Translations {
  [key: string]: string | Translations;
}

const translations: Record<Language, Translations> = {
  'en': en,
  'zh-CN': zhCN,
};

interface LanguageContextType {
  language: Language;
  setLanguage: (lang: Language) => void;
  t: (key: string) => string;
}

const STORAGE_KEY = 'serialDebug_language';

const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

// Get nested value from object using dot notation
const getNestedValue = (obj: Translations, path: string): string => {
  const keys = path.split('.');
  let current: Translations | string = obj;

  for (const key of keys) {
    if (typeof current === 'object' && current !== null && key in current) {
      current = current[key];
    } else {
      return path; // Return key as fallback
    }
  }

  return typeof current === 'string' ? current : path;
};

export const LanguageProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [language, setLanguageState] = useState<Language>(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === 'en' || saved === 'zh-CN') {
      return saved;
    }
    // Default to English
    return 'en';
  });

  const setLanguage = (lang: Language) => {
    setLanguageState(lang);
    localStorage.setItem(STORAGE_KEY, lang);
  };

  // Translation function
  const t = (key: string): string => {
    const result = getNestedValue(translations[language], key);
    if (result === key) {
      // Fallback to English if key not found
      return getNestedValue(translations['en'], key);
    }
    return result;
  };

  return (
    <LanguageContext.Provider value={{ language, setLanguage, t }}>
      {children}
    </LanguageContext.Provider>
  );
};

export const useLanguage = (): LanguageContextType => {
  const context = useContext(LanguageContext);
  if (context === undefined) {
    throw new Error('useLanguage must be used within a LanguageProvider');
  }
  return context;
};
