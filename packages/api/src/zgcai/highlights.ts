import axios from 'axios';
import { logger } from '@librechat/data-schemas';
import { getIntelBaseUrl, getHighlightsTtlMs, getHighlightsCount } from './config';

export interface Highlight {
  id: string;
  title: string;
  source: string;
  category: 'policy' | 'tech';
  url: string;
  date: string;
}

interface HighlightsState {
  items: Highlight[];
  fetchedAt: number;
}

const WINDOW_MS = 7 * 24 * 60 * 60 * 1000;
const PER_SOURCE = 2;

let state: HighlightsState | null = null;
let inFlight: Promise<Highlight[]> | null = null;

function extractList(data: unknown): Array<Record<string, unknown>> {
  if (Array.isArray(data)) {
    return data as Array<Record<string, unknown>>;
  }
  if (data && typeof data === 'object') {
    const obj = data as Record<string, unknown>;
    for (const key of ['data', 'items', 'result']) {
      if (Array.isArray(obj[key])) {
        return obj[key] as Array<Record<string, unknown>>;
      }
    }
  }
  return [];
}

function dateOnly(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Reject far-future timestamps (some sources carry future publication/deadline dates). */
function isFutureDate(dateStr: string): boolean {
  const t = Date.parse(dateStr);
  return Number.isFinite(t) && t > Date.now() + 24 * 60 * 60 * 1000;
}

async function fetchPolicy(base: string): Promise<Highlight[]> {
  const res = await axios.get(`${base}/api/intel/policy/feed`, {
    params: { limit: 10 },
    timeout: 15_000,
  });
  return extractList(res.data)
    .map((it) => ({
      highlight: {
        id: String(it.id ?? ''),
        title: String(it.title ?? '').trim(),
        source: '政策情报',
        category: 'policy' as const,
        url: String(it.sourceUrl ?? it.url ?? ''),
        date: String(it.date ?? ''),
      },
      score: Number(it.matchScore ?? 0),
    }))
    .filter((x) => x.highlight.title && x.highlight.url && !isFutureDate(x.highlight.date))
    .sort((a, b) => b.score - a.score)
    .slice(0, PER_SOURCE)
    .map((x) => x.highlight);
}

async function fetchTech(base: string, dateFrom: string, dateTo: string): Promise<Highlight[]> {
  const res = await axios.get(`${base}/api/articles`, {
    params: {
      dimension: 'technology',
      date_from: dateFrom,
      date_to: dateTo,
      sort_by: 'published_at',
      order: 'desc',
      page_size: 10,
    },
    timeout: 15_000,
  });
  return extractList(res.data)
    .map((it) => ({
      id: String(it.id ?? ''),
      title: String(it.title ?? '').trim(),
      source: '科技前沿',
      category: 'tech' as const,
      url: String(it.url ?? ''),
      date: String(it.published_at ?? ''),
    }))
    .filter((h) => h.title && h.url && h.date && h.date !== 'None' && !isFutureDate(h.date))
    .slice(0, PER_SOURCE);
}

async function doFetch(): Promise<Highlight[]> {
  const base = getIntelBaseUrl();
  if (!base) {
    return [];
  }
  const now = new Date();
  const dateTo = dateOnly(now);
  const dateFrom = dateOnly(new Date(now.getTime() - WINDOW_MS));

  const [policy, tech] = await Promise.allSettled([
    fetchPolicy(base),
    fetchTech(base, dateFrom, dateTo),
  ]);

  const merged: Highlight[] = [];
  if (policy.status === 'fulfilled') {
    merged.push(...policy.value);
  } else {
    logger.warn(`[zgcai/highlights] policy fetch failed: ${(policy.reason as Error)?.message}`);
  }
  if (tech.status === 'fulfilled') {
    merged.push(...tech.value);
  } else {
    logger.warn(`[zgcai/highlights] tech fetch failed: ${(tech.reason as Error)?.message}`);
  }
  return merged.slice(0, getHighlightsCount());
}

/** Cached org-wide "this week" highlights from the Intelligence Engine. Never throws. */
export async function getHighlights(): Promise<Highlight[]> {
  if (state && Date.now() - state.fetchedAt < getHighlightsTtlMs()) {
    return state.items;
  }
  if (inFlight) {
    return inFlight;
  }
  inFlight = doFetch()
    .then((items) => {
      state = { items, fetchedAt: Date.now() };
      logger.info(`[zgcai/highlights] Refreshed: ${items.length} items`);
      return items;
    })
    .catch((err) => {
      logger.error(`[zgcai/highlights] Refresh failed: ${(err as Error).message}`);
      return state?.items ?? [];
    })
    .finally(() => {
      inFlight = null;
    });
  return inFlight;
}

export function warmUpHighlights(): void {
  if (!getIntelBaseUrl()) {
    return;
  }
  getHighlights().catch(() => {
    /* getHighlights already logs; warm-up must not crash startup */
  });
}
