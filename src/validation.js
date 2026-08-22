const net = require('node:net');

const KNOWN_FIELDS = new Set([
  'hostname', 'ipv4', 'ipv6', 'uptime', 'uptime_seconds', 'load', 'load_average',
  'load_1', 'load_5', 'load_15', 'os', 'kernel', 'cpu_count',
  'memory_total_bytes', 'memory_used_bytes', 'disk_total_bytes', 'disk_used_bytes',
  'temperature_c', 'reported_at',
]);

function optionalString(value, maxLength = 255) {
  if (value === undefined || value === null || value === '') return null;
  return String(value).trim().slice(0, maxLength) || null;
}

function optionalNumber(value, { integer = false, min = 0 } = {}) {
  if (value === undefined || value === null || value === '') return null;
  const number = Number(value);
  if (!Number.isFinite(number) || number < min) return null;
  return integer ? Math.round(number) : number;
}

function normalizeLoad(payload) {
  const source = payload.load_average ?? payload.load;
  let values = [];

  if (Array.isArray(source)) values = source;
  if (typeof source === 'string') values = source.trim().split(/[\s,]+/);
  if (source && typeof source === 'object' && !Array.isArray(source)) {
    values = [source['1'] ?? source.one, source['5'] ?? source.five, source['15'] ?? source.fifteen];
  }

  return {
    load_1: optionalNumber(payload.load_1 ?? values[0]),
    load_5: optionalNumber(payload.load_5 ?? values[1]),
    load_15: optionalNumber(payload.load_15 ?? values[2]),
  };
}

function normalizeIp(value, version) {
  const address = optionalString(value, 64);
  if (!address) return null;
  return net.isIP(address) === version ? address : null;
}

function normalizeHostPayload(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return { error: 'Request body must be a JSON object' };
  }

  const hostname = optionalString(payload.hostname, 253);
  if (!hostname || !/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(hostname)) {
    return { error: 'hostname is required and may only contain letters, numbers, dots, underscores, and hyphens' };
  }

  const ipv4 = normalizeIp(payload.ipv4, 4);
  const ipv6 = normalizeIp(payload.ipv6, 6);
  if (payload.ipv4 && !ipv4) return { error: 'ipv4 must be a valid IPv4 address' };
  if (payload.ipv6 && !ipv6) return { error: 'ipv6 must be a valid IPv6 address' };

  const reportedAt = optionalString(payload.reported_at, 64);
  if (reportedAt && Number.isNaN(Date.parse(reportedAt))) {
    return { error: 'reported_at must be a valid date' };
  }

  const metadata = Object.fromEntries(
    Object.entries(payload).filter(([key]) => !KNOWN_FIELDS.has(key)),
  );
  const serializedMetadata = JSON.stringify(metadata);
  if (Buffer.byteLength(serializedMetadata) > 16_384) {
    return { error: 'Additional metadata must be smaller than 16 KB' };
  }

  return {
    value: {
      hostname,
      ipv4,
      ipv6,
      uptime_seconds: optionalNumber(payload.uptime_seconds ?? payload.uptime, { integer: true }),
      ...normalizeLoad(payload),
      os: optionalString(payload.os),
      kernel: optionalString(payload.kernel),
      cpu_count: optionalNumber(payload.cpu_count, { integer: true, min: 1 }),
      memory_total_bytes: optionalNumber(payload.memory_total_bytes, { integer: true }),
      memory_used_bytes: optionalNumber(payload.memory_used_bytes, { integer: true }),
      disk_total_bytes: optionalNumber(payload.disk_total_bytes, { integer: true }),
      disk_used_bytes: optionalNumber(payload.disk_used_bytes, { integer: true }),
      temperature_c: optionalNumber(payload.temperature_c, { min: -100 }),
      metadata: serializedMetadata,
      reported_at: reportedAt ? new Date(reportedAt).toISOString() : null,
      received_at: new Date().toISOString(),
    },
  };
}

module.exports = { normalizeHostPayload };
