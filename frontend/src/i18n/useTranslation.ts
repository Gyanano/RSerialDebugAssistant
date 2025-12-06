import { useLanguage } from './LanguageContext';

/**
 * Convenience hook that returns just the translation function.
 * Use this when you only need to translate strings and don't need
 * to access or modify the language setting.
 */
export const useTranslation = () => {
  const { t } = useLanguage();
  return { t };
};
