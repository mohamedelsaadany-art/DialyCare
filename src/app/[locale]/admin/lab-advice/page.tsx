'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { useLocale } from 'next-intl';
import Card from '@/components/ui/Card';
import { FloatingToast } from '@/components/ui/FloatingToast';
import { CLINICAL_12_LAB_TESTS } from '@/components/admin/PatientLabResultsModal';
import { speakParts, stopSpeaking } from '@/lib/speech-client';
import type { LabAdviceMap, LabAdviceStatus } from '@/lib/lab-advice';

const STATUS_LABEL: Record<LabAdviceStatus, { ar: string; en: string; cls: string }> = {
  pending: { ar: 'بانتظار المراجعة', en: 'Waiting for review', cls: 'bg-amber-100 text-amber-800 border-amber-300' },
  approved: { ar: 'معتمدة', en: 'Approved', cls: 'bg-emerald-100 text-emerald-800 border-emerald-300' },
  rejected: { ar: 'مرفوضة', en: 'Refused', cls: 'bg-slate-200 text-slate-700 border-slate-300' },
};

/**
 * Doctor review of what the talking avatar may say about abnormal lab results.
 * Patients only ever hear approved lines. Super admin can approve, edit or refuse.
 */
export default function LabAdviceReviewPage() {
  const isAr = useLocale() === 'ar';
  const [items, setItems] = useState<LabAdviceMap | null>(null);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [canReview, setCanReview] = useState(false);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [toast, setToast] = useState<{ msg: string; tone: 'success' | 'error' } | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    fetch('/api/lab-advice', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (!j?.items) return setFailed(true);
        setItems(j.items);
        setCanReview(!!j.canReview);
        setDrafts(Object.fromEntries(Object.entries(j.items as LabAdviceMap).map(([k, v]) => [k, v.text])));
      })
      .catch(() => setFailed(true));
    return () => stopSpeaking();
  }, []);

  const counts = useMemo(() => {
    const c = { pending: 0, approved: 0, rejected: 0 };
    for (const v of Object.values(items || {})) c[v.status]++;
    return c;
  }, [items]);

  const decide = async (key: string, status: LabAdviceStatus) => {
    setBusyKey(key);
    try {
      const res = await fetch('/api/lab-advice', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key, text: drafts[key], status }),
      });
      const j = await res.json().catch(() => null);
      if (!res.ok || !j?.items) throw new Error('failed');
      setItems(j.items);
      setToast({ msg: status === 'approved' ? (isAr ? 'تم الاعتماد ✅' : 'Approved ✅') : isAr ? 'تم الرفض' : 'Refused', tone: 'success' });
    } catch {
      setToast({ msg: isAr ? 'لم يتم الحفظ، حاول مرة أخرى' : 'Not saved, try again', tone: 'error' });
    } finally {
      setBusyKey(null);
      setTimeout(() => setToast(null), 3000);
    }
  };

  if (failed) return <p className="text-sm text-red-600">{isAr ? 'تعذر تحميل الصفحة.' : 'Could not load this page.'}</p>;
  if (!items) return <p className="text-sm text-slate-500">{isAr ? 'جارِ التحميل…' : 'Loading…'}</p>;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">🧪 {isAr ? 'نصائح التحاليل للمساعد المتكلم' : 'Lab advice for the talking assistant'}</h1>
        <p className="text-sm text-slate-600 mt-1 max-w-3xl">
          {isAr
            ? 'لما تحليل المريض يكون عالي أو قليل، المساعد بيقول الجملة دي بعد النتيجة. المريض بيسمع الجمل المعتمدة بس. عدّل الجملة لو حابب، وبعدين اعتمدها أو ارفضها.'
            : 'When a result is high or low, the assistant says this line after it. Patients only hear approved lines. Edit a line if needed, then approve or refuse it.'}
        </p>
        <div className="flex flex-wrap gap-2 mt-3 text-xs font-bold">
          {(Object.keys(STATUS_LABEL) as LabAdviceStatus[]).map((s) => (
            <span key={s} className={`px-2.5 py-1 rounded-lg border ${STATUS_LABEL[s].cls}`}>
              {isAr ? STATUS_LABEL[s].ar : STATUS_LABEL[s].en}: {counts[s]}
            </span>
          ))}
        </div>
        {!canReview && (
          <p className="mt-3 text-sm font-bold text-amber-800">
            {isAr ? 'الاعتماد والرفض متاحين للمشرف العام فقط.' : 'Only the super admin can approve or refuse.'}
          </p>
        )}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {CLINICAL_12_LAB_TESTS.map((test) =>
          (['high', 'low'] as const).map((dir) => {
            const key = `${test.key}:${dir}`;
            const item = items[key];
            if (!item) return null;
            const changed = (drafts[key] || '').trim() !== item.text.trim();
            return (
              <Card key={key} data-testid={`lab-advice-${key}`} className="space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h2 className="font-bold text-slate-900">
                    {isAr ? test.nameAr : test.nameEn}{' '}
                    <span className={dir === 'high' ? 'text-red-700' : 'text-blue-700'}>
                      {dir === 'high' ? (isAr ? '↑ عالي' : '↑ high') : isAr ? '↓ قليل' : '↓ low'}
                    </span>
                    <span className="text-xs font-normal text-slate-500">
                      {' '}
                      ({dir === 'high' ? `> ${test.refMax}` : `< ${test.refMin}`} {test.unit})
                    </span>
                  </h2>
                  <span className={`text-xs font-bold px-2.5 py-1 rounded-lg border ${STATUS_LABEL[item.status].cls}`}>
                    {isAr ? STATUS_LABEL[item.status].ar : STATUS_LABEL[item.status].en}
                  </span>
                </div>
                <textarea
                  dir="rtl"
                  value={drafts[key] ?? ''}
                  onChange={(e) => setDrafts((d) => ({ ...d, [key]: e.target.value }))}
                  disabled={!canReview}
                  rows={3}
                  maxLength={400}
                  className="w-full rounded-xl border border-slate-300 p-3 text-base leading-relaxed text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#1e6bb8] disabled:bg-slate-50"
                />
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => speakParts([`${test.nameAr}، ${dir === 'high' ? 'أعلى' : 'أقل'} من الطبيعي. ${drafts[key] || ''}`])}
                    className="min-h-[44px] px-3 rounded-xl border border-slate-300 bg-white text-sm font-bold text-slate-700"
                  >
                    🔊 {isAr ? 'اسمع' : 'Listen'}
                  </button>
                  {canReview && (
                    <>
                      <button
                        type="button"
                        disabled={busyKey === key || !(drafts[key] || '').trim() || (item.status === 'approved' && !changed)}
                        onClick={() => decide(key, 'approved')}
                        className="min-h-[44px] px-4 rounded-xl bg-emerald-600 text-white text-sm font-bold disabled:opacity-50"
                      >
                        ✅ {changed ? (isAr ? 'حفظ التعديل واعتماد' : 'Save & approve') : isAr ? 'اعتماد' : 'Approve'}
                      </button>
                      <button
                        type="button"
                        disabled={busyKey === key || item.status === 'rejected'}
                        onClick={() => decide(key, 'rejected')}
                        className="min-h-[44px] px-4 rounded-xl border border-red-300 bg-white text-red-700 text-sm font-bold disabled:opacity-50"
                      >
                        ❌ {isAr ? 'رفض' : 'Refuse'}
                      </button>
                    </>
                  )}
                </div>
              </Card>
            );
          })
        )}
      </div>

      {toast && <FloatingToast tone={toast.tone} message={toast.msg} onClose={() => setToast(null)} />}
    </div>
  );
}
