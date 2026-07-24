import { useMemo, useState, useCallback } from 'react';
import { X, ArrowUpRight } from 'lucide-react';
import { useMediaQuery } from '@librechat/client';
import { useGetHighlightsQuery, useGetStartupConfig } from '~/data-provider';
import { useLocalize } from '~/hooks';
import { cn } from '~/utils';

const DISMISS_KEY = 'zgcai:highlights-dismissed';
const MOBILE_COUNT = 2;
const DESKTOP_COUNT = 4;

/** Local day key so a dismiss hides highlights for the rest of the day, then they return. */
function todayKey(): string {
  return new Date().toISOString().slice(0, 10);
}

function relativeDate(dateStr: string, localize: ReturnType<typeof useLocalize>): string {
  const t = Date.parse(dateStr);
  if (!Number.isFinite(t)) {
    return '';
  }
  const days = Math.floor((Date.now() - t) / (24 * 60 * 60 * 1000));
  if (days <= 0) {
    return localize('com_ui_today');
  }
  if (days === 1) {
    return localize('com_ui_yesterday');
  }
  return localize('com_ui_days_ago', { 0: days });
}

export default function Highlights() {
  const localize = useLocalize();
  const isSmallScreen = useMediaQuery('(max-width: 639px)');
  const { data: startupConfig } = useGetStartupConfig();
  const enabled = startupConfig?.interface?.highlights === true;
  const { data } = useGetHighlightsQuery({ enabled });

  const [dismissed, setDismissed] = useState(
    () => localStorage.getItem(DISMISS_KEY) === todayKey(),
  );

  const shown = useMemo(() => {
    const items = data?.highlights ?? [];
    return items.slice(0, isSmallScreen ? MOBILE_COUNT : DESKTOP_COUNT);
  }, [data?.highlights, isSmallScreen]);

  const dismiss = useCallback(() => {
    localStorage.setItem(DISMISS_KEY, todayKey());
    setDismissed(true);
  }, []);

  if (!enabled || dismissed || shown.length === 0) {
    return null;
  }

  return (
    <div className="mx-auto mt-6 flex w-full max-w-md flex-col gap-2 sm:max-w-none">
      <div className="flex items-center justify-between px-1">
        <span className="text-xs font-semibold uppercase tracking-wider text-text-secondary">
          {localize('com_ui_highlights')}
        </span>
        <button
          type="button"
          onClick={dismiss}
          aria-label={localize('com_ui_dismiss')}
          className="grid h-5 w-5 place-items-center rounded text-text-tertiary transition-colors hover:bg-surface-tertiary hover:text-text-secondary"
        >
          <X className="h-3.5 w-3.5" aria-hidden="true" />
        </button>
      </div>
      <div className="overflow-hidden rounded-xl border border-border-medium">
        {shown.map((item, index) => (
          <a
            key={item.id}
            href={item.url}
            target="_blank"
            rel="noreferrer noopener"
            className={cn(
              'flex items-center gap-3 px-4 py-3 transition-colors hover:bg-surface-tertiary',
              index > 0 && 'border-t border-border-light',
            )}
          >
            <div className="min-w-0 flex-1">
              <div className="line-clamp-2 text-sm leading-snug text-text-primary">
                {item.title}
              </div>
              <div className="mt-1.5 flex items-center gap-2">
                <span className="rounded-full bg-surface-secondary px-2 py-0.5 text-[11px] text-text-secondary">
                  {item.source}
                </span>
                <span className="text-[11px] tabular-nums text-text-tertiary">
                  {relativeDate(item.date, localize)}
                </span>
              </div>
            </div>
            <ArrowUpRight className="h-4 w-4 flex-shrink-0 text-text-tertiary" aria-hidden="true" />
          </a>
        ))}
      </div>
    </div>
  );
}
