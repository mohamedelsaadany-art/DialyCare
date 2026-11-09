'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { useLocale, useTranslations } from 'next-intl';

import Card from '@/components/ui/Card';
import Badge from '@/components/ui/Badge';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import Modal from '@/components/ui/Modal';
import LoadingSpinner from '@/components/ui/LoadingSpinner';

import type { CoachingTip, CoachingCategory } from '@/lib/types';
import {
  getCoachingTips,
  addCoachingTip,
  updateCoachingTip,
  deleteCoachingTip,
} from '../admin-store';
import {
  TipsIcon,
  PlusIcon,
  EditIcon,
  TrashIcon,
  CheckCircleIcon,
} from '../admin-icons';

type TabCategory = 'all' | CoachingCategory;

export default function CoachingTipsManagerPage() {
  const locale = useLocale();
  const isRtl = locale === 'ar';
  const tTips = useTranslations('tips');
  const tCommon = useTranslations('common');

  const [loading, setLoading] = useState(true);
  const [tips, setTips] = useState<CoachingTip[]>([]);
  const [activeTab, setActiveTab] = useState<TabCategory>('all');

  // Modal State for Add / Edit
  const [modalOpen, setModalOpen] = useState(false);
  const [editingTip, setEditingTip] = useState<CoachingTip | null>(null);

  // Form State
  const [formCategory, setFormCategory] = useState<CoachingCategory>('diet');
  const [formTitleEn, setFormTitleEn] = useState('');
  const [formTitleAr, setFormTitleAr] = useState('');
  const [formContentEn, setFormContentEn] = useState('');
  const [formContentAr, setFormContentAr] = useState('');
  const [formOrder, setFormOrder] = useState('1');
  const [formIsActive, setFormIsActive] = useState(true);
  const [formError, setFormError] = useState('');

  // Delete Confirmation Modal
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [tipToDelete, setTipToDelete] = useState<CoachingTip | null>(null);

  const loadTips = () => {
    try {
      const data = getCoachingTips();
      // Sort by order ascending
      data.sort((a, b) => a.order - b.order);
      setTips(data);
    } catch (err) {
      console.error('Failed to load coaching tips:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const timer = setTimeout(() => {
      loadTips();
    }, 0);
    return () => clearTimeout(timer);
  }, []);

  // Filtered tips by active category tab
  const filteredTips = useMemo(() => {
    if (activeTab === 'all') return tips;
    return tips.filter((t) => t.category === activeTab);
  }, [tips, activeTab]);

  // Tab counts
  const categoryCounts = useMemo(() => {
    return {
      all: tips.length,
      diet: tips.filter((t) => t.category === 'diet').length,
      fluid: tips.filter((t) => t.category === 'fluid').length,
      medication: tips.filter((t) => t.category === 'medication').length,
      general: tips.filter((t) => t.category === 'general').length,
    };
  }, [tips]);

  const handleOpenAdd = () => {
    setEditingTip(null);
    setFormCategory(activeTab === 'all' ? 'diet' : activeTab);
    setFormTitleEn('');
    setFormTitleAr('');
    setFormContentEn('');
    setFormContentAr('');
    setFormOrder(`${tips.length + 1}`);
    setFormIsActive(true);
    setFormError('');
    setModalOpen(true);
  };

  const handleOpenEdit = (tip: CoachingTip) => {
    setEditingTip(tip);
    setFormCategory(tip.category);
    setFormTitleEn(tip.titleEn);
    setFormTitleAr(tip.titleAr);
    setFormContentEn(tip.contentEn);
    setFormContentAr(tip.contentAr);
    setFormOrder(`${tip.order}`);
    setFormIsActive(tip.isActive);
    setFormError('');
    setModalOpen(true);
  };

  const handleToggleActive = (tip: CoachingTip) => {
    const updated = updateCoachingTip(tip.id, { isActive: !tip.isActive });
    if (updated) {
      setTips(tips.map((t) => (t.id === tip.id ? updated : t)));
    }
  };

  const handleSaveTip = (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');

    if (!formTitleEn.trim() || !formTitleAr.trim()) {
      setFormError(isRtl ? 'يرجى إدخال العنوان باللغتين' : 'Title in both English and Arabic is required');
      return;
    }

    if (!formContentEn.trim() || !formContentAr.trim()) {
      setFormError(isRtl ? 'يرجى إدخال محتوى النصيحة باللغتين' : 'Content in both English and Arabic is required');
      return;
    }

    const orderNum = parseInt(formOrder, 10) || 1;

    if (editingTip) {
      // Update
      const updated = updateCoachingTip(editingTip.id, {
        category: formCategory,
        titleEn: formTitleEn.trim(),
        titleAr: formTitleAr.trim(),
        contentEn: formContentEn.trim(),
        contentAr: formContentAr.trim(),
        order: orderNum,
        isActive: formIsActive,
      });

      if (updated) {
        setTips(tips.map((t) => (t.id === editingTip.id ? updated : t)));
        setModalOpen(false);
      }
    } else {
      // Add
      const newTip: CoachingTip = {
        id: `tip_${formCategory}_${Date.now()}`,
        category: formCategory,
        titleEn: formTitleEn.trim(),
        titleAr: formTitleAr.trim(),
        contentEn: formContentEn.trim(),
        contentAr: formContentAr.trim(),
        order: orderNum,
        isActive: formIsActive,
      };

      const created = addCoachingTip(newTip);
      setTips([...tips, created]);
      setModalOpen(false);
    }
  };

  const handleOpenDelete = (tip: CoachingTip) => {
    setTipToDelete(tip);
    setDeleteModalOpen(true);
  };

  const handleConfirmDelete = () => {
    if (!tipToDelete) return;
    deleteCoachingTip(tipToDelete.id);
    setTips(tips.filter((t) => t.id !== tipToDelete.id));
    setDeleteModalOpen(false);
    setTipToDelete(null);
  };

  const getCategoryBadge = (category: CoachingCategory) => {
    switch (category) {
      case 'diet':
        return (
          <Badge variant="success" size="sm">
            {isRtl ? 'التغذية والكلى' : 'Diet & Renal'}
          </Badge>
        );
      case 'fluid':
        return (
          <Badge variant="warning" size="sm">
            {isRtl ? 'إدارة السوائل' : 'Fluid Quota'}
          </Badge>
        );
      case 'medication':
        return (
          <Badge variant="info" size="sm">
            {isRtl ? 'الأدوية والمثبتات' : 'Prescription Care'}
          </Badge>
        );
      case 'general':
        return (
          <Badge variant="neutral" size="sm">
            {isRtl ? 'إرشادات عامة' : 'Lifestyle & Access'}
          </Badge>
        );
      default:
        return <Badge variant="neutral" size="sm">{category}</Badge>;
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-3">
        <LoadingSpinner size="lg" />
        <p className="text-slate-500 text-sm font-medium">
          {tCommon('loading') || 'Loading coaching tips...'}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-in fade-in duration-150">
      {/* Header & Primary Add Button */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 tracking-tight">
              {tTips('title') || (isRtl ? 'مكتبة التوجيه الصحي الكلوي' : 'Renal Health Coaching Library')}
            </h1>
            <Badge variant="neutral" size="sm">
              {tips.length} {isRtl ? 'نصيحة' : 'Tips'}
            </Badge>
          </div>
          <p className="text-sm text-slate-500 mt-1">
            {isRtl
              ? 'إدارة النصائح التثقيفية اليومية الموجهة للمرضى حول السوائل والغذاء والأدوية'
              : 'Curate daily evidence-based guidance cards presented on patient home dashboards'}
          </p>
        </div>

        <div>
          <Button
            variant="primary"
            size="md"
            onClick={handleOpenAdd}
            leftIcon={<PlusIcon className="w-4 h-4" />}
          >
            {isRtl ? 'إضافة نصيحة جديدة' : 'Add Coaching Tip'}
          </Button>
        </div>
      </div>

      {/* Category Navigation Tabs */}
      <div className="flex items-center gap-2 overflow-x-auto pb-2 border-b border-slate-200">
        {[
          { key: 'all' as TabCategory, labelEn: 'All Tips', labelAr: 'الكل' },
          { key: 'diet' as TabCategory, labelEn: 'Renal Nutrition', labelAr: 'التغذية' },
          { key: 'fluid' as TabCategory, labelEn: 'Fluid Control', labelAr: 'السوائل' },
          { key: 'medication' as TabCategory, labelEn: 'Medication', labelAr: 'الأدوية' },
          { key: 'general' as TabCategory, labelEn: 'General & Access', labelAr: 'إرشادات عامة' },
        ].map((tab) => {
          const count = categoryCounts[tab.key];
          const isActive = activeTab === tab.key;

          return (
            <button
              key={tab.key}
              type="button"
              onClick={() => setActiveTab(tab.key)}
              className={`
                inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold whitespace-nowrap transition-colors cursor-pointer
                ${
                  isActive
                    ? 'bg-[#1e6bb8] text-white shadow-xs'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                }
              `}
            >
              <span>{isRtl ? tab.labelAr : tab.labelEn}</span>
              <span
                className={`
                  text-xs px-2 py-0.5 rounded-full font-mono
                  ${isActive ? 'bg-white/20 text-white' : 'bg-slate-200/80 text-slate-700'}
                `}
              >
                {count}
              </span>
            </button>
          );
        })}
      </div>

      {/* Tips Grid */}
      {filteredTips.length === 0 ? (
        <div className="text-center py-16 bg-white rounded-2xl border border-slate-200 p-8">
          <TipsIcon className="w-12 h-12 text-slate-300 mx-auto mb-3" />
          <h3 className="text-base font-bold text-slate-800">
            {isRtl ? 'لا توجد نصائح في هذا القسم' : 'No tips found in this category'}
          </h3>
          <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
            {isRtl ? 'يمكنك إضافة نصيحة جديدة الآن بالنقر على الزر أعلاه' : 'Click "Add Coaching Tip" to create a new clinical advice entry.'}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredTips.map((tip) => {
            const displayTitle = isRtl ? tip.titleAr : tip.titleEn;
            const subtitle = isRtl ? tip.titleEn : tip.titleAr;
            const displayContent = isRtl ? tip.contentAr : tip.contentEn;

            return (
              <Card
                key={tip.id}
                className={`
                  flex flex-col justify-between hover:border-[#1e6bb8]/40 transition-all duration-150
                  ${!tip.isActive ? 'opacity-60 bg-slate-50/70' : 'bg-white'}
                `}
              >
                <div className="space-y-3">
                  {/* Card Header: Category + Order + Status Switch */}
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5">
                      {getCategoryBadge(tip.category)}
                      <span className="text-xs font-mono font-bold text-slate-400">
                        #{tip.order}
                      </span>
                    </div>

                    <button
                      type="button"
                      onClick={() => handleToggleActive(tip)}
                      title={tip.isActive ? 'Active' : 'Inactive'}
                      className={`
                        w-9 h-5 flex items-center rounded-full p-1 cursor-pointer transition-colors duration-200
                        ${tip.isActive ? 'bg-emerald-500' : 'bg-slate-300'}
                      `}
                    >
                      <div
                        className={`
                          bg-white w-3 h-3 rounded-full shadow-xs transform transition-transform duration-200
                          ${tip.isActive ? 'translate-x-4 rtl:-translate-x-4' : 'translate-x-0'}
                        `}
                      />
                    </button>
                  </div>

                  {/* Title */}
                  <div>
                    <h3 className="text-base font-bold text-slate-900 leading-snug">
                      {displayTitle}
                    </h3>
                    <p className="text-xs text-slate-400 mt-0.5 line-clamp-1">{subtitle}</p>
                  </div>

                  {/* Content Preview */}
                  <p className="text-xs text-slate-600 leading-relaxed line-clamp-4">
                    {displayContent}
                  </p>
                </div>

                {/* Footer Actions */}
                <div className="pt-4 border-t border-slate-100 flex items-center justify-between mt-4">
                  <span className="text-[11px] text-slate-400 font-mono">
                    {tip.id}
                  </span>

                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => handleOpenEdit(tip)}
                      className="p-1.5 text-slate-500 hover:text-[#1e6bb8] hover:bg-blue-50 rounded-lg transition-colors cursor-pointer"
                      title={tCommon('edit') || 'Edit'}
                    >
                      <EditIcon className="w-4 h-4" />
                    </button>

                    <button
                      type="button"
                      onClick={() => handleOpenDelete(tip)}
                      className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors cursor-pointer"
                      title={tCommon('delete') || 'Delete'}
                    >
                      <TrashIcon className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {/* Add / Edit Tip Modal */}
      <Modal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        maxWidth="lg"
        title={
          <div className="flex items-center gap-2">
            <TipsIcon className="w-5 h-5 text-[#1e6bb8]" />
            <span>
              {editingTip
                ? isRtl ? 'تعديل النصيحة التوعوية' : 'Edit Coaching Tip'
                : isRtl ? 'إضافة نصيحة توعوية جديدة' : 'Add New Coaching Tip'}
            </span>
          </div>
        }
      >
        <form onSubmit={handleSaveTip} className="space-y-4">
          {formError && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-red-700 text-xs font-semibold">
              {formError}
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-semibold text-slate-700">
                {isRtl ? 'فئة النصيحة' : 'Tip Category'}
              </label>
              <select
                value={formCategory}
                onChange={(e) => setFormCategory(e.target.value as CoachingCategory)}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-xl bg-white focus:outline-none focus:border-[#1e6bb8]"
              >
                <option value="diet">{isRtl ? 'التغذية والكلى (Diet)' : 'Renal Diet'}</option>
                <option value="fluid">{isRtl ? 'إدارة السوائل (Fluid)' : 'Fluid Management'}</option>
                <option value="medication">{isRtl ? 'الأدوية والمثبتات (Medication)' : 'Prescription Care'}</option>
                <option value="general">{isRtl ? 'إرشادات عامة والناسور (General)' : 'Lifestyle & Fistula'}</option>
              </select>
            </div>

            <Input
              label={isRtl ? 'ترتيب الظهور' : 'Display Sequence Order'}
              type="number"
              value={formOrder}
              onChange={(e) => setFormOrder(e.target.value)}
              required
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input
              label={isRtl ? 'العنوان (بالإنجليزية)' : 'Title (English)'}
              value={formTitleEn}
              onChange={(e) => setFormTitleEn(e.target.value)}
              placeholder="e.g. Mastering Potassium Control"
              required
            />

            <Input
              label={isRtl ? 'العنوان (بالعربية)' : 'Title (Arabic)'}
              value={formTitleAr}
              onChange={(e) => setFormTitleAr(e.target.value)}
              placeholder="مثال: التحكم الذكي في مستوى البوتاسيوم"
              required
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-semibold text-slate-700">
                {isRtl ? 'المحتوى (بالإنجليزية)' : 'Content (English)'}
              </label>
              <textarea
                value={formContentEn}
                onChange={(e) => setFormContentEn(e.target.value)}
                rows={4}
                required
                placeholder="Full clinical advice for patients..."
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-xl focus:outline-none focus:border-[#1e6bb8]"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-semibold text-slate-700">
                {isRtl ? 'المحتوى (بالعربية)' : 'Content (Arabic)'}
              </label>
              <textarea
                value={formContentAr}
                onChange={(e) => setFormContentAr(e.target.value)}
                rows={4}
                required
                placeholder="النصيحة الطبية الكاملة بالعربية للمريض..."
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-xl focus:outline-none focus:border-[#1e6bb8]"
              />
            </div>
          </div>

          <div className="flex items-center gap-2 pt-2">
            <input
              type="checkbox"
              id="tipActiveCheck"
              checked={formIsActive}
              onChange={(e) => setFormIsActive(e.target.checked)}
              className="w-4 h-4 text-[#1e6bb8] rounded"
            />
            <label htmlFor="tipActiveCheck" className="text-sm font-semibold text-slate-700 cursor-pointer">
              {isRtl ? 'النصيحة مفعّلة ومعروضة للمرضى' : 'Tip is active and visible to patients'}
            </label>
          </div>

          <div className="flex items-center justify-end gap-2 pt-4 border-t border-slate-100">
            <Button variant="ghost" size="sm" onClick={() => setModalOpen(false)}>
              {tCommon('cancel') || 'Cancel'}
            </Button>
            <Button
              variant="primary"
              size="sm"
              type="submit"
              leftIcon={<CheckCircleIcon className="w-4 h-4" />}
            >
              {editingTip
                ? tCommon('save') || 'Save Changes'
                : isRtl ? 'إضافة النصيحة' : 'Create Tip'}
            </Button>
          </div>
        </form>
      </Modal>

      {/* Delete Confirmation Modal */}
      <Modal
        isOpen={deleteModalOpen}
        onClose={() => setDeleteModalOpen(false)}
        title={isRtl ? 'تأكيد حذف النصيحة' : 'Confirm Tip Deletion'}
      >
        <div className="space-y-4">
          <p className="text-sm text-slate-600">
            {isRtl
              ? `هل أنت متأكد من رغبتك في حذف النصيحة "${tipToDelete?.titleAr || tipToDelete?.titleEn}"؟ لن تظهر للمرضى بعد الآن.`
              : `Are you sure you want to permanently remove "${tipToDelete?.titleEn}"? It will no longer appear on patient feeds.`}
          </p>

          <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
            <Button variant="ghost" size="sm" onClick={() => setDeleteModalOpen(false)}>
              {tCommon('cancel') || 'Cancel'}
            </Button>
            <Button variant="danger" size="sm" onClick={handleConfirmDelete}>
              {tCommon('delete') || 'Delete Tip'}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
