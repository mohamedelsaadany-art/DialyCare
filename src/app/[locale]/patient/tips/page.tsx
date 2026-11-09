'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { useAuth } from '@/lib/auth-context';
import { getCoachingTips } from '@/lib/data-store';
import type { CoachingTip, CoachingCategory } from '@/lib/types';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Input } from '@/components/ui/Input';

type FilterCategory = 'all' | CoachingCategory;

export default function PatientTipsPage() {
  const { user } = useAuth();
  const locale = useLocale();
  const isAr = locale === 'ar';

  const tTips = useTranslations('tips');

  const patientId = user?.uid || 'patient-1';
  const readTipsKey = `DIALYCARE_READ_TIPS_${patientId}`;

  const [tips, setTips] = useState<CoachingTip[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<FilterCategory>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [expandedTipIds, setExpandedTipIds] = useState<Record<string, boolean>>({});
  const [readTipIds, setReadTipIds] = useState<string[]>([]);

  useEffect(() => {
    const allTips = getCoachingTips().filter((t) => t.isActive);
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setTips(allTips);

    // Read stored read tips
    if (typeof window !== 'undefined') {
      try {
        const stored = window.localStorage.getItem(readTipsKey);
        if (stored) {
          setReadTipIds(JSON.parse(stored) as string[]);
        }
      } catch (e) {
        console.error('Error loading read tips:', e);
      }
    }
  }, [readTipsKey]);

  const toggleReadStatus = (tipId: string, e?: React.MouseEvent) => {
    e?.stopPropagation();
    setReadTipIds((prev) => {
      const isRead = prev.includes(tipId);
      const updated = isRead ? prev.filter((id) => id !== tipId) : [...prev, tipId];
      if (typeof window !== 'undefined') {
        window.localStorage.setItem(readTipsKey, JSON.stringify(updated));
      }
      return updated;
    });
  };

  const toggleExpandTip = (tipId: string) => {
    setExpandedTipIds((prev) => ({
      ...prev,
      [tipId]: !prev[tipId],
    }));

    // Auto mark as read when expanded
    if (!readTipIds.includes(tipId)) {
      setReadTipIds((prev) => {
        const updated = [...prev, tipId];
        if (typeof window !== 'undefined') {
          window.localStorage.setItem(readTipsKey, JSON.stringify(updated));
        }
        return updated;
      });
    }
  };

  // Rotating Tip of the Day based on day of year
  const tipOfTheDay = useMemo(() => {
    if (tips.length === 0) return null;
    const now = new Date();
    const dayOfYear = Math.floor(
      (now.getTime() - new Date(now.getFullYear(), 0, 0).getTime()) / (1000 * 60 * 60 * 24)
    );
    const index = Math.abs(dayOfYear) % tips.length;
    return tips[index];
  }, [tips]);

  // Categories list per specification: All | Diet 🥗 | Fluid 💧 | Medication 💊 | General 📋
  const categories: { key: FilterCategory; label: string; icon: string }[] = [
    { key: 'all', label: isAr ? 'الكل' : 'All', icon: '📋' },
    { key: 'diet', label: isAr ? 'التغذية' : 'Diet', icon: '🥗' },
    { key: 'fluid', label: isAr ? 'السوائل' : 'Fluid', icon: '💧' },
    { key: 'medication', label: isAr ? 'الأدوية' : 'Medication', icon: '💊' },
    { key: 'general', label: isAr ? 'عام' : 'General', icon: '📋' },
  ];

  // Filtered tips
  const filteredTips = useMemo(() => {
    return tips.filter((tip) => {
      const matchesCategory = selectedCategory === 'all' || tip.category === selectedCategory;
      const title = isAr ? tip.titleAr : tip.titleEn;
      const content = isAr ? tip.contentAr : tip.contentEn;
      const q = searchQuery.trim().toLowerCase();
      const matchesSearch =
        !q ||
        title.toLowerCase().includes(q) ||
        content.toLowerCase().includes(q) ||
        tip.category.toLowerCase().includes(q);

      return matchesCategory && matchesSearch;
    });
  }, [tips, selectedCategory, searchQuery, isAr]);

  const getCategoryBadgeVariant = (category: CoachingCategory) => {
    switch (category) {
      case 'diet':
        return 'success';
      case 'fluid':
        return 'info';
      case 'medication':
        return 'warning';
      case 'general':
      default:
        return 'neutral';
    }
  };

  const getCategoryIcon = (category: CoachingCategory) => {
    switch (category) {
      case 'diet':
        return '🥗';
      case 'fluid':
        return '💧';
      case 'medication':
        return '💊';
      case 'general':
      default:
        return '📋';
    }
  };

  return (
    <div className="space-y-5 animate-in fade-in duration-200">
      {/* Page Header */}
      <div className="flex flex-col gap-1">
        <h1 className="text-xl font-black text-slate-900 tracking-tight">
          {tTips('title') || (isAr ? 'نصائح التثقيف الكلوي' : 'Renal Coaching Tips')}
        </h1>
        <p className="text-xs text-slate-500 font-medium">
          {isAr
            ? 'إرشادات طبية يومية لمساعدتك على الالتزام بالعلاج وتجنب المضاعفات'
            : 'Daily clinical advice to improve dialysis adherence and wellness'}
        </p>
      </div>

      {/* Featured: Tip of the Day Card */}
      {tipOfTheDay && (
        <Card className="p-5 bg-gradient-to-br from-blue-50 via-emerald-50 to-white border-2 border-[#1e6bb8]/40 rounded-3xl shadow-sm relative overflow-hidden">
          <div className="flex items-center justify-between gap-2 mb-2.5">
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#1e6bb8] text-white text-xs font-black shadow-xs">
              <span>⭐</span>
              <span>{tTips('tipOfDay') || (isAr ? 'نصيحة اليوم' : 'Tip of the Day')}</span>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant={getCategoryBadgeVariant(tipOfTheDay.category)} size="sm" className="font-extrabold uppercase">
                {getCategoryIcon(tipOfTheDay.category)} {tipOfTheDay.category}
              </Badge>
              {readTipIds.includes(tipOfTheDay.id) && (
                <span className="text-xs font-black text-emerald-600 flex items-center gap-0.5">
                  ✓ {isAr ? 'مقروءة' : 'Read'}
                </span>
              )}
            </div>
          </div>

          <h2 className="text-base font-black text-slate-900 leading-snug">
            {isAr ? tipOfTheDay.titleAr : tipOfTheDay.titleEn}
          </h2>

          <p className="text-sm text-slate-700 mt-2 leading-relaxed font-normal">
            {isAr ? tipOfTheDay.contentAr : tipOfTheDay.contentEn}
          </p>

          <div className="mt-4 pt-3 border-t border-slate-200/60 flex items-center justify-between">
            <span className="text-xs text-slate-500 font-medium">
              {isAr ? 'تتجدد النصيحة تلقائياً كل يوم' : 'Rotates daily based on date'}
            </span>
            <button
              type="button"
              onClick={(e) => toggleReadStatus(tipOfTheDay.id, e)}
              className="min-h-[48px] px-3 py-2 text-xs font-extrabold text-[#1e6bb8] hover:bg-blue-50 rounded-xl transition-colors cursor-pointer flex items-center"
            >
              {readTipIds.includes(tipOfTheDay.id)
                ? (isAr ? 'إلغاء وضع القراءة' : 'Mark as unread')
                : (isAr ? 'وضع علامة مقروءة ✓' : 'Mark as read ✓')}
            </button>
          </div>
        </Card>
      )}

      {/* Search Input */}
      <div>
        <Input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder={
            tTips('tipSearchPlaceholder') ||
            (isAr ? 'ابحث في النصائح (بوتاسيوم، صوديوم، سوائل...)' : 'Search tips (potassium, fluid, binders...)')
          }
          leftIcon={
            <svg className="w-5 h-5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
          }
        />
      </div>

      {/* Category Filter Pills (Horizontal Scrollable) */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1.5 scrollbar-none select-none">
        {categories.map((cat) => {
          const isSelected = selectedCategory === cat.key;
          return (
            <button
              key={cat.key}
              type="button"
              onClick={() => setSelectedCategory(cat.key)}
              className={`
                min-h-[48px] px-4 py-2 rounded-2xl text-xs sm:text-sm font-extrabold shrink-0 flex items-center gap-1.5 transition-all cursor-pointer
                ${
                  isSelected
                    ? 'bg-[#1e6bb8] text-white shadow-xs scale-102'
                    : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-50'
                }
              `}
            >
              <span>{cat.icon}</span>
              <span>{cat.label}</span>
            </button>
          );
        })}
      </div>

      {/* Tips List */}
      <div className="space-y-3">
        {filteredTips.length === 0 ? (
          <Card className="p-8 text-center bg-white rounded-3xl border border-slate-200">
            <span className="text-3xl">🔍</span>
            <p className="text-sm font-bold text-slate-700 mt-2">
              {isAr ? 'لا توجد نصائح مطابقة لبحثك' : 'No coaching tips match your filter'}
            </p>
            <p className="text-xs text-slate-500 mt-1">
              {isAr ? 'جرب البحث بكلمات أخرى أو اختر فئة مختلفة' : 'Try searching different terms'}
            </p>
          </Card>
        ) : (
          filteredTips.map((tip) => {
            const isExpanded = Boolean(expandedTipIds[tip.id]);
            const isRead = readTipIds.includes(tip.id);
            const title = isAr ? tip.titleAr : tip.titleEn;
            const content = isAr ? tip.contentAr : tip.contentEn;

            return (
              <div
                key={tip.id}
                role="button"
                tabIndex={0}
                onClick={() => toggleExpandTip(tip.id)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    toggleExpandTip(tip.id);
                  }
                }}
                className={`
                  p-4 rounded-2xl border transition-all duration-150 cursor-pointer shadow-xs select-none
                  focus:outline-none focus-visible:ring-2 focus-visible:ring-[#1e6bb8] min-h-[58px]
                  ${
                    isExpanded
                      ? 'bg-blue-50/40 border-[#1e6bb8]/60 ring-1 ring-[#1e6bb8]/20'
                      : 'bg-white border-slate-200 hover:border-[#1e6bb8]/50'
                  }
                `}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="space-y-1 flex-1">
                    <div className="flex items-center gap-2">
                      <Badge variant={getCategoryBadgeVariant(tip.category)} size="sm" className="font-extrabold uppercase">
                        {getCategoryIcon(tip.category)} {tip.category}
                      </Badge>
                      {isRead && (
                        <span className="text-[11px] font-black text-emerald-600 flex items-center gap-0.5">
                          ✓ {isAr ? 'مقروءة' : 'Read'}
                        </span>
                      )}
                    </div>
                    <h3 className="text-base font-extrabold text-slate-900 leading-snug pt-0.5">
                      {title}
                    </h3>
                  </div>

                  <span className="text-slate-400 text-sm mt-1 shrink-0 font-mono">
                    {isExpanded ? '▲' : '▼'}
                  </span>
                </div>

                <div className="mt-2 text-sm text-slate-600 leading-relaxed">
                  {isExpanded ? (
                    <p className="animate-in fade-in duration-150 font-medium">{content}</p>
                  ) : (
                    <p className="line-clamp-2">{content}</p>
                  )}
                </div>

                <div className="mt-3 pt-2.5 border-t border-slate-100 flex items-center justify-between text-xs">
                  <span className="font-bold text-[#1e6bb8]">
                    {isExpanded
                      ? isAr
                        ? 'إغلاق التفاصيل ▲'
                        : 'Collapse advice ▲'
                      : isAr
                      ? 'اضغط لقراءة النصيحة كاملة ▼'
                      : 'Tap to read full tip ▼'}
                  </span>

                  <button
                    type="button"
                    onClick={(e) => toggleReadStatus(tip.id, e)}
                    className="min-h-[48px] px-3 py-1.5 text-slate-600 hover:text-slate-900 font-bold cursor-pointer rounded-lg hover:bg-slate-100 transition-colors flex items-center"
                  >
                    {isRead
                      ? (isAr ? 'إلغاء القراءة' : 'Unread')
                      : (isAr ? 'وضع علامة مقروءة' : 'Mark Read')}
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
