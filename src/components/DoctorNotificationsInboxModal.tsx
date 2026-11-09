'use client';

import React from 'react';
import { useLocale } from 'next-intl';
import { Modal } from '@/components/ui/Modal';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import type { Notification } from '@/lib/types';

interface DoctorNotificationsInboxModalProps {
  isOpen: boolean;
  onClose: () => void;
  notifications: Notification[];
  readIds: string[];
  onMarkAsRead: (id: string) => void;
  onMarkAllAsRead: () => void;
  selectedNotificationId?: string | null;
}

export function DoctorNotificationsInboxModal({
  isOpen,
  onClose,
  notifications,
  readIds,
  onMarkAsRead,
  onMarkAllAsRead,
  selectedNotificationId,
}: DoctorNotificationsInboxModalProps) {
  const locale = useLocale();
  const isAr = locale === 'ar';

  const readSet = React.useMemo(() => new Set(readIds), [readIds]);
  const unreadCount = React.useMemo(
    () => notifications.filter((n) => !readSet.has(n.id)).length,
    [notifications, readSet]
  );

  const itemRefs = React.useRef<Record<string, HTMLElement | null>>({});

  React.useEffect(() => {
    if (isOpen && selectedNotificationId && itemRefs.current[selectedNotificationId]) {
      const timer = setTimeout(() => {
        itemRefs.current[selectedNotificationId]?.scrollIntoView({
          behavior: 'smooth',
          block: 'nearest',
        });
      }, 150);
      return () => clearTimeout(timer);
    }
  }, [isOpen, selectedNotificationId]);

  const formatTimestamp = (dateStr?: string | Date | null) => {
    if (!dateStr) return isAr ? 'اليوم' : 'Today';
    try {
      const d = new Date(dateStr);
      if (isNaN(d.getTime())) return isAr ? 'اليوم' : 'Today';
      return new Intl.DateTimeFormat(isAr ? 'ar-EG' : 'en-US', {
        dateStyle: 'medium',
        timeStyle: 'short',
      }).format(d);
    } catch {
      return isAr ? 'اليوم' : 'Today';
    }
  };

  const getTypeBadge = (type: Notification['type']) => {
    switch (type) {
      case 'broadcast':
        return (
          <Badge variant="neutral" size="sm" className="font-bold">
            {isAr ? '📢 تعميم عام' : '📢 Broadcast'}
          </Badge>
        );
      case 'group':
        return (
          <Badge variant="info" size="sm" className="font-bold">
            {isAr ? '👥 مجموعة الوردية' : '👥 Shift Group'}
          </Badge>
        );
      case 'individual':
      default:
        return (
          <Badge variant="warning" size="sm" className="font-bold">
            {isAr ? '🔒 رسالة خاصة' : '🔒 Direct Message'}
          </Badge>
        );
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      maxWidth="lg"
      title={
        <div className="flex items-center gap-2.5">
          <span className="text-2xl" role="img" aria-label="Messages">
            🩺
          </span>
          <div className="flex items-center gap-2">
            <span>{isAr ? 'رسائل الفريق الطبي' : 'Clinical Team Messages'}</span>
            {unreadCount > 0 ? (
              <span className="bg-red-500 text-white text-xs font-black px-2 py-0.5 rounded-full ring-2 ring-white">
                {unreadCount} {isAr ? 'جديد' : 'new'}
              </span>
            ) : (
              <Badge variant="success" size="sm">
                {isAr ? 'تمت قراءة الكل' : 'All Read'}
              </Badge>
            )}
          </div>
        </div>
      }
      description={
        isAr
          ? 'التوجيهات السريرية والتنبيهات المباشرة المرسلة من أطباء وتمريض وحدة الغسيل الكلوي'
          : 'Clinical updates, urgent reminders, and instructions from your nephrology care team'
      }
      footer={
        <div className="w-full flex items-center justify-between gap-3">
          {unreadCount > 0 ? (
            <Button
              variant="outline"
              size="sm"
              onClick={onMarkAllAsRead}
              className="font-bold text-xs"
            >
              {isAr ? 'تحديد الكل كمقروء ✓✓' : 'Mark All as Read ✓✓'}
            </Button>
          ) : (
            <div />
          )}
          <Button variant="secondary" size="md" onClick={onClose} className="font-bold">
            {isAr ? 'إغلاق' : 'Close'}
          </Button>
        </div>
      }
    >
      <div className="space-y-3.5 max-h-[60vh] overflow-y-auto pr-1">
        {notifications.length === 0 ? (
          <div className="text-center py-12 px-4 rounded-2xl bg-slate-50 border border-dashed border-slate-200">
            <span className="text-4xl block mb-2" role="img" aria-label="Inbox">
              📬
            </span>
            <h4 className="text-sm font-extrabold text-slate-800">
              {isAr ? 'صندوق الرسائل فارغ' : 'No messages yet'}
            </h4>
            <p className="text-xs text-slate-500 mt-1 max-w-xs mx-auto">
              {isAr
                ? 'ستظهر هنا جميع التنبيهات والإعلانات الصادرة من طبيب الكلى المعالج فور إرسالها.'
                : 'Any updates or announcements from your dialysis care team will appear right here.'}
            </p>
          </div>
        ) : (
          notifications.map((n) => {
            const isRead = readSet.has(n.id);
            const isHighlighted = selectedNotificationId === n.id;
            const title = isAr ? n.titleAr || n.titleEn : n.titleEn || n.titleAr;
            const message = isAr ? n.messageAr || n.messageEn : n.messageEn || n.messageAr;

            return (
              <article
                key={n.id}
                ref={(el) => {
                  itemRefs.current[n.id] = el;
                }}
                className={`p-4 rounded-2xl border transition-all duration-150 relative ${
                  isHighlighted
                    ? 'ring-2 ring-[#1e6bb8] bg-blue-50/70 border-blue-300 shadow-md'
                    : isRead
                    ? 'bg-slate-50/70 border-slate-200 text-slate-700'
                    : 'bg-white border-blue-200/90 shadow-xs'
                }`}
              >
                {/* Header row */}
                <div className="flex items-start justify-between gap-2 mb-2">
                  <div className="flex items-center gap-2 flex-wrap">
                    {getTypeBadge(n.type)}
                    {!isRead ? (
                      <span className="inline-flex items-center gap-1 text-[11px] font-black text-red-600 bg-red-50 border border-red-200 px-2 py-0.5 rounded-full">
                        <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-ping" />
                        {isAr ? 'رسالة جديدة' : 'New'}
                      </span>
                    ) : (
                      <span className="text-[11px] font-semibold text-slate-400">
                        {isAr ? 'تمت القراءة' : 'Read'}
                      </span>
                    )}
                  </div>

                  <time
                    dateTime={typeof n.sentAt === 'string' ? n.sentAt : n.sentAt.toISOString()}
                    className="text-[11px] text-slate-400 font-medium shrink-0"
                  >
                    {formatTimestamp(n.sentAt)}
                  </time>
                </div>

                {/* Content */}
                <h3 className="text-base font-black text-slate-900 tracking-tight leading-snug">
                  {title}
                </h3>
                <p className="text-xs text-slate-600 mt-1.5 leading-relaxed whitespace-pre-line font-medium">
                  {message}
                </p>

                {/* Sender & Action footer */}
                <div className="mt-3 pt-3 border-t border-slate-100 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-1.5 text-[11px] text-slate-500 font-semibold">
                    <span>👨‍⚕️</span>
                    <span>{isAr ? 'الفريق الطبي المعالج' : 'Dialysis Care Team'}</span>
                  </div>

                  {!isRead && (
                    <Button
                      size="sm"
                      variant="primary"
                      onClick={() => onMarkAsRead(n.id)}
                      className="font-extrabold text-xs min-h-[36px]"
                    >
                      {isAr ? 'تم القراءة ✓' : 'Mark as Read ✓'}
                    </Button>
                  )}
                </div>
              </article>
            );
          })
        )}
      </div>
    </Modal>
  );
}

export default DoctorNotificationsInboxModal;
