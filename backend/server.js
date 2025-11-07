// backend/server.js
import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import cookieParser from 'cookie-parser'

import reqlog from './middleware/reqlog.js'
import { maybeBypass, requireAuth, requireAdmin } from './middleware/auth.js'
import { timePolicy } from './services/time_windows.js'

/* ===== Health/Auth (PUBLIC) ===== */
import health from './routes/health.js'
import healthFull from './routes/health_full.js'
import auth from './routes/auth.js'

/* ===== OAuth + Webhooks (PUBLIC) ===== */
import oauthMeta from './routes/oauth_meta.js'
import oauthLinkedIn from './routes/oauth_linkedin.js'
import metaWebhooks from './routes/meta_webhooks.js'
import linkedinInbound from './routes/linkedin_inbound.js'

/* ===== Platform APIs (PROTECTED) ===== */
import metaIds from './routes/meta_ids.js'
import meta from './routes/meta.js'
import importMeta from './routes/import_meta.js'
import linkedinPost from './routes/linkedin_post.js'
import importLinkedIn from './routes/import_linkedin.js'
import linkedinPipelineRouter from './routes/linkedin_pipeline.js'

/* ===== App features (PROTECTED) ===== */
import messagesRoutes from './routes/messages.js'
import approvalsRoutes from './routes/approvals.js'
import approvalsBulkRouter from './routes/approvals_bulk.js'
import queueRoutes from './routes/queue.js'
import queueApprove from './routes/queue_approve.js'
import birthdays from './routes/birthdays.js'
import dispatch from './routes/dispatch.js'
import replies from './routes/replies.js'
import timeline from './routes/timeline.js'
import exportCsv from './routes/export_csv.js'
import briefings from './routes/briefings.js'
import calendlyRouter from './routes/calendly.js'
import misc from './routes/misc_stub.js'
import contextRoutes from './routes/context.js'
import appSettings from './routes/settings_app.js'
import settingsRoutes from './routes/settings.js'
import leadsRoutes from './routes/leads.js'
import sourcingRoutes from './routes/sourcing.js'
import leadsAdd from './routes/leads_add.js'
import calSuggest from './routes/cal_suggest.js'
import pushRoutes from './routes/push.js'
import assistLIRoutes from './routes/assist_li.js'
import templatesRouter from './routes/templates.js'
import growthRouter from './routes/growth.js'
import threadsRouter from './routes/threads.js'
import offersRouter from './routes/offers.js'
import igDmRouter from './routes/ig_dm.js'
import adminUsersRouter from './routes/admin_users.js'
import smartAdminRouter from './routes/smart_admin.js'
import connectionsRouter from './routes/connections.js'

/* ===== LI/FB senders & pollers ===== */
import { tickLinkedInSender } from './worker/li_dm_sender.js'
import { tickLinkedInInboxPoller } from './worker/li_inbox_poller.js'
import { tickFacebookSender } from './worker/fb_dm_sender.js'
import { tickFacebookInboxPoller } from './worker/fb_inbox_poller.js'

/* ===== Extra routers ===== */
import liBatchRouter from './routes/li_batch.js'
import queueBulkRouter from './routes/queue_bulk.js'
import prospectsRouter from './routes/prospects.js'
import resolverRouter from './routes/resolver.js'

/* ===== Workers & jobs ===== */
import './worker/scheduler.js'
import { startBirthdayCron } from './jobs/birthday_cron.js'
import { startFollowupsCron } from './jobs/followups_cron.js'
import { startSourcingCron } from './worker/sourcing_cron.js'
import { startNightlyDraftsCron } from './worker/nightly.js'
import { startGrowthScheduler } from './worker/growth_scheduler.js'
import { startLearningCron } from './worker/learning_cron.js'
import { startGhostNudgesCron } from './worker/ghost_nudges.js'
import { startABHousekeepingCron } from './worker/ab_housekeeping.js'
import { initLiDailyBatch } from './scheduler/jobs/liDailyBatch.js'
import { startConnectQueueWorker } from './worker/connect_queue_runner.js'
import globalUserCache from './services/users/cache.js'

/* ===== Smart driver (24/7 brain) ===== */
import { startSmartDriver } from './worker/smart_driver.js'

/* ===== AI smoke test ===== */
import { aiComplete } from './lib/ai.js'

/* ===== Status + Cookies Upload ===== */
import socialStatus from './routes/social_status.js'
import linkedinCookiesUpload from './routes/linkedin_cookies_upload.js'
import { startOnConnectSeeder } from './worker/on_connect_seeder.js'

const APP_ORIGIN = (process.env.APP_ORIGIN || process.env.ORIGIN_APP || '').replace(/\/+$/,'')
const NETLIFY_ORIGIN = (process.env.ORIGIN_APP || '').replace(/\/+$/,'')
const APP_PORT = process.env.PORT || 8787

const app = express()

/* ---------- Express hygiene ---------- */
app.set('etag', false) // avoid stale 304s on JSON
app.set('trust proxy', true) // render/proxies

/* ---------- keep-alive ---------- */
app.use((_, res, next) => {
  res.setHeader('Connection', 'keep-alive')
  res.setHeader('Keep-Alive', 'timeout=5')
  next()
})

/* ---------- CORS ---------- */
const allowList = [ NETLIFY_ORIGIN, APP_ORIGIN, 'http://localhost:5173', 'http://localhost:8787' ]
  .filter(Boolean)
function isAllowedOrigin(origin) {
  if (!origin) return true
  if (allowList.includes(origin)) return true
  try { if (new URL(origin).host.endsWith('.netlify.app')) return true } catch {}
  return false
}
app.use((_, res, next) => { res.setHeader('Vary', 'Origin'); next() })
app.use(cors({
  origin(origin, cb) { isAllowedOrigin(origin) ? cb(null, true) : cb(new Error(`cors_blocked ${origin || 'no_origin'}`)) },
  methods: ['GET','POST','PUT','PATCH','DELETE','OPTIONS','HEAD'],
  allowedHeaders: ['Content-Type','Authorization','x-app-key'],
  credentials: true,
  maxAge: 600
}))
app.options('*', (req, res) => {
  const origin = req.headers.origin || ''
  if (!isAllowedOrigin(origin)) return res.status(403).end()
  res.setHeader('Access-Control-Allow-Origin', origin)
  res.setHeader('Access-Control-Allow-Credentials','true')
  res.setHeader('Access-Control-Allow-Methods','GET,POST,PUT,PATCH,DELETE,OPTIONS,HEAD')
  res.setHeader('Access-Control-Allow-Headers','Authorization,Content-Type,x-app-key')
  res.status(204).end()
})

/* ---------- body + cookies + logs ---------- */
app.use(express.json({ limit: '5mb' }))
app.use(cookieParser())
app.use(reqlog)

/* ---------- PUBLIC ---------- */
app.get('/healthz', (_req, res) => res.json({ ok:true, t:Date.now() }))
app.use('/api/health', health)
app.use('/api/health/full', healthFull)
app.use('/auth', auth)

/* OAuth + webhooks (public) */
app.use('/oauth/meta', oauthMeta)
app.use('/oauth/linkedin', oauthLinkedIn)
app.use('/webhooks/meta', metaWebhooks)
app.use('/webhooks/linkedin', linkedinInbound)

/* simple public root + ping */
app.get('/', (_req, res) => res.json({ ok:true, name:'EmpireRise API' }))
app.get('/auth/ping', (_req, res) => res.json({ ok:true }))

/* ---------- Frontend redirects on API host ---------- */
app.get('/settings', (_req, res) => {
  if (!APP_ORIGIN) return res.status(404).json({ ok:false, error:'set APP_ORIGIN' })
  res.redirect(`${APP_ORIGIN}/settings`)
})
app.get('/login', (_req, res) => {
  if (!APP_ORIGIN) return res.status(404).json({ ok:false, error:'set APP_ORIGIN' })
  res.redirect(`${APP_ORIGIN}/login`)
})

/* ---------- AUTH WALL for /api/** ONLY ---------- */
app.use(maybeBypass)
app.use('/api', requireAuth)

/* ---------- PROTECTED MOUNTS (/api/...) ---------- */
app.use('/api/meta', metaIds)
app.use('/api/meta', meta)
app.use('/api/import/meta', importMeta)
app.use('/api/linkedin/pipeline', linkedinPipelineRouter)
app.use('/api/linkedin', linkedinPost)

// Original mount
app.use('/api/import/linkedin', importLinkedIn)
// Alias so POST /api/import/linkedin/contacts works too
app.use('/api/import/linkedin/contacts', importLinkedIn)

app.use('/api', igDmRouter)

app.use('/api/messages', messagesRoutes)
app.use('/api/approvals', approvalsRoutes)
app.use('/api/approvals', approvalsBulkRouter)
app.use('/api/queue', queueRoutes)
app.use('/api/queue', queueApprove)
app.use('/api/birthdays', birthdays)
app.use('/api/replies', replies)
app.use('/api/dispatch', dispatch)
app.use('/api/lead', timeline)
app.use('/api/leads', leadsRoutes)
app.use('/api/leads', leadsAdd)
app.use('/api/export', exportCsv)
app.use('/api/briefings', briefings)
app.use('/api/settings', settingsRoutes)
app.use('/api/context', contextRoutes)
app.use('/api/app-settings', appSettings)
app.use('/api/sourcing', sourcingRoutes)
app.use('/api/cal', calSuggest)
app.use('/api/push', pushRoutes)
app.use('/api/assist/li', assistLIRoutes)
app.use('/api/growth', growthRouter)
app.use('/api', templatesRouter)
app.use('/api', threadsRouter)
app.use('/api', offersRouter)
app.use('/api', misc)
app.use('/api/smart', smartAdminRouter)
app.use('/api/connections', connectionsRouter)

/* â Status under /api/social */
app.use('/api/social', socialStatus)

/* â Cookies upload ONLY under /api/linkedin/cookies */
app.use('/api/linkedin/cookies', requireAuth, linkedinCookiesUpload)

/* admin endpoints */
app.use('/api/admin', requireAdmin, adminUsersRouter)

/* extra routers */
app.use('/api/batch', liBatchRouter)
app.use('/api/queue-bulk', queueBulkRouter)
app.use('/api/prospects', prospectsRouter)
app.use('/api/resolve', resolverRouter)

/* ---------- EXAMPLES ---------- */
app.get('/api/test/ai', async (_req, res) => {
  try {
    const text = await aiComplete('Write a short friendly check in.')
    res.json({ ok:true, text })
  } catch (e) {
    res.status(200).json({ ok:false, error:e.message })
  }
})
app.get('/api/dashboard', (req, res) => {
  res.json({
    ok:true,
    user: req.user?.email || req.user?.sub || null,
    sent:0, replies:0, qualified:0, booked:0
  })
})

/* ---------- ERRORS ---------- */
app.use((err, _req, res, _next) => {
  const msg = err?.message || 'server_error'
  if (msg?.startsWith?.('cors_blocked')) return res.status(403).json({ ok:false, error: msg })
  if (['unauthorized','Unauthorized','invalid_token'].includes(msg)) return res.status(401).json({ ok:false, error:'unauthorized' })
  res.status(200).json({ ok:false, error: msg })
})

/* ---------- BOOT ---------- */
app.listen(APP_PORT, () => {
  console.log(`EmpireRise API on ${APP_PORT}`)
  console.log('Auth bypass:', String(process.env.AUTH_BYPASS || 'false'))
  console.log('Work window policy:', timePolicy._cfg)

  // init the daily batch safely (avoid crashing if scheduler lib not ready)
  if (String(process.env.CONNECT_QUEUE_ENABLED || 'true') === 'true') {
    startConnectQueueWorker()
  }

  const safeInitLiBatch = () => {
    try {
      initLiDailyBatch(globalUserCache)
      console.log('[liDailyBatch] initialized successfully.')
    } catch (e) {
      console.log('initLiDailyBatch skipped:', e.message)
      setTimeout(safeInitLiBatch, 60_000)
    }
  }
  safeInitLiBatch()

  // background loops (guarded by env flags)
  if (String(process.env.LI_SENDER_ENABLED || 'true') === 'true') {
    setInterval(() => tickLinkedInSender().catch(()=>{}), 45_000)
  }
  if (String(process.env.LI_POLLER_ENABLED || 'true') === 'true') {
    const liPollEvery = Math.max(60, Number(process.env.LI_POLL_INTERVAL_SEC || 120))
    setInterval(() => tickLinkedInInboxPoller().catch(()=>{}), liPollEvery * 1000)
  }
  if (String(process.env.FB_SENDER_ENABLED || 'true') === 'true') {
    setInterval(() => tickFacebookSender().catch(()=>{}), 45_000)
  }
  if (String(process.env.FB_POLLER_ENABLED || 'true') === 'true') {
    const fbPollEvery = Math.max(90, Number(process.env.FB_POLL_INTERVAL_SEC || 150))
    setInterval(() => tickFacebookInboxPoller().catch(()=>{}), fbPollEvery * 1000)
  }

  // 24/7 âbrainâ loop (scoring, drafting, enrichment)
  try {
    startSmartDriver()
    console.log('Smart driver started')
  } catch (e) {
    console.log('Smart driver failed to start:', e.message)
  }

  // seed right after successful OAuth connect
  startOnConnectSeeder().catch(()=>{})
})
