import * as React from 'react';
import { CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

export type StatCardVariant = 'cyan' | 'blue' | 'emerald' | 'amber' | 'purple' | 'rose' | 'teal' | 'indigo';

interface StatCardProps {
  label: string;
  value: React.ReactNode;
  hint?: React.ReactNode;
  icon?: React.ReactNode;
  tone?: 'default' | 'positive' | 'negative' | 'warning' | 'info';
  variant?: StatCardVariant;
  badge?: React.ReactNode;
  loading?: boolean;
  className?: string;
  to?: string;
}

const VARIANT_CONFIG: Record<
  StatCardVariant,
  {
    cardBg: string;
    iconBg: string;
    iconColor: string;
    ringColor: string;
    valueColor: string;
    labelColor: string;
    hintColor: string;
    waves: string[];
    topBar: string;
  }
> = {
  cyan: {
    cardBg: 'bg-gradient-to-br from-white via-sky-50/70 to-cyan-50/90 border-sky-200/90 hover:border-sky-400 shadow-sm hover:shadow-lg hover:shadow-cyan-500/15',
    iconBg: 'bg-gradient-to-tr from-cyan-600 via-sky-500 to-blue-500',
    iconColor: 'text-white',
    ringColor: 'ring-4 ring-cyan-100 shadow-md shadow-cyan-500/30',
    valueColor: 'text-slate-900 group-hover:text-cyan-950',
    labelColor: 'text-slate-700',
    hintColor: 'text-cyan-700/80',
    waves: ['#06b6d4', '#38bdf8', '#7dd3fc'],
    topBar: 'from-cyan-500 to-sky-400',
  },
  emerald: {
    cardBg: 'bg-gradient-to-br from-white via-emerald-50/70 to-teal-50/90 border-emerald-200/90 hover:border-emerald-400 shadow-sm hover:shadow-lg hover:shadow-emerald-500/15',
    iconBg: 'bg-gradient-to-tr from-emerald-600 via-teal-500 to-green-500',
    iconColor: 'text-white',
    ringColor: 'ring-4 ring-emerald-100 shadow-md shadow-emerald-500/30',
    valueColor: 'text-slate-900 group-hover:text-emerald-950',
    labelColor: 'text-slate-700',
    hintColor: 'text-emerald-700/80',
    waves: ['#10b981', '#34d399', '#6ee7b7'],
    topBar: 'from-emerald-500 to-teal-400',
  },
  amber: {
    cardBg: 'bg-gradient-to-br from-white via-amber-50/70 to-orange-50/90 border-amber-200/90 hover:border-amber-400 shadow-sm hover:shadow-lg hover:shadow-amber-500/15',
    iconBg: 'bg-gradient-to-tr from-amber-500 via-orange-500 to-yellow-500',
    iconColor: 'text-white',
    ringColor: 'ring-4 ring-amber-100 shadow-md shadow-amber-500/30',
    valueColor: 'text-slate-900 group-hover:text-amber-950',
    labelColor: 'text-slate-700',
    hintColor: 'text-amber-700/80',
    waves: ['#f59e0b', '#fbbf24', '#fcd34d'],
    topBar: 'from-amber-500 to-orange-400',
  },
  purple: {
    cardBg: 'bg-gradient-to-br from-white via-purple-50/70 to-violet-50/90 border-purple-200/90 hover:border-purple-400 shadow-sm hover:shadow-lg hover:shadow-purple-500/15',
    iconBg: 'bg-gradient-to-tr from-purple-600 via-violet-600 to-indigo-600',
    iconColor: 'text-white',
    ringColor: 'ring-4 ring-purple-100 shadow-md shadow-purple-500/30',
    valueColor: 'text-slate-900 group-hover:text-purple-950',
    labelColor: 'text-slate-700',
    hintColor: 'text-purple-700/80',
    waves: ['#a855f7', '#c084fc', '#d8b4fe'],
    topBar: 'from-purple-500 to-violet-400',
  },
  rose: {
    cardBg: 'bg-gradient-to-br from-white via-rose-50/70 to-pink-50/90 border-rose-200/90 hover:border-rose-400 shadow-sm hover:shadow-lg hover:shadow-rose-500/15',
    iconBg: 'bg-gradient-to-tr from-rose-500 via-pink-600 to-red-500',
    iconColor: 'text-white',
    ringColor: 'ring-4 ring-rose-100 shadow-md shadow-rose-500/30',
    valueColor: 'text-slate-900 group-hover:text-rose-950',
    labelColor: 'text-slate-700',
    hintColor: 'text-rose-700/80',
    waves: ['#f43f5e', '#fb7185', '#fda4af'],
    topBar: 'from-rose-500 to-pink-400',
  },
  blue: {
    cardBg: 'bg-gradient-to-br from-white via-blue-50/70 to-indigo-50/90 border-blue-200/90 hover:border-blue-400 shadow-sm hover:shadow-lg hover:shadow-blue-500/15',
    iconBg: 'bg-gradient-to-tr from-blue-600 via-indigo-600 to-sky-600',
    iconColor: 'text-white',
    ringColor: 'ring-4 ring-blue-100 shadow-md shadow-blue-500/30',
    valueColor: 'text-slate-900 group-hover:text-blue-950',
    labelColor: 'text-slate-700',
    hintColor: 'text-blue-700/80',
    waves: ['#3b82f6', '#60a5fa', '#93c5fd'],
    topBar: 'from-blue-500 to-indigo-400',
  },
  teal: {
    cardBg: 'bg-gradient-to-br from-white via-teal-50/70 to-emerald-50/90 border-teal-200/90 hover:border-teal-400 shadow-sm hover:shadow-lg hover:shadow-teal-500/15',
    iconBg: 'bg-gradient-to-tr from-teal-600 via-emerald-600 to-cyan-600',
    iconColor: 'text-white',
    ringColor: 'ring-4 ring-teal-100 shadow-md shadow-teal-500/30',
    valueColor: 'text-slate-900 group-hover:text-teal-950',
    labelColor: 'text-slate-700',
    hintColor: 'text-teal-700/80',
    waves: ['#0d9488', '#2dd4bf', '#5eead4'],
    topBar: 'from-teal-500 to-emerald-400',
  },
  indigo: {
    cardBg: 'bg-gradient-to-br from-white via-indigo-50/70 to-blue-50/90 border-indigo-200/90 hover:border-indigo-400 shadow-sm hover:shadow-lg hover:shadow-indigo-500/15',
    iconBg: 'bg-gradient-to-tr from-indigo-600 via-purple-600 to-blue-600',
    iconColor: 'text-white',
    ringColor: 'ring-4 ring-indigo-100 shadow-md shadow-indigo-500/30',
    valueColor: 'text-slate-900 group-hover:text-indigo-950',
    labelColor: 'text-slate-700',
    hintColor: 'text-indigo-700/80',
    waves: ['#6366f1', '#818cf8', '#a5b4fc'],
    topBar: 'from-indigo-500 to-purple-400',
  },
};

function resolveVariant(variant?: StatCardVariant, tone?: string): StatCardVariant {
  if (variant && VARIANT_CONFIG[variant]) return variant;
  if (tone === 'positive') return 'emerald';
  if (tone === 'negative') return 'rose';
  if (tone === 'warning') return 'amber';
  if (tone === 'info') return 'blue';
  return 'cyan';
}

export function WaveDecoration({
  className = '',
  strokes = ['#9dbcc8', '#adc9d4', '#bcd6e0'],
}: {
  className?: string;
  strokes?: string[];
}) {
  return (
    <svg
      className={`w-full h-8 pointer-events-none select-none ${className}`}
      viewBox="0 0 400 36"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      preserveAspectRatio="none"
    >
      <path
        d="M0,18 C60,4 120,32 180,18 C240,4 300,32 360,18 C380,13 400,20 400,20"
        stroke={strokes[0] ?? '#9dbcc8'}
        strokeWidth="1.8"
        strokeOpacity="0.85"
      />
      <path
        d="M0,25 C70,10 130,36 200,22 C270,8 330,34 400,20"
        stroke={strokes[1] ?? '#adc9d4'}
        strokeWidth="1.4"
        strokeOpacity="0.65"
      />
      <path
        d="M0,12 C50,28 110,6 170,22 C230,38 310,10 400,26"
        stroke={strokes[2] ?? '#bcd6e0'}
        strokeWidth="1.1"
        strokeOpacity="0.45"
      />
    </svg>
  );
}

export function StatCard({
  label,
  value,
  hint,
  icon,
  tone,
  variant,
  badge,
  loading,
  className,
  to,
}: StatCardProps) {
  const chosenVariant = resolveVariant(variant, tone);
  const theme = VARIANT_CONFIG[chosenVariant];
  const Wrapper: React.ElementType = to ? 'a' : 'div';

  return (
    <Wrapper
      {...(to ? { href: to } : {})}
      className={cn(
        'group relative block overflow-hidden rounded-2xl border pt-5 pb-1 px-5 transition-all duration-200 hover:-translate-y-0.5',
        theme.cardBg,
        to && 'cursor-pointer',
        className
      )}
    >
      {/* Subtle top color accent strip */}
      <div
        className={cn(
          'absolute top-0 left-0 right-0 h-1 bg-gradient-to-r transition-opacity duration-200 opacity-80 group-hover:opacity-100',
          theme.topBar
        )}
      />

      <CardContent className="p-0">
        <div className="flex items-center gap-4">
          {icon && (
            <div
              className={cn(
                'flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl transition-transform duration-200 group-hover:scale-105',
                theme.iconBg,
                theme.iconColor,
                theme.ringColor
              )}
            >
              {icon}
            </div>
          )}
          <div className="min-w-0 flex-1 text-center">
            {loading ? (
              <Skeleton className="mx-auto h-8 w-24" />
            ) : (
              <p className={cn('truncate text-3xl font-extrabold tracking-tight transition-colors', theme.valueColor)}>
                {value}
              </p>
            )}
            <p className={cn('truncate text-xs font-semibold mt-0.5', theme.labelColor)}>{label}</p>
            {hint && !loading && (
              <p className={cn('truncate text-[10px] font-medium mt-0.5', theme.hintColor)}>{hint}</p>
            )}
            {badge && !loading && <div className="mt-1 flex justify-center">{badge}</div>}
          </div>
        </div>

        <div className="-mx-5 -mb-1 mt-4">
          <WaveDecoration strokes={theme.waves} />
        </div>
      </CardContent>
    </Wrapper>
  );
}
