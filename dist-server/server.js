"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
require("dotenv/config");
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const crypto_1 = require("crypto");
const cors_1 = __importDefault(require("cors"));
const better_sqlite3_1 = __importDefault(require("better-sqlite3"));
const express_1 = __importDefault(require("express"));
const fs_1 = __importDefault(require("fs"));
const http_1 = require("http");
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const multer_1 = __importDefault(require("multer"));
const path_1 = __importDefault(require("path"));
const socket_io_1 = require("socket.io");
const app = (0, express_1.default)();
const httpServer = (0, http_1.createServer)(app);
const PORT = Number(process.env.PORT || 3000);
const DB_PATH = process.env.DB_PATH || path_1.default.resolve(process.cwd(), "database.sqlite");
const JWT_SECRET = process.env.JWT_SECRET || "change-this-secret-in-production";
const UPLOADS_DIR = process.env.UPLOADS_DIR || path_1.default.resolve(process.cwd(), "uploads");
const MAX_UPLOAD_SIZE_MB = Math.max(21, Number(process.env.MAX_UPLOAD_SIZE_MB || 2048));
const MAX_UPLOAD_SIZE_BYTES = Math.floor(MAX_UPLOAD_SIZE_MB * 1024 * 1024);
const USERNAME_COOLDOWN_HOURS = Math.max(1, Number(process.env.USERNAME_COOLDOWN_HOURS || 24));
const CALL_RING_TIMEOUT_MS = Math.max(5000, Number(process.env.CALL_RING_TIMEOUT_MS || 30000));
const USERNAME_REGEX = /^[a-z0-9_]{3,32}$/;
const ROOM_SLUG_REGEX = /^[a-z0-9_-]{3,48}$/;
const ENCRYPTION_KEY_SOURCE = process.env.ENCRYPTION_KEY || JWT_SECRET;
const ENCRYPTION_KEY = (0, crypto_1.createHash)("sha256").update(ENCRYPTION_KEY_SOURCE).digest();
const ENCRYPTION_PREFIX = "enc:v1:";
fs_1.default.mkdirSync(UPLOADS_DIR, { recursive: true });
const allowedOrigins = (process.env.CORS_ORIGIN || "*")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
const corsOptions = {
    origin(origin, callback) {
        if (!origin || allowedOrigins.includes("*") || allowedOrigins.includes(origin)) {
            callback(null, true);
            return;
        }
        callback(new Error("CORS blocked by server policy"));
    },
    credentials: true
};
app.use((0, cors_1.default)(corsOptions));
app.options("*", (0, cors_1.default)(corsOptions));
app.use(express_1.default.json({ limit: "10mb" }));
app.use("/uploads", express_1.default.static(UPLOADS_DIR));
app.use((req, res, next) => {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("X-Frame-Options", "DENY");
    res.setHeader("Referrer-Policy", "no-referrer");
    res.setHeader("Permissions-Policy", "camera=(), geolocation=(), interest-cohort=()");
    if (process.env.NODE_ENV === "production") {
        res.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
    }
    if (req.path.startsWith("/uploads/")) {
        res.setHeader("Cache-Control", "private, max-age=31536000, immutable");
    }
    next();
});
const io = new socket_io_1.Server(httpServer, {
    cors: {
        origin: allowedOrigins.includes("*") ? true : allowedOrigins,
        credentials: true
    }
});
const db = new better_sqlite3_1.default(DB_PATH);
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");
function normalizeTheme(value) {
    return value === "light" ? "light" : "dark";
}
function normalizeChatBubbleStyle(value) {
    if (value === "rounded" || value === "compact") {
        return value;
    }
    return "modern";
}
function normalizeChatWallpaper(value) {
    if (value === "plain" || value === "mesh") {
        return value;
    }
    return "gradient";
}
function normalizeMessageFontScale(value) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) {
        return 100;
    }
    return Math.min(120, Math.max(85, Math.round(numeric)));
}
function normalizeMessageType(value) {
    if (value === "file" || value === "voice") {
        return value;
    }
    return "text";
}
function normalizeChannelKind(value) {
    return value === "group" ? "group" : "channel";
}
function encryptField(value) {
    if (!value) {
        return "";
    }
    const iv = (0, crypto_1.randomBytes)(12);
    const cipher = (0, crypto_1.createCipheriv)("aes-256-gcm", ENCRYPTION_KEY, iv);
    const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
    const tag = cipher.getAuthTag();
    const payload = Buffer.concat([iv, tag, encrypted]).toString("base64url");
    return `${ENCRYPTION_PREFIX}${payload}`;
}
function decryptField(value) {
    if (!value) {
        return "";
    }
    if (!value.startsWith(ENCRYPTION_PREFIX)) {
        return value;
    }
    try {
        const encoded = value.slice(ENCRYPTION_PREFIX.length);
        const raw = Buffer.from(encoded, "base64url");
        const iv = raw.subarray(0, 12);
        const tag = raw.subarray(12, 28);
        const encrypted = raw.subarray(28);
        const decipher = (0, crypto_1.createDecipheriv)("aes-256-gcm", ENCRYPTION_KEY, iv);
        decipher.setAuthTag(tag);
        return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString("utf8");
    }
    catch {
        return "";
    }
}
const authAttempts = new Map();
function isRateLimited(key, limit, windowMs) {
    const now = Date.now();
    const state = authAttempts.get(key);
    if (!state || now > state.resetAt) {
        authAttempts.set(key, { count: 1, resetAt: now + windowMs });
        return false;
    }
    state.count += 1;
    return state.count > limit;
}
function ensureColumn(tableName, columnName, columnDef) {
    const columns = db
        .prepare(`PRAGMA table_info(${tableName})`)
        .all();
    const hasColumn = columns.some((column) => column.name === columnName);
    if (!hasColumn) {
        db.exec(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${columnDef}`);
    }
}
function makeUniqueId() {
    const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    while (true) {
        let uniqueId = "";
        for (let i = 0; i < 6; i += 1) {
            uniqueId += alphabet[Math.floor(Math.random() * alphabet.length)];
        }
        const existing = db
            .prepare("SELECT id FROM users WHERE unique_id = ?")
            .get(uniqueId);
        if (!existing) {
            return uniqueId;
        }
    }
}
function normalizeNumericUserId(value) {
    const numeric = Number(value);
    if (!Number.isInteger(numeric) || numeric <= 0) {
        return 0;
    }
    return numeric;
}
function allocateNextNumericUserId() {
    const row = db
        .prepare("SELECT COALESCE(MAX(numeric_user_id), 0) AS max_user_id FROM users")
        .get();
    const next = Number(row?.max_user_id || 0) + 1;
    return next > 0 ? next : 1;
}
function isEmailValid(value) {
    return /^\S+@\S+\.\S+$/.test(value);
}
function normalizeUsername(value) {
    return value.trim().toLowerCase();
}
function isUsernameValid(value) {
    return USERNAME_REGEX.test(value);
}
function sanitizeMessageText(value) {
    return value.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "").trim();
}
function classifyMimeType(mimeType) {
    if (mimeType.startsWith("image/")) {
        return "image";
    }
    if (mimeType.startsWith("video/")) {
        return "video";
    }
    if (mimeType.startsWith("audio/")) {
        return "audio";
    }
    return "file";
}
function inferMediaKindFromMessage(type, fileName, fileUrl) {
    if (type === "voice") {
        return "audio";
    }
    const ext = path_1.default.extname(fileName || fileUrl).toLowerCase();
    if ([".jpg", ".jpeg", ".png", ".gif", ".webp", ".bmp", ".svg"].includes(ext)) {
        return "image";
    }
    if ([".mp4", ".mov", ".avi", ".mkv", ".webm"].includes(ext)) {
        return "video";
    }
    if ([".mp3", ".wav", ".ogg", ".m4a", ".webm", ".aac", ".flac"].includes(ext)) {
        return "audio";
    }
    return "file";
}
function isBlockedUpload(fileName, mimeType) {
    const ext = path_1.default.extname(fileName || "").toLowerCase();
    const blockedExt = new Set([
        ".exe",
        ".bat",
        ".cmd",
        ".ps1",
        ".scr",
        ".com",
        ".js",
        ".vbs",
        ".jar",
        ".msi",
        ".hta"
    ]);
    if (blockedExt.has(ext)) {
        return true;
    }
    return mimeType === "application/x-msdownload" || mimeType === "application/x-dosexec";
}
function toSqlNow() {
    return "datetime('now')";
}
function conversationRoomName(conversationId) {
    return `conversation:${conversationId}`;
}
function ensureSchema() {
    db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      username TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      display_name TEXT,
      unique_id TEXT UNIQUE,
      numeric_user_id INTEGER UNIQUE,
      email TEXT,
      bio TEXT,
      avatar_url TEXT,
      theme TEXT,
      chat_bubble_style TEXT,
      chat_wallpaper TEXT,
      message_font_scale INTEGER,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY,
      sender_id TEXT NOT NULL,
      receiver_id TEXT NOT NULL,
      content TEXT,
      type TEXT NOT NULL DEFAULT 'text',
      file_url TEXT,
      file_name TEXT,
      timestamp TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY(sender_id) REFERENCES users(id),
      FOREIGN KEY(receiver_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS friendships (
      user_id TEXT NOT NULL,
      friend_id TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      PRIMARY KEY(user_id, friend_id),
      FOREIGN KEY(user_id) REFERENCES users(id),
      FOREIGN KEY(friend_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS channels (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      owner_id TEXT NOT NULL,
      kind TEXT NOT NULL DEFAULT 'channel',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY(owner_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS channel_members (
      channel_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'member',
      joined_at TEXT NOT NULL DEFAULT (datetime('now')),
      PRIMARY KEY(channel_id, user_id),
      FOREIGN KEY(channel_id) REFERENCES channels(id) ON DELETE CASCADE,
      FOREIGN KEY(user_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS channel_messages (
      id TEXT PRIMARY KEY,
      channel_id TEXT NOT NULL,
      sender_id TEXT NOT NULL,
      content TEXT,
      type TEXT NOT NULL DEFAULT 'text',
      file_url TEXT,
      file_name TEXT,
      timestamp TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY(channel_id) REFERENCES channels(id) ON DELETE CASCADE,
      FOREIGN KEY(sender_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS archived_items (
      user_id TEXT NOT NULL,
      target_type TEXT NOT NULL,
      target_id TEXT NOT NULL,
      archived_at TEXT NOT NULL DEFAULT (datetime('now')),
      PRIMARY KEY (user_id, target_type, target_id),
      FOREIGN KEY(user_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS conversations (
      id TEXT PRIMARY KEY,
      type TEXT NOT NULL DEFAULT 'direct',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS conversation_participants (
      conversation_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'member',
      joined_at TEXT NOT NULL DEFAULT (datetime('now')),
      last_read_at TEXT,
      last_delivered_at TEXT,
      PRIMARY KEY(conversation_id, user_id),
      FOREIGN KEY(conversation_id) REFERENCES conversations(id) ON DELETE CASCADE,
      FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS username_history (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      old_username TEXT NOT NULL,
      new_username TEXT NOT NULL,
      changed_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS media_attachments (
      id TEXT PRIMARY KEY,
      owner_user_id TEXT NOT NULL,
      storage_path TEXT NOT NULL,
      public_url TEXT NOT NULL,
      file_name TEXT NOT NULL,
      mime_type TEXT NOT NULL,
      size_bytes INTEGER NOT NULL,
      media_kind TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY(owner_user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS message_attachments (
      message_id TEXT NOT NULL,
      attachment_id TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      PRIMARY KEY(message_id, attachment_id),
      FOREIGN KEY(message_id) REFERENCES messages(id) ON DELETE CASCADE,
      FOREIGN KEY(attachment_id) REFERENCES media_attachments(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS channel_message_attachments (
      channel_message_id TEXT NOT NULL,
      attachment_id TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      PRIMARY KEY(channel_message_id, attachment_id),
      FOREIGN KEY(channel_message_id) REFERENCES channel_messages(id) ON DELETE CASCADE,
      FOREIGN KEY(attachment_id) REFERENCES media_attachments(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS call_sessions (
      id TEXT PRIMARY KEY,
      initiator_user_id TEXT NOT NULL,
      recipient_user_id TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'ringing',
      started_at TEXT NOT NULL DEFAULT (datetime('now')),
      accepted_at TEXT,
      ended_at TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      ended_by_user_id TEXT,
      decline_reason TEXT,
      ended_reason TEXT,
      last_event_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY(initiator_user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY(recipient_user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS call_participants (
      call_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'peer',
      joined_at TEXT,
      left_at TEXT,
      PRIMARY KEY(call_id, user_id),
      FOREIGN KEY(call_id) REFERENCES call_sessions(id) ON DELETE CASCADE,
      FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
    );
  `);
    ensureColumn("users", "display_name", "TEXT");
    ensureColumn("users", "unique_id", "TEXT");
    ensureColumn("users", "numeric_user_id", "INTEGER");
    ensureColumn("users", "created_at", "TEXT");
    ensureColumn("users", "email", "TEXT");
    ensureColumn("users", "bio", "TEXT");
    ensureColumn("users", "avatar_url", "TEXT");
    ensureColumn("users", "theme", "TEXT");
    ensureColumn("users", "chat_bubble_style", "TEXT");
    ensureColumn("users", "chat_wallpaper", "TEXT");
    ensureColumn("users", "message_font_scale", "INTEGER");
    ensureColumn("channels", "kind", "TEXT");
    ensureColumn("channels", "username_slug", "TEXT");
    ensureColumn("channels", "description", "TEXT");
    ensureColumn("channels", "avatar_url", "TEXT");
    ensureColumn("messages", "conversation_id", "TEXT");
    ensureColumn("messages", "sender_user_id", "TEXT");
    ensureColumn("messages", "body", "TEXT");
    ensureColumn("messages", "message_type", "TEXT");
    ensureColumn("messages", "created_at", "TEXT");
    ensureColumn("messages", "updated_at", "TEXT");
    ensureColumn("messages", "delivered_at", "TEXT");
    ensureColumn("messages", "read_at", "TEXT");
    ensureColumn("messages", "is_deleted", "INTEGER NOT NULL DEFAULT 0");
    ensureColumn("call_sessions", "created_at", "TEXT");
    ensureColumn("call_sessions", "updated_at", "TEXT");
    ensureColumn("call_sessions", "ended_by_user_id", "TEXT");
    ensureColumn("call_sessions", "decline_reason", "TEXT");
    ensureColumn("call_sessions", "ended_reason", "TEXT");
    db.exec(`
    CREATE INDEX IF NOT EXISTS idx_messages_pair ON messages(sender_id, receiver_id, timestamp);
    CREATE INDEX IF NOT EXISTS idx_messages_conversation_created ON messages(conversation_id, created_at);
    CREATE INDEX IF NOT EXISTS idx_messages_conversation_read ON messages(conversation_id, read_at, created_at);
    CREATE INDEX IF NOT EXISTS idx_friendships_user ON friendships(user_id, friend_id);
    CREATE INDEX IF NOT EXISTS idx_channel_members_user ON channel_members(user_id, channel_id);
    CREATE INDEX IF NOT EXISTS idx_channel_messages_channel ON channel_messages(channel_id, timestamp);
    CREATE INDEX IF NOT EXISTS idx_archived_user ON archived_items(user_id, archived_at DESC);
    CREATE INDEX IF NOT EXISTS idx_users_unique_id_ci ON users(upper(unique_id));
    CREATE INDEX IF NOT EXISTS idx_users_numeric_user_id ON users(numeric_user_id);
    CREATE INDEX IF NOT EXISTS idx_users_display_name_ci ON users(lower(display_name));
    CREATE INDEX IF NOT EXISTS idx_conversation_participants_user ON conversation_participants(user_id, conversation_id);
    CREATE INDEX IF NOT EXISTS idx_username_history_user ON username_history(user_id, changed_at DESC);
    CREATE INDEX IF NOT EXISTS idx_media_owner_kind ON media_attachments(owner_user_id, media_kind, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_channel_username_slug ON channels(username_slug);
    CREATE INDEX IF NOT EXISTS idx_call_sessions_pair ON call_sessions(initiator_user_id, recipient_user_id, started_at DESC);
    CREATE INDEX IF NOT EXISTS idx_call_sessions_status ON call_sessions(status, updated_at DESC);
  `);
    db.exec("CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email_unique ON users(email) WHERE email IS NOT NULL;");
    db.exec("CREATE UNIQUE INDEX IF NOT EXISTS idx_users_numeric_user_id_unique ON users(numeric_user_id) WHERE numeric_user_id IS NOT NULL;");
    try {
        db.exec("CREATE UNIQUE INDEX IF NOT EXISTS idx_users_username_ci ON users(lower(username));");
    }
    catch {
        db.exec("CREATE INDEX IF NOT EXISTS idx_users_username_ci ON users(lower(username));");
    }
    db.exec(`
    UPDATE users
    SET username = lower(trim(username))
    WHERE username IS NOT NULL;

    UPDATE users
    SET display_name = username
    WHERE display_name IS NULL OR trim(display_name) = '';

    UPDATE users
    SET bio = ''
    WHERE bio IS NULL;

    UPDATE users
    SET avatar_url = ''
    WHERE avatar_url IS NULL;

    UPDATE users
    SET theme = 'dark'
    WHERE theme IS NULL OR trim(theme) = '';

    UPDATE users
    SET chat_bubble_style = 'modern'
    WHERE chat_bubble_style IS NULL OR trim(chat_bubble_style) = '';

    UPDATE users
    SET chat_wallpaper = 'gradient'
    WHERE chat_wallpaper IS NULL OR trim(chat_wallpaper) = '';

    UPDATE users
    SET message_font_scale = 100
    WHERE message_font_scale IS NULL OR message_font_scale < 85 OR message_font_scale > 120;

    UPDATE users
    SET created_at = datetime('now')
    WHERE created_at IS NULL OR trim(created_at) = '';

    UPDATE channels
    SET kind = 'channel'
    WHERE kind IS NULL OR trim(kind) = '';

    UPDATE channels
    SET description = ''
    WHERE description IS NULL;

    UPDATE channels
    SET avatar_url = ''
    WHERE avatar_url IS NULL;

    UPDATE messages
    SET sender_user_id = sender_id
    WHERE (sender_user_id IS NULL OR trim(sender_user_id) = '') AND sender_id IS NOT NULL;

    UPDATE messages
    SET body = content
    WHERE body IS NULL AND content IS NOT NULL;

    UPDATE messages
    SET message_type = type
    WHERE message_type IS NULL AND type IS NOT NULL;

    UPDATE messages
    SET message_type = 'text'
    WHERE message_type IS NULL OR trim(message_type) = '';

    UPDATE messages
    SET created_at = COALESCE(timestamp, datetime('now'))
    WHERE created_at IS NULL OR trim(created_at) = '';

    UPDATE messages
    SET updated_at = created_at
    WHERE updated_at IS NULL OR trim(updated_at) = '';

    UPDATE messages
    SET is_deleted = 0
    WHERE is_deleted IS NULL;

    UPDATE call_sessions
    SET created_at = COALESCE(created_at, started_at, datetime('now'))
    WHERE created_at IS NULL OR trim(created_at) = '';

    UPDATE call_sessions
    SET updated_at = COALESCE(updated_at, last_event_at, created_at, datetime('now'))
    WHERE updated_at IS NULL OR trim(updated_at) = '';

    UPDATE call_sessions
    SET status = 'failed'
    WHERE status IS NULL OR trim(status) = '';
  `);
    const usersWithoutNumericId = db
        .prepare(`
      SELECT id
      FROM users
      WHERE numeric_user_id IS NULL OR numeric_user_id <= 0
      ORDER BY datetime(created_at) ASC, id ASC
      `)
        .all();
    if (usersWithoutNumericId.length > 0) {
        let nextNumericId = allocateNextNumericUserId();
        const updateNumericId = db.prepare("UPDATE users SET numeric_user_id = ? WHERE id = ?");
        for (const user of usersWithoutNumericId) {
            updateNumericId.run(nextNumericId, user.id);
            nextNumericId += 1;
        }
    }
    const usersWithoutUniqueId = db
        .prepare("SELECT id FROM users WHERE unique_id IS NULL OR trim(unique_id) = ''")
        .all();
    const updateUniqueId = db.prepare("UPDATE users SET unique_id = ? WHERE id = ?");
    for (const user of usersWithoutUniqueId) {
        updateUniqueId.run(makeUniqueId(), user.id);
    }
    const usersWithoutEmail = db
        .prepare("SELECT id, username FROM users WHERE email IS NULL OR trim(email) = ''")
        .all();
    const updateEmail = db.prepare("UPDATE users SET email = ? WHERE id = ?");
    for (const user of usersWithoutEmail) {
        updateEmail.run(`${user.username}@local.chat`, user.id);
    }
    backfillConversationsFromLegacyMessages();
    ensureChannelSlugs();
    try {
        db.exec(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_channels_username_slug_ci_unique
      ON channels(lower(username_slug))
      WHERE username_slug IS NOT NULL AND trim(username_slug) != ''
    `);
    }
    catch {
        // Keep server boot resilient if legacy data contains collisions.
    }
}
function sanitizeSlugPart(value) {
    return value
        .toLowerCase()
        .replace(/[^a-z0-9_-]+/g, "-")
        .replace(/-{2,}/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 48);
}
function normalizeRoomSlug(value) {
    return sanitizeSlugPart(String(value || "").trim().toLowerCase());
}
function isRoomSlugValid(value) {
    return ROOM_SLUG_REGEX.test(value);
}
function slugExists(slug, excludeChannelId) {
    if (!slug)
        return false;
    if (excludeChannelId) {
        const row = db
            .prepare("SELECT id FROM channels WHERE lower(username_slug) = ? AND id != ?")
            .get(slug.toLowerCase(), excludeChannelId);
        return Boolean(row);
    }
    const row = db
        .prepare("SELECT id FROM channels WHERE lower(username_slug) = ?")
        .get(slug.toLowerCase());
    return Boolean(row);
}
function makeUniqueRoomSlug(baseInput, fallbackInput, excludeChannelId) {
    const baseSeed = normalizeRoomSlug(baseInput);
    const fallbackSeed = normalizeRoomSlug(fallbackInput);
    const base = baseSeed || fallbackSeed || "channel";
    let candidate = base;
    let suffix = 1;
    while (slugExists(candidate, excludeChannelId)) {
        const suffixText = `-${suffix}`;
        const trimmedBase = base.slice(0, Math.max(1, 48 - suffixText.length));
        candidate = `${trimmedBase}${suffixText}`;
        suffix += 1;
    }
    return candidate;
}
function ensureChannelSlugs() {
    const rows = db
        .prepare("SELECT id, name, username_slug FROM channels")
        .all();
    const updateStmt = db.prepare("UPDATE channels SET username_slug = ? WHERE id = ?");
    for (const row of rows) {
        const base = String(row.username_slug || row.name || "").trim();
        const fallback = `${sanitizeSlugPart(row.name || "channel") || "channel"}-${row.id.slice(0, 6)}`;
        const nextSlug = makeUniqueRoomSlug(base, fallback, row.id);
        const currentSlug = normalizeRoomSlug(String(row.username_slug || ""));
        if (nextSlug !== currentSlug) {
            updateStmt.run(nextSlug, row.id);
        }
    }
}
function getDirectConversationBetween(userA, userB) {
    return db
        .prepare(`
      SELECT c.id, c.type, c.created_at, c.updated_at
      FROM conversations c
      JOIN conversation_participants p1 ON p1.conversation_id = c.id AND p1.user_id = ?
      JOIN conversation_participants p2 ON p2.conversation_id = c.id AND p2.user_id = ?
      WHERE c.type = 'direct'
      LIMIT 1
      `)
        .get(userA, userB);
}
function ensureDirectConversation(userA, userB) {
    const existing = getDirectConversationBetween(userA, userB);
    if (existing) {
        return existing.id;
    }
    const conversationId = (0, crypto_1.randomUUID)();
    db.prepare(`
      INSERT INTO conversations (id, type, created_at, updated_at)
      VALUES (?, 'direct', datetime('now'), datetime('now'))
    `).run(conversationId);
    const insertParticipant = db.prepare(`
      INSERT OR IGNORE INTO conversation_participants
      (conversation_id, user_id, role, joined_at, last_read_at, last_delivered_at)
      VALUES (?, ?, 'member', datetime('now'), NULL, NULL)
    `);
    insertParticipant.run(conversationId, userA);
    insertParticipant.run(conversationId, userB);
    return conversationId;
}
function backfillConversationsFromLegacyMessages() {
    const legacyRows = db
        .prepare(`
      SELECT id, sender_id, receiver_id, content, type, file_url, file_name, timestamp
      FROM messages
      WHERE (conversation_id IS NULL OR trim(conversation_id) = '')
        AND sender_id IS NOT NULL
        AND receiver_id IS NOT NULL
      ORDER BY timestamp ASC
      `)
        .all();
    if (legacyRows.length === 0) {
        return;
    }
    const cache = new Map();
    const updateMessageStmt = db.prepare(`
      UPDATE messages
      SET conversation_id = ?,
          sender_user_id = COALESCE(sender_user_id, sender_id),
          body = COALESCE(body, content),
          message_type = COALESCE(message_type, type, 'text'),
          created_at = COALESCE(created_at, timestamp, datetime('now')),
          updated_at = COALESCE(updated_at, created_at, timestamp, datetime('now')),
          is_deleted = COALESCE(is_deleted, 0)
      WHERE id = ?
    `);
    const updateConversationStmt = db.prepare("UPDATE conversations SET updated_at = ? WHERE id = ? AND (updated_at IS NULL OR updated_at < ?)");
    for (const row of legacyRows) {
        if (!row.sender_id || !row.receiver_id) {
            continue;
        }
        const sorted = [row.sender_id, row.receiver_id].sort();
        const key = `${sorted[0]}:${sorted[1]}`;
        let conversationId = cache.get(key);
        if (!conversationId) {
            conversationId = ensureDirectConversation(sorted[0], sorted[1]);
            cache.set(key, conversationId);
        }
        updateMessageStmt.run(conversationId, row.id);
        const messageTime = row.timestamp || new Date().toISOString();
        updateConversationStmt.run(messageTime, conversationId, messageTime);
    }
}
ensureSchema();
const activeUserSockets = new Map();
function resolveUserNumericId(row) {
    const fromRow = normalizeNumericUserId(row.numeric_user_id);
    if (fromRow > 0) {
        return fromRow;
    }
    const fallback = db
        .prepare("SELECT numeric_user_id FROM users WHERE id = ?")
        .get(row.id);
    const fromDb = normalizeNumericUserId(fallback?.numeric_user_id);
    return fromDb > 0 ? fromDb : 0;
}
function toUserDto(row) {
    const numericUserId = resolveUserNumericId(row);
    return {
        id: row.id,
        userId: numericUserId,
        username: row.username,
        displayName: row.display_name || row.username,
        uniqueId: (row.unique_id || "").toUpperCase(),
        email: row.email || "",
        bio: row.bio || "",
        avatarUrl: row.avatar_url || "",
        createdAt: row.created_at || new Date().toISOString(),
        settings: {
            theme: normalizeTheme(row.theme || undefined),
            chatBubbleStyle: normalizeChatBubbleStyle(row.chat_bubble_style || undefined),
            chatWallpaper: normalizeChatWallpaper(row.chat_wallpaper || undefined),
            messageFontScale: normalizeMessageFontScale(row.message_font_scale)
        }
    };
}
function toPublicUserDto(row) {
    const mapped = toUserDto(row);
    return {
        id: mapped.id,
        userId: mapped.userId,
        username: mapped.username,
        displayName: mapped.displayName,
        uniqueId: mapped.uniqueId,
        bio: mapped.bio,
        avatarUrl: mapped.avatarUrl
    };
}
function mapDirectMessage(row) {
    const senderId = row.sender_user_id || row.sender_id;
    const messageType = normalizeMessageType(row.message_type || row.type);
    const createdAt = row.created_at || row.timestamp;
    const body = decryptField(row.body ?? row.content);
    const fileUrl = decryptField(row.file_url);
    const fileName = decryptField(row.file_name);
    return {
        id: row.id,
        conversationId: row.conversation_id || "",
        senderId,
        receiverId: row.receiver_id,
        content: body,
        body,
        type: messageType,
        messageType,
        fileUrl,
        fileName,
        timestamp: createdAt,
        createdAt,
        updatedAt: row.updated_at || createdAt,
        deliveredAt: row.delivered_at || null,
        readAt: row.read_at || null,
        isDeleted: Boolean(row.is_deleted)
    };
}
function mapChannelMessage(row) {
    return {
        id: row.id,
        channelId: row.channel_id,
        senderId: row.sender_id,
        content: decryptField(row.content),
        type: normalizeMessageType(row.type),
        fileUrl: decryptField(row.file_url),
        fileName: decryptField(row.file_name),
        timestamp: row.timestamp
    };
}
function mapChannelListItem(row) {
    return {
        id: row.id,
        name: row.name,
        ownerId: row.owner_id,
        kind: normalizeChannelKind(row.kind || undefined),
        usernameSlug: row.username_slug || "",
        description: row.description || "",
        avatarUrl: row.avatar_url || "",
        createdAt: row.created_at,
        membersCount: row.members_count
    };
}
function mapMediaAttachment(row) {
    return {
        id: row.id,
        ownerUserId: row.owner_user_id,
        storagePath: row.storage_path,
        publicUrl: row.public_url,
        fileName: row.file_name,
        mimeType: row.mime_type,
        sizeBytes: row.size_bytes,
        mediaKind: row.media_kind,
        createdAt: row.created_at
    };
}
function listMessageAttachments(messageIds) {
    const result = new Map();
    if (messageIds.length === 0) {
        return result;
    }
    const placeholders = messageIds.map(() => "?").join(", ");
    const rows = db
        .prepare(`
      SELECT ma.message_id, a.id, a.owner_user_id, a.storage_path, a.public_url, a.file_name,
             a.mime_type, a.size_bytes, a.media_kind, a.created_at
      FROM message_attachments ma
      JOIN media_attachments a ON a.id = ma.attachment_id
      WHERE ma.message_id IN (${placeholders})
      ORDER BY ma.created_at ASC
      `)
        .all(...messageIds);
    for (const row of rows) {
        const list = result.get(row.message_id) || [];
        list.push(mapMediaAttachment({
            id: row.attachment_id,
            owner_user_id: row.owner_user_id,
            storage_path: row.storage_path,
            public_url: row.public_url,
            file_name: row.file_name,
            mime_type: row.mime_type,
            size_bytes: row.size_bytes,
            media_kind: row.media_kind,
            created_at: row.created_at
        }));
        result.set(row.message_id, list);
    }
    return result;
}
function withMessageAttachments(messages) {
    const attachmentsMap = listMessageAttachments(messages.map((entry) => entry.id));
    return messages.map((entry) => ({
        ...entry,
        attachments: attachmentsMap.get(entry.id) || []
    }));
}
function listChannelMessageAttachments(messageIds) {
    const result = new Map();
    if (messageIds.length === 0) {
        return result;
    }
    const placeholders = messageIds.map(() => "?").join(", ");
    const rows = db
        .prepare(`
      SELECT cma.channel_message_id AS message_id, a.id, a.owner_user_id, a.storage_path, a.public_url,
             a.file_name, a.mime_type, a.size_bytes, a.media_kind, a.created_at
      FROM channel_message_attachments cma
      JOIN media_attachments a ON a.id = cma.attachment_id
      WHERE cma.channel_message_id IN (${placeholders})
      ORDER BY cma.created_at ASC
      `)
        .all(...messageIds);
    for (const row of rows) {
        const list = result.get(row.message_id) || [];
        list.push(mapMediaAttachment({
            id: row.id,
            owner_user_id: row.owner_user_id,
            storage_path: row.storage_path,
            public_url: row.public_url,
            file_name: row.file_name,
            mime_type: row.mime_type,
            size_bytes: row.size_bytes,
            media_kind: row.media_kind,
            created_at: row.created_at
        }));
        result.set(row.message_id, list);
    }
    return result;
}
function withChannelMessageAttachments(messages) {
    const attachmentsMap = listChannelMessageAttachments(messages.map((entry) => entry.id));
    return messages.map((entry) => ({
        ...entry,
        attachments: attachmentsMap.get(entry.id) || []
    }));
}
function userExists(userId) {
    const row = db.prepare("SELECT id FROM users WHERE id = ?").get(userId);
    return Boolean(row);
}
function fetchUserById(userId) {
    return db
        .prepare(`
      SELECT id, username, password, display_name, unique_id, numeric_user_id, email, bio, avatar_url,
             theme, chat_bubble_style, chat_wallpaper, message_font_scale, created_at
      FROM users
      WHERE id = ?
      `)
        .get(userId);
}
function fetchUserByNumericId(numericUserId) {
    const normalized = normalizeNumericUserId(numericUserId);
    if (normalized <= 0)
        return undefined;
    return db
        .prepare(`
      SELECT id, username, password, display_name, unique_id, numeric_user_id, email, bio, avatar_url,
             theme, chat_bubble_style, chat_wallpaper, message_font_scale, created_at
      FROM users
      WHERE numeric_user_id = ?
      LIMIT 1
      `)
        .get(normalized);
}
function resolveUserPrimaryId(rawValue) {
    const raw = String(rawValue || "").trim();
    if (!raw)
        return undefined;
    if (/^\d+$/.test(raw)) {
        const numericUser = fetchUserByNumericId(Number(raw));
        return numericUser?.id;
    }
    const direct = fetchUserById(raw);
    return direct?.id;
}
function ensureFriendship(userId, friendId) {
    const insertStatement = db.prepare("INSERT OR IGNORE INTO friendships (user_id, friend_id, created_at) VALUES (?, ?, datetime('now'))");
    insertStatement.run(userId, friendId);
    insertStatement.run(friendId, userId);
}
function isChannelMember(channelId, userId) {
    const row = db
        .prepare("SELECT 1 FROM channel_members WHERE channel_id = ? AND user_id = ?")
        .get(channelId, userId);
    return Boolean(row);
}
function isChannelOwner(channelId, userId) {
    const row = db
        .prepare("SELECT 1 FROM channels WHERE id = ? AND owner_id = ?")
        .get(channelId, userId);
    return Boolean(row);
}
function getChannelById(channelId) {
    return db
        .prepare("SELECT id, owner_id, kind, name, username_slug, description, avatar_url FROM channels WHERE id = ?")
        .get(channelId);
}
function getChannelBySlug(slug) {
    return db
        .prepare("SELECT id, owner_id, kind, name, username_slug, description, avatar_url FROM channels WHERE lower(username_slug) = ? LIMIT 1")
        .get(slug.toLowerCase());
}
function findUserByQuery(query) {
    const normalized = query.trim().toLowerCase();
    const upper = query.trim().toUpperCase();
    const numericUserId = /^\d+$/.test(query.trim()) ? Number(query.trim()) : 0;
    if (!normalized) {
        return undefined;
    }
    return db
        .prepare(`
      SELECT id, username, password, display_name, unique_id, numeric_user_id, email, bio, avatar_url,
             theme, chat_bubble_style, chat_wallpaper, message_font_scale, created_at
      FROM users
      WHERE id = ?
         OR lower(username) = ?
         OR upper(unique_id) = ?
         OR (? > 0 AND numeric_user_id = ?)
      LIMIT 1
      `)
        .get(query.trim(), normalized, upper, numericUserId, numericUserId);
}
function parseUsernameFromQuery(query) {
    return normalizeUsername(query.replace(/^@/, ""));
}
function mustFindUserByUsernameOrId(query) {
    const raw = query.trim();
    if (!raw) {
        return undefined;
    }
    if (/^\d+$/.test(raw)) {
        const byNumericId = fetchUserByNumericId(Number(raw));
        if (byNumericId) {
            return byNumericId;
        }
    }
    if (raw.length > 2 && raw.includes("-")) {
        const byId = fetchUserById(raw);
        if (byId) {
            return byId;
        }
    }
    const normalizedUsername = parseUsernameFromQuery(raw);
    if (normalizedUsername) {
        const byUsername = db
            .prepare(`
        SELECT id, username, password, display_name, unique_id, numeric_user_id, email, bio, avatar_url,
               theme, chat_bubble_style, chat_wallpaper, message_font_scale, created_at
        FROM users
        WHERE lower(username) = ?
        LIMIT 1
        `)
            .get(normalizedUsername);
        if (byUsername) {
            return byUsername;
        }
    }
    return findUserByQuery(raw);
}
function getDialogParticipant(dialogId, userId) {
    return db
        .prepare("SELECT conversation_id, user_id FROM conversation_participants WHERE conversation_id = ? AND user_id = ?")
        .get(dialogId, userId);
}
function getDirectPeer(dialogId, userId) {
    return db
        .prepare(`
      SELECT u.id, u.username, u.password, u.display_name, u.unique_id, u.numeric_user_id, u.email, u.bio, u.avatar_url,
             u.theme, u.chat_bubble_style, u.chat_wallpaper, u.message_font_scale, u.created_at
      FROM conversation_participants cp
      JOIN users u ON u.id = cp.user_id
      WHERE cp.conversation_id = ? AND cp.user_id != ?
      LIMIT 1
      `)
        .get(dialogId, userId);
}
function touchConversation(conversationId, timestamp = new Date().toISOString()) {
    db.prepare("UPDATE conversations SET updated_at = ? WHERE id = ?").run(timestamp, conversationId);
}
function createMediaAttachment(ownerUserId, file) {
    const attachmentId = (0, crypto_1.randomUUID)();
    const publicUrl = `/uploads/${file.filename}`;
    const mediaKind = classifyMimeType(file.mimetype);
    db.prepare(`
    INSERT INTO media_attachments (
      id, owner_user_id, storage_path, public_url, file_name, mime_type, size_bytes, media_kind, created_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
    `).run(attachmentId, ownerUserId, file.path, publicUrl, file.originalname, file.mimetype, file.size, mediaKind);
    return mapMediaAttachment({
        id: attachmentId,
        owner_user_id: ownerUserId,
        storage_path: file.path,
        public_url: publicUrl,
        file_name: file.originalname,
        mime_type: file.mimetype,
        size_bytes: file.size,
        media_kind: mediaKind,
        created_at: new Date().toISOString()
    });
}
function getMediaAttachmentById(attachmentId) {
    return db
        .prepare(`
      SELECT id, owner_user_id, storage_path, public_url, file_name, mime_type, size_bytes, media_kind, created_at
      FROM media_attachments
      WHERE id = ?
      `)
        .get(attachmentId);
}
function validateUsernameUpdate(userId, nextUsername) {
    if (!isUsernameValid(nextUsername)) {
        return {
            ok: false,
            status: 400,
            error: "Username должен быть 3-32 символа и содержать только a-z, 0-9, _"
        };
    }
    const exists = db
        .prepare("SELECT id FROM users WHERE lower(username) = ? AND id != ?")
        .get(nextUsername, userId);
    if (exists) {
        return { ok: false, status: 409, error: "Username уже занят" };
    }
    const latestChange = db
        .prepare(`
      SELECT changed_at
      FROM username_history
      WHERE user_id = ?
      ORDER BY changed_at DESC
      LIMIT 1
      `)
        .get(userId);
    if (latestChange?.changed_at) {
        const changedAt = new Date(latestChange.changed_at).getTime();
        const nextAllowedAt = changedAt + USERNAME_COOLDOWN_HOURS * 60 * 60 * 1000;
        if (Date.now() < nextAllowedAt) {
            const minutes = Math.ceil((nextAllowedAt - Date.now()) / (60 * 1000));
            return {
                ok: false,
                status: 429,
                error: `Username можно менять раз в ${USERNAME_COOLDOWN_HOURS}ч. Осталось ~${minutes} мин.`
            };
        }
    }
    return { ok: true };
}
function updateUsernameWithHistory(userId, nextUsername) {
    const current = fetchUserById(userId);
    if (!current) {
        return { error: "User not found", status: 404 };
    }
    if (current.username === nextUsername) {
        return { user: current };
    }
    const validation = validateUsernameUpdate(userId, nextUsername);
    if (!validation.ok) {
        return { error: validation.error, status: validation.status };
    }
    const tx = db.transaction(() => {
        db.prepare("UPDATE users SET username = ? WHERE id = ?").run(nextUsername, userId);
        db.prepare(`
      INSERT INTO username_history (id, user_id, old_username, new_username, changed_at)
      VALUES (?, ?, ?, ?, datetime('now'))
      `).run((0, crypto_1.randomUUID)(), userId, current.username, nextUsername);
    });
    tx();
    return { user: fetchUserById(userId) };
}
function getConversationList(userId) {
    const rows = db
        .prepare(`
      SELECT
        c.id AS conversation_id,
        c.type AS conversation_type,
        c.created_at AS conversation_created_at,
        c.updated_at AS conversation_updated_at,
        other.id AS participant_id,
        other.username AS participant_username,
        other.display_name AS participant_display_name,
        other.unique_id AS participant_unique_id,
        other.numeric_user_id AS participant_numeric_user_id,
        other.bio AS participant_bio,
        other.avatar_url AS participant_avatar_url,
        other.created_at AS participant_created_at,
        lm.id AS last_message_id,
        lm.sender_id AS last_message_sender_id,
        lm.receiver_id AS last_message_receiver_id,
        lm.body AS last_message_body,
        lm.message_type AS last_message_type,
        lm.file_url AS last_message_file_url,
        lm.file_name AS last_message_file_name,
        lm.created_at AS last_message_created_at,
        (
          SELECT COUNT(*)
          FROM messages um
          WHERE um.conversation_id = c.id
            AND um.sender_user_id != ?
            AND (um.read_at IS NULL OR trim(um.read_at) = '')
            AND COALESCE(um.is_deleted, 0) = 0
        ) AS unread_count
      FROM conversation_participants me
      JOIN conversations c ON c.id = me.conversation_id AND c.type = 'direct'
      JOIN conversation_participants op ON op.conversation_id = c.id AND op.user_id != me.user_id
      JOIN users other ON other.id = op.user_id
      LEFT JOIN messages lm ON lm.id = (
        SELECT id
        FROM messages m2
        WHERE m2.conversation_id = c.id AND COALESCE(m2.is_deleted, 0) = 0
        ORDER BY COALESCE(m2.created_at, m2.timestamp) DESC
        LIMIT 1
      )
      WHERE me.user_id = ?
      ORDER BY COALESCE(lm.created_at, c.updated_at, c.created_at) DESC
      `)
        .all(userId, userId);
    const lastMessageIds = rows
        .map((row) => row.last_message_id || "")
        .filter(Boolean);
    const attachmentsMap = listMessageAttachments(lastMessageIds);
    return rows.map((row) => {
        const peer = {
            id: row.participant_id,
            username: row.participant_username,
            password: "",
            display_name: row.participant_display_name,
            unique_id: row.participant_unique_id,
            numeric_user_id: row.participant_numeric_user_id,
            email: "",
            bio: row.participant_bio,
            avatar_url: row.participant_avatar_url,
            theme: null,
            chat_bubble_style: null,
            chat_wallpaper: null,
            created_at: row.participant_created_at
        };
        const lastMessage = row.last_message_id
            ? {
                ...mapDirectMessage({
                    id: row.last_message_id,
                    sender_id: row.last_message_sender_id || "",
                    receiver_id: row.last_message_receiver_id || "",
                    content: row.last_message_body,
                    type: row.last_message_type || "text",
                    file_url: row.last_message_file_url,
                    file_name: row.last_message_file_name,
                    timestamp: row.last_message_created_at || row.conversation_updated_at,
                    sender_user_id: row.last_message_sender_id,
                    body: row.last_message_body,
                    message_type: row.last_message_type,
                    created_at: row.last_message_created_at,
                    updated_at: row.last_message_created_at,
                    is_deleted: 0
                }),
                attachments: attachmentsMap.get(row.last_message_id) || []
            }
            : null;
        return {
            id: row.conversation_id,
            type: "direct",
            peer: toPublicUserDto(peer),
            unreadCount: Number(row.unread_count || 0),
            createdAt: row.conversation_created_at,
            updatedAt: row.conversation_updated_at,
            lastMessage
        };
    });
}
function loadDialogMessages(dialogId, limit, before) {
    const safeLimit = Math.min(200, Math.max(1, limit));
    const rows = before
        ? db
            .prepare(`
          SELECT id, sender_id, receiver_id, content, type, file_url, file_name, timestamp,
                 conversation_id, sender_user_id, body, message_type, created_at, updated_at,
                 delivered_at, read_at, is_deleted
          FROM messages
          WHERE conversation_id = ?
            AND COALESCE(is_deleted, 0) = 0
            AND COALESCE(created_at, timestamp) < ?
          ORDER BY COALESCE(created_at, timestamp) DESC
          LIMIT ?
          `)
            .all(dialogId, before, safeLimit)
        : db
            .prepare(`
          SELECT id, sender_id, receiver_id, content, type, file_url, file_name, timestamp,
                 conversation_id, sender_user_id, body, message_type, created_at, updated_at,
                 delivered_at, read_at, is_deleted
          FROM messages
          WHERE conversation_id = ?
            AND COALESCE(is_deleted, 0) = 0
          ORDER BY COALESCE(created_at, timestamp) DESC
          LIMIT ?
          `)
            .all(dialogId, safeLimit);
    return withMessageAttachments(rows.reverse().map(mapDirectMessage));
}
function parseCallStatusEvent(event) {
    if (event === "accepted")
        return "accepted";
    if (event === "declined")
        return "declined";
    if (event === "busy")
        return "busy";
    if (event === "missed")
        return "missed";
    if (event === "ended")
        return "ended";
    if (event === "failed")
        return "failed";
    return "ringing";
}
function getCallSessionById(callId) {
    return db
        .prepare(`
      SELECT id, initiator_user_id, recipient_user_id, status, started_at, accepted_at, ended_at,
             created_at, updated_at, ended_by_user_id, decline_reason, ended_reason, last_event_at
      FROM call_sessions
      WHERE id = ?
      `)
        .get(callId);
}
function isActiveCallStatus(status) {
    return status === "ringing" || status === "accepted";
}
function isTerminalCallStatus(status) {
    return ["declined", "busy", "missed", "ended", "failed"].includes(status);
}
function hasActiveCall(userId, excludeCallId) {
    const rows = db
        .prepare(`
      SELECT id, initiator_user_id, recipient_user_id, status, started_at, updated_at, last_event_at
      FROM call_sessions
      WHERE (initiator_user_id = ? OR recipient_user_id = ?)
        AND status IN ('ringing', 'accepted')
        AND initiator_user_id != recipient_user_id
        AND (? = '' OR id != ?)
      ORDER BY updated_at DESC
      `)
        .all(userId, userId, excludeCallId || "", excludeCallId || "");
    for (const row of rows) {
        if (row.initiator_user_id === row.recipient_user_id) {
            clearCallRingTimer(row.id);
            transitionCallSession(row.id, "failed", userId, "self-call");
            continue;
        }
        if (row.status === "ringing") {
            const lastEvent = Date.parse(String(row.last_event_at || row.updated_at || row.started_at || ""));
            const timeoutExceeded = Number.isFinite(lastEvent) && Date.now() - lastEvent > CALL_RING_TIMEOUT_MS + 1000;
            if (timeoutExceeded) {
                clearCallRingTimer(row.id);
                transitionCallSession(row.id, "missed", row.recipient_user_id, "timeout");
                continue;
            }
        }
        if (row.status === "accepted") {
            const initiatorOnline = isUserOnline(row.initiator_user_id);
            const recipientOnline = isUserOnline(row.recipient_user_id);
            if (!initiatorOnline || !recipientOnline) {
                transitionCallSession(row.id, "ended", userId, "peer-disconnected");
                continue;
            }
        }
        return true;
    }
    return false;
}
function isCallParticipant(call, userId) {
    return call.initiator_user_id === userId || call.recipient_user_id === userId;
}
function getCallPeerId(call, userId) {
    return call.initiator_user_id === userId ? call.recipient_user_id : call.initiator_user_id;
}
function createCallSession(callId, initiatorId, recipientId, initialStatus) {
    db.prepare(`
    INSERT INTO call_sessions (
      id, initiator_user_id, recipient_user_id, status, started_at, accepted_at, ended_at,
      created_at, updated_at, ended_by_user_id, decline_reason, ended_reason, last_event_at
    )
    VALUES (?, ?, ?, ?, datetime('now'), NULL, NULL, datetime('now'), datetime('now'), NULL, NULL, NULL, datetime('now'))
    `).run(callId, initiatorId, recipientId, initialStatus);
    db.prepare(`
    INSERT OR IGNORE INTO call_participants (call_id, user_id, role, joined_at, left_at)
    VALUES (?, ?, 'initiator', datetime('now'), NULL),
           (?, ?, 'recipient', NULL, NULL)
    `).run(callId, initiatorId, callId, recipientId);
    return getCallSessionById(callId);
}
function transitionCallSession(callId, nextStatus, actorUserId, reason) {
    const existing = getCallSessionById(callId);
    if (!existing) {
        return undefined;
    }
    if (isTerminalCallStatus(existing.status)) {
        return existing;
    }
    if (nextStatus === "accepted") {
        if (existing.status !== "ringing") {
            return existing;
        }
        db.prepare(`
      UPDATE call_sessions
      SET status = 'accepted',
          accepted_at = COALESCE(accepted_at, datetime('now')),
          updated_at = datetime('now'),
          last_event_at = datetime('now')
      WHERE id = ?
      `).run(callId);
        db.prepare(`
      UPDATE call_participants
      SET joined_at = COALESCE(joined_at, datetime('now'))
      WHERE call_id = ?
      `).run(callId);
        return getCallSessionById(callId);
    }
    if (nextStatus === "ringing") {
        if (existing.status !== "ringing") {
            return existing;
        }
        db.prepare(`
      UPDATE call_sessions
      SET updated_at = datetime('now'),
          last_event_at = datetime('now')
      WHERE id = ?
      `).run(callId);
        return getCallSessionById(callId);
    }
    const normalizedReason = String(reason || "").trim() || null;
    const declineReason = nextStatus === "declined" || nextStatus === "busy" || nextStatus === "missed" ? normalizedReason : null;
    const endReason = nextStatus === "ended" || nextStatus === "failed" ? normalizedReason : null;
    db.prepare(`
    UPDATE call_sessions
    SET status = ?,
        ended_at = COALESCE(ended_at, datetime('now')),
        ended_by_user_id = COALESCE(ended_by_user_id, ?),
        decline_reason = CASE WHEN ? IS NOT NULL THEN ? ELSE decline_reason END,
        ended_reason = CASE WHEN ? IS NOT NULL THEN ? ELSE ended_reason END,
        updated_at = datetime('now'),
        last_event_at = datetime('now')
    WHERE id = ?
    `).run(nextStatus, actorUserId, declineReason, declineReason, endReason, endReason, callId);
    db.prepare(`
    UPDATE call_participants
    SET left_at = COALESCE(left_at, datetime('now'))
    WHERE call_id = ?
    `).run(callId);
    return getCallSessionById(callId);
}
const callRingTimers = new Map();
function clearCallRingTimer(callId) {
    const timer = callRingTimers.get(callId);
    if (timer) {
        clearTimeout(timer);
        callRingTimers.delete(callId);
    }
}
function makeToken(user) {
    return jsonwebtoken_1.default.sign(user, JWT_SECRET, { expiresIn: "30d" });
}
function authMiddleware(req, res, next) {
    const authHeader = req.headers.authorization;
    const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : "";
    if (!token) {
        res.status(401).json({ error: "Unauthorized" });
        return;
    }
    try {
        const payload = jsonwebtoken_1.default.verify(token, JWT_SECRET);
        if (!payload.id || !payload.username) {
            res.status(401).json({ error: "Unauthorized" });
            return;
        }
        req.user = {
            id: String(payload.id),
            username: String(payload.username)
        };
        next();
    }
    catch (_error) {
        res.status(401).json({ error: "Invalid token" });
    }
}
function addSocketForUser(userId, socketId) {
    const sockets = activeUserSockets.get(userId) || new Set();
    sockets.add(socketId);
    activeUserSockets.set(userId, sockets);
}
function removeSocketForUser(userId, socketId) {
    const sockets = activeUserSockets.get(userId);
    if (!sockets) {
        return;
    }
    sockets.delete(socketId);
    if (sockets.size === 0) {
        activeUserSockets.delete(userId);
    }
}
function isUserOnline(userId) {
    const sockets = activeUserSockets.get(userId);
    return Boolean(sockets && sockets.size > 0);
}
function joinMemberChannels(socketId, userId) {
    const rows = db
        .prepare("SELECT channel_id FROM channel_members WHERE user_id = ?")
        .all(userId);
    for (const row of rows) {
        io.sockets.sockets.get(socketId)?.join(`channel:${row.channel_id}`);
    }
}
function joinUserDialogs(socketId, userId) {
    const rows = db
        .prepare("SELECT conversation_id FROM conversation_participants WHERE user_id = ?")
        .all(userId);
    for (const row of rows) {
        io.sockets.sockets.get(socketId)?.join(conversationRoomName(row.conversation_id));
    }
}
const uploadStorage = multer_1.default.diskStorage({
    destination: (_req, _file, callback) => {
        callback(null, UPLOADS_DIR);
    },
    filename: (_req, file, callback) => {
        const ext = path_1.default.extname(file.originalname);
        callback(null, `${(0, crypto_1.randomUUID)()}${ext}`);
    }
});
const upload = (0, multer_1.default)({
    storage: uploadStorage,
    limits: {
        fileSize: MAX_UPLOAD_SIZE_BYTES
    }
});
app.get("/api/status", (_req, res) => {
    const usersCount = db.prepare("SELECT COUNT(*) AS count FROM users").get();
    const channelsCount = db
        .prepare("SELECT COUNT(*) AS count FROM channels WHERE kind = 'channel'")
        .get();
    const groupsCount = db
        .prepare("SELECT COUNT(*) AS count FROM channels WHERE kind = 'group'")
        .get();
    const activeCallsCount = db
        .prepare("SELECT COUNT(*) AS count FROM call_sessions WHERE status IN ('ringing', 'accepted')")
        .get();
    res.json({
        ok: true,
        service: "messenger-backend",
        dbPath: DB_PATH,
        uploadsDir: UPLOADS_DIR,
        maxUploadMb: MAX_UPLOAD_SIZE_MB,
        users: usersCount.count,
        channels: channelsCount.count,
        groups: groupsCount.count,
        activeCalls: activeCallsCount.count,
        callRingTimeoutMs: CALL_RING_TIMEOUT_MS,
        uptimeSec: Math.floor(process.uptime())
    });
});
app.post("/api/register", async (req, res) => {
    const rateKey = `register:${req.ip || "unknown"}`;
    if (isRateLimited(rateKey, 20, 60000)) {
        res.status(429).json({ error: "Too many registration attempts. Try again later." });
        return;
    }
    const usernameRaw = normalizeUsername(String(req.body.username || ""));
    const passwordRaw = String(req.body.password || "");
    const displayNameRaw = String(req.body.displayName || "").trim();
    const emailRaw = String(req.body.email || "").trim().toLowerCase();
    const bioRaw = String(req.body.bio || "").trim();
    if (!isUsernameValid(usernameRaw)) {
        res.status(400).json({ error: "Username must be 3-32 chars: a-z, 0-9, _" });
        return;
    }
    if (!passwordRaw || passwordRaw.length < 6) {
        res.status(400).json({ error: "Password must contain at least 6 characters" });
        return;
    }
    if (emailRaw && !isEmailValid(emailRaw)) {
        res.status(400).json({ error: "Email is not valid" });
        return;
    }
    const usernameExists = db
        .prepare("SELECT id FROM users WHERE lower(username) = ?")
        .get(usernameRaw);
    if (usernameExists) {
        res.status(409).json({ error: "Username already exists" });
        return;
    }
    const email = emailRaw || `${usernameRaw}@local.chat`;
    const emailExists = db
        .prepare("SELECT id FROM users WHERE email = ?")
        .get(email);
    if (emailExists) {
        res.status(409).json({ error: "Email already exists" });
        return;
    }
    const id = (0, crypto_1.randomUUID)();
    const uniqueId = makeUniqueId();
    const numericUserId = allocateNextNumericUserId();
    const displayName = displayNameRaw || usernameRaw;
    const passwordHash = await bcryptjs_1.default.hash(passwordRaw, 10);
    db.prepare(`
      INSERT INTO users (
        id, username, password, display_name, unique_id, numeric_user_id, email, bio,
        avatar_url, theme, chat_bubble_style, chat_wallpaper, message_font_scale, created_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, '', 'dark', 'modern', 'gradient', 100, datetime('now'))
    `).run(id, usernameRaw, passwordHash, displayName, uniqueId, numericUserId, email, bioRaw);
    const created = fetchUserById(id);
    if (!created) {
        res.status(500).json({ error: "Failed to create user" });
        return;
    }
    const token = makeToken({ id: created.id, username: created.username });
    res.status(201).json({ token, user: toUserDto(created) });
});
app.post("/api/login", async (req, res) => {
    const rateKey = `login:${req.ip || "unknown"}`;
    if (isRateLimited(rateKey, 40, 60000)) {
        res.status(429).json({ error: "Too many login attempts. Try again later." });
        return;
    }
    const usernameRaw = normalizeUsername(String(req.body.username || ""));
    const passwordRaw = String(req.body.password || "");
    if (!usernameRaw || !passwordRaw) {
        res.status(400).json({ error: "Username and password are required" });
        return;
    }
    const row = db
        .prepare(`
      SELECT id, username, password, display_name, unique_id, numeric_user_id, email, bio, avatar_url,
             theme, chat_bubble_style, chat_wallpaper, message_font_scale, created_at
      FROM users
      WHERE lower(username) = ?
      `)
        .get(usernameRaw);
    if (!row) {
        res.status(401).json({ error: "Invalid credentials" });
        return;
    }
    const validPassword = await bcryptjs_1.default.compare(passwordRaw, row.password || "");
    if (!validPassword) {
        res.status(401).json({ error: "Invalid credentials" });
        return;
    }
    const token = makeToken({ id: row.id, username: row.username });
    res.json({ token, user: toUserDto(row) });
});
app.get("/api/me", authMiddleware, (req, res) => {
    const currentUser = fetchUserById(req.user.id);
    if (!currentUser) {
        res.status(404).json({ error: "User not found" });
        return;
    }
    res.json(toUserDto(currentUser));
});
app.patch("/api/me", authMiddleware, (req, res) => {
    const userId = req.user.id;
    const payload = req.body;
    const updates = [];
    const values = [];
    let usernameWasChanged = false;
    if (payload.username !== undefined) {
        const username = normalizeUsername(String(payload.username));
        const usernameChange = updateUsernameWithHistory(userId, username);
        if (usernameChange.error) {
            res.status(usernameChange.status || 400).json({ error: usernameChange.error });
            return;
        }
        usernameWasChanged = Boolean(usernameChange.user && usernameChange.user.username === username);
    }
    if (payload.displayName !== undefined) {
        const displayName = String(payload.displayName).trim();
        updates.push("display_name = ?");
        values.push(displayName || req.user.username);
    }
    if (payload.email !== undefined) {
        const email = String(payload.email).trim().toLowerCase();
        if (!email || !isEmailValid(email)) {
            res.status(400).json({ error: "Email is not valid" });
            return;
        }
        const exists = db
            .prepare("SELECT id FROM users WHERE email = ? AND id != ?")
            .get(email, userId);
        if (exists) {
            res.status(409).json({ error: "Email already exists" });
            return;
        }
        updates.push("email = ?");
        values.push(email);
    }
    if (payload.bio !== undefined) {
        updates.push("bio = ?");
        values.push(String(payload.bio).slice(0, 500));
    }
    if (payload.theme !== undefined) {
        updates.push("theme = ?");
        values.push(normalizeTheme(payload.theme));
    }
    if (payload.chatBubbleStyle !== undefined) {
        updates.push("chat_bubble_style = ?");
        values.push(normalizeChatBubbleStyle(payload.chatBubbleStyle));
    }
    if (payload.chatWallpaper !== undefined) {
        updates.push("chat_wallpaper = ?");
        values.push(normalizeChatWallpaper(payload.chatWallpaper));
    }
    if (payload.messageFontScale !== undefined) {
        updates.push("message_font_scale = ?");
        values.push(normalizeMessageFontScale(payload.messageFontScale));
    }
    if (updates.length > 0) {
        values.push(userId);
        db.prepare(`UPDATE users SET ${updates.join(", ")} WHERE id = ?`).run(...values);
    }
    const updated = fetchUserById(userId);
    if (!updated) {
        res.status(404).json({ error: "User not found" });
        return;
    }
    const payloadResponse = { user: toUserDto(updated) };
    if (usernameWasChanged) {
        payloadResponse.token = makeToken({ id: updated.id, username: updated.username });
    }
    res.json(payloadResponse);
});
app.post("/api/me/username", authMiddleware, (req, res) => {
    const payload = req.body;
    const nextUsername = normalizeUsername(String(payload.username || ""));
    const result = updateUsernameWithHistory(req.user.id, nextUsername);
    if (result.error || !result.user) {
        res.status(result.status || 400).json({ error: result.error || "Username update failed" });
        return;
    }
    res.json({
        user: toUserDto(result.user),
        token: makeToken({ id: result.user.id, username: result.user.username })
    });
});
app.get("/api/me/username-history", authMiddleware, (req, res) => {
    const rows = db
        .prepare(`
      SELECT id, old_username, new_username, changed_at
      FROM username_history
      WHERE user_id = ?
      ORDER BY changed_at DESC
      LIMIT 50
      `)
        .all(req.user.id);
    res.json(rows.map((row) => ({
        id: row.id,
        oldUsername: row.old_username,
        newUsername: row.new_username,
        changedAt: row.changed_at
    })));
});
app.post("/api/me/avatar", authMiddleware, upload.single("avatar"), (req, res) => {
    if (!req.file) {
        res.status(400).json({ error: "No avatar uploaded" });
        return;
    }
    const avatarUrl = `/uploads/${req.file.filename}`;
    db.prepare("UPDATE users SET avatar_url = ? WHERE id = ?").run(avatarUrl, req.user.id);
    const updated = fetchUserById(req.user.id);
    if (!updated) {
        res.status(404).json({ error: "User not found" });
        return;
    }
    res.json(toUserDto(updated));
});
app.get("/api/users/search", authMiddleware, (req, res) => {
    const rateKey = `search:${req.user.id}`;
    if (isRateLimited(rateKey, 200, 60000)) {
        res.status(429).json({ error: "Too many search requests. Try again in a minute." });
        return;
    }
    const queryRaw = String(req.query.query || "").trim();
    if (!queryRaw) {
        res.json([]);
        return;
    }
    const limit = Math.min(30, Math.max(1, Number(req.query.limit || 12)));
    const queryLower = queryRaw.toLowerCase();
    const queryUpper = queryRaw.toUpperCase();
    const usernameContains = `%${queryLower}%`;
    const usernamePrefix = `${queryLower}%`;
    const numericUserId = /^\d+$/.test(queryRaw) ? normalizeNumericUserId(Number(queryRaw)) : 0;
    const numericPrefix = /^\d+$/.test(queryRaw) ? `${queryRaw}%` : "";
    const rows = db
        .prepare(`
      SELECT id, username, password, display_name, unique_id, numeric_user_id, email, bio, avatar_url,
             theme, chat_bubble_style, chat_wallpaper, message_font_scale, created_at
      FROM users
      WHERE id != ?
        AND (
          lower(username) LIKE ?
          OR lower(display_name) LIKE ?
          OR upper(unique_id) = ?
          OR (? > 0 AND numeric_user_id = ?)
          OR (? > 0 AND CAST(numeric_user_id AS TEXT) LIKE ?)
        )
      ORDER BY
        CASE
          WHEN (? > 0 AND numeric_user_id = ?) THEN 0
          WHEN lower(username) = ? THEN 1
          WHEN lower(username) LIKE ? THEN 2
          WHEN lower(username) LIKE ? THEN 3
          WHEN lower(display_name) LIKE ? THEN 4
          WHEN upper(unique_id) = ? THEN 5
          ELSE 6
        END,
        created_at DESC
      LIMIT ?
      `)
        .all(req.user.id, usernameContains, usernameContains, queryUpper, numericUserId, numericUserId, numericUserId, numericPrefix, numericUserId, numericUserId, queryLower, usernamePrefix, usernameContains, usernameContains, queryUpper, limit);
    res.json(rows.map(toPublicUserDto));
});
app.get("/api/users/search/:uniqueId", authMiddleware, (req, res) => {
    const rawLookup = String(req.params.uniqueId || "").trim();
    const uniqueId = rawLookup.toUpperCase();
    let row;
    if (/^\d+$/.test(rawLookup)) {
        row = fetchUserByNumericId(Number(rawLookup));
    }
    if (!row) {
        row = db
            .prepare(`
        SELECT id, username, password, display_name, unique_id, numeric_user_id, email, bio, avatar_url,
               theme, chat_bubble_style, chat_wallpaper, message_font_scale, created_at
        FROM users
        WHERE upper(unique_id) = ? OR id = ?
        LIMIT 1
        `)
            .get(uniqueId, rawLookup);
    }
    if (!row) {
        res.status(404).json({ error: "User not found" });
        return;
    }
    res.json(toPublicUserDto(row));
});
app.get("/api/users/:userId/profile", authMiddleware, (req, res) => {
    const profileUserId = resolveUserPrimaryId(req.params.userId || "");
    if (!profileUserId) {
        res.status(404).json({ error: "User not found" });
        return;
    }
    const profile = fetchUserById(profileUserId);
    if (!profile) {
        res.status(404).json({ error: "User not found" });
        return;
    }
    const friendRow = db
        .prepare("SELECT 1 FROM friendships WHERE user_id = ? AND friend_id = ?")
        .get(req.user.id, profileUserId);
    const conversationId = profileUserId === req.user.id
        ? null
        : getDirectConversationBetween(req.user.id, profileUserId)?.id || null;
    const directMediaCount = conversationId
        ? (db
            .prepare(`
          SELECT COUNT(*) AS count
          FROM message_attachments ma
          JOIN messages m ON m.id = ma.message_id
          WHERE m.conversation_id = ?
          `)
            .get(conversationId).count || 0)
        : 0;
    const profileData = toPublicUserDto(profile);
    profileData.createdAt = profile.created_at || new Date().toISOString();
    profileData.isFriend = Boolean(friendRow);
    profileData.conversationId = conversationId;
    profileData.mediaCount = directMediaCount;
    if (req.user.id === profile.id) {
        profileData.email = profile.email || "";
        const history = db
            .prepare(`
        SELECT old_username, new_username, changed_at
        FROM username_history
        WHERE user_id = ?
        ORDER BY changed_at DESC
        LIMIT 20
        `)
            .all(profile.id);
        profileData.usernameHistory = history.map((row) => ({
            oldUsername: row.old_username,
            newUsername: row.new_username,
            changedAt: row.changed_at
        }));
    }
    res.json(profileData);
});
app.get("/api/users/:userId/media", authMiddleware, (req, res) => {
    const targetUserId = resolveUserPrimaryId(req.params.userId || "");
    if (!targetUserId) {
        res.status(404).json({ error: "User not found" });
        return;
    }
    if (!userExists(targetUserId)) {
        res.status(404).json({ error: "User not found" });
        return;
    }
    if (targetUserId === req.user.id) {
        res.json({ tab: "media", media: [], files: [], links: [], audio: [], items: [] });
        return;
    }
    const dialog = getDirectConversationBetween(req.user.id, targetUserId);
    if (!dialog) {
        res.json({ tab: "media", media: [], files: [], links: [], audio: [], items: [] });
        return;
    }
    const tab = String(req.query.tab || "media").toLowerCase();
    const limit = Math.min(200, Math.max(1, Number(req.query.limit || 100)));
    const attachmentRows = db
        .prepare(`
      SELECT a.id, a.owner_user_id, a.storage_path, a.public_url, a.file_name, a.mime_type, a.size_bytes, a.media_kind, a.created_at
      FROM message_attachments ma
      JOIN messages m ON m.id = ma.message_id
      JOIN media_attachments a ON a.id = ma.attachment_id
      WHERE m.conversation_id = ?
      ORDER BY m.created_at DESC
      LIMIT ?
      `)
        .all(dialog.id, limit);
    const linkRows = db
        .prepare(`
      SELECT id, body, created_at, sender_user_id
      FROM messages
      WHERE conversation_id = ?
        AND body IS NOT NULL
      ORDER BY created_at DESC
      LIMIT ?
      `)
        .all(dialog.id, limit);
    const links = [];
    for (const row of linkRows) {
        const text = decryptField(row.body);
        const matches = text.match(/https?:\/\/[^\s]+/g) || [];
        for (const url of matches) {
            links.push({ messageId: row.id, url, createdAt: row.created_at, senderId: row.sender_user_id });
        }
    }
    const mappedAttachments = attachmentRows.map(mapMediaAttachment);
    const responseByTab = {
        media: mappedAttachments.filter((entry) => entry.mediaKind === "image" || entry.mediaKind === "video"),
        files: mappedAttachments.filter((entry) => entry.mediaKind === "file"),
        audio: mappedAttachments.filter((entry) => entry.mediaKind === "audio"),
        links
    };
    res.json({
        tab,
        ...responseByTab,
        items: tab === "links" ? responseByTab.links : responseByTab[tab] || []
    });
});
app.post("/api/friends/:friendId", authMiddleware, (req, res) => {
    const userId = req.user.id;
    const friendId = resolveUserPrimaryId(req.params.friendId || "");
    if (!friendId) {
        res.status(404).json({ error: "Friend not found" });
        return;
    }
    if (userId === friendId) {
        res.status(400).json({ error: "Cannot add yourself" });
        return;
    }
    const friend = fetchUserById(friendId);
    if (!friend) {
        res.status(404).json({ error: "Friend not found" });
        return;
    }
    ensureFriendship(userId, friendId);
    res.json(toPublicUserDto(friend));
});
app.get("/api/friends", authMiddleware, (req, res) => {
    const rows = db
        .prepare(`
      SELECT u.id, u.username, u.password, u.display_name, u.unique_id, u.numeric_user_id, u.email, u.bio, u.avatar_url,
             u.theme, u.chat_bubble_style, u.chat_wallpaper, u.message_font_scale, u.created_at
      FROM friendships f
      JOIN users u ON u.id = f.friend_id
      WHERE f.user_id = ?
      ORDER BY f.created_at DESC
      `)
        .all(req.user.id);
    res.json(rows.map(toPublicUserDto));
});
app.post("/api/dialogs/open", authMiddleware, (req, res) => {
    const payload = req.body;
    const currentUserId = req.user.id;
    let targetUser;
    if (payload.userId) {
        const resolvedId = resolveUserPrimaryId(String(payload.userId).trim());
        if (resolvedId) {
            targetUser = fetchUserById(resolvedId);
        }
    }
    else if (payload.username) {
        targetUser = mustFindUserByUsernameOrId(String(payload.username));
    }
    if (!targetUser) {
        res.status(404).json({ error: "User not found" });
        return;
    }
    if (targetUser.id === currentUserId) {
        res.status(400).json({ error: "Cannot open direct dialog with yourself" });
        return;
    }
    const conversationId = ensureDirectConversation(currentUserId, targetUser.id);
    ensureFriendship(currentUserId, targetUser.id);
    const dialogs = getConversationList(currentUserId);
    const targetDialog = dialogs.find((entry) => entry.id === conversationId);
    res.status(201).json(targetDialog || {
        id: conversationId,
        type: "direct",
        peer: toPublicUserDto(targetUser),
        unreadCount: 0,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        lastMessage: null
    });
});
app.get("/api/dialogs", authMiddleware, (req, res) => {
    res.json(getConversationList(req.user.id));
});
app.get("/api/dialogs/:dialogId/messages", authMiddleware, (req, res) => {
    const dialogId = req.params.dialogId;
    const participant = getDialogParticipant(dialogId, req.user.id);
    if (!participant) {
        res.status(403).json({ error: "Dialog is unavailable" });
        return;
    }
    const limit = Number(req.query.limit || 100);
    const before = String(req.query.before || "").trim() || undefined;
    const messages = loadDialogMessages(dialogId, limit, before);
    res.json(messages);
});
app.post("/api/dialogs/:dialogId/messages", authMiddleware, (req, res) => {
    const dialogId = req.params.dialogId;
    const participant = getDialogParticipant(dialogId, req.user.id);
    if (!participant) {
        res.status(403).json({ error: "Dialog is unavailable" });
        return;
    }
    const peer = getDirectPeer(dialogId, req.user.id);
    if (!peer) {
        res.status(404).json({ error: "Peer not found" });
        return;
    }
    const payload = req.body;
    const messageType = normalizeMessageType(payload.messageType || "text");
    const body = sanitizeMessageText(String(payload.body || ""));
    const attachmentId = String(payload.attachmentId || "").trim();
    const explicitFileUrl = String(payload.fileUrl || "").trim();
    const explicitFileName = String(payload.fileName || "").trim();
    if (messageType === "text" && !body) {
        res.status(400).json({ error: "Message body is empty" });
        return;
    }
    if (messageType !== "text" && !attachmentId && !explicitFileUrl) {
        res.status(400).json({ error: "Attachment is required for non-text message" });
        return;
    }
    const attachment = attachmentId ? getMediaAttachmentById(attachmentId) : undefined;
    if (attachmentId && !attachment) {
        res.status(404).json({ error: "Attachment not found" });
        return;
    }
    const senderId = req.user.id;
    const receiverId = peer.id;
    const fileUrl = attachment ? attachment.public_url : explicitFileUrl;
    const fileName = attachment ? attachment.file_name : explicitFileName;
    const nowIso = new Date().toISOString();
    const messageId = (0, crypto_1.randomUUID)();
    db.prepare(`
    INSERT INTO messages (
      id, conversation_id, sender_id, receiver_id, sender_user_id,
      content, body, type, message_type, file_url, file_name,
      timestamp, created_at, updated_at, delivered_at, read_at, is_deleted
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), ?, ?, ?, NULL, 0)
    `).run(messageId, dialogId, senderId, receiverId, senderId, encryptField(body), encryptField(body), messageType, messageType, encryptField(fileUrl), encryptField(fileName), nowIso, nowIso, isUserOnline(receiverId) ? nowIso : null);
    if (attachment) {
        db.prepare(`
      INSERT OR IGNORE INTO message_attachments (message_id, attachment_id, created_at)
      VALUES (?, ?, datetime('now'))
      `).run(messageId, attachment.id);
    }
    touchConversation(dialogId, nowIso);
    ensureFriendship(senderId, receiverId);
    const inserted = db
        .prepare(`
      SELECT id, sender_id, receiver_id, content, type, file_url, file_name, timestamp,
             conversation_id, sender_user_id, body, message_type, created_at, updated_at,
             delivered_at, read_at, is_deleted
      FROM messages
      WHERE id = ?
      `)
        .get(messageId);
    const message = withMessageAttachments([mapDirectMessage(inserted)])[0];
    io.to(conversationRoomName(dialogId)).emit("dialog:message", message);
    io.to(`user:${senderId}`).emit("message_sent", message);
    io.to(`user:${receiverId}`).emit("receive_message", message);
    io.to(`user:${receiverId}`).emit("dialog:message", message);
    if (message.deliveredAt) {
        io.to(`user:${senderId}`).emit("dialog:message-delivered", {
            conversationId: dialogId,
            messageId: message.id,
            deliveredAt: message.deliveredAt
        });
    }
    res.status(201).json(message);
});
app.post("/api/dialogs/:dialogId/read", authMiddleware, (req, res) => {
    const dialogId = req.params.dialogId;
    const participant = getDialogParticipant(dialogId, req.user.id);
    if (!participant) {
        res.status(403).json({ error: "Dialog is unavailable" });
        return;
    }
    const body = req.body;
    const upToMessageId = String(body.upToMessageId || "").trim();
    let upToDate = new Date().toISOString();
    if (upToMessageId) {
        const messageRow = db
            .prepare("SELECT created_at, timestamp FROM messages WHERE id = ? AND conversation_id = ?")
            .get(upToMessageId, dialogId);
        if (messageRow) {
            upToDate = messageRow.created_at || messageRow.timestamp || upToDate;
        }
    }
    const updatedRows = db
        .prepare(`
      UPDATE messages
      SET read_at = datetime('now'), delivered_at = COALESCE(delivered_at, datetime('now'))
      WHERE conversation_id = ?
        AND sender_user_id != ?
        AND COALESCE(is_deleted, 0) = 0
        AND (read_at IS NULL OR trim(read_at) = '')
        AND COALESCE(created_at, timestamp) <= ?
      `)
        .run(dialogId, req.user.id, upToDate);
    db.prepare(`
    UPDATE conversation_participants
    SET last_read_at = datetime('now')
    WHERE conversation_id = ? AND user_id = ?
    `).run(dialogId, req.user.id);
    const peer = getDirectPeer(dialogId, req.user.id);
    const readPayload = {
        conversationId: dialogId,
        readerUserId: req.user.id,
        readAt: new Date().toISOString()
    };
    if (peer) {
        io.to(`user:${peer.id}`).emit("dialog:messages-read", readPayload);
    }
    io.to(conversationRoomName(dialogId)).emit("dialog:messages-read", readPayload);
    res.json({ ok: true, updated: updatedRows.changes });
});
app.get("/api/dialogs/:dialogId/media", authMiddleware, (req, res) => {
    const dialogId = req.params.dialogId;
    const participant = getDialogParticipant(dialogId, req.user.id);
    if (!participant) {
        res.status(403).json({ error: "Dialog is unavailable" });
        return;
    }
    const tab = String(req.query.tab || "media").toLowerCase();
    const limit = Math.min(200, Math.max(1, Number(req.query.limit || 100)));
    const attachmentRows = db
        .prepare(`
      SELECT a.id, a.owner_user_id, a.storage_path, a.public_url, a.file_name, a.mime_type, a.size_bytes, a.media_kind, a.created_at
      FROM message_attachments ma
      JOIN messages m ON m.id = ma.message_id
      JOIN media_attachments a ON a.id = ma.attachment_id
      WHERE m.conversation_id = ?
      ORDER BY m.created_at DESC
      LIMIT ?
      `)
        .all(dialogId, limit);
    const linkRows = db
        .prepare(`
      SELECT id, body, created_at, sender_user_id
      FROM messages
      WHERE conversation_id = ?
        AND body IS NOT NULL
      ORDER BY created_at DESC
      LIMIT ?
      `)
        .all(dialogId, limit);
    const links = [];
    for (const row of linkRows) {
        const text = decryptField(row.body);
        const matches = text.match(/https?:\/\/[^\s]+/g) || [];
        for (const url of matches) {
            links.push({ messageId: row.id, url, createdAt: row.created_at, senderId: row.sender_user_id });
        }
    }
    const mappedAttachments = attachmentRows.map(mapMediaAttachment);
    const responseByTab = {
        media: mappedAttachments.filter((entry) => entry.mediaKind === "image" || entry.mediaKind === "video"),
        files: mappedAttachments.filter((entry) => entry.mediaKind === "file"),
        audio: mappedAttachments.filter((entry) => entry.mediaKind === "audio"),
        links
    };
    res.json({
        tab,
        ...responseByTab,
        items: tab === "links" ? responseByTab.links : responseByTab[tab] || []
    });
});
app.get("/api/calls/history", authMiddleware, (req, res) => {
    const rows = db
        .prepare(`
      SELECT id, initiator_user_id, recipient_user_id, status, started_at, accepted_at, ended_at,
             created_at, updated_at, ended_by_user_id, decline_reason, ended_reason
      FROM call_sessions
      WHERE initiator_user_id = ? OR recipient_user_id = ?
      ORDER BY COALESCE(updated_at, started_at, created_at) DESC
      LIMIT 100
      `)
        .all(req.user.id, req.user.id);
    res.json(rows.map((row) => ({
        id: row.id,
        initiatorUserId: row.initiator_user_id,
        recipientUserId: row.recipient_user_id,
        status: row.status,
        startedAt: row.started_at,
        acceptedAt: row.accepted_at,
        endedAt: row.ended_at,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        endedByUserId: row.ended_by_user_id,
        declineReason: row.decline_reason,
        endedReason: row.ended_reason
    })));
});
app.get("/api/calls/active", authMiddleware, (req, res) => {
    const row = db
        .prepare(`
      SELECT id, initiator_user_id, recipient_user_id, status, started_at, accepted_at, ended_at,
             created_at, updated_at, ended_by_user_id, decline_reason, ended_reason, last_event_at
      FROM call_sessions
      WHERE (initiator_user_id = ? OR recipient_user_id = ?)
        AND status IN ('ringing', 'accepted')
        AND initiator_user_id != recipient_user_id
      ORDER BY COALESCE(updated_at, last_event_at, started_at) DESC
      LIMIT 1
      `)
        .get(req.user.id, req.user.id);
    if (!row) {
        res.json({ active: null });
        return;
    }
    res.json({
        active: {
            id: row.id,
            initiatorUserId: row.initiator_user_id,
            receiverUserId: row.recipient_user_id,
            status: row.status,
            startedAt: row.started_at,
            acceptedAt: row.accepted_at,
            createdAt: row.created_at,
            updatedAt: row.updated_at
        }
    });
});
app.get("/api/messages/:otherUserId", authMiddleware, (req, res) => {
    const currentUserId = req.user.id;
    const otherUserId = req.params.otherUserId;
    if (!userExists(otherUserId)) {
        res.status(404).json({ error: "User not found" });
        return;
    }
    const conversationId = ensureDirectConversation(currentUserId, otherUserId);
    const messages = loadDialogMessages(conversationId, 200);
    res.json(messages);
});
app.get("/api/gifs", authMiddleware, (req, res) => {
    const ownerUserId = req.user.id;
    const query = String(req.query.query || "")
        .trim()
        .toLowerCase();
    const limit = Math.min(80, Math.max(1, Number(req.query.limit || 36)));
    const rows = query
        ? db
            .prepare(`
          SELECT id, owner_user_id, storage_path, public_url, file_name, mime_type, size_bytes, media_kind, created_at
          FROM media_attachments
          WHERE owner_user_id = ?
            AND (LOWER(mime_type) = 'image/gif' OR LOWER(file_name) LIKE '%.gif')
            AND LOWER(file_name) LIKE ?
          ORDER BY datetime(created_at) DESC
          LIMIT ?
          `)
            .all(ownerUserId, `%${query}%`, limit)
        : db
            .prepare(`
          SELECT id, owner_user_id, storage_path, public_url, file_name, mime_type, size_bytes, media_kind, created_at
          FROM media_attachments
          WHERE owner_user_id = ?
            AND (LOWER(mime_type) = 'image/gif' OR LOWER(file_name) LIKE '%.gif')
          ORDER BY datetime(created_at) DESC
          LIMIT ?
          `)
            .all(ownerUserId, limit);
    res.json({
        items: rows.map(mapMediaAttachment)
    });
});
app.post("/api/upload", authMiddleware, upload.single("file"), (req, res) => {
    if (!req.file) {
        res.status(400).json({ error: "No file uploaded" });
        return;
    }
    if (isBlockedUpload(req.file.originalname, req.file.mimetype)) {
        try {
            fs_1.default.unlinkSync(req.file.path);
        }
        catch {
            // Ignore best-effort cleanup.
        }
        res.status(400).json({ error: "This file type is blocked for security reasons" });
        return;
    }
    const attachment = createMediaAttachment(req.user.id, req.file);
    res.json({
        attachmentId: attachment.id,
        fileUrl: attachment.publicUrl,
        fileName: attachment.fileName,
        fileType: attachment.mimeType,
        mediaKind: attachment.mediaKind,
        size: attachment.sizeBytes,
        maxUploadMb: MAX_UPLOAD_SIZE_MB,
        attachment
    });
});
function createRoom(ownerId, name, kind, options) {
    const channelId = (0, crypto_1.randomUUID)();
    const requestedSlug = normalizeRoomSlug(String(options?.username || ""));
    if (requestedSlug && !isRoomSlugValid(requestedSlug)) {
        throw new Error("ROOM_SLUG_INVALID");
    }
    const fallbackSlug = `${kind}-${channelId.slice(0, 6)}`;
    const usernameSlug = makeUniqueRoomSlug(requestedSlug || name, fallbackSlug);
    const description = String(options?.description || "").trim().slice(0, 500);
    db.prepare(`
      INSERT INTO channels (id, name, owner_id, kind, username_slug, description, avatar_url, created_at)
      VALUES (?, ?, ?, ?, ?, ?, '', datetime('now'))
    `).run(channelId, name, ownerId, kind, usernameSlug, description);
    db.prepare(`
      INSERT INTO channel_members (channel_id, user_id, role, joined_at)
      VALUES (?, ?, 'owner', datetime('now'))
    `).run(channelId, ownerId);
    return {
        id: channelId,
        name,
        ownerId,
        kind,
        usernameSlug,
        description,
        avatarUrl: "",
        membersCount: 1
    };
}
app.post("/api/channels", authMiddleware, (req, res) => {
    const payload = req.body;
    const name = String(payload.name || "").trim();
    if (!name) {
        res.status(400).json({ error: "Channel name is required" });
        return;
    }
    try {
        res.status(201).json(createRoom(req.user.id, name, "channel", {
            username: payload.username,
            description: payload.description
        }));
    }
    catch (error) {
        if (error instanceof Error && error.message === "ROOM_SLUG_INVALID") {
            res.status(400).json({ error: "Slug должен быть 3-48 символов: a-z, 0-9, _ или -" });
            return;
        }
        res.status(500).json({ error: "Не удалось создать канал" });
    }
});
app.post("/api/groups", authMiddleware, (req, res) => {
    const payload = req.body;
    const name = String(payload.name || "").trim();
    if (!name) {
        res.status(400).json({ error: "Group name is required" });
        return;
    }
    try {
        res.status(201).json(createRoom(req.user.id, name, "group", {
            username: payload.username,
            description: payload.description
        }));
    }
    catch (error) {
        if (error instanceof Error && error.message === "ROOM_SLUG_INVALID") {
            res.status(400).json({ error: "Slug должен быть 3-48 символов: a-z, 0-9, _ или -" });
            return;
        }
        res.status(500).json({ error: "Не удалось создать группу" });
    }
});
app.post("/api/channels/:channelId/join", authMiddleware, (req, res) => {
    const channelId = req.params.channelId;
    const room = getChannelById(channelId);
    if (!room || normalizeChannelKind(room.kind) !== "channel") {
        res.status(404).json({ error: "Channel not found" });
        return;
    }
    db.prepare(`
      INSERT OR IGNORE INTO channel_members (channel_id, user_id, role, joined_at)
      VALUES (?, ?, 'member', datetime('now'))
    `).run(channelId, req.user.id);
    res.json({ ok: true });
});
app.post("/api/groups/:groupId/join", authMiddleware, (req, res) => {
    const groupId = req.params.groupId;
    const room = getChannelById(groupId);
    if (!room || normalizeChannelKind(room.kind) !== "group") {
        res.status(404).json({ error: "Group not found" });
        return;
    }
    db.prepare(`
      INSERT OR IGNORE INTO channel_members (channel_id, user_id, role, joined_at)
      VALUES (?, ?, 'member', datetime('now'))
    `).run(groupId, req.user.id);
    res.json({ ok: true });
});
app.post("/api/channels/:channelId/members", authMiddleware, (req, res) => {
    const channelId = req.params.channelId;
    const room = getChannelById(channelId);
    if (!room || normalizeChannelKind(room.kind) !== "channel") {
        res.status(404).json({ error: "Channel not found" });
        return;
    }
    if (!isChannelOwner(channelId, req.user.id)) {
        res.status(403).json({ error: "Only admin can add users to channel" });
        return;
    }
    const payload = req.body;
    const query = String(payload.userId || payload.query || "").trim();
    const targetUser = findUserByQuery(query);
    if (!targetUser) {
        res.status(404).json({ error: "User not found" });
        return;
    }
    db.prepare(`
      INSERT OR IGNORE INTO channel_members (channel_id, user_id, role, joined_at)
      VALUES (?, ?, 'member', datetime('now'))
    `).run(channelId, targetUser.id);
    res.json({ ok: true, user: toPublicUserDto(targetUser) });
});
app.post("/api/groups/:groupId/members", authMiddleware, (req, res) => {
    const groupId = req.params.groupId;
    const room = getChannelById(groupId);
    if (!room || normalizeChannelKind(room.kind) !== "group") {
        res.status(404).json({ error: "Group not found" });
        return;
    }
    if (!isChannelOwner(groupId, req.user.id)) {
        res.status(403).json({ error: "Only group owner can add users" });
        return;
    }
    const payload = req.body;
    const query = String(payload.userId || payload.query || "").trim();
    const targetUser = findUserByQuery(query);
    if (!targetUser) {
        res.status(404).json({ error: "User not found" });
        return;
    }
    db.prepare(`
      INSERT OR IGNORE INTO channel_members (channel_id, user_id, role, joined_at)
      VALUES (?, ?, 'member', datetime('now'))
    `).run(groupId, targetUser.id);
    res.json({ ok: true, user: toPublicUserDto(targetUser) });
});
app.get("/api/channels", authMiddleware, (req, res) => {
    const rows = db
        .prepare(`
      SELECT
        c.id,
        c.name,
        c.owner_id,
        c.kind,
        c.username_slug,
        c.description,
        c.avatar_url,
        c.created_at,
        (SELECT COUNT(*) FROM channel_members cm WHERE cm.channel_id = c.id) AS members_count
      FROM channel_members me
      JOIN channels c ON c.id = me.channel_id
      WHERE me.user_id = ? AND c.kind = 'channel'
      ORDER BY c.created_at DESC
      `)
        .all(req.user.id);
    res.json(rows.map(mapChannelListItem));
});
app.get("/api/groups", authMiddleware, (req, res) => {
    const rows = db
        .prepare(`
      SELECT
        c.id,
        c.name,
        c.owner_id,
        c.kind,
        c.username_slug,
        c.description,
        c.avatar_url,
        c.created_at,
        (SELECT COUNT(*) FROM channel_members cm WHERE cm.channel_id = c.id) AS members_count
      FROM channel_members me
      JOIN channels c ON c.id = me.channel_id
      WHERE me.user_id = ? AND c.kind = 'group'
      ORDER BY c.created_at DESC
      `)
        .all(req.user.id);
    res.json(rows.map(mapChannelListItem));
});
app.get("/api/channels/slug/:slug", authMiddleware, (req, res) => {
    const slug = normalizeRoomSlug(String(req.params.slug || ""));
    if (!slug || !isRoomSlugValid(slug)) {
        res.status(400).json({ error: "Некорректный slug" });
        return;
    }
    const room = getChannelBySlug(slug);
    if (!room) {
        res.status(404).json({ error: "Канал или группа не найдены" });
        return;
    }
    const membersCount = db
        .prepare("SELECT COUNT(*) AS count FROM channel_members WHERE channel_id = ?")
        .get(room.id);
    const kind = normalizeChannelKind(room.kind);
    const payload = {
        id: room.id,
        name: room.name || "",
        ownerId: room.owner_id,
        kind,
        usernameSlug: room.username_slug || "",
        description: room.description || "",
        avatarUrl: room.avatar_url || "",
        createdAt: "",
        membersCount: membersCount.count
    };
    res.json({
        room: payload,
        isMember: isChannelMember(room.id, req.user.id),
        publicPath: kind === "group" ? `/g/${payload.usernameSlug}` : `/c/${payload.usernameSlug}`
    });
});
app.post("/api/channels/slug/:slug/join", authMiddleware, (req, res) => {
    const slug = normalizeRoomSlug(String(req.params.slug || ""));
    if (!slug || !isRoomSlugValid(slug)) {
        res.status(400).json({ error: "Некорректный slug" });
        return;
    }
    const room = getChannelBySlug(slug);
    if (!room) {
        res.status(404).json({ error: "Канал или группа не найдены" });
        return;
    }
    db.prepare(`
      INSERT OR IGNORE INTO channel_members (channel_id, user_id, role, joined_at)
      VALUES (?, ?, 'member', datetime('now'))
    `).run(room.id, req.user.id);
    const membersCount = db
        .prepare("SELECT COUNT(*) AS count FROM channel_members WHERE channel_id = ?")
        .get(room.id);
    res.json({
        ok: true,
        room: {
            id: room.id,
            name: room.name || "",
            ownerId: room.owner_id,
            kind: normalizeChannelKind(room.kind),
            usernameSlug: room.username_slug || "",
            description: room.description || "",
            avatarUrl: room.avatar_url || "",
            createdAt: "",
            membersCount: membersCount.count
        }
    });
});
app.patch("/api/channels/:channelId/slug", authMiddleware, (req, res) => {
    const channelId = req.params.channelId;
    const room = getChannelById(channelId);
    if (!room) {
        res.status(404).json({ error: "Канал не найден" });
        return;
    }
    if (!isChannelOwner(channelId, req.user.id)) {
        res.status(403).json({ error: "Только владелец может менять slug" });
        return;
    }
    const payload = req.body;
    const nextSlug = normalizeRoomSlug(String(payload.slug || ""));
    if (!nextSlug || !isRoomSlugValid(nextSlug)) {
        res.status(400).json({ error: "Slug должен быть 3-48 символов: a-z, 0-9, _ или -" });
        return;
    }
    if (slugExists(nextSlug, channelId)) {
        res.status(409).json({ error: "Этот slug уже занят" });
        return;
    }
    db.prepare("UPDATE channels SET username_slug = ? WHERE id = ?").run(nextSlug, channelId);
    const updatedRoom = getChannelById(channelId);
    const kind = normalizeChannelKind(updatedRoom?.kind);
    res.json({
        ok: true,
        id: channelId,
        kind,
        usernameSlug: nextSlug,
        publicPath: kind === "group" ? `/g/${nextSlug}` : `/c/${nextSlug}`
    });
});
app.get("/api/channels/:channelId/profile", authMiddleware, (req, res) => {
    const channelId = req.params.channelId;
    const room = getChannelById(channelId);
    if (!room) {
        res.status(404).json({ error: "Channel not found" });
        return;
    }
    if (!isChannelMember(channelId, req.user.id)) {
        res.status(403).json({ error: "You are not a member of this room" });
        return;
    }
    const membersCount = db
        .prepare("SELECT COUNT(*) as count FROM channel_members WHERE channel_id = ?")
        .get(channelId);
    const mediaCount = db
        .prepare(`
      SELECT COUNT(*) AS count
      FROM channel_message_attachments cma
      JOIN channel_messages cm ON cm.id = cma.channel_message_id
      WHERE cm.channel_id = ?
      `)
        .get(channelId);
    res.json({
        id: room.id,
        kind: normalizeChannelKind(room.kind),
        name: room.name || "",
        usernameSlug: room.username_slug || "",
        publicPath: normalizeChannelKind(room.kind) === "group" ? `/g/${room.username_slug || ""}` : `/c/${room.username_slug || ""}`,
        description: room.description || "",
        avatarUrl: room.avatar_url || "",
        ownerId: room.owner_id,
        membersCount: membersCount.count,
        mediaCount: mediaCount.count
    });
});
app.get("/api/channels/:channelId/media", authMiddleware, (req, res) => {
    const channelId = req.params.channelId;
    const room = getChannelById(channelId);
    if (!room) {
        res.status(404).json({ error: "Channel not found" });
        return;
    }
    if (!isChannelMember(channelId, req.user.id)) {
        res.status(403).json({ error: "You are not a member of this room" });
        return;
    }
    const tab = String(req.query.tab || "media").toLowerCase();
    const limit = Math.min(200, Math.max(1, Number(req.query.limit || 100)));
    const attachmentRows = db
        .prepare(`
      SELECT cma.channel_message_id AS message_id, a.id AS attachment_id, a.owner_user_id, a.storage_path,
             a.public_url, a.file_name, a.mime_type, a.size_bytes, a.media_kind, a.created_at
      FROM channel_message_attachments cma
      JOIN channel_messages cm ON cm.id = cma.channel_message_id
      JOIN media_attachments a ON a.id = cma.attachment_id
      WHERE cm.channel_id = ?
      ORDER BY cm.timestamp DESC
      LIMIT ?
      `)
        .all(channelId, limit);
    const linksRows = db
        .prepare(`
      SELECT id, content, sender_id, timestamp
      FROM channel_messages
      WHERE channel_id = ? AND content IS NOT NULL
      ORDER BY timestamp DESC
      LIMIT ?
      `)
        .all(channelId, limit);
    const links = [];
    for (const row of linksRows) {
        const text = decryptField(row.content);
        const matches = text.match(/https?:\/\/[^\s]+/g) || [];
        for (const url of matches) {
            links.push({
                messageId: row.id,
                url,
                createdAt: row.timestamp,
                senderId: row.sender_id
            });
        }
    }
    const mappedAttachments = attachmentRows.map((row) => mapMediaAttachment({
        id: row.attachment_id,
        owner_user_id: row.owner_user_id,
        storage_path: row.storage_path,
        public_url: row.public_url,
        file_name: row.file_name,
        mime_type: row.mime_type,
        size_bytes: row.size_bytes,
        media_kind: row.media_kind,
        created_at: row.created_at
    }));
    const responseByTab = {
        media: mappedAttachments.filter((entry) => entry.mediaKind === "image" || entry.mediaKind === "video"),
        files: mappedAttachments.filter((entry) => entry.mediaKind === "file"),
        audio: mappedAttachments.filter((entry) => entry.mediaKind === "audio"),
        links
    };
    res.json({
        channelId,
        tab,
        ...responseByTab,
        items: tab === "links" ? responseByTab.links : responseByTab[tab] || []
    });
});
app.get("/api/channels/:channelId/messages", authMiddleware, (req, res) => {
    const channelId = req.params.channelId;
    const room = getChannelById(channelId);
    if (!room || normalizeChannelKind(room.kind) !== "channel") {
        res.status(404).json({ error: "Channel not found" });
        return;
    }
    if (!isChannelMember(channelId, req.user.id)) {
        res.status(403).json({ error: "You are not a member of this channel" });
        return;
    }
    const rows = db
        .prepare(`
      SELECT id, channel_id, sender_id, content, type, file_url, file_name, timestamp
      FROM channel_messages
      WHERE channel_id = ?
      ORDER BY timestamp ASC
      `)
        .all(channelId);
    res.json(withChannelMessageAttachments(rows.map(mapChannelMessage)));
});
app.get("/api/groups/:groupId/messages", authMiddleware, (req, res) => {
    const groupId = req.params.groupId;
    const room = getChannelById(groupId);
    if (!room || normalizeChannelKind(room.kind) !== "group") {
        res.status(404).json({ error: "Group not found" });
        return;
    }
    if (!isChannelMember(groupId, req.user.id)) {
        res.status(403).json({ error: "You are not a member of this group" });
        return;
    }
    const rows = db
        .prepare(`
      SELECT id, channel_id, sender_id, content, type, file_url, file_name, timestamp
      FROM channel_messages
      WHERE channel_id = ?
      ORDER BY timestamp ASC
      `)
        .all(groupId);
    res.json(withChannelMessageAttachments(rows.map(mapChannelMessage)));
});
app.post("/api/archive", authMiddleware, (req, res) => {
    const payload = req.body;
    const targetType = String(payload.targetType || "").trim().toLowerCase();
    const targetId = String(payload.targetId || "").trim();
    const userId = req.user.id;
    if (!targetType || !targetId) {
        res.status(400).json({ error: "targetType and targetId are required" });
        return;
    }
    if (targetType === "user") {
        if (!userExists(targetId)) {
            res.status(404).json({ error: "User not found" });
            return;
        }
    }
    else if (targetType === "channel" || targetType === "group") {
        const room = getChannelById(targetId);
        if (!room || normalizeChannelKind(room.kind) !== targetType) {
            res.status(404).json({ error: `${targetType} not found` });
            return;
        }
        if (!isChannelMember(targetId, userId)) {
            res.status(403).json({ error: "You are not a member" });
            return;
        }
    }
    else {
        res.status(400).json({ error: "Unsupported targetType" });
        return;
    }
    db.prepare(`
      INSERT INTO archived_items (user_id, target_type, target_id, archived_at)
      VALUES (?, ?, ?, datetime('now'))
      ON CONFLICT(user_id, target_type, target_id)
      DO UPDATE SET archived_at = excluded.archived_at
    `).run(userId, targetType, targetId);
    res.json({ ok: true });
});
app.delete("/api/archive", authMiddleware, (req, res) => {
    const payload = req.body;
    const targetType = String(payload.targetType || "").trim().toLowerCase();
    const targetId = String(payload.targetId || "").trim();
    if (!targetType || !targetId) {
        res.status(400).json({ error: "targetType and targetId are required" });
        return;
    }
    db.prepare("DELETE FROM archived_items WHERE user_id = ? AND target_type = ? AND target_id = ?").run(req.user.id, targetType, targetId);
    res.json({ ok: true });
});
app.get("/api/archive", authMiddleware, (req, res) => {
    const userId = req.user.id;
    const archivedUsers = db
        .prepare(`
      SELECT u.id, u.username, u.password, u.display_name, u.unique_id, u.numeric_user_id, u.email, u.bio, u.avatar_url,
             u.theme, u.chat_bubble_style, u.chat_wallpaper, u.message_font_scale, u.created_at
      FROM archived_items a
      JOIN users u ON u.id = a.target_id
      WHERE a.user_id = ? AND a.target_type = 'user'
      ORDER BY a.archived_at DESC
      `)
        .all(userId);
    const archivedChannels = db
        .prepare(`
      SELECT c.id, c.name, c.owner_id, c.kind, c.created_at,
        c.username_slug, c.description, c.avatar_url,
        (SELECT COUNT(*) FROM channel_members cm WHERE cm.channel_id = c.id) AS members_count
      FROM archived_items a
      JOIN channels c ON c.id = a.target_id
      WHERE a.user_id = ? AND a.target_type = 'channel'
      ORDER BY a.archived_at DESC
      `)
        .all(userId);
    const archivedGroups = db
        .prepare(`
      SELECT c.id, c.name, c.owner_id, c.kind, c.created_at,
        c.username_slug, c.description, c.avatar_url,
        (SELECT COUNT(*) FROM channel_members cm WHERE cm.channel_id = c.id) AS members_count
      FROM archived_items a
      JOIN channels c ON c.id = a.target_id
      WHERE a.user_id = ? AND a.target_type = 'group'
      ORDER BY a.archived_at DESC
      `)
        .all(userId);
    res.json({
        users: archivedUsers.map(toPublicUserDto),
        channels: archivedChannels.map(mapChannelListItem),
        groups: archivedGroups.map(mapChannelListItem)
    });
});
io.on("connection", (socket) => {
    const socketUserId = () => String(socket.data.userId || "");
    const handleRegister = (payload) => {
        const rawUserId = typeof payload === "string" ? payload : String(payload?.userId || "");
        const token = typeof payload === "string" ? "" : String(payload?.token || "");
        if (!rawUserId || !userExists(rawUserId)) {
            return;
        }
        if (token) {
            try {
                const decoded = jsonwebtoken_1.default.verify(token, JWT_SECRET);
                if (String(decoded.id || "") !== rawUserId) {
                    return;
                }
            }
            catch {
                return;
            }
        }
        socket.data.userId = rawUserId;
        addSocketForUser(rawUserId, socket.id);
        socket.join(`user:${rawUserId}`);
        joinMemberChannels(socket.id, rawUserId);
        joinUserDialogs(socket.id, rawUserId);
    };
    socket.on("register", handleRegister);
    socket.on("join_channel", (payload) => {
        const channelId = String(payload?.channelId || "");
        const userId = String(payload?.userId || socketUserId() || "");
        if (!channelId || !userId || !isChannelMember(channelId, userId)) {
            return;
        }
        socket.join(`channel:${channelId}`);
    });
    socket.on("join_dialog", (payload) => {
        const conversationId = String(payload?.conversationId || "");
        const userId = String(payload?.userId || socketUserId() || "");
        if (!conversationId || !userId || !getDialogParticipant(conversationId, userId)) {
            return;
        }
        socket.join(conversationRoomName(conversationId));
    });
    const emitCallIncoming = (receiverId, data) => {
        io.to(`user:${receiverId}`).emit("incoming_call", data);
        io.to(`user:${receiverId}`).emit("call:incoming", data);
        io.to(`user:${receiverId}`).emit("webrtc:offer", data);
    };
    const emitCallAnswered = (receiverId, data) => {
        io.to(`user:${receiverId}`).emit("call_answered", data);
        io.to(`user:${receiverId}`).emit("call:accept", data);
    };
    const emitCallDeclined = (receiverId, data) => {
        io.to(`user:${receiverId}`).emit("call_rejected", data);
        io.to(`user:${receiverId}`).emit("call:decline", data);
    };
    const emitCallEnded = (receiverId, data) => {
        io.to(`user:${receiverId}`).emit("call_ended", data);
        io.to(`user:${receiverId}`).emit("call:end", data);
    };
    const emitCallBusy = (receiverId, data) => {
        io.to(`user:${receiverId}`).emit("call_busy", data);
        io.to(`user:${receiverId}`).emit("call:busy", data);
    };
    const emitCallMissed = (receiverId, data) => {
        io.to(`user:${receiverId}`).emit("call_missed", data);
        io.to(`user:${receiverId}`).emit("call:missed", data);
    };
    const handleCallInvite = (payload) => {
        const currentUserId = socketUserId();
        const callId = String(payload.callId || (0, crypto_1.randomUUID)());
        const senderId = String(payload.senderId || "");
        const receiverId = String(payload.receiverId || "");
        if (!currentUserId || currentUserId !== senderId) {
            socket.emit("call:decline", {
                callId,
                senderId: receiverId || senderId,
                reason: "not-registered"
            });
            return;
        }
        if (!receiverId || !payload.offer) {
            emitCallDeclined(senderId, {
                callId,
                senderId: receiverId || senderId,
                reason: "invalid-call"
            });
            return;
        }
        if (senderId === receiverId) {
            emitCallDeclined(senderId, {
                callId,
                senderId: receiverId,
                reason: "self-call"
            });
            return;
        }
        if (!userExists(receiverId)) {
            emitCallMissed(senderId, {
                callId,
                senderId: receiverId,
                reason: "offline"
            });
            io.to(`user:${senderId}`).emit("call_unavailable", { callId, receiverId, reason: "offline" });
            return;
        }
        if (getCallSessionById(callId)) {
            return;
        }
        if (hasActiveCall(senderId, callId)) {
            createCallSession(callId, senderId, receiverId, "ringing");
            transitionCallSession(callId, "busy", senderId, "caller-busy");
            emitCallBusy(senderId, { callId, senderId: receiverId, reason: "caller-busy" });
            return;
        }
        if (!isUserOnline(receiverId)) {
            createCallSession(callId, senderId, receiverId, "ringing");
            transitionCallSession(callId, "missed", senderId, "offline");
            emitCallMissed(senderId, { callId, senderId: receiverId, reason: "offline" });
            io.to(`user:${senderId}`).emit("call_unavailable", { callId, receiverId, reason: "offline" });
            return;
        }
        if (hasActiveCall(receiverId, callId)) {
            createCallSession(callId, senderId, receiverId, "ringing");
            transitionCallSession(callId, "busy", receiverId, "busy");
            emitCallBusy(senderId, { callId, senderId: receiverId, reason: "busy" });
            return;
        }
        createCallSession(callId, senderId, receiverId, "ringing");
        transitionCallSession(callId, "ringing", senderId);
        emitCallIncoming(receiverId, {
            callId,
            senderId,
            offer: payload.offer,
            senderPreview: payload.senderPreview || null
        });
        io.to(`user:${senderId}`).emit("call_ringing", { callId, receiverId });
        io.to(`user:${senderId}`).emit("call:ringing", { callId, receiverId });
        clearCallRingTimer(callId);
        const timeout = setTimeout(() => {
            callRingTimers.delete(callId);
            const current = getCallSessionById(callId);
            if (!current || current.status !== "ringing") {
                return;
            }
            const transitioned = transitionCallSession(callId, "missed", current.recipient_user_id, "timeout");
            if (!transitioned) {
                return;
            }
            emitCallMissed(current.initiator_user_id, {
                callId: transitioned.id,
                senderId: current.recipient_user_id,
                reason: "timeout"
            });
            emitCallMissed(current.recipient_user_id, {
                callId: transitioned.id,
                senderId: current.initiator_user_id,
                reason: "timeout"
            });
        }, CALL_RING_TIMEOUT_MS);
        callRingTimers.set(callId, timeout);
    };
    socket.on("call_offer", handleCallInvite);
    socket.on("call:invite", handleCallInvite);
    socket.on("webrtc:offer", handleCallInvite);
    const handleCallAnswer = (payload) => {
        const currentUserId = socketUserId();
        const callId = String(payload.callId || "");
        const senderId = String(payload.senderId || "");
        const receiverId = String(payload.receiverId || "");
        if (!currentUserId || currentUserId !== senderId) {
            return;
        }
        if (!callId || !receiverId || senderId === receiverId || !payload.answer) {
            return;
        }
        const session = getCallSessionById(callId);
        if (!session || session.recipient_user_id !== senderId || session.initiator_user_id !== receiverId) {
            return;
        }
        if (!isUserOnline(receiverId)) {
            clearCallRingTimer(callId);
            transitionCallSession(callId, "ended", senderId, "caller-offline");
            emitCallEnded(senderId, {
                callId,
                senderId: receiverId,
                reason: "caller-offline"
            });
            return;
        }
        if (session.status !== "ringing") {
            return;
        }
        clearCallRingTimer(callId);
        transitionCallSession(callId, "accepted", senderId);
        emitCallAnswered(receiverId, {
            callId,
            senderId,
            answer: payload.answer
        });
        io.to(`user:${receiverId}`).emit("webrtc:answer", {
            callId,
            senderId,
            answer: payload.answer
        });
    };
    socket.on("call_answer", handleCallAnswer);
    socket.on("call:accept", handleCallAnswer);
    socket.on("webrtc:answer", handleCallAnswer);
    const handleCallIce = (payload) => {
        const currentUserId = socketUserId();
        const callId = String(payload.callId || "");
        const senderId = String(payload.senderId || "");
        const receiverId = String(payload.receiverId || "");
        if (!currentUserId || currentUserId !== senderId) {
            return;
        }
        if (!callId || !receiverId || senderId === receiverId || !payload.candidate) {
            return;
        }
        const session = getCallSessionById(callId);
        if (!session || !isCallParticipant(session, senderId) || !isCallParticipant(session, receiverId)) {
            return;
        }
        if (!isActiveCallStatus(session.status)) {
            return;
        }
        io.to(`user:${receiverId}`).emit("call_ice_candidate", {
            callId,
            senderId,
            candidate: payload.candidate
        });
        io.to(`user:${receiverId}`).emit("webrtc:ice-candidate", {
            callId,
            senderId,
            candidate: payload.candidate
        });
    };
    socket.on("call_ice_candidate", handleCallIce);
    socket.on("webrtc:ice-candidate", handleCallIce);
    const handleCallDecline = (payload) => {
        const currentUserId = socketUserId();
        const callId = String(payload.callId || "");
        const senderId = String(payload.senderId || "");
        const receiverId = String(payload.receiverId || "");
        if (!currentUserId || currentUserId !== senderId) {
            return;
        }
        if (!callId || !receiverId || senderId === receiverId) {
            return;
        }
        const session = getCallSessionById(callId);
        if (!session || session.recipient_user_id !== senderId || session.initiator_user_id !== receiverId) {
            return;
        }
        if (session.status !== "ringing") {
            return;
        }
        clearCallRingTimer(callId);
        transitionCallSession(callId, parseCallStatusEvent("declined"), senderId, payload.reason || "declined");
        emitCallDeclined(receiverId, {
            callId,
            senderId,
            reason: payload.reason || "declined"
        });
    };
    socket.on("call_reject", handleCallDecline);
    socket.on("call:decline", handleCallDecline);
    socket.on("call_busy", (payload) => {
        const currentUserId = socketUserId();
        const callId = String(payload.callId || "");
        const senderId = String(payload.senderId || "");
        const receiverId = String(payload.receiverId || "");
        if (!currentUserId || currentUserId !== senderId) {
            return;
        }
        if (!callId || !receiverId || senderId === receiverId) {
            return;
        }
        const session = getCallSessionById(callId);
        if (!session || session.recipient_user_id !== senderId || session.initiator_user_id !== receiverId) {
            return;
        }
        if (session.status !== "ringing") {
            return;
        }
        clearCallRingTimer(callId);
        transitionCallSession(callId, "busy", senderId, "busy");
        emitCallBusy(receiverId, { callId, senderId, reason: "busy" });
    });
    socket.on("call:busy", (payload) => {
        const currentUserId = socketUserId();
        const callId = String(payload.callId || "");
        const senderId = String(payload.senderId || "");
        const receiverId = String(payload.receiverId || "");
        if (!currentUserId || currentUserId !== senderId) {
            return;
        }
        if (!callId || !receiverId || senderId === receiverId) {
            return;
        }
        const session = getCallSessionById(callId);
        if (!session || session.recipient_user_id !== senderId || session.initiator_user_id !== receiverId) {
            return;
        }
        if (session.status !== "ringing") {
            return;
        }
        clearCallRingTimer(callId);
        transitionCallSession(callId, "busy", senderId, "busy");
        emitCallBusy(receiverId, { callId, senderId, reason: "busy" });
    });
    const handleCallEnd = (payload) => {
        const currentUserId = socketUserId();
        const callId = String(payload.callId || "");
        const senderId = String(payload.senderId || "");
        const receiverId = String(payload.receiverId || "");
        if (!currentUserId || currentUserId !== senderId) {
            return;
        }
        if (!callId || !receiverId || senderId === receiverId) {
            return;
        }
        const session = getCallSessionById(callId);
        if (!session || !isCallParticipant(session, senderId) || !isCallParticipant(session, receiverId)) {
            return;
        }
        if (isTerminalCallStatus(session.status)) {
            return;
        }
        clearCallRingTimer(callId);
        transitionCallSession(callId, "ended", senderId, payload.reason || "ended");
        emitCallEnded(receiverId, {
            callId,
            senderId,
            reason: payload.reason || "ended"
        });
    };
    socket.on("call_end", handleCallEnd);
    socket.on("call:end", handleCallEnd);
    const handleDirectMessage = (payload) => {
        const currentUserId = socketUserId();
        const senderId = String(payload.senderId || "");
        const requestedReceiverId = String(payload.receiverId || "");
        const type = normalizeMessageType(payload.type);
        const textBody = sanitizeMessageText(String(payload.content || ""));
        const attachmentId = String(payload.attachmentId || "").trim();
        if (!currentUserId || currentUserId !== senderId) {
            return;
        }
        if (!senderId || !userExists(senderId)) {
            return;
        }
        if (requestedReceiverId && senderId === requestedReceiverId) {
            return;
        }
        let conversationId = String(payload.conversationId || "").trim();
        let receiverId = requestedReceiverId;
        if (conversationId) {
            if (!getDialogParticipant(conversationId, senderId)) {
                return;
            }
            const peer = getDirectPeer(conversationId, senderId);
            if (!peer) {
                return;
            }
            receiverId = peer.id;
        }
        else {
            if (!receiverId || !userExists(receiverId)) {
                return;
            }
            conversationId = ensureDirectConversation(senderId, receiverId);
        }
        if (!receiverId || !conversationId) {
            return;
        }
        if (type === "text" && !textBody) {
            return;
        }
        const attachment = attachmentId ? getMediaAttachmentById(attachmentId) : undefined;
        if (attachmentId && !attachment) {
            return;
        }
        const fileUrl = attachment ? attachment.public_url : String(payload.fileUrl || "");
        const fileName = attachment ? attachment.file_name : String(payload.fileName || "");
        const normalizedType = attachment ? (attachment.media_kind === "audio" ? "voice" : "file") : type;
        const nowIso = new Date().toISOString();
        const deliveredAt = isUserOnline(receiverId) ? nowIso : null;
        const messageId = (0, crypto_1.randomUUID)();
        db.prepare(`
      INSERT INTO messages (
        id, conversation_id, sender_id, receiver_id, sender_user_id,
        content, body, type, message_type, file_url, file_name, timestamp,
        created_at, updated_at, delivered_at, read_at, is_deleted
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), ?, ?, ?, NULL, 0)
      `).run(messageId, conversationId, senderId, receiverId, senderId, encryptField(textBody), encryptField(textBody), normalizedType, normalizedType, encryptField(fileUrl), encryptField(fileName), nowIso, nowIso, deliveredAt);
        if (attachment) {
            db.prepare(`
        INSERT OR IGNORE INTO message_attachments (message_id, attachment_id, created_at)
        VALUES (?, ?, datetime('now'))
        `).run(messageId, attachment.id);
        }
        touchConversation(conversationId, nowIso);
        ensureFriendship(senderId, receiverId);
        socket.join(conversationRoomName(conversationId));
        const receiverSockets = activeUserSockets.get(receiverId);
        if (receiverSockets) {
            for (const receiverSocketId of receiverSockets) {
                io.sockets.sockets.get(receiverSocketId)?.join(conversationRoomName(conversationId));
            }
        }
        const row = db
            .prepare(`
        SELECT id, sender_id, receiver_id, content, type, file_url, file_name, timestamp,
               conversation_id, sender_user_id, body, message_type, created_at, updated_at,
               delivered_at, read_at, is_deleted
        FROM messages
        WHERE id = ?
        `)
            .get(messageId);
        const message = withMessageAttachments([mapDirectMessage(row)])[0];
        io.to(conversationRoomName(conversationId)).emit("dialog:message", message);
        io.to(`user:${senderId}`).emit("message_sent", message);
        io.to(`user:${receiverId}`).emit("receive_message", message);
        io.to(`user:${receiverId}`).emit("dialog:message", message);
        if (deliveredAt) {
            io.to(`user:${senderId}`).emit("dialog:message-delivered", {
                conversationId,
                messageId,
                deliveredAt
            });
        }
    };
    socket.on("send_message", handleDirectMessage);
    socket.on("dialog:send-message", handleDirectMessage);
    socket.on("dialog:mark-read", (payload) => {
        const currentUserId = socketUserId();
        const conversationId = String(payload?.conversationId || "");
        const readerId = String(payload?.readerId || currentUserId || "");
        const upToMessageId = String(payload?.upToMessageId || "").trim();
        if (!conversationId || !readerId || currentUserId !== readerId) {
            return;
        }
        if (!getDialogParticipant(conversationId, readerId)) {
            return;
        }
        let upToDate = new Date().toISOString();
        if (upToMessageId) {
            const row = db
                .prepare("SELECT created_at, timestamp FROM messages WHERE id = ? AND conversation_id = ?")
                .get(upToMessageId, conversationId);
            if (row) {
                upToDate = row.created_at || row.timestamp || upToDate;
            }
        }
        db.prepare(`
        UPDATE messages
        SET read_at = datetime('now'),
            delivered_at = COALESCE(delivered_at, datetime('now'))
        WHERE conversation_id = ?
          AND sender_user_id != ?
          AND (read_at IS NULL OR trim(read_at) = '')
          AND COALESCE(created_at, timestamp) <= ?
        `).run(conversationId, readerId, upToDate);
        db.prepare(`
        UPDATE conversation_participants
        SET last_read_at = datetime('now')
        WHERE conversation_id = ? AND user_id = ?
        `).run(conversationId, readerId);
        const readPayload = {
            conversationId,
            readerUserId: readerId,
            readAt: new Date().toISOString()
        };
        io.to(conversationRoomName(conversationId)).emit("dialog:messages-read", readPayload);
        const peer = getDirectPeer(conversationId, readerId);
        if (peer) {
            io.to(`user:${peer.id}`).emit("dialog:messages-read", readPayload);
        }
    });
    socket.on("send_channel_message", (payload) => {
        const currentUserId = socketUserId();
        const senderId = String(payload.senderId || "");
        const channelId = String(payload.channelId || "");
        const type = normalizeMessageType(payload.type);
        const content = sanitizeMessageText(String(payload.content || ""));
        const attachmentId = String(payload.attachmentId || "").trim();
        const attachment = attachmentId ? getMediaAttachmentById(attachmentId) : undefined;
        const fileUrl = attachment ? attachment.public_url : payload.fileUrl || "";
        const fileName = attachment ? attachment.file_name : payload.fileName || "";
        if (!currentUserId || currentUserId !== senderId) {
            return;
        }
        if (!senderId || !channelId || !isChannelMember(channelId, senderId)) {
            return;
        }
        if (type === "text" && !content) {
            return;
        }
        const normalizedType = attachment ? (attachment.media_kind === "audio" ? "voice" : "file") : type;
        const messageId = (0, crypto_1.randomUUID)();
        db.prepare(`
      INSERT INTO channel_messages (id, channel_id, sender_id, content, type, file_url, file_name, timestamp)
      VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))
      `).run(messageId, channelId, senderId, encryptField(content), normalizedType, encryptField(fileUrl), encryptField(fileName));
        if (attachment) {
            db.prepare(`
        INSERT OR IGNORE INTO channel_message_attachments (channel_message_id, attachment_id, created_at)
        VALUES (?, ?, datetime('now'))
        `).run(messageId, attachment.id);
        }
        const row = db
            .prepare("SELECT id, channel_id, sender_id, content, type, file_url, file_name, timestamp FROM channel_messages WHERE id = ?")
            .get(messageId);
        const mapped = withChannelMessageAttachments([mapChannelMessage(row)])[0];
        io.to(`channel:${channelId}`).emit("receive_channel_message", mapped);
        io.to(`channel:${channelId}`).emit("channel:message", mapped);
    });
    socket.on("disconnect", () => {
        const userId = socket.data.userId;
        if (userId) {
            removeSocketForUser(userId, socket.id);
            if (!isUserOnline(userId)) {
                const danglingCalls = db
                    .prepare(`
            SELECT id, initiator_user_id, recipient_user_id, status, started_at, accepted_at, ended_at,
                   created_at, updated_at, ended_by_user_id, decline_reason, ended_reason, last_event_at
            FROM call_sessions
            WHERE (initiator_user_id = ? OR recipient_user_id = ?)
              AND status IN ('ringing', 'accepted')
            ORDER BY COALESCE(updated_at, last_event_at, started_at) DESC
            `)
                    .all(userId, userId);
                for (const call of danglingCalls) {
                    clearCallRingTimer(call.id);
                    if (call.initiator_user_id === call.recipient_user_id) {
                        transitionCallSession(call.id, "failed", userId, "self-call");
                        continue;
                    }
                    let nextStatus = "ended";
                    let reason = "disconnect";
                    let eventType = "end";
                    if (call.status === "ringing" && call.recipient_user_id === userId) {
                        nextStatus = "missed";
                        reason = "recipient-disconnected";
                        eventType = "missed";
                    }
                    else if (call.status === "ringing" && call.initiator_user_id === userId) {
                        nextStatus = "ended";
                        reason = "caller-disconnected";
                    }
                    const transitioned = transitionCallSession(call.id, nextStatus, userId, reason);
                    if (!transitioned)
                        continue;
                    const peerId = getCallPeerId(transitioned, userId);
                    if (!peerId || peerId === userId || !isUserOnline(peerId)) {
                        continue;
                    }
                    if (eventType === "missed") {
                        emitCallMissed(peerId, {
                            callId: transitioned.id,
                            senderId: userId,
                            reason
                        });
                    }
                    else {
                        emitCallEnded(peerId, {
                            callId: transitioned.id,
                            senderId: userId,
                            reason
                        });
                    }
                }
            }
        }
    });
});
app.use((err, _req, res, _next) => {
    if (err instanceof multer_1.default.MulterError && err.code === "LIMIT_FILE_SIZE") {
        res.status(413).json({
            error: `File is too large. Current limit is ${MAX_UPLOAD_SIZE_MB} MB`,
            maxUploadMb: MAX_UPLOAD_SIZE_MB
        });
        return;
    }
    const message = err instanceof Error ? err.message : "Internal Server Error";
    res.status(500).json({ error: message });
});
const server = httpServer.listen(PORT, "127.0.0.1", () => {
    console.log(`Backend started on http://127.0.0.1:${PORT}`);
});
function shutdown(signal) {
    console.log(`${signal} received, shutting down...`);
    server.close(() => {
        db.close();
        process.exit(0);
    });
    setTimeout(() => process.exit(1), 10000).unref();
}
process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
//# sourceMappingURL=server.js.map