import { Router } from 'express';
import { supa } from '../db.js';

const router = Router();

const STATUS_ORDER = ['new', 'requested', 'connected', 'queued', 'error'];
const FALLBACK_ORDER_COLUMNS = [
  'created_at',
  'inserted_at',
  'createdat',
  'insertedat',
  'createdAt',
  'insertedAt',
  'id'
];
const CREATED_AT_KEYS = ['created_at', 'inserted_at', 'createdat', 'insertedat', 'createdAt', 'insertedAt'];
const UPDATED_AT_KEYS = ['updated_at', 'modified_at', 'updatedat', 'updatedAt', 'inserted_at', 'insertedat'];

function countStatuses(statusRows = []) {
  const counts = Object.create(null);
  for (const key of STATUS_ORDER) {
    counts[key] = 0;
  }

  for (const row of statusRows) {
    const status = typeof row?.status === 'string' ? row.status.toLowerCase() : '';
    if (!status) continue;
    const increment = typeof row.count === 'number' ? row.count : 0;
    counts[status] = (counts[status] || 0) + increment;
  }

  return counts;
}

async function fetchStatusCounts() {
  const rows = [];

  for (const status of STATUS_ORDER) {
    try {
      const response = await supa
        .from('candidates')
        .select('id', { count: 'exact', head: true })
        .eq('platform', 'linkedin')
        .eq('status', status);

      rows.push({ status, count: response?.count || 0 });
    } catch (error) {
      console.warn('linkedin_pipeline status count failed', status, error);
      rows.push({ status, count: 0 });
    }
  }

  return countStatuses(rows);
}

router.get('/', async (_req, res) => {
  try {
    const candidatesPromise = fetchWithFallback('candidates', {
      matchers: (query) => query.eq('platform', 'linkedin'),
      limit: 50
    });
    const queuePromise = fetchWithFallback('connect_queue', {
      matchers: (query) => query.eq('platform', 'linkedin'),
      limit: 25
    });
    const logPromise = fetchWithFallback('connect_log', {
      matchers: (query) => query.eq('platform', 'linkedin'),
      limit: 25
    });

    const [statusCounts, candidatesResp, queueResp, logResp] = await Promise.all([
      fetchStatusCounts(),
      candidatesPromise,
      queuePromise,
      logPromise
    ]);

    const errors = [candidatesResp?.error, queueResp?.error, logResp?.error]
      .filter(Boolean)
      .map((err) => (err?.message ? err.message : String(err)));

    if (errors.length > 0) {
      throw new Error(errors.join('; '));
    }

    res.json({
      ok: true,
      stats: statusCounts,
      candidates: (candidatesResp?.data || []).map(normalizeTimestamps),
      queue: (queueResp?.data || []).map(normalizeTimestamps),
      log: (logResp?.data || []).map(normalizeTimestamps)
    });
  } catch (error) {
    res.status(200).json({ ok: false, error: error?.message ? error.message : String(error) });
  }
});

function normalizeTimestamps(row = {}) {
  const createdAt = pickFirstTimestamp(row, CREATED_AT_KEYS);
  const updatedAt = pickFirstTimestamp(row, UPDATED_AT_KEYS) || createdAt || null;

  return {
    ...row,
    created_at: createdAt || null,
    updated_at: updatedAt
  };
}

function pickFirstTimestamp(row, keys) {
  for (const key of keys) {
    if (row[key]) return row[key];
  }
  return null;
}

async function fetchWithFallback(table, options = {}) {
  const { matchers, limit = 50, select = '*' } = options;

  const applyMatchers = (query) => {
    if (typeof matchers === 'function') {
      const next = matchers(query);
      return next || query;
    }
    return query;
  };

  for (const column of FALLBACK_ORDER_COLUMNS) {
    try {
      let query = supa.from(table).select(select);
      query = applyMatchers(query);

      const response = await query.order(column, { ascending: false, nullsFirst: false }).limit(limit);

      if (!response.error || response.error?.code !== '42703') {
        return response;
      }
    } catch (error) {
      return { data: null, error };
    }
  }

  try {
    let query = supa.from(table).select(select);
    query = applyMatchers(query);
    return await query.limit(limit);
  } catch (error) {
    return { data: null, error };
  }
}

export default router;
