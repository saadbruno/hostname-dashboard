const fs = require('node:fs');
const path = require('node:path');
const Database = require('better-sqlite3');

function createDatabase(databasePath) {
  fs.mkdirSync(path.dirname(databasePath), { recursive: true });
  const database = new Database(databasePath);

  database.pragma('journal_mode = WAL');
  database.pragma('foreign_keys = ON');
  database.exec(`
    CREATE TABLE IF NOT EXISTS hosts (
      hostname TEXT PRIMARY KEY,
      ipv4 TEXT,
      ipv6 TEXT,
      uptime_seconds INTEGER,
      load_1 REAL,
      load_5 REAL,
      load_15 REAL,
      os TEXT,
      kernel TEXT,
      cpu_count INTEGER,
      memory_total_bytes INTEGER,
      memory_used_bytes INTEGER,
      disk_total_bytes INTEGER,
      disk_used_bytes INTEGER,
      temperature_c REAL,
      metadata TEXT NOT NULL DEFAULT '{}',
      reported_at TEXT,
      received_at TEXT NOT NULL
    )
  `);

  const upsertHost = database.prepare(`
    INSERT INTO hosts (
      hostname, ipv4, ipv6, uptime_seconds, load_1, load_5, load_15,
      os, kernel, cpu_count, memory_total_bytes, memory_used_bytes,
      disk_total_bytes, disk_used_bytes, temperature_c, metadata, reported_at, received_at
    ) VALUES (
      @hostname, @ipv4, @ipv6, @uptime_seconds, @load_1, @load_5, @load_15,
      @os, @kernel, @cpu_count, @memory_total_bytes, @memory_used_bytes,
      @disk_total_bytes, @disk_used_bytes, @temperature_c, @metadata, @reported_at, @received_at
    )
    ON CONFLICT(hostname) DO UPDATE SET
      ipv4 = excluded.ipv4,
      ipv6 = excluded.ipv6,
      uptime_seconds = excluded.uptime_seconds,
      load_1 = excluded.load_1,
      load_5 = excluded.load_5,
      load_15 = excluded.load_15,
      os = excluded.os,
      kernel = excluded.kernel,
      cpu_count = excluded.cpu_count,
      memory_total_bytes = excluded.memory_total_bytes,
      memory_used_bytes = excluded.memory_used_bytes,
      disk_total_bytes = excluded.disk_total_bytes,
      disk_used_bytes = excluded.disk_used_bytes,
      temperature_c = excluded.temperature_c,
      metadata = excluded.metadata,
      reported_at = excluded.reported_at,
      received_at = excluded.received_at
  `);

  const listHosts = database.prepare('SELECT * FROM hosts ORDER BY received_at DESC, hostname ASC');
  const deleteHost = database.prepare('DELETE FROM hosts WHERE hostname = ?');

  return {
    raw: database,
    upsert(host) {
      upsertHost.run(host);
    },
    list() {
      return listHosts.all().map((host) => ({
        ...host,
        metadata: JSON.parse(host.metadata || '{}'),
      }));
    },
    remove(hostname) {
      return deleteHost.run(hostname).changes > 0;
    },
    close() {
      database.close();
    },
  };
}

module.exports = { createDatabase };

