'use client';

import React, { useEffect, useState } from 'react';
import Card from '@/components/ui/Card';

interface UsageResponse {
  success: boolean;
  today: string;
  totalPatients: number;
  patientsWithAlerts: number;
  activeToday: number;
  opensToday: number;
  opensFromAlertsToday: number;
  alertsSentToday: number;
  trackingSince: string | null;
  days: { ymd: string; activePatients: number; alertsSent: number }[];
  patients: { id: string; nameAr: string; name: string; opensToday: number; lastSeen: string | null; alertsOn: boolean }[];
}

const WEEKDAY_AR = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];
const WEEKDAY_EN = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function dayLabel(ymd: string, isAr: boolean): string {
  const d = new Date(`${ymd}T12:00:00Z`).getUTCDay();
  return isAr ? WEEKDAY_AR[d] : WEEKDAY_EN[d];
}

/** How many patients open the app, and which ones stopped. Staff only. */
export function AdminAppUsageCard({ isAr }: { isAr: boolean }) {
  const [data, setData] = useState<UsageResponse | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let alive = true;
    fetch('/api/admin/usage', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((j: UsageResponse | null) => {
        if (!alive) return;
        if (j?.success) setData(j);
        else setFailed(true);
      })
      .catch(() => alive && setFailed(true));
    return () => {
      alive = false;
    };
  }, []);

  if (failed) return null;

  const max = Math.max(1, ...(data?.days || []).map((d) => d.activePatients));
  const notSeen = (data?.patients || []).filter((p) => !p.lastSeen);

  return (
    <Card data-testid="admin-app-usage" className="space-y-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-lg font-bold text-slate-900">📱 {isAr ? 'استخدام المرضى للتطبيق' : 'Patient app use'}</h2>
        {data?.trackingSince && (
          <span className="text-xs text-slate-500">
            {isAr ? `القياس بدأ ${data.trackingSince}` : `Tracking since ${data.trackingSince}`}
          </span>
        )}
      </div>

      {!data ? (
        <p className="text-sm text-slate-500">{isAr ? 'جارِ التحميل…' : 'Loading…'}</p>
      ) : (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { label: isAr ? 'فتحوا التطبيق اليوم' : 'Opened today', value: `${data.activeToday} / ${data.totalPatients}` },
              { label: isAr ? 'مرات الفتح اليوم' : 'Opens today', value: data.opensToday },
              { label: isAr ? 'فتحوا من تنبيه' : 'From an alert', value: data.opensFromAlertsToday },
              { label: isAr ? 'التنبيهات مفعّلة' : 'Alerts on', value: `${data.patientsWithAlerts} / ${data.totalPatients}` },
            ].map((t) => (
              <div key={t.label} className="rounded-2xl bg-slate-50 border border-slate-200 p-3">
                <p className="text-xs text-slate-500">{t.label}</p>
                <p className="text-2xl font-extrabold text-slate-900 mt-1"><bdi>{t.value}</bdi></p>
              </div>
            ))}
          </div>

          <div>
            <p className="text-xs font-semibold text-slate-500 mb-2">
              {isAr ? 'مرضى فتحوا التطبيق — آخر 7 أيام' : 'Patients who opened the app — last 7 days'}
            </p>
            <div className="flex items-end gap-2 h-28" dir="ltr">
              {[...data.days].reverse().map((d) => (
                <div key={d.ymd} className="flex-1 min-w-0 flex flex-col items-center gap-1">
                  <span className="text-xs font-bold text-slate-700">{d.activePatients}</span>
                  <div
                    className="w-full rounded-t-lg bg-[#1e6bb8]"
                    style={{ height: `${Math.max(4, (d.activePatients / max) * 72)}px` }}
                    title={isAr ? `${d.alertsSent} تنبيه مرسل` : `${d.alertsSent} alerts sent`}
                  />
                  <span className="text-[11px] text-slate-500 truncate">{dayLabel(d.ymd, isAr)}</span>
                </div>
              ))}
            </div>
          </div>

          {notSeen.length > 0 && (
            <details className="rounded-2xl border border-amber-200 bg-amber-50">
              <summary className="cursor-pointer select-none px-3 py-2.5 text-sm font-bold text-amber-900">
                {isAr ? `${notSeen.length} مريض لم يفتح التطبيق خلال 7 أيام` : `${notSeen.length} patients have not opened the app in 7 days`}
              </summary>
              <ul className="px-3 pb-3 text-sm text-slate-700 grid sm:grid-cols-2 gap-x-4 gap-y-1">
                {notSeen.map((p) => (
                  <li key={p.id} className="flex items-center justify-between gap-2 min-w-0">
                    <span className="truncate">{isAr ? p.nameAr : p.name}</span>
                    <span className="text-xs text-slate-500 shrink-0">
                      {p.alertsOn ? (isAr ? '🔔 مفعّل' : '🔔 on') : isAr ? '🔕 مقفول' : '🔕 off'}
                    </span>
                  </li>
                ))}
              </ul>
            </details>
          )}
        </>
      )}
    </Card>
  );
}

export default AdminAppUsageCard;
