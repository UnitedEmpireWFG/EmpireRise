/* backend/server.js */
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

/* ===== OAuth & Webhooks (PUBLIC) ===== */
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
import adminUsersRouter from './routes/admin_users.js' // ✅ import ONCE

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
import globalUserCache from './services/users/cache.js'

/* ===== AI smoke test ===== */
import { aiComplete } from './lib/ai.js'

const app = express()

/* ---------- keep-alive ---------- */
app.use((_, res, next) => {
  res.setHeader('Connection', 'keep-alive')
  res.setHeader('Keep-Alive', 'timeout=5')
  next()
})

/* ---------- parsers & logs (before routes) ---------- */
app.use(cookieParser())
app.use(express.json({ limit: '2mb' }))
app.use(reqlog)

/* ---------- CORS (tight) ---------- */
const NETLIFY_ORIGIN = (process.env.ORIGIN_APP || '').replace(/\/+$/,'') // e.g. https://empirerise.netlify.app
const allowList = [ NETLIFY_ORIGIN, 'http://localhost:5173', 'http://localhost:8787' ].filter(Boolean)
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
  credentials: true, maxAge: 600
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

/* ---------- PUBLIC ---------- */
app.get('/healthz', (_req, res) => res.json({ ok:true, t:Date.now() }))
app.use('/api/health', health)
app.use('/api/health/full', healthFull)
app.use('/auth', auth)

// OAuth/webhooks are PUBLIC (redirects won’t have our token)
app.use('/oauth/meta', oauthMeta)
app.use('/oauth/linkedin', oauthLinkedIn)
app.use('/webhooks/meta', metaWebhooks)
app.use('/webhooks/linkedin', linkedinInbound)

// Public root + ping
app.get('/', (_req, res) => res.json({ ok:true, name:'EmpireRise API' }))
app.get('/auth/ping', (_req, res) => res.json({ ok:true }))

/* ---------- AUTH WALL for /api/** ONLY ---------- */
app.use(maybeBypass)          // no-op unless AUTH_BYPASS=true
app.use('/api', requireAuth)  // protect everything under /api

/* ---------- PROTECTED MOUNTS (/api/...) ---------- */
app.use('/api/meta', metaIds)
app.use('/api/meta', meta)
app.use('/api/import/meta', importMeta)
app.use('/api/linkedin', linkedinPost)
app.use('/api/import/linkedin', importLinkedIn)
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

// Admin router — single mount, namespaced, protected
app.use('/api/admin', requireAdmin, adminUsersRouter)

/* ---------- Example protected endpoints ---------- */
app.get('/api/test/ai', async (_req, res) => {
  try { res.json({ ok:true, text: await aiComplete('Write a short friendly check in.') }) }
  catch (e) { res.status(200).json({ ok:false, error:e.message }) }
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
const port = process.env.PORT || 8787
app.listen(port, () => {
  console.log(`EmpireRise API on ${port}`)
  console.log('Auth bypass:', String(process.env.AUTH_BYPASS || 'false'))
  console.log('Work window policy:', timePolicy._cfg)

  // Jobs
  startBirthdayCron()
  startFollowupsCron()
  startSourcingCron()
  startNightlyDraftsCron()
  startGrowthScheduler()
  startLearningCron()
  startGhostNudgesCron()
  startABHousekeepingCron()

  const safeInitLiBatch = () => {
    try { initLiDailyBatch(globalUserCache); console.log('liDailyBatch initialized') }
    catch (e) { console.log('initLiDailyBatch skipped:', e.message); setTimeout(safeInitLiBatch, 60_000) }
  }
  safeInitLiBatch()

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
})