import { createContext, useContext } from 'react';
import { t as translate, type Lang } from '../i18n';

interface LangCtx {
  lang: Lang;
  t: (key: string, params?: Record<string, string | number>) => string;
}

const LanguageContext = createContext<LangCtx>({
  lang: 'pl',
  t: (key, params) => translate('pl', key, params),
});

export function LanguageProvider({ lang, children }: { lang: Lang; children: React.ReactNode }) {
  const value: LangCtx = {
    lang,
    t: (key, params) => translate(lang, key, params),
  };
  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export function useLang() {
  return useContext(LanguageContext);
}
