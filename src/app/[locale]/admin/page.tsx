'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from 'recharts';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';

import Card from '@/components/ui/Card';
import Badge from '@/components/ui/Badge';
import Button from '@/components/ui/Button';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import { AdminClinicalQuickPanel } from '@/components/admin/AdminClinicalQuickPanel';
import { STORAGE_KEYS } from '@/lib/data-store';
import type { Patient } from '@/lib/types';
import {
  getPatients,
  getAdherenceTrendData,
  getPatientMetrics,
  getAdminSettings,
  getNotifications,
  getAdherenceLogs,
  getFluidLogs,
  getDietLogs,
  type PatientMetrics,
} from './admin-store';
import {
  PatientsIcon,
  NotificationsIcon,
  DownloadIcon,
  EyeIcon,
} from './admin-icons';

interface PatientWithMetrics extends Patient {
  metrics: PatientMetrics;
}

export default function AdminDashboardPage() {
  const locale = useLocale();
  const router = useRouter();
  const tAdmin = useTranslations('admin');
  const tCommon = useTranslations('common');
  const isRtl = locale === 'ar';

  const [loading, setLoading] = useState(true);
  const [patients, setPatients] = useState<PatientWithMetrics[]>([]);
  const [trendData, setTrendData] = useState<ReturnType<typeof getAdherenceTrendData>>([]);
  const [notificationsCount, setNotificationsCount] = useState(0);
  const [activeTodayCount, setActiveTodayCount] = useState(0);
  const [overallAvg, setOverallAvg] = useState({ ttt: 0, fluid: 0, diet: 0, total: 0 });
  const [threshold, setThreshold] = useState(70);

  const loadDashboardData = useCallback(() => {
    try {
      const settings = getAdminSettings();
      const configuredThreshold = settings.adherenceThreshold || 70;
      setThreshold(configuredThreshold);

      const rawPatients = getPatients();
      const withMetrics: PatientWithMetrics[] = rawPatients.map((p) => ({
        ...p,
        metrics: getPatientMetrics(p.id),
      }));
      setPatients(withMetrics);

      // Trend data for 7 days
      const trend = getAdherenceTrendData(7);
      setTrendData(trend);

      // Notifications count: Total this week (last 7 days)
      const notifs = getNotifications();
      const oneWeekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
      const thisWeekNotifs = notifs.filter(
        (n) => new Date(n.sentAt).getTime() >= oneWeekAgo
      );
      setNotificationsCount(thisWeekNotifs.length);

      // Active today count: patients who logged adherence, fluid, or diet today
      const todayStr = new Date().toISOString().slice(0, 10);
      const todayLogs = getAdherenceLogs(undefined, undefined, {
        start: todayStr,
      });
      const activeIds = new Set(todayLogs.map((l) => l.patientId));
      rawPatients.forEach((p) => {
        const fLogs = getFluidLogs(p.id, todayStr);
        if (fLogs.length > 0) activeIds.add(p.id);
        const dLogs = getDietLogs(p.id, todayStr);
        if (dLogs.length > 0) activeIds.add(p.id);
      });
      setActiveTodayCount(activeIds.size);

      // Calculate averages across patients
      if (withMetrics.length > 0) {
        const sumTtt = withMetrics.reduce((acc, p) => acc + p.metrics.tttAdherence, 0);
        const sumFluid = withMetrics.reduce((acc, p) => acc + p.metrics.fluidAdherence, 0);
        const sumDiet = withMetrics.reduce((acc, p) => acc + p.metrics.dietAdherence, 0);

        const avgTtt = Math.round(sumTtt / withMetrics.length);
        const avgFluid = Math.round(sumFluid / withMetrics.length);
        const avgDiet = Math.round(sumDiet / withMetrics.length);
        const total = Math.round((avgTtt + avgFluid + avgDiet) / 3);

        setOverallAvg({ ttt: avgTtt, fluid: avgFluid, diet: avgDiet, total });
      } else {
        setOverallAvg({ ttt: 0, fluid: 0, diet: 0, total: 0 });
      }
    } catch (error) {
      console.error('Failed to load dashboard data:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      loadDashboardData();
    }, 0);

    const handleSync = () => {
      loadDashboardData();
    };
    const handleStorage = (e: StorageEvent) => {
      if (
        e.key === null ||
        e.key === STORAGE_KEYS.PATIENTS ||
        e.key === STORAGE_KEYS.DIALYSIS_SESSIONS ||
        e.key === STORAGE_KEYS.LAB_RESULTS ||
        e.key === STORAGE_KEYS.PATIENT_MEDICATIONS ||
        e.key === STORAGE_KEYS.ADHERENCE_LOGS ||
        e.key === STORAGE_KEYS.FLUID_LOGS ||
        e.key === STORAGE_KEYS.DIET_LOGS ||
        e.key === STORAGE_KEYS.NOTIFICATIONS
      ) {
        loadDashboardData();
      }
    };

    window.addEventListener('dialycare_sessions_updated', handleSync);
    window.addEventListener('dialycare_labs_updated', handleSync);
    window.addEventListener('dialycare_medications_updated', handleSync);
    window.addEventListener('dialycare_notifications_updated', handleSync);
    window.addEventListener('storage', handleStorage);

    return () => {
      clearTimeout(timer);
      window.removeEventListener('dialycare_sessions_updated', handleSync);
      window.removeEventListener('dialycare_labs_updated', handleSync);
      window.removeEventListener('dialycare_medications_updated', handleSync);
      window.removeEventListener('dialycare_notifications_updated', handleSync);
      window.removeEventListener('storage', handleStorage);
    };
  }, [loadDashboardData]);

  // Filter non-adherent patients based on threshold
  const nonAdherentPatients = patients.filter(
    (p) => p.metrics.overallAdherence < threshold
  );

  // Bar chart data for adherence by type
  const typeBarData = [
    {
      name: isRtl ? 'الأدوية (TTT)' : 'TTT Meds',
      rate: overallAvg.ttt,
      color: '#1e6bb8',
    },
    {
      name: isRtl ? 'السوائل' : 'Fluid',
      rate: overallAvg.fluid,
      color: '#0284c7',
    },
    {
      name: isRtl ? 'الغذاء' : 'Diet',
      rate: overallAvg.diet,
      color: '#4caf50',
    },
  ];

  // Distribution Pie Chart Data
  const adherentCount = patients.filter((p) => p.metrics.overallAdherence >= threshold).length;
  const moderateCount = patients.filter(
    (p) => p.metrics.overallAdherence >= 50 && p.metrics.overallAdherence < threshold
  ).length;
  const criticalCount = patients.filter((p) => p.metrics.overallAdherence < 50).length;

  const pieDistributionData = [
    {
      name: isRtl ? `ملتزم (≥ ${threshold}%)` : `Compliant (≥${threshold}%)`,
      value: adherentCount,
      color: '#4caf50',
    },
    {
      name: isRtl ? `يحتاج متابعة (50-${threshold}%)` : `Moderate (50-${threshold}%)`,
      value: moderateCount,
      color: '#f59e0b',
    },
    {
      name: isRtl ? 'حرج (< 50%)' : 'Critical (<50%)',
      value: criticalCount,
      color: '#ef4444',
    },
  ];

  // Export to CSV
  const handleExportCSV = () => {
    const headers = [
      'Patient ID',
      'Name',
      'Arabic Name',
      'Schedule',
      'Phone',
      'TTT Adherence %',
      'Fluid Adherence %',
      'Diet Adherence %',
      'Overall %',
      'Status',
      'Last Active',
    ];
    const rows = patients.map((p) => [
      p.id,
      `"${p.fullName}"`,
      `"${p.fullNameAr || ''}"`,
      p.dialysisSchedule,
      `"${p.phone || ''}"`,
      p.metrics.tttAdherence,
      p.metrics.fluidAdherence,
      p.metrics.dietAdherence,
      p.metrics.overallAdherence,
      p.isActive ? 'Active' : 'Inactive',
      p.metrics.lastActive,
    ]);

    const csvContent = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute(
      'download',
      `DialyCare_Adherence_Report_${new Date().toISOString().slice(0, 10)}.csv`
    );
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  // Export to PDF using jsPDF + jspdf-autotable
  const handleExportPDF = () => {
    const doc = new jsPDF();

    // Title & Header
    doc.setFontSize(20);
    doc.setTextColor(30, 107, 184); // #1e6bb8
    doc.text('DialyCare Adherence Report', 14, 22);

    doc.setFontSize(10);
    doc.setTextColor(100, 116, 139);
    doc.text(`Generated on: ${new Date().toLocaleString()} | Clinical Portal`, 14, 30);

    // Summary Statistics block
    doc.setFontSize(12);
    doc.setTextColor(15, 23, 42);
    doc.text('Executive Adherence Summary', 14, 42);

    const summaryData = [
      ['Total Enrolled Patients', `${patients.length}`],
      ['Active Loggers Today', `${activeTodayCount}`],
      ['Overall Adherence Rate', `${overallAvg.total}%`],
      ['TTT Medication Adherence', `${overallAvg.ttt}%`],
      ['Fluid Intake Compliance', `${overallAvg.fluid}%`],
      ['Diet Checklist Compliance', `${overallAvg.diet}%`],
      ['Non-Adherent Patients Flagged (< ' + threshold + '%)', `${nonAdherentPatients.length}`],
      ['Weekly Notifications Sent', `${notificationsCount}`],
    ];

    autoTable(doc, {
      startY: 46,
      head: [['Clinical Metric', 'Value']],
      body: summaryData,
      theme: 'striped',
      headStyles: { fillColor: [30, 107, 184] },
      styles: { fontSize: 9 },
    });

    // Patient Adherence Table
    const tableBody = patients.map((p) => [
      p.fullName,
      p.dialysisSchedule,
      p.phone || 'N/A',
      `${p.metrics.tttAdherence}%`,
      `${p.metrics.fluidAdherence}%`,
      `${p.metrics.dietAdherence}%`,
      `${p.metrics.overallAdherence}%`,
      p.isActive ? 'Active' : 'Inactive',
      p.metrics.lastActive,
    ]);

    const lastTable = (doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable;
    const finalY = lastTable?.finalY ? lastTable.finalY + 12 : 110;
    doc.setFontSize(12);
    doc.setTextColor(15, 23, 42);
    doc.text('Patient-by-Patient Adherence Breakdown', 14, finalY);

    autoTable(doc, {
      startY: finalY + 4,
      head: [
        [
          'Patient Name',
          'Schedule',
          'Phone',
          'TTT %',
          'Fluid %',
          'Diet %',
          'Overall %',
          'Status',
          'Last Active',
        ],
      ],
      body: tableBody,
      theme: 'grid',
      headStyles: { fillColor: [30, 107, 184] },
      styles: { fontSize: 8 },
    });

    doc.save(`DialyCare_Adherence_Report_${new Date().toISOString().slice(0, 10)}.pdf`);
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-3">
        <LoadingSpinner size="lg" />
        <p className="text-slate-500 text-sm font-medium">
          {tCommon('loading') || 'Loading clinical analytics...'}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-8 animate-in fade-in duration-200">
      {/* Top Banner / Actions Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 tracking-tight">
            {tAdmin('dashboardTitle') ||
              (isRtl ? 'لوحة تحكم الفريق الطبي' : 'Clinical Care Team Dashboard')}
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            {isRtl
              ? 'مراقبة التزام مرضى الغسيل الكلوي بالأدوية والسوائل والغذاء'
              : 'Real-time adherence monitoring for hemodialysis patients'}
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <Button
            variant="outline"
            size="sm"
            onClick={handleExportCSV}
            leftIcon={<DownloadIcon className="w-4 h-4" />}
          >
            {isRtl ? 'تصدير CSV' : 'Export CSV'}
          </Button>

          <Button
            variant="primary"
            size="sm"
            onClick={handleExportPDF}
            leftIcon={<DownloadIcon className="w-4 h-4" />}
          >
            {isRtl ? 'تقرير PDF' : 'Export PDF'}
          </Button>
        </div>
      </div>

      {/* Doctor Immediate Clinical Quick Actions: Record Dialysis Session & Lab Results (12 Tests) */}
      <AdminClinicalQuickPanel
        id="clinical-quick-panel"
        showEmbeddedViews={false}
        onDataUpdated={loadDashboardData}
      />

      {/* Overview Cards Row (4 cards) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
        {/* Card 1: Total Patients (with icon 👥) */}
        <Card className="hover:border-[#1e6bb8]/40 transition-colors">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
                <span className="text-base" role="img" aria-label="Patients">
                  👥
                </span>
                <span>
                  {tAdmin('totalPatients') || (isRtl ? 'إجمالي المرضى' : 'Total Patients')}
                </span>
              </p>
              <h3 className="text-3xl font-extrabold text-slate-900 mt-2">
                {patients.length}
              </h3>
              <p className="text-xs text-emerald-600 font-medium mt-1 flex items-center gap-1">
                <span>●</span>
                <span>{isRtl ? 'مسجلين بالوحدة' : 'Enrolled in unit'}</span>
              </p>
            </div>
            <div className="w-12 h-12 rounded-2xl bg-blue-50 text-[#1e6bb8] flex items-center justify-center shrink-0">
              <PatientsIcon className="w-6 h-6" />
            </div>
          </div>
        </Card>

        {/* Card 2: Active Today */}
        <Card className="hover:border-emerald-300 transition-colors">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                {isRtl ? 'النشطون اليوم' : 'Active Today'}
              </p>
              <h3 className="text-3xl font-extrabold text-slate-900 mt-2">
                {activeTodayCount}
              </h3>
              <p className="text-xs text-slate-500 font-medium mt-1">
                {patients.length > 0
                  ? `${Math.round((activeTodayCount / patients.length) * 100)}% ${
                      isRtl ? 'من المرضى' : 'of total roster'
                    }`
                  : '0%'}
              </p>
            </div>
            <div className="w-12 h-12 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0">
              <span className="text-xl">⚡</span>
            </div>
          </div>
        </Card>

        {/* Card 3: Overall Adherence Rate */}
        <Card className="hover:border-blue-300 transition-colors">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                {tAdmin('overallAdherence') ||
                  (isRtl ? 'معدل الالتزام العام' : 'Overall Adherence Rate')}
              </p>
              <h3 className="text-3xl font-extrabold text-slate-900 mt-2">
                {overallAvg.total}%
              </h3>
              <div className="mt-1 flex items-center gap-1.5">
                <Badge
                  variant={overallAvg.total >= threshold ? 'success' : 'warning'}
                  size="sm"
                >
                  {overallAvg.total >= threshold
                    ? isRtl
                      ? 'أداء ممتاز'
                      : 'Target Met'
                    : isRtl
                    ? 'يحتاج متابعة'
                    : 'Needs Follow-up'}
                </Badge>
              </div>
            </div>
            <div className="w-12 h-12 rounded-2xl bg-blue-50 text-[#1e6bb8] flex items-center justify-center shrink-0">
              <span className="text-xl">📈</span>
            </div>
          </div>
        </Card>

        {/* Card 4: Notifications Sent (total this week) */}
        <Card className="hover:border-amber-300 transition-colors">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                {isRtl ? 'الإشعارات هذا الأسبوع' : 'Notifications Sent'}
              </p>
              <h3 className="text-3xl font-extrabold text-slate-900 mt-2">
                {notificationsCount}
              </h3>
              <p className="text-xs text-slate-500 font-medium mt-1">
                {isRtl ? 'تنبيهات خلال 7 أيام' : 'Total sent this week'}
              </p>
            </div>
            <div className="w-12 h-12 rounded-2xl bg-amber-50 text-amber-600 flex items-center justify-center shrink-0">
              <NotificationsIcon className="w-6 h-6" />
            </div>
          </div>
        </Card>
      </div>

      {/* Charts Section: 7-day Trend (LineChart) & Adherence by Type (BarChart) */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Trend Chart - 2 Cols on large screens */}
        <div className="lg:col-span-2">
          <Card
            title={isRtl ? 'اتجاه الالتزام خلال 7 أيام' : '7-Day Adherence Trend'}
            subtitle={
              isRtl
                ? 'مقارنة يومية بين الأدوية والسوائل والغذاء'
                : 'Daily compliance tracking across TTT, Fluid, and Diet'
            }
          >
            <div className="h-72 w-full pt-2">
              <ResponsiveContainer width="100%" height={270}>
                <LineChart data={trendData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis dataKey="date" stroke="#94a3b8" fontSize={12} tickLine={false} />
                  <YAxis domain={[0, 100]} stroke="#94a3b8" fontSize={12} tickLine={false} />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: '#ffffff',
                      borderRadius: '0.75rem',
                      border: '1px solid #e2e8f0',
                      boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)',
                      fontSize: '12px',
                    }}
                  />
                  <Legend wrapperStyle={{ paddingTop: '8px', fontSize: '13px' }} />
                  <Line
                    type="monotone"
                    dataKey="ttt"
                    name={isRtl ? 'الأدوية (TTT)' : 'TTT Medication'}
                    stroke="#1e6bb8"
                    strokeWidth={2.5}
                    dot={{ r: 3, fill: '#1e6bb8' }}
                    activeDot={{ r: 6 }}
                  />
                  <Line
                    type="monotone"
                    dataKey="fluid"
                    name={isRtl ? 'السوائل' : 'Fluid Intake'}
                    stroke="#0284c7"
                    strokeWidth={2.5}
                    dot={{ r: 3, fill: '#0284c7' }}
                    activeDot={{ r: 6 }}
                  />
                  <Line
                    type="monotone"
                    dataKey="diet"
                    name={isRtl ? 'الغذاء' : 'Diet Checklist'}
                    stroke="#4caf50"
                    strokeWidth={2.5}
                    dot={{ r: 3, fill: '#4caf50' }}
                    activeDot={{ r: 6 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </Card>
        </div>

        {/* Breakdown by Type Chart - 1 Col */}
        <div className="lg:col-span-1">
          <Card
            title={isRtl ? 'متوسط الالتزام حسب النوع' : 'Adherence by Category'}
            subtitle={isRtl ? 'معدل التزام المرضى الإجمالي' : 'Overall patient compliance rate'}
          >
            <div className="h-72 w-full pt-2">
              <ResponsiveContainer width="100%" height={270}>
                <BarChart data={typeBarData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis dataKey="name" stroke="#94a3b8" fontSize={12} tickLine={false} />
                  <YAxis domain={[0, 100]} stroke="#94a3b8" fontSize={12} tickLine={false} />
                  <Tooltip
                    formatter={(val: unknown) => [
                      `${String(val)}%`,
                      isRtl ? 'معدل الالتزام' : 'Compliance Rate',
                    ]}
                    contentStyle={{
                      backgroundColor: '#ffffff',
                      borderRadius: '0.75rem',
                      border: '1px solid #e2e8f0',
                      fontSize: '12px',
                    }}
                  />
                  <Bar dataKey="rate" radius={[8, 8, 0, 0]}>
                    {typeBarData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Card>
        </div>
      </div>

      {/* Adherence Status Tier Distribution (PieChart) */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-1">
          <Card
            title={isRtl ? 'توزيع شرائح الالتزام' : 'Adherence Tier Distribution'}
            subtitle={
              isRtl
                ? `نسبة المرضى بحسب عتبة الالتزام (${threshold}%)`
                : `Roster split by target threshold (${threshold}%)`
            }
          >
            <div className="h-64 w-full pt-1">
              <ResponsiveContainer width="100%" height={240}>
                <PieChart>
                  <Pie
                    data={pieDistributionData}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    innerRadius={48}
                    outerRadius={76}
                    paddingAngle={4}
                  >
                    {pieDistributionData.map((entry, index) => (
                      <Cell key={`pie-cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip
                    formatter={(val: unknown) => [
                      `${String(val)} ${isRtl ? 'مرضى' : 'patients'}`,
                      isRtl ? 'العدد' : 'Count',
                    ]}
                    contentStyle={{
                      backgroundColor: '#ffffff',
                      borderRadius: '0.75rem',
                      border: '1px solid #e2e8f0',
                      fontSize: '12px',
                    }}
                  />
                  <Legend wrapperStyle={{ paddingTop: '8px', fontSize: '11px' }} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </Card>
        </div>

        {/* Flagged Non-Adherent Patients Table - 2 Cols */}
        <div className="lg:col-span-2">
          <Card
            title={
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-red-500 animate-pulse" />
                <span>
                  {isRtl ? 'المرضى ذوو الالتزام المنخفض' : 'Non-Adherent Patients Flagged'}
                </span>
                <Badge variant="danger" size="sm">
                  {nonAdherentPatients.length} {isRtl ? 'مرضى' : 'Flagged'}
                </Badge>
              </div>
            }
            subtitle={
              isRtl
                ? `المرضى الذين يقل معدل التزامهم الإجمالي عن ${threshold}% (انقر على أي صف للانتقال للملف)`
                : `Patients below ${threshold}% threshold (click any row to view profile)`
            }
          >
            {nonAdherentPatients.length === 0 ? (
              <div className="text-center py-10 bg-emerald-50/50 rounded-xl border border-emerald-100">
                <div className="w-12 h-12 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center mx-auto mb-2 text-xl font-bold">
                  ✓
                </div>
                <p className="text-sm font-semibold text-emerald-800">
                  {isRtl
                    ? 'جميع المرضى ملتزمون ضمن المعدل المطلوب!'
                    : 'All active patients currently meet the adherence threshold!'}
                </p>
                <p className="text-xs text-emerald-600 mt-1">
                  {isRtl
                    ? `الهدف المعتمد: ≥ ${threshold}%`
                    : `Current unit benchmark: ≥ ${threshold}%`}
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-start text-sm border-collapse">
                  <thead>
                    <tr className="border-b border-slate-200 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                      <th className="py-3 px-4 text-start">
                        {isRtl ? 'اسم المريض' : 'Patient Name'}
                      </th>
                      <th className="py-3 px-4 text-start">
                        {isRtl ? 'أيام الغسيل' : 'Schedule'}
                      </th>
                      <th className="py-3 px-4 text-center">{isRtl ? 'الأدوية' : 'TTT %'}</th>
                      <th className="py-3 px-4 text-center">{isRtl ? 'السوائل' : 'Fluid %'}</th>
                      <th className="py-3 px-4 text-center">{isRtl ? 'الغذاء' : 'Diet %'}</th>
                      <th className="py-3 px-4 text-center">{isRtl ? 'الإجمالي' : 'Overall %'}</th>
                      <th className="py-3 px-4 text-start">{isRtl ? 'آخر نشاط' : 'Last Active'}</th>
                      <th className="py-3 px-4 text-end">{isRtl ? 'الإجراء' : 'Action'}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {nonAdherentPatients.map((p) => {
                      const isSevere = p.metrics.overallAdherence < 50;

                      return (
                        <tr
                          key={p.id}
                          onClick={() => router.push(`/${locale}/admin/patients/${p.id}`)}
                          className="hover:bg-slate-50 transition-colors cursor-pointer group"
                        >
                          <td className="py-3.5 px-4 font-semibold text-slate-900">
                            <span className="group-hover:text-[#1e6bb8] transition-colors">
                              {p.fullName}
                            </span>
                            {p.fullNameAr && (
                              <span className="block text-xs font-normal text-slate-400">
                                {p.fullNameAr}
                              </span>
                            )}
                          </td>
                          <td className="py-3.5 px-4">
                            <Badge variant="neutral" size="sm">
                              {p.dialysisSchedule}
                            </Badge>
                          </td>
                          <td className="py-3.5 px-4 text-center">
                            <span
                              className={`inline-block px-2 py-0.5 rounded-md font-mono text-xs font-bold ${
                                p.metrics.tttAdherence < 50
                                  ? 'bg-red-100 text-red-700'
                                  : p.metrics.tttAdherence < 70
                                  ? 'bg-amber-100 text-amber-800'
                                  : 'bg-emerald-100 text-emerald-800'
                              }`}
                            >
                              {p.metrics.tttAdherence}%
                            </span>
                          </td>
                          <td className="py-3.5 px-4 text-center">
                            <span
                              className={`inline-block px-2 py-0.5 rounded-md font-mono text-xs font-bold ${
                                p.metrics.fluidAdherence < 50
                                  ? 'bg-red-100 text-red-700'
                                  : p.metrics.fluidAdherence < 70
                                  ? 'bg-amber-100 text-amber-800'
                                  : 'bg-emerald-100 text-emerald-800'
                              }`}
                            >
                              {p.metrics.fluidAdherence}%
                            </span>
                          </td>
                          <td className="py-3.5 px-4 text-center">
                            <span
                              className={`inline-block px-2 py-0.5 rounded-md font-mono text-xs font-bold ${
                                p.metrics.dietAdherence < 50
                                  ? 'bg-red-100 text-red-700'
                                  : p.metrics.dietAdherence < 70
                                  ? 'bg-amber-100 text-amber-800'
                                  : 'bg-emerald-100 text-emerald-800'
                              }`}
                            >
                              {p.metrics.dietAdherence}%
                            </span>
                          </td>
                          <td className="py-3.5 px-4 text-center">
                            <Badge variant={isSevere ? 'danger' : 'warning'} size="sm">
                              {p.metrics.overallAdherence}%
                            </Badge>
                          </td>
                          <td className="py-3.5 px-4 text-slate-500 text-xs">
                            {p.metrics.lastActive}
                          </td>
                          <td
                            className="py-3.5 px-4 text-end"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <Link href={`/${locale}/admin/patients/${p.id}`}>
                              <Button
                                variant="ghost"
                                size="sm"
                                leftIcon={<EyeIcon className="w-3.5 h-3.5" />}
                              >
                                {isRtl ? 'عرض' : 'View'}
                              </Button>
                            </Link>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}
