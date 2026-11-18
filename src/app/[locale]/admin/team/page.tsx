'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useLocale } from 'next-intl';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import Button from '@/components/ui/Button';

interface TeamMember {
  uid: string;
  displayName: string;
  role: 'doctor' | 'nurse' | 'staff';
  specialty?: string;
  hospital?: string;
  phone?: string;
  language?: string;
  registeredAt?: string;
}

export default function AdminTeamPage() {
  const locale = useLocale();
  const isRtl = locale === 'ar';

  const [team, setTeam] = useState<TeamMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  const loadTeam = useCallback(async () => {
    setError(null);
    try {
      const res = await fetch('/api/admin/team', { cache: 'no-store' });
      if (!res.ok) {
        throw new Error(isRtl ? 'فشل تحميل بيانات الفريق الطبي' : 'Failed to load medical team');
      }
      const data = (await res.json()) as { success?: boolean; team?: TeamMember[]; error?: string };
      if (!data.success || !Array.isArray(data.team)) {
        throw new Error(data.error || (isRtl ? 'فشل تحميل بيانات الفريق الطبي' : 'Failed to load medical team'));
      }
      setTeam(data.team);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : (isRtl ? 'حدث خطأ غير متوقع' : 'An unexpected error occurred'));
    } finally {
      setLoading(false);
    }
  }, [isRtl]);

  useEffect(() => {
    let mounted = true;
    const timer = setTimeout(() => {
      if (mounted) void loadTeam();
    }, 0);
    return () => {
      mounted = false;
      clearTimeout(timer);
    };
  }, [loadTeam]);

  const filteredTeam = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return team;
    return team.filter((m) => {
      const name = (m.displayName || '').toLowerCase();
      const spec = (m.specialty || '').toLowerCase();
      return name.includes(q) || spec.includes(q);
    });
  }, [team, searchQuery]);

  const doctors = useMemo(() => filteredTeam.filter((m) => m.role === 'doctor'), [filteredTeam]);
  const nurses = useMemo(() => filteredTeam.filter((m) => m.role === 'nurse'), [filteredTeam]);
  const staff = useMemo(() => filteredTeam.filter((m) => m.role === 'staff'), [filteredTeam]);

  const renderSection = (
    title: string,
    members: TeamMember[]
  ) => {
    return (
      <section className="space-y-3">
        <div className="flex items-center gap-2">
          <h2 className="text-lg font-bold text-slate-800">{title}</h2>
          <span className="px-2 py-0.5 text-xs font-bold bg-slate-100 text-slate-600 rounded-full">
            {members.length}
          </span>
        </div>

        {members.length === 0 ? (
          <div className="p-6 bg-slate-50/80 border border-dashed border-slate-200 rounded-xl text-center text-sm text-slate-400">
            {isRtl ? 'لا يوجد أعضاء حالياً' : 'No members yet'}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {members.map((member) => (
              <div
                key={member.uid}
                className="bg-white rounded-xl border border-slate-200/90 p-4 shadow-xs hover:shadow-sm transition-shadow flex flex-col justify-between gap-3"
              >
                <div className="space-y-1">
                  <h3 className="font-bold text-base text-slate-900">{member.displayName}</h3>
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-500">
                    {member.specialty ? (
                      <span className="inline-flex items-center px-2 py-0.5 rounded bg-blue-50 text-blue-700 font-medium">
                        {member.specialty}
                      </span>
                    ) : null}
                    {member.hospital ? (
                      <span className="text-slate-600 font-medium">
                        {member.hospital}
                      </span>
                    ) : null}
                  </div>
                </div>

                {member.phone ? (
                  <div className="pt-2 border-t border-slate-100 flex items-center justify-between">
                    <span className="text-xs text-slate-400 font-medium">{isRtl ? 'الهاتف:' : 'Phone:'}</span>
                    <a
                      href={`tel:${member.phone}`}
                      className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-bold text-blue-700 bg-blue-50 hover:bg-blue-100 rounded-lg transition"
                      dir="ltr"
                    >
                      <span>📞</span>
                      <span>{member.phone}</span>
                    </a>
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        )}
      </section>
    );
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[300px] py-16 gap-3">
        <LoadingSpinner size="lg" />
        <p className="text-slate-500 text-sm font-medium">
          {isRtl ? 'جاري تحميل الفريق الطبي...' : 'Loading medical team...'}
        </p>
      </div>
    );
  }

  return (
    <div dir={isRtl ? 'rtl' : 'ltr'} className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-black text-slate-900">
            {isRtl ? 'الفريق الطبي' : 'Medical team'}
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            {isRtl
              ? 'دليل الأطباء وهيئة التمريض وفريق الوحدة'
              : 'Directory of doctors, nurses, and unit staff'}
          </p>
        </div>
      </div>

      {error && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <span>{error}</span>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => {
              setLoading(true);
              void loadTeam();
            }}
            className="font-bold text-xs shrink-0"
          >
            {isRtl ? 'إعادة المحاولة' : 'Retry'}
          </Button>
        </div>
      )}

      <div className="relative">
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder={isRtl ? 'البحث بالاسم أو التخصص...' : 'Search by name or specialty...'}
          className="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
        />
      </div>

      <div className="space-y-8">
        {renderSection(isRtl ? 'الأطباء' : 'Doctors', doctors)}
        {renderSection(isRtl ? 'التمريض' : 'Nurses', nurses)}
        {renderSection(isRtl ? 'الفنيون وطاقم الوحدة' : 'Technicians & unit staff', staff)}
      </div>
    </div>
  );
}
