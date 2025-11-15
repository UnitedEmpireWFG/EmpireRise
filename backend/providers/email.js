import net from 'node:net'
import tls from 'node:tls'
import os from 'node:os'
import { randomBytes } from 'node:crypto'

const CRLF = '\r\n'

function toBase64(value) {
  return Buffer.from(String(value || ''), 'utf8').toString('base64')
}

function normalizeRecipients(input) {
  if (!input) return []
  if (Array.isArray(input)) {
    return input.flatMap((entry) => normalizeRecipients(entry))
  }
  return String(input)
    .split(/[,;]/)
    .map((part) => part.trim())
    .filter(Boolean)
}

function formatHeaders(headers) {
  return Object.entries(headers)
    .filter(([, value]) => value !== undefined && value !== null && value !== '')
    .map(([key, value]) => `${key}: ${value}`)
    .join(CRLF)
}

function escapeDots(lines) {
  return lines
    .split(/\r?\n/)
    .map((line) => (line.startsWith('.') ? '.' + line : line))
    .join(CRLF)
}

function buildMessage({ from, to, subject, text, html }) {
  const date = new Date().toUTCString()
  const headers = {
    From: from,
    To: Array.isArray(to) ? to.join(', ') : to,
    Subject: subject || '',
    Date: date,
    'MIME-Version': '1.0'
  }

  if (text && html) {
    const boundary = `----EmpireRise${randomBytes(12).toString('hex')}`
    headers['Content-Type'] = `multipart/alternative; boundary="${boundary}"`
    const bodySegments = [
      `--${boundary}`,
      'Content-Type: text/plain; charset=utf-8',
      'Content-Transfer-Encoding: 7bit',
      '',
      text,
      `--${boundary}`,
      'Content-Type: text/html; charset=utf-8',
      'Content-Transfer-Encoding: 7bit',
      '',
      html,
      `--${boundary}--`,
      ''
    ]
    return `${formatHeaders(headers)}${CRLF}${CRLF}${bodySegments.join(CRLF)}`
  }

  if (html) {
    headers['Content-Type'] = 'text/html; charset=utf-8'
    headers['Content-Transfer-Encoding'] = '7bit'
    return `${formatHeaders(headers)}${CRLF}${CRLF}${html}`
  }

  headers['Content-Type'] = 'text/plain; charset=utf-8'
  headers['Content-Transfer-Encoding'] = '7bit'
  return `${formatHeaders(headers)}${CRLF}${CRLF}${text || ''}`
}

async function readResponse(socket) {
  return await new Promise((resolve, reject) => {
    let buffer = ''

    function cleanup(error) {
      socket.off('data', onData)
      socket.off('error', onError)
      socket.off('end', onEnd)
      if (error) {
        reject(error)
      }
    }

    function onEnd() {
      cleanup(new Error('smtp_connection_closed'))
    }

    function onError(error) {
      cleanup(error)
    }

    function onData(chunk) {
      buffer += chunk.toString('utf8')
      if (!buffer.endsWith(CRLF)) {
        return
      }
      const lines = buffer.trim().split(/\r?\n/)
      const lastLine = lines[lines.length - 1] || ''
      if (!/^\d{3} /.test(lastLine)) {
        return
      }
      cleanup()
      resolve({
        code: Number(lastLine.slice(0, 3)),
        lines
      })
    }

    socket.on('data', onData)
    socket.once('error', onError)
    socket.once('end', onEnd)
  })
}

async function sendCommand(socket, command) {
  socket.write(command + CRLF)
  return await readResponse(socket)
}

async function establishConnection({ host, port, secure, timeoutMs }) {
  const baseOptions = { host, port: Number(port || (secure ? 465 : 587)) }
  const socket = secure
    ? tls.connect({ ...baseOptions, servername: host })
    : net.createConnection(baseOptions)

  if (timeoutMs) {
    socket.setTimeout(timeoutMs, () => {
      socket.destroy(new Error('smtp_connection_timeout'))
    })
  }

  await new Promise((resolve, reject) => {
    socket.once('error', reject)
    socket.once('secureConnect', resolve)
    socket.once('connect', resolve)
  })

  const greeting = await readResponse(socket)
  if (greeting.code !== 220) {
    socket.destroy()
    throw new Error(`smtp_greeting_failed:${greeting.lines.join('|')}`)
  }

  return socket
}

async function upgradeToTLS(socket, host) {
  const tlsSocket = tls.connect({ socket, servername: host })
  await new Promise((resolve, reject) => {
    tlsSocket.once('secureConnect', resolve)
    tlsSocket.once('error', reject)
  })
  return tlsSocket
}

async function authenticate(socket, { user, pass }) {
  const authInit = await sendCommand(socket, 'AUTH LOGIN')
  if (authInit.code !== 334) {
    throw new Error(`smtp_auth_init_failed:${authInit.lines.join('|')}`)
  }
  const userResp = await sendCommand(socket, toBase64(user))
  if (userResp.code !== 334) {
    throw new Error(`smtp_auth_user_failed:${userResp.lines.join('|')}`)
  }
  const passResp = await sendCommand(socket, toBase64(pass))
  if (passResp.code !== 235) {
    throw new Error(`smtp_auth_pass_failed:${passResp.lines.join('|')}`)
  }
}

async function transmitMail(socket, host, message, { from, to }) {
  const heloDomain = process.env.SMTP_EHLO_DOMAIN || os.hostname() || 'localhost'
  let ehlo = await sendCommand(socket, `EHLO ${heloDomain}`)
  if (ehlo.code !== 250) {
    throw new Error(`smtp_ehlo_failed:${ehlo.lines.join('|')}`)
  }

  const supportsStartTLS = ehlo.lines.some((line) => /STARTTLS/i.test(line))
  let activeSocket = socket

  if (!socket.encrypted && supportsStartTLS) {
    const starttls = await sendCommand(socket, 'STARTTLS')
    if (starttls.code !== 220) {
      throw new Error(`smtp_starttls_failed:${starttls.lines.join('|')}`)
    }
    activeSocket = await upgradeToTLS(socket, host)
    ehlo = await sendCommand(activeSocket, `EHLO ${heloDomain}`)
    if (ehlo.code !== 250) {
      throw new Error(`smtp_post_tls_ehlo_failed:${ehlo.lines.join('|')}`)
    }
  }

  const authUser = process.env.SMTP_USER
  const authPass = process.env.SMTP_PASS

  if (authUser && authPass) {
    await authenticate(activeSocket, { user: authUser, pass: authPass })
  }

  const mailFrom = await sendCommand(activeSocket, `MAIL FROM:<${from}>`)
  if (mailFrom.code !== 250) {
    throw new Error(`smtp_mail_from_failed:${mailFrom.lines.join('|')}`)
  }

  for (const rcpt of normalizeRecipients(to)) {
    const rcptResp = await sendCommand(activeSocket, `RCPT TO:<${rcpt}>`)
    if (![250, 251].includes(rcptResp.code)) {
      throw new Error(`smtp_rcpt_failed:${rcpt}:${rcptResp.lines.join('|')}`)
    }
  }

  const dataResp = await sendCommand(activeSocket, 'DATA')
  if (dataResp.code !== 354) {
    throw new Error(`smtp_data_init_failed:${dataResp.lines.join('|')}`)
  }

  const normalized = escapeDots(message) + CRLF + '.' + CRLF
  await new Promise((resolve, reject) => {
    activeSocket.write(normalized, (error) => {
      if (error) reject(error)
      else resolve()
    })
  })
  const completeResp = await readResponse(activeSocket)
  if (completeResp.code !== 250) {
    throw new Error(`smtp_data_failed:${completeResp.lines.join('|')}`)
  }

  await sendCommand(activeSocket, 'QUIT').catch(() => {})
  activeSocket.end()
  return activeSocket
}

class SimpleSMTPTransport {
  constructor({ host, port, secure, timeoutMs }) {
    this.host = host
    this.port = port
    this.secure = Boolean(secure)
    this.timeoutMs = timeoutMs || 20000
  }

  async sendMail({ from, to, subject, text, html }) {
    if (!from) {
      throw new Error('smtp_missing_from_address')
    }
    const recipients = normalizeRecipients(to)
    if (!recipients.length) {
      throw new Error('smtp_missing_recipient')
    }

    const message = buildMessage({ from, to: recipients, subject, text, html })
    const socket = await establishConnection({
      host: this.host,
      port: this.port,
      secure: this.secure,
      timeoutMs: this.timeoutMs
    })

    try {
      const activeSocket = await transmitMail(socket, this.host, message, { from, to: recipients })
      activeSocket.destroy()
    } finally {
      socket.destroy()
    }
  }
}

export function makeTransport() {
  const host = process.env.SMTP_HOST
  const port = Number(process.env.SMTP_PORT || 587)
  const secure = process.env.SMTP_SECURE === 'true' || port === 465
  if (!host) {
    throw new Error('smtp_host_not_configured')
  }
  return new SimpleSMTPTransport({ host, port, secure })
}
