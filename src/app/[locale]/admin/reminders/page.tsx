'use client';

import React, { useState, useEffect } from 'react';
import { useLocale, useTranslations } from 'next-intl';

import Card from '@/components/ui/Card';
import Badge from '@/components/ui/Badge';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import Modal from '@/components/ui/Modal';
import LoadingSpinner from '@/components/ui/LoadingSpinner';

import type { ReminderTemplate, ReminderType } from '@/lib/types';
import {
  getReminderTemplates,
  updateReminderTemplate,
} from '../admin-store';
import {
  RemindersIcon,
  EditIcon,
  DialyCareLogo,
  CheckCircleIcon,
} from '../admin-icons';

export default function ReminderTemplatesPage() {
  const locale = useLocale();
  const isRtl = locale === 'ar';
  const tReminders = useTranslations('reminders');
  const tCommon = useTranslations('common');

  const [loading, setLoading] = useState(true);
  const [templates, setTemplates] = useState<ReminderTemplate[]>([]);

  // Edit Modal State
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<ReminderTemplate | null>(null);
  const [form, setForm] = useState({
    titleEn: '',
    titleAr: '',
    messageEn: '',
    messageAr: '',
    defaultTime: '08:00',
    isActive: true,
  });
  const [previewLanguage, setPreviewLanguage] = useState<'en' | 'ar'>('en');

  const loadTemplates = () => {
    try {
      const data = getReminderTemplates();
      setTemplates(data);
    } catch (err) {
      console.error('Failed to load reminder templates:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const timer = setTimeout(() => {
      loadTemplates();
    }, 0);
    return () => clearTimeout(timer);
  }, []);

  const handleOpenEdit = (template: ReminderTemplate) => {
    setEditingTemplate(template);
    setForm({
      titleEn: template.titleEn,
      titleAr: template.titleAr,
      messageEn: template.messageEn,
      messageAr: template.messageAr,
      defaultTime: template.defaultTime,
      isActive: template.isActive,
    });
    setPreviewLanguage(locale === 'ar' ? 'ar' : 'en');
    setEditModalOpen(true);
  };

  const handleToggleActive = (template: ReminderTemplate) => {
    const updated = updateReminderTemplate(template.id, {
      isActive: !template.isActive,
    });
    if (updated) {
      setTemplates(templates.map((t) => (t.id === template.id ? updated : t)));
    }
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingTemplate) return;

    const updated = updateReminderTemplate(editingTemplate.id, {
      titleEn: form.titleEn.trim(),
      titleAr: form.titleAr.trim(),
      messageEn: form.messageEn.trim(),
      messageAr: form.messageAr.trim(),
      defaultTime: form.defaultTime,
      isActive: form.isActive,
    });

    if (updated) {
      setTemplates(templates.map((t) => (t.id === editingTemplate.id ? updated : t)));
      setEditModalOpen(false);
    }
  };

  const getTypeBadge = (type: ReminderType) => {
    switch (type) {
      case 'ttt':
        return (
          <Badge variant="info" size="sm">
            {isRtl ? 'أدوية ومثبتات (TTT)' : 'Medication (TTT)'}
          </Badge>
        );
      case 'fluid':
        return (
          <Badge variant="warning" size="sm">
            {isRtl ? 'متابعة السوائل' : 'Fluid Quota'}
          </Badge>
        );
      case 'diet':
        return (
          <Badge variant="success" size="sm">
            {isRtl ? 'قائمة الغذاء' : 'Diet Log'}
          </Badge>
        );
      default:
        return <Badge variant="neutral" size="sm">{type}</Badge>;
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-3">
        <LoadingSpinner size="lg" />
        <p className="text-slate-500 text-sm font-medium">
          {tCommon('loading') || 'Loading reminder templates...'}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-in fade-in duration-150">
      {/* Header */}
      <div>
        <div className="flex items-center gap-2">
          <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 tracking-tight">
            {tReminders('title') || (isRtl ? 'نماذج التذكيرات الافتراضية' : 'Default Reminder Templates')}
          </h1>
          <Badge variant="neutral" size="sm">
            {templates.length} {isRtl ? 'نماذج' : 'Templates'}
          </Badge>
        </div>
        <p className="text-sm text-slate-500 mt-1">
          {isRtl
            ? 'تحديد وإدارة مواعيد ونصوص التنبيهات الدورية الموجهة للمرضى الجدد'
            : 'Configure baseline push alerts and timings assigned to new patients upon enrollment'}
        </p>
      </div>

      {/* Info Note Banner */}
      <div className="p-4 bg-blue-50 border border-blue-200 rounded-2xl flex items-start gap-3">
        <div className="text-xl shrink-0 mt-0.5">💡</div>
        <div>
          <h4 className="text-xs font-bold text-[#1e6bb8] uppercase tracking-wider">
            {isRtl ? 'ملاحظة سريرية هامة' : 'Clinical Policy Notice'}
          </h4>
          <p className="text-xs text-slate-700 mt-0.5 leading-relaxed">
            {isRtl
              ? 'التعديلات التي تجريها على هذه النماذج تطبق تلقائياً على المرضى الجدد عند تسجيلهم. يحتفظ المرضى المسجلون مسبقاً بجداولهم الخاصة ما لم يتم تعديلها يدوياً من ملفاتهم.'
              : 'Changes made to templates automatically apply to newly enrolled patients. Existing patients retain their customized schedules unless explicitly reset in their profile.'}
          </p>
        </div>
      </div>

      {/* Templates Table Card */}
      <Card className="overflow-hidden p-0">
        <div className="overflow-x-auto">
          <table className="w-full text-start text-sm border-collapse">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-xs font-bold text-slate-500 uppercase tracking-wider">
                <th className="py-3.5 px-4 text-start">{isRtl ? 'الفئة' : 'Category'}</th>
                <th className="py-3.5 px-4 text-start">{isRtl ? 'العنوان (إنجليزي)' : 'Title (EN)'}</th>
                <th className="py-3.5 px-4 text-start">{isRtl ? 'العنوان (عربي)' : 'Title (AR)'}</th>
                <th className="py-3.5 px-4 text-center">{isRtl ? 'الوقت الافتراضي' : 'Default Time'}</th>
                <th className="py-3.5 px-4 text-center">{isRtl ? 'الحالة' : 'Active'}</th>
                <th className="py-3.5 px-4 text-end">{isRtl ? 'إجراءات' : 'Actions'}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {templates.map((tpl) => (
                <tr key={tpl.id} className="hover:bg-slate-50 transition-colors">
                  <td className="py-3.5 px-4">
                    {getTypeBadge(tpl.type)}
                  </td>

                  <td className="py-3.5 px-4 font-semibold text-slate-900">
                    {tpl.titleEn}
                  </td>

                  <td className="py-3.5 px-4 font-semibold text-slate-700">
                    {tpl.titleAr}
                  </td>

                  <td className="py-3.5 px-4 text-center font-mono font-bold text-slate-800 text-xs">
                    <span className="px-2.5 py-1 bg-slate-100 rounded-lg border border-slate-200">
                      {tpl.defaultTime}
                    </span>
                  </td>

                  <td className="py-3.5 px-4 text-center">
                    <button
                      type="button"
                      onClick={() => handleToggleActive(tpl)}
                      className={`
                        w-10 h-5 inline-flex items-center rounded-full p-1 cursor-pointer transition-colors duration-200
                        ${tpl.isActive ? 'bg-emerald-500' : 'bg-slate-300'}
                      `}
                    >
                      <div
                        className={`
                          bg-white w-3.5 h-3.5 rounded-full shadow-md transform transition-transform duration-200
                          ${tpl.isActive ? 'translate-x-5 rtl:-translate-x-5' : 'translate-x-0'}
                        `}
                      />
                    </button>
                  </td>

                  <td className="py-3.5 px-4 text-end">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleOpenEdit(tpl)}
                      leftIcon={<EditIcon className="w-3.5 h-3.5" />}
                    >
                      {tCommon('edit') || (isRtl ? 'تعديل' : 'Edit')}
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Edit Template Modal with Live Push Notification Preview */}
      <Modal
        isOpen={editModalOpen}
        onClose={() => setEditModalOpen(false)}
        maxWidth="lg"
        title={
          <div className="flex items-center gap-2">
            <RemindersIcon className="w-5 h-5 text-[#1e6bb8]" />
            <span>
              {isRtl ? 'تعديل نموذج التذكير ومعاينة الإشعار' : 'Edit Reminder Template & Preview'}
            </span>
          </div>
        }
      >
        <form onSubmit={handleSave} className="space-y-5">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input
              label={isRtl ? 'عنوان التذكير (بالإنجليزية)' : 'Title (English)'}
              value={form.titleEn}
              onChange={(e) => setForm({ ...form, titleEn: e.target.value })}
              required
            />

            <Input
              label={isRtl ? 'عنوان التذكير (بالعربية)' : 'Title (Arabic)'}
              value={form.titleAr}
              onChange={(e) => setForm({ ...form, titleAr: e.target.value })}
              required
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-semibold text-slate-700">
                {isRtl ? 'نص التذكير (بالإنجليزية)' : 'Notification Message (English)'}
              </label>
              <textarea
                value={form.messageEn}
                onChange={(e) => setForm({ ...form, messageEn: e.target.value })}
                rows={3}
                required
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-xl focus:outline-none focus:border-[#1e6bb8]"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-semibold text-slate-700">
                {isRtl ? 'نص التذكير (بالعربية)' : 'Notification Message (Arabic)'}
              </label>
              <textarea
                value={form.messageAr}
                onChange={(e) => setForm({ ...form, messageAr: e.target.value })}
                rows={3}
                required
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-xl focus:outline-none focus:border-[#1e6bb8]"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-center">
            <Input
              label={isRtl ? 'الوقت الافتراضي المجدول' : 'Default Scheduled Time'}
              type="time"
              value={form.defaultTime}
              onChange={(e) => setForm({ ...form, defaultTime: e.target.value })}
              required
            />

            <div className="flex items-center gap-2 pt-5">
              <input
                type="checkbox"
                id="templateActiveCheck"
                checked={form.isActive}
                onChange={(e) => setForm({ ...form, isActive: e.target.checked })}
                className="w-4 h-4 text-[#1e6bb8] rounded"
              />
              <label htmlFor="templateActiveCheck" className="text-sm font-semibold text-slate-700 cursor-pointer">
                {isRtl ? 'النموذج مفعّل افتراضياً' : 'Enabled by default for new patients'}
              </label>
            </div>
          </div>

          {/* Live Phone Notification Preview Box */}
          <div className="pt-2">
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                {isRtl ? 'معاينة إشعار هاتف المريض:' : 'Patient Lock Screen Push Preview:'}
              </p>
              <div className="flex gap-1">
                <button
                  type="button"
                  onClick={() => setPreviewLanguage('en')}
                  className={`px-2 py-0.5 text-xs font-semibold rounded ${
                    previewLanguage === 'en'
                      ? 'bg-[#1e6bb8] text-white'
                      : 'bg-slate-100 text-slate-600'
                  }`}
                >
                  EN
                </button>
                <button
                  type="button"
                  onClick={() => setPreviewLanguage('ar')}
                  className={`px-2 py-0.5 text-xs font-semibold rounded ${
                    previewLanguage === 'ar'
                      ? 'bg-[#1e6bb8] text-white'
                      : 'bg-slate-100 text-slate-600'
                  }`}
                >
                  AR
                </button>
              </div>
            </div>

            <div
              className={`p-4 bg-slate-900 text-white rounded-2xl shadow-lg border border-slate-800 ${
                previewLanguage === 'ar' ? 'rtl text-right' : 'ltr text-left'
              }`}
              dir={previewLanguage === 'ar' ? 'rtl' : 'ltr'}
            >
              <div className="flex items-center justify-between text-[11px] text-slate-400 pb-2 border-b border-slate-800/80 mb-2">
                <div className="flex items-center gap-1.5">
                  <DialyCareLogo className="w-4 h-4" />
                  <span className="font-semibold text-slate-300">{previewLanguage === 'ar' ? 'وَصْلِتي' : 'Waslity'}</span>
                  <span>•</span>
                  <span>{form.defaultTime || '08:00'}</span>
                </div>
                <span>{isRtl ? 'الآن' : 'Now'}</span>
              </div>

              <h5 className="font-bold text-sm text-white">
                {previewLanguage === 'ar' ? form.titleAr || 'عنوان التنبيه' : form.titleEn || 'Reminder Title'}
              </h5>
              <p className="text-xs text-slate-300 mt-1 leading-relaxed">
                {previewLanguage === 'ar'
                  ? form.messageAr || 'نص التنبيه سيظهر هنا في هاتف المريض...'
                  : form.messageEn || 'Push alert notification text will appear here...'}
              </p>
            </div>
          </div>

          {/* Modal Actions */}
          <div className="flex items-center justify-end gap-2 pt-4 border-t border-slate-100">
            <Button variant="ghost" size="sm" onClick={() => setEditModalOpen(false)}>
              {tCommon('cancel') || 'Cancel'}
            </Button>
            <Button
              variant="primary"
              size="sm"
              type="submit"
              leftIcon={<CheckCircleIcon className="w-4 h-4" />}
            >
              {tCommon('save') || 'Save Template'}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
