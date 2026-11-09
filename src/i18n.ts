import { getRequestConfig } from 'next-intl/server';

export default getRequestConfig(async ({ requestLocale, locale: explicitLocale }) => {
  let locale = explicitLocale || (await requestLocale);
  if (!locale || !['en', 'ar'].includes(locale)) {
    locale = 'en';
  }

  return {
    locale,
    messages: (await import(`./messages/${locale}.json`)).default,
  };
});
