'use client';

import React, { useState } from 'react';
import { Modal } from '@/components/ui/Modal';

export interface TemporaryPasswordModalProps {
  open: boolean;
  patientName: string;
  password: string;
  isRtl: boolean;
  onClose: () => void;
}

export function TemporaryPasswordModal({
  open,
  patientName,
  password,
  isRtl,
  onClose,
}: TemporaryPasswordModalProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard) {
        await navigator.clipboard.writeText(password);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }
    } catch {
      // Ignore clipboard write failure
    }
  };

  const title = isRtl ? 'كلمة مرور مؤقتة' : 'Temporary password';
  const bodyText = isRtl
    ? `أرسل كلمة المرور هذه إلى ${patientName} عبر واتساب. لن تظهر مرة أخرى.`
    : `Send this password to ${patientName} on WhatsApp. It is shown only once.`;
  const copyLabel = isRtl ? (copied ? 'تم النسخ' : 'نسخ') : copied ? 'Copied' : 'Copy';
  const doneLabel = isRtl ? 'تم' : 'Done';

  return (
    <Modal
      isOpen={open}
      onClose={onClose}
      title={title}
      maxWidth="md"
    >
      <div className="space-y-4 py-2" dir={isRtl ? 'rtl' : 'ltr'}>
        <p className="text-sm text-slate-600 dark:text-slate-300">
          {bodyText}
        </p>

        <div className="p-4 bg-slate-100 dark:bg-slate-800 rounded-lg text-center border border-slate-200 dark:border-slate-700">
          <span className="font-mono text-2xl font-bold tracking-widest text-slate-900 dark:text-slate-100 select-all">
            {password}
          </span>
        </div>

        <div className="flex items-center justify-end gap-3 pt-2">
          <button
            type="button"
            onClick={handleCopy}
            className="px-4 py-2 text-sm font-medium text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-700 transition"
          >
            {copyLabel}
          </button>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-white bg-teal-600 hover:bg-teal-700 rounded-lg transition"
          >
            {doneLabel}
          </button>
        </div>
      </div>
    </Modal>
  );
}

export default TemporaryPasswordModal;
