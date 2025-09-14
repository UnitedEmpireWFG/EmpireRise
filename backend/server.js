/* backend/server.js */
import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import reqlog from './middleware/reqlog.js'
import { requireAuth } from './middleware/auth.js'   // ✅ new fixed middleware
import { timePolicy } from './services/time_windows.js'

// ===== Feature/worker imports (same as before) =====
import health from './routes/health.js'
import healthFull from './routes/health_full.js'
import auth from './routes/auth.js'
import oauthMeta from './routes/oauth_meta.js'
import metaWebhooks from './routes/meta_webhooks.js'
import oauthLinkedIn from './routes/oauth_linkedin.js'
import linkedinInbound from './routes/linkedin_inbound.js'
import calendlyRouter from './routes/calendly.js'

// App feature routes
import messagesRoutes from './routes/messages.js'
import approvalsRoutes from './routes/approvals.js'
import approvalsBulkRouter from './routes/approvals_bulk.js'
import queueRoutes from './routes/queue.js'
import queueApprove from './routes/queue_approve.js'
import leadsRoutes from './routes/leads.js'
import leadsAdd from './routes/leads_add.js'
import appSettings from './routes/settings_app.js'
import settingsRoutes from './routes/settings.js'
import contextRoutes from './routes/context.js'
import sourcingRoutes from './routes/sourcing.js'
import dispatch from './routes/dispatch.js'
import replies from './routes/replies.js'
import birthdays from './routes/birthdays.js'
import exportCsv from './routes/export_csv.js'
import briefings from './routes/briefings.js'
import calSuggest from './routes/cal_suggest.js'
import pushRoutes from './routes/push.js'
import assistLIRoutes from './routes/assist_li.js'
import templatesRouter from './routes/templates.js'
import growthRouter from './routes/growth.js'
import threadsRouter from './routes/threads.js'
import offersRouter from './routes/offers.js'
import misc from './routes/misc_stub.js'
import adminUsersRouter from './routes/admin_users.js'

// ===== Jobs/workers =====
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

const app = express()

/* ---------- keep-alive ---------- */
app.use((_, res, next) => {
  res.setHeader('Connection', 'keep-alive')
  res.setHeader('Keep-Alive', 'timeout=5')
  next()
})

/* ================== CORS ================== */
const NETLIFY_ORIGIN = process.env.ORIGIN_APP || ''
const allowList = [
  NETLIFY_ORIGIN,
  'http://localhost:5173',
  'http://localhost:8787'
].filter(Boolean)

function isAllowedOrigin(origin) {
  if (!origin) return true
  if (allowList.includes(origin)) return true
  try { if (new URL(origin).host.endsWith('.netlify.app')) return true } catch {}
  return false
}

app.use((_, res, next) => { res.setHeader('Vary', 'Origin'); next() })

app.use(cors({
  origin(origin, cb) {
    isAllowedOrigin(origin) ? cb(null, true) : cb(new Error(`cors_blocked ${origin || 'no_origin'}`))
  },
  methods: ['GET','POST','PUT','PATCH','DELETE','OPTIONS'],
  allowedHeaders: ['Content-Type','Authorization','x-app-key'],
  credentials: true,
  maxAge: 600
}))

// Preflight
app.options('*', (req, res) => {
  const origin = req.headers.origin || ''
  if (!isAllowedOrigin(origin)) return res.status(403).end()
  res.setHeader('Access-Control-Allow-Origin', origin)
  res.setHeader('Access-Control-Allow-Credentials', 'true')
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Authorization,Content-Type,x-app-key')
  res.status(204).end()
})

/* ---------- body + req logging ---------- */
app.use(express.json({ limit: '2mb' }))
app.use(reqlog)

/* ---------------- PUBLIC ---------------- */
app.use('/api/health', health)
app.use('/api/health/full', healthFull)
app.use('/auth', auth)
app.use('/oauth/meta', oauthMeta)
app.use('/webhooks/meta', metaWebhooks)
app.use('/webhooks/linkedin', linkedinInbound)
app.use('/webhooks/calendly', calendlyRouter)

/* ---------------- AUTH WALL ---------------- */
app.use(requireAuth)
app.use(adminUsersRouter)

/* ---------------- PROTECTED ROUTES ---------------- */
app.use('/api/messages', messagesRoutes)
app.use('/api/approvals', approvalsRoutes)
app.use('/api/approvals', approvalsBulkRouter)
app.use('/api/queue', queueRoutes)
app.use('/api/queue', queueApprove)
app.use('/api/leads', leadsRoutes)
app.use('/api/leads', leadsAdd)
app.use('/api/settings', settingsRoutes)
app.use('/api/app-settings', appSettings)
app.use('/api/context', contextRoutes)
app.use('/api/sourcing', sourcingRoutes)
app.use('/api/dispatch', dispatch)
app.use('/api/replies', replies)
app.use('/api/birthdays', birthdays)
app.use('/api/export', exportCsv)
app.use('/api/briefings', briefings)
app.use('/api/cal', calSuggest)
app.use('/api/push', pushRoutes)
app.use('/api/assist/li', assistLIRoutes)
app.use('/api', templatesRouter)
app.use('/api', threadsRouter)
app.use('/api', offersRouter)
app.use('/api', misc)
app.use('/api/growth', growthRouter)

/* ---------- Dashboard (protected) ---------- */
app.get('/api/dashboard', (req, res) => {
  res.json({
    ok: true,
    user: req.user?.email || req.user?.sub || null,
    sent: 0,
    replies: 0,
    qualified: 0,
    booked: 0
  })
})

/* ---------- Error handler ---------- */
app.use((err, _req, res, _next) => {
  const msg = err?.message || 'server_error'
  if (msg?.startsWith?.('cors_blocked')) return res.status(403).json({ ok: false, error: msg })
  if (['unauthorized','Unauthorized','invalid_token'].includes(msg)) return res.status(401).json({ ok: false, error: 'unauthorized' })
  res.status(200).json({ ok: false, error: msg })
})

/* ---------- Boot ---------- */
const port = process.env.PORT || 8787
app.listen(port, () => {
  console.log(`EmpireRise API on ${port}`)
  console.log('Work window policy:', timePolicy._cfg)

  // Start jobs
  startBirthdayCron()
  startFollowupsCron()
  startSourcingCron()
  startNightlyDraftsCron()
  startGrowthScheduler()
  startLearningCron()
  startGhostNudgesCron()
  startABHousekeepingCron()

  try { initLiDailyBatch(globalUserCache); console.log('liDailyBatch initialized') }
  catch (e) { console.log('initLiDailyBatch skipped:', e.message) }
})