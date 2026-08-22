const path = require('node:path');
const express = require('express');
const helmet = require('helmet');
const {
  clearSessionCookie,
  createSessionCookie,
  readSession,
  requireSession,
  safeEqual,
} = require('./auth');
const { normalizeHostPayload } = require('./validation');

function createRateLimiter({ windowMs, limit }) {
  const buckets = new Map();

  return (request, response, next) => {
    const now = Date.now();
    const key = request.ip;
    const bucket = buckets.get(key);

    if (!bucket || bucket.resetAt <= now) {
      buckets.set(key, { count: 1, resetAt: now + windowMs });
      return next();
    }

    bucket.count += 1;
    if (bucket.count <= limit) return next();

    response.set('Retry-After', String(Math.ceil((bucket.resetAt - now) / 1000)));
    return response.status(429).json({ error: 'Too many requests. Try again shortly.' });
  };
}

function requestToken(request) {
  const authorization = request.get('authorization') || '';
  if (authorization.startsWith('Bearer ')) return authorization.slice(7);
  return request.params.token || '';
}

function sourceAddress(request) {
  return (request.ip || request.socket.remoteAddress || '').replace(/^::ffff:/, '');
}

function createApp({ config, database }) {
  const app = express();
  const protect = requireSession(config);
  const loginLimiter = createRateLimiter({ windowMs: 15 * 60 * 1000, limit: 10 });
  const webhookLimiter = createRateLimiter({ windowMs: 60 * 1000, limit: 120 });

  app.disable('x-powered-by');
  app.set('trust proxy', config.trustProxy);
  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'"],
        imgSrc: ["'self'", 'data:'],
        connectSrc: ["'self'"],
      },
    },
  }));
  app.use(express.json({ limit: '24kb' }));

  app.get('/api/health', (_request, response) => {
    response.json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  app.get('/api/session', (request, response) => {
    const session = readSession(request, config.sessionSecret, config.username);
    response.json({ authenticated: Boolean(session), username: session?.username || null });
  });

  app.post('/api/login', loginLimiter, (request, response) => {
    const usernameMatches = safeEqual(request.body?.username || '', config.username);
    const passwordMatches = safeEqual(request.body?.password || '', config.password);

    if (!usernameMatches || !passwordMatches) {
      return response.status(401).json({ error: 'Incorrect username or password' });
    }

    response.set('Set-Cookie', createSessionCookie(config.username, config.sessionSecret, config.secureCookies));
    return response.json({ authenticated: true, username: config.username });
  });

  app.post('/api/logout', (_request, response) => {
    response.set('Set-Cookie', clearSessionCookie(config.secureCookies));
    response.json({ authenticated: false });
  });

  app.get('/api/hosts', protect, (_request, response) => {
    response.json({
      hosts: database.list(),
      offlineAfterMinutes: config.offlineAfterMinutes,
      serverTime: new Date().toISOString(),
    });
  });

  app.delete('/api/hosts/:hostname', protect, (request, response) => {
    const removed = database.remove(request.params.hostname);
    if (!removed) return response.status(404).json({ error: 'Host not found' });
    return response.status(204).end();
  });

  function receiveWebhook(request, response) {
    if (!safeEqual(requestToken(request), config.webhookToken)) {
      return response.status(401).json({ error: 'Invalid webhook token' });
    }

    const payload = { ...request.body };
    const remoteAddress = sourceAddress(request);
    if (!payload.ipv4 && /^\d{1,3}(\.\d{1,3}){3}$/.test(remoteAddress)) payload.ipv4 = remoteAddress;
    if (!payload.ipv6 && remoteAddress.includes(':')) payload.ipv6 = remoteAddress;

    const result = normalizeHostPayload(payload);
    if (result.error) return response.status(400).json({ error: result.error });

    database.upsert(result.value);
    return response.status(202).json({
      accepted: true,
      hostname: result.value.hostname,
      receivedAt: result.value.received_at,
    });
  }

  app.post('/api/webhook', webhookLimiter, receiveWebhook);
  app.post('/api/webhook/:token', webhookLimiter, receiveWebhook);

  app.use(express.static(path.join(__dirname, '..', 'public'), {
    extensions: ['html'],
    maxAge: config.secureCookies ? '1h' : 0,
  }));

  app.use('/api', (_request, response) => {
    response.status(404).json({ error: 'Endpoint not found' });
  });

  app.use((_error, _request, response, _next) => {
    if (_error instanceof SyntaxError && _error.status === 400) {
      return response.status(400).json({ error: 'Malformed JSON body' });
    }
    console.error(_error);
    return response.status(500).json({ error: 'Unexpected server error' });
  });

  return app;
}

module.exports = { createApp };

