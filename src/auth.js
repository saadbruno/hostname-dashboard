const crypto = require('node:crypto');

const COOKIE_NAME = 'homelab_session';
const SESSION_DURATION_SECONDS = 60 * 60 * 24 * 7;

function safeEqual(left, right) {
  const leftBuffer = Buffer.from(String(left));
  const rightBuffer = Buffer.from(String(right));

  if (leftBuffer.length !== rightBuffer.length) return false;
  return crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

function sign(value, secret) {
  return crypto.createHmac('sha256', secret).update(value).digest('base64url');
}

function createSessionCookie(username, secret, secure) {
  const payload = Buffer.from(JSON.stringify({
    username,
    expiresAt: Date.now() + SESSION_DURATION_SECONDS * 1000,
  })).toString('base64url');
  const token = `${payload}.${sign(payload, secret)}`;
  const attributes = [
    `${COOKIE_NAME}=${token}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Strict',
    `Max-Age=${SESSION_DURATION_SECONDS}`,
  ];

  if (secure) attributes.push('Secure');
  return attributes.join('; ');
}

function clearSessionCookie(secure) {
  const attributes = [
    `${COOKIE_NAME}=`,
    'Path=/',
    'HttpOnly',
    'SameSite=Strict',
    'Max-Age=0',
  ];

  if (secure) attributes.push('Secure');
  return attributes.join('; ');
}

function parseCookies(header = '') {
  return Object.fromEntries(
    header.split(';').map((part) => part.trim()).filter(Boolean).map((part) => {
      const separator = part.indexOf('=');
      if (separator === -1) return [part, ''];
      return [part.slice(0, separator), part.slice(separator + 1)];
    }),
  );
}

function readSession(request, secret, expectedUsername) {
  const token = parseCookies(request.headers.cookie)[COOKIE_NAME];
  if (!token) return null;

  const separator = token.lastIndexOf('.');
  if (separator === -1) return null;

  const payload = token.slice(0, separator);
  const signature = token.slice(separator + 1);
  if (!safeEqual(signature, sign(payload, secret))) return null;

  try {
    const session = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    if (session.expiresAt <= Date.now() || !safeEqual(session.username, expectedUsername)) return null;
    return session;
  } catch {
    return null;
  }
}

function requireSession(config) {
  return (request, response, next) => {
    const session = readSession(request, config.sessionSecret, config.username);
    if (!session) return response.status(401).json({ error: 'Authentication required' });
    request.session = session;
    return next();
  };
}

module.exports = {
  clearSessionCookie,
  createSessionCookie,
  readSession,
  requireSession,
  safeEqual,
};

