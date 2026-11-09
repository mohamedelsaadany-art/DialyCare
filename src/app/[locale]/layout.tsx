import React from 'react';
import { NextIntlClientProvider } from 'next-intl';
import { getMessages, setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';

export function generateStaticParams() {
  return [{ locale: 'en' }, { locale: 'ar' }];
}

export default async function LocaleLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;

  if (!['en', 'ar'].includes(locale)) {
    notFound();
  }

  setRequestLocale(locale);

  const messages = await getMessages();
  const dir = locale === 'ar' ? 'rtl' : 'ltr';

  return (
    <NextIntlClientProvider locale={locale} messages={messages}>
      <div
        id="dialycare-locale-root"
        dir={dir}
        lang={locale}
        className={`flex-1 flex flex-col w-full ${dir === 'rtl' ? 'rtl' : 'ltr'}`}
      >
        <script
          dangerouslySetInnerHTML={{
            __html: `document.documentElement.lang='${locale}';document.documentElement.dir='${dir}';`,
          }}
        />
        <React.Suspense
          fallback={
            <div className="flex-1 flex items-center justify-center p-8">
              <div className="w-8 h-8 rounded-full border-3 border-blue-200 border-t-[#1e6bb8] animate-spin" />
            </div>
          }
        >
          {children}
        </React.Suspense>
      </div>
    </NextIntlClientProvider>
  );
}
