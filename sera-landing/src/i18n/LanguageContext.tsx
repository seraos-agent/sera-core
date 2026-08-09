import React, { createContext, useContext, useState } from 'react';
import { translations } from './translations';
import type { LanguageCode } from './translations';

interface LanguageContextType {
  language: LanguageCode;
  setLanguage: (lang: LanguageCode) => void;
  t: (key: string) => string;
}

const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [language, setLanguageState] = useState<LanguageCode>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('sera-language') as LanguageCode;
      if (saved && ['en', 'id', 'zh'].includes(saved)) {
        return saved;
      }
    }
    return 'en';
  });

  const setLanguage = (lang: LanguageCode) => {
    setLanguageState(lang);
    if (typeof window !== 'undefined') {
      localStorage.setItem('sera-language', lang);
    }
  };

  const t = (key: string): string => {
    const translationSet = translations[key];
    if (!translationSet) {
      console.warn(`Translation key not found: ${key}`);
      return key;
    }
    return translationSet[language] || translationSet['en'] || key;
  };

  return (
    <LanguageContext.Provider value={{ language, setLanguage, t }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useTranslation() {
  const context = useContext(LanguageContext);
  if (context === undefined) {
    throw new Error('useTranslation must be used within a LanguageProvider');
  }
  return context;
}
