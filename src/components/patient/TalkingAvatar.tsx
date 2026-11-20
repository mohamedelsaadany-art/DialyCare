'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { PatientAvatarSvg } from '@/components/avatar/PatientAvatarPresets';
import { CLINICAL_12_LAB_TESTS } from '@/components/admin/PatientLabResultsModal';
import {
  getAdherenceLogs,
  getCoachingTips,
  getFluidLogs,
  getPatientAvatar,
  getPatientFluidLimits,
  getPatientLabResults,
  getPatientMedications,
} from '@/lib/data-store';
import { labsScript, medsScript, tipScript, todayScript } from '@/lib/avatar-scripts';
import { speakParts, stopSpeaking } from '@/lib/speech-client';
import type { Patient } from '@/lib/types';

type Topic = 'today' | 'meds' | 'labs' | 'tip';

const TOPICS: { id: Topic; icon: string; ar: string; en: string }[] = [
  { id: 'today', icon: '🗓️', ar: 'النهارده', en: 'Today' },
  { id: 'meds', icon: '💊', ar: 'أدويتي', en: 'My medicines' },
  { id: 'labs', icon: '🧪', ar: 'تحاليلي', en: 'My labs' },
  { id: 'tip', icon: '💡', ar: 'نصيحة', en: 'A tip' },
];

const SIZE = 76;
const POS_KEY = 'WASLITY_AVATAR_POS';
const HINT_KEY = 'WASLITY_AVATAR_HINT_SEEN';
const BOTTOM_MENU = 84; // keep clear of the bottom menu
const DRAG_THRESHOLD = 8;

/** Keep the avatar fully on screen and above the bottom menu. */
export function clampAvatarPosition(x: number, y: number, vw: number, vh: number): { x: number; y: number } {
  const maxX = Math.max(8, vw - SIZE - 8);
  const maxY = Math.max(72, vh - SIZE - BOTTOM_MENU);
  return { x: Math.min(Math.max(8, x), maxX), y: Math.min(Math.max(72, y), maxY) };
}

function readPos(): { x: number; y: number } | null {
  try {
    const p = JSON.parse(window.localStorage.getItem(POS_KEY) || 'null');
    return p && typeof p.x === 'number' && typeof p.y === 'number' ? p : null;
  } catch {
    return null;
  }
}

/**
 * The patient's own avatar floats over the home page. Drag it anywhere; tap it
 * to open the talking panel: today's plan, medicines, latest labs (with
 * doctor-approved advice only) and a tip. Words show while it speaks.
 * Everything floats, so the page itself never moves.
 */
export function TalkingAvatar({ patientId, patient, firstName, isAr }: { patientId: string; patient: Patient | null; firstName?: string; isAr: boolean }) {
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  const [open, setOpen] = useState(false);
  const [hint, setHint] = useState<boolean>(() => {
    try {
      return typeof window !== 'undefined' && !window.localStorage.getItem(HINT_KEY);
    } catch {
      return false;
    }
  });
  const [speaking, setSpeaking] = useState<Topic | null>(null);
  const [caption, setCaption] = useState('');
  const advice = useRef<Record<string, string>>({});
  const tipIndex = useRef<number | null>(null);
  const drag = useRef<{ id: number; sx: number; sy: number; ox: number; oy: number; moved: boolean } | null>(null);

  // place it (saved spot, else bottom corner) and keep it on screen on rotate
  useEffect(() => {
    const place = () => {
      const saved = readPos();
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      const start = saved || { x: isAr ? 12 : vw - SIZE - 12, y: vh - SIZE - BOTTOM_MENU - 12 };
      setPos(clampAvatarPosition(start.x, start.y, vw, vh));
    };
    place();
    window.addEventListener('resize', place);
    fetch('/api/lab-advice', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (j?.advice) advice.current = j.advice;
      })
      .catch(() => {});
    return () => {
      window.removeEventListener('resize', place);
      stopSpeaking();
    };
  }, [isAr]);

  const buildParts = useCallback(
    (topic: Topic): string[] => {
      const meds = getPatientMedications(patientId).filter((m) => m.isActive !== false);
      if (topic === 'meds') return medsScript(meds);
      if (topic === 'labs') {
        const labs = [...getPatientLabResults(patientId)].sort((a, b) => String(b.testDate).localeCompare(String(a.testDate)));
        return labsScript(labs[0], CLINICAL_12_LAB_TESTS, advice.current);
      }
      if (topic === 'tip') {
        if (tipIndex.current === null) tipIndex.current = Math.floor(Date.now() / 86400000);
        return tipScript(getCoachingTips(), tipIndex.current++);
      }
      const now = new Date();
      const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      return todayScript({
        firstName,
        schedule: patient?.dialysisSchedule,
        now,
        nowMinutes: now.getHours() * 60 + now.getMinutes(),
        meds,
        todayLogs: getAdherenceLogs(patientId, 'ttt', { start: start.toISOString(), end: now.toISOString() }),
        waterMl: getFluidLogs(patientId, now).reduce((s, f) => s + (Number(f.amountMl) || 0), 0),
        waterLimitMl: getPatientFluidLimits(patient?.dryWeightKg || 70).critical,
      });
    },
    [patientId, patient, firstName]
  );

  const talk = (topic: Topic) => {
    if (speaking === topic) {
      stopSpeaking();
      setSpeaking(null);
      return;
    }
    const parts = buildParts(topic);
    setSpeaking(topic);
    setCaption(parts[0] || '');
    void speakParts(parts, (i) => setCaption(parts[i])).then(() => setSpeaking((s) => (s === topic ? null : s)));
  };

  const openPanel = () => {
    setOpen(true);
    if (hint) {
      setHint(false);
      try {
        window.localStorage.setItem(HINT_KEY, '1');
      } catch {
        // ignore
      }
    }
    // greet with today's plan straight away (this tap counts as permission to speak)
    talk('today');
  };

  const closePanel = () => {
    stopSpeaking();
    setSpeaking(null);
    setOpen(false);
  };

  // ---- dragging (finger or mouse); a short tap opens the panel ----
  const onPointerDown = (e: React.PointerEvent<HTMLButtonElement>) => {
    if (!pos) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { id: e.pointerId, sx: e.clientX, sy: e.clientY, ox: pos.x, oy: pos.y, moved: false };
  };
  const onPointerMove = (e: React.PointerEvent<HTMLButtonElement>) => {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    const dx = e.clientX - d.sx;
    const dy = e.clientY - d.sy;
    if (!d.moved && Math.hypot(dx, dy) < DRAG_THRESHOLD) return;
    d.moved = true;
    setPos(clampAvatarPosition(d.ox + dx, d.oy + dy, window.innerWidth, window.innerHeight));
  };
  const onPointerUp = (e: React.PointerEvent<HTMLButtonElement>) => {
    const d = drag.current;
    drag.current = null;
    if (!d || d.id !== e.pointerId) return;
    if (d.moved) {
      try {
        window.localStorage.setItem(POS_KEY, JSON.stringify(pos));
      } catch {
        // ignore
      }
    } else {
      openPanel();
    }
  };

  const avatarId = patient?.avatarId || getPatientAvatar(patientId);
  const avatar = <PatientAvatarSvg presetId={avatarId} gender={patient?.gender} className="w-full h-full" />;

  return (
    <>
      {!open && pos && (
        <div className="fixed z-40" style={{ left: pos.x, top: pos.y, width: SIZE, height: SIZE }}>
          {hint && (
            <div
              className={`pointer-events-none absolute bottom-full mb-2 ${pos.x < 120 ? 'left-0' : 'right-0'} whitespace-nowrap rounded-2xl bg-[#1e6bb8] text-white text-sm font-bold px-3 py-1.5 shadow-lg`}
            >
              {isAr ? 'اضغط عليّا، أنا هكلمك 👋' : 'Tap me, I will talk to you 👋'}
            </div>
          )}
          <button
            type="button"
            data-testid="talking-avatar-button"
            aria-label={isAr ? 'المساعد المتكلم' : 'Talking assistant'}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={() => (drag.current = null)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                openPanel();
              }
            }}
            style={{ touchAction: 'none' }}
            className="w-full h-full rounded-full bg-white border-4 border-[#1e6bb8] shadow-xl select-none cursor-grab active:cursor-grabbing"
          >
            {avatar}
            <span className="absolute -bottom-1 -right-1 w-7 h-7 rounded-full bg-[#1e6bb8] text-white text-sm flex items-center justify-center shadow" aria-hidden="true">
              🔊
            </span>
          </button>
        </div>
      )}

      {open && (
        <div className="fixed inset-x-0 z-50 px-3" style={{ bottom: `calc(env(safe-area-inset-bottom, 0px) + ${BOTTOM_MENU - 8}px)` }}>
          <section
            data-testid="talking-avatar"
            role="dialog"
            aria-label={isAr ? 'المساعد المتكلم' : 'Talking assistant'}
            className="mx-auto max-w-md rounded-3xl bg-white border-2 border-[#1e6bb8]/30 p-4 space-y-3 shadow-2xl animate-in slide-in-from-bottom-4 duration-200"
          >
            <div className="flex items-start gap-3">
              <div className={`w-20 h-20 shrink-0 rounded-full ${speaking ? 'avatar-talking ring-4 ring-[#1e6bb8]/30' : ''}`} aria-hidden="true">
                {avatar}
              </div>
              {/* fixed height so nothing moves while it talks */}
              <div
                data-testid="talking-avatar-caption"
                aria-live="polite"
                className="flex-1 min-w-0 h-28 overflow-y-auto rounded-2xl bg-slate-50 border border-slate-200 p-3 text-lg font-bold leading-snug text-slate-900"
              >
                {caption || (isAr ? 'اضغط على أي زرار تحت، وأنا هكلمك 👇' : 'Tap a button below and I will talk 👇')}
              </div>
              <button
                type="button"
                onClick={closePanel}
                aria-label={isAr ? 'إغلاق' : 'Close'}
                className="shrink-0 w-11 h-11 rounded-full bg-slate-100 text-slate-600 text-xl font-bold flex items-center justify-center"
              >
                ✕
              </button>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {TOPICS.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => talk(t.id)}
                  aria-pressed={speaking === t.id}
                  className={`min-h-[60px] rounded-2xl border-2 text-lg font-black flex items-center justify-center gap-2 active:scale-95 transition ${
                    speaking === t.id ? 'bg-[#1e6bb8] border-[#1e6bb8] text-white' : 'bg-white border-[#1e6bb8]/40 text-[#1e6bb8]'
                  }`}
                >
                  <span aria-hidden="true">{speaking === t.id ? '⏹' : t.icon}</span>
                  <span>{speaking === t.id ? (isAr ? 'وقّف' : 'Stop') : isAr ? t.ar : t.en}</span>
                </button>
              ))}
            </div>
          </section>
        </div>
      )}
    </>
  );
}

export default TalkingAvatar;
