
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Archive,
  ArrowLeft,
  AtSign,
  Check,
  ChevronDown,
  ChevronRight,
  File,
  FolderPlus,
  Hash,
  Lock,
  LogOut,
  Mail,
  MessageCircle,
  MessageSquare,
  Mic,
  MicOff,
  Image,
  Paperclip,
  Pause,
  Phone,
  PhoneCall,
  PhoneOff,
  Pencil,
  Palette,
  Play,
  Radio,
  Search,
  Send,
  Settings,
  SlidersHorizontal,
  Smile,
  User,
  UserRound,
  UserPlus,
  Users,
  Video,
  X
} from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import socket from "./lib/socket";

type Theme = "dark" | "light";
type ChatBubbleStyle = "modern" | "rounded" | "compact";
type ChatWallpaper = "gradient" | "plain" | "mesh";

type UserSettings = {
  theme: Theme;
  chatBubbleStyle: ChatBubbleStyle;
  chatWallpaper: ChatWallpaper;
  messageFontScale: number;
};

type UserData = {
  id: string;
  userId: number;
  username: string;
  displayName: string;
  uniqueId: string;
  email: string;
  bio: string;
  avatarUrl: string;
  createdAt: string;
  settings: UserSettings;
};

type PublicUser = {
  id: string;
  userId: number;
  username: string;
  displayName: string;
  uniqueId: string;
  bio: string;
  avatarUrl: string;
};

type RoomKind = "channel" | "group";

type ChannelData = {
  id: string;
  name: string;
  ownerId: string;
  kind?: RoomKind;
  usernameSlug?: string;
  description?: string;
  avatarUrl?: string;
  membersCount: number;
  createdAt?: string;
};

type MessageData = {
  id: string;
  conversationId?: string;
  senderId: string;
  receiverId?: string;
  channelId?: string;
  content: string;
  type: "text" | "file" | "voice";
  fileUrl?: string;
  fileName?: string;
  deliveredAt?: string | null;
  readAt?: string | null;
  attachments?: MediaAttachment[];
  timestamp: string;
};

type MediaAttachment = {
  id: string;
  ownerUserId: string;
  publicUrl: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  mediaKind: "image" | "video" | "audio" | "file";
  createdAt: string;
};

type DialogSummary = {
  id: string;
  type: "direct";
  peer: PublicUser;
  unreadCount: number;
  createdAt: string;
  updatedAt: string;
  lastMessage: MessageData | null;
};

type MediaPanelData = {
  tab: "media" | "files" | "links" | "audio";
  media: MediaAttachment[];
  files: MediaAttachment[];
  audio: MediaAttachment[];
  links: Array<{ messageId: string; url: string; createdAt: string; senderId: string }>;
  items: Array<MediaAttachment | { messageId: string; url: string; createdAt: string; senderId: string }>;
};

type ProfileData = PublicUser & {
  isFriend: boolean;
  createdAt: string;
  email?: string;
  conversationId?: string | null;
  mediaCount?: number;
  usernameHistory?: Array<{ oldUsername: string; newUsername: string; changedAt: string }>;
};

type ChannelProfileData = {
  id: string;
  kind: "channel" | "group";
  name: string;
  usernameSlug: string;
  publicPath?: string;
  description: string;
  avatarUrl: string;
  ownerId: string;
  membersCount: number;
  mediaCount: number;
};

type ChatTarget =
  | { kind: "user"; value: PublicUser }
  | { kind: "channel"; value: ChannelData }
  | { kind: "group"; value: ChannelData };

type ArchiveData = {
  users: PublicUser[];
  channels: ChannelData[];
  groups: ChannelData[];
};

type SidebarFolderBaseId = "all";
type SidebarFolderId = SidebarFolderBaseId | `custom:${string}`;

type SidebarFolderFilter = {
  includeDirect: boolean;
  includeGroups: boolean;
  includeChannels: boolean;
  unreadOnly: boolean;
  includeArchived: boolean;
};

type SidebarCustomFolder = {
  id: string;
  name: string;
  filter: SidebarFolderFilter;
};

type SidebarFolderTab = {
  id: SidebarFolderId;
  label: string;
  custom?: boolean;
};

type SidebarChatItem = {
  id: string;
  key: string;
  kind: "user" | "channel" | "group";
  title: string;
  subtitle: string;
  unreadCount: number;
  lastActivity: string;
  isArchived: boolean;
  avatarUrl?: string;
  contact?: PublicUser;
  room?: ChannelData;
};

type ToastKind = "error" | "success" | "info";

type ToastData = {
  id: string;
  kind: ToastKind;
  text: string;
};

type SettingsDraft = {
  displayName: string;
  username: string;
  email: string;
  bio: string;
  theme: Theme;
  chatBubbleStyle: ChatBubbleStyle;
  chatWallpaper: ChatWallpaper;
  messageFontScale: number;
};

type CallState = "idle" | "incoming" | "calling" | "ringing" | "connecting" | "connected";

type IncomingCallPayload = {
  callId?: string;
  senderId?: string;
  offer?: RTCSessionDescriptionInit;
  senderPreview?: PublicUser;
};

type CallAnsweredPayload = {
  callId?: string;
  senderId?: string;
  answer?: RTCSessionDescriptionInit;
};

type CallIcePayload = {
  callId?: string;
  senderId?: string;
  candidate?: RTCIceCandidateInit;
};

type CallControlSignal = {
  callId?: string;
  senderId?: string;
  reason?: string;
};

type MediaViewerData = {
  url: string;
  fileName: string;
  kind: "image" | "gif";
};

type AttachmentRenderKind = "image" | "gif" | "video" | "audio" | "file";

type AttachmentRenderItem = {
  id: string;
  url: string;
  fileName: string;
  mimeType: string;
  kind: AttachmentRenderKind;
};

const BRAND_NAME = "Nexli";
const BRAND_LOGO_SRC = "/assets/brand/nexli-logo.png";
const SIDEBAR_FOLDERS_STORAGE_KEY = "teleclone.sidebarFolders.v1";
const EMOJI_SETS: Array<{ title: string; values: string[] }> = [
  { title: "Smileys", values: ["😀", "😄", "😁", "😉", "😊", "😍", "😘", "🤩", "🥳", "😎", "🤔", "😴"] },
  { title: "People", values: ["👍", "👏", "🙏", "🤝", "💪", "👀", "🔥", "💯", "✨", "❤️", "💙", "💬"] },
  { title: "Fun", values: ["🎉", "🎧", "🎮", "🚀", "🌟", "🍿", "☕", "🐱", "🧠", "🛠️", "📌", "📷"] }
];

const DEFAULT_CUSTOM_FOLDER_FILTER: SidebarFolderFilter = {
  includeDirect: true,
  includeGroups: true,
  includeChannels: true,
  unreadOnly: false,
  includeArchived: false
};

function normalizeFolderFilter(raw: unknown): SidebarFolderFilter {
  if (!raw || typeof raw !== "object") {
    return DEFAULT_CUSTOM_FOLDER_FILTER;
  }

  const candidate = raw as Partial<SidebarFolderFilter>;
  return {
    includeDirect: candidate.includeDirect !== false,
    includeGroups: candidate.includeGroups !== false,
    includeChannels: candidate.includeChannels !== false,
    unreadOnly: candidate.unreadOnly === true,
    includeArchived: candidate.includeArchived === true
  };
}

function sanitizeFolderName(name: string): string {
  return String(name || "")
    .trim()
    .replace(/\s+/g, " ")
    .slice(0, 32);
}

function makeFolderId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function readStoredFolders(): SidebarCustomFolder[] {
  const raw = localStorage.getItem(SIDEBAR_FOLDERS_STORAGE_KEY);
  if (!raw) return [];

  try {
    const parsed = JSON.parse(raw) as unknown[];
    if (!Array.isArray(parsed)) return [];

    return parsed
      .map((entry) => {
        if (!entry || typeof entry !== "object") return null;
        const candidate = entry as Partial<SidebarCustomFolder>;
        const id = String(candidate.id || "").trim();
        const name = sanitizeFolderName(String(candidate.name || ""));
        if (!id || !name) return null;
        return {
          id,
          name,
          filter: normalizeFolderFilter(candidate.filter)
        };
      })
      .filter((entry): entry is SidebarCustomFolder => Boolean(entry));
  } catch {
    return [];
  }
}

function roomPublicPath(kind: RoomKind, slug: string): string {
  const safeSlug = String(slug || "").trim().toLowerCase();
  return kind === "group" ? `/g/${safeSlug}` : `/c/${safeSlug}`;
}

function roomPublicLink(kind: RoomKind, slug: string): string {
  if (!slug) return "";
  return `${window.location.origin}${roomPublicPath(kind, slug)}`;
}

function headersWithAuth(token: string | null): HeadersInit {
  return token ? { Authorization: `Bearer ${token}` } : {};
}

const DEFAULT_SETTINGS: UserSettings = {
  theme: "dark",
  chatBubbleStyle: "modern",
  chatWallpaper: "gradient",
  messageFontScale: 100
};

function normalizeMessageFontScale(value: unknown): number {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return 100;
  }
  return Math.min(120, Math.max(85, Math.round(numeric)));
}

function normalizeSettings(settings?: Partial<UserSettings> | null): UserSettings {
  return {
    theme: settings?.theme === "light" ? "light" : "dark",
    chatBubbleStyle:
      settings?.chatBubbleStyle === "rounded" || settings?.chatBubbleStyle === "compact"
        ? settings.chatBubbleStyle
        : "modern",
    chatWallpaper:
      settings?.chatWallpaper === "plain" || settings?.chatWallpaper === "mesh"
        ? settings.chatWallpaper
        : "gradient",
    messageFontScale: normalizeMessageFontScale(settings?.messageFontScale)
  };
}

function normalizePublicNumericUserId(value: unknown): number {
  const numeric = Number(value);
  if (!Number.isInteger(numeric) || numeric <= 0) {
    return 0;
  }
  return numeric;
}

function normalizeUser(raw: unknown): UserData | null {
  if (!raw || typeof raw !== "object") return null;

  const candidate = raw as Partial<UserData>;
  const id = String(candidate.id || "").trim();
  const username = String(candidate.username || "").trim();

  if (!id || !username) {
    return null;
  }

  const displayName = String(candidate.displayName || username).trim() || username;
  const uniqueId = String(candidate.uniqueId || "").trim().toUpperCase();
  const userId = normalizePublicNumericUserId(candidate.userId);

  return {
    id,
    userId,
    username,
    displayName,
    uniqueId,
    email: String(candidate.email || "").trim(),
    bio: String(candidate.bio || ""),
    avatarUrl: String(candidate.avatarUrl || "").trim(),
    createdAt: String(candidate.createdAt || new Date().toISOString()),
    settings: normalizeSettings(candidate.settings || DEFAULT_SETTINGS)
  };
}

function normalizePublicUser(raw: unknown): PublicUser | null {
  if (!raw || typeof raw !== "object") return null;

  const candidate = raw as Partial<PublicUser>;
  const id = String(candidate.id || "").trim();
  const username = String(candidate.username || "").trim();

  if (!id || !username) {
    return null;
  }

  const displayName = String(candidate.displayName || username).trim() || username;
  const uniqueId = String(candidate.uniqueId || "").trim().toUpperCase();
  const userId = normalizePublicNumericUserId(candidate.userId);

  return {
    id,
    userId,
    username,
    displayName,
    uniqueId,
    bio: String(candidate.bio || ""),
    avatarUrl: String(candidate.avatarUrl || "").trim()
  };
}

function normalizeMediaAttachment(raw: unknown): MediaAttachment | null {
  if (!raw || typeof raw !== "object") return null;
  const candidate = raw as Partial<MediaAttachment>;
  const id = String(candidate.id || "").trim();
  const publicUrl = String(candidate.publicUrl || "").trim();
  const fileName = String(candidate.fileName || "").trim();

  if (!id || !publicUrl) return null;

  const mediaKind =
    candidate.mediaKind === "image" ||
    candidate.mediaKind === "video" ||
    candidate.mediaKind === "audio" ||
    candidate.mediaKind === "file"
      ? candidate.mediaKind
      : "file";

  return {
    id,
    ownerUserId: String(candidate.ownerUserId || "").trim(),
    publicUrl,
    fileName: fileName || "file",
    mimeType: String(candidate.mimeType || "").trim(),
    sizeBytes: Number(candidate.sizeBytes || 0),
    mediaKind,
    createdAt: String(candidate.createdAt || new Date().toISOString())
  };
}

function normalizeMessage(raw: unknown): MessageData | null {
  if (!raw || typeof raw !== "object") return null;
  const candidate = raw as Partial<MessageData> & { messageType?: string; body?: string };
  const id = String(candidate.id || "").trim();
  const senderId = String(candidate.senderId || "").trim();
  if (!id || !senderId) return null;

  const typeRaw = String(candidate.type || candidate.messageType || "text");
  const type = typeRaw === "file" || typeRaw === "voice" ? typeRaw : "text";
  const content = String(candidate.content ?? candidate.body ?? "");
  const attachments = Array.isArray(candidate.attachments)
    ? candidate.attachments
        .map((entry) => normalizeMediaAttachment(entry))
        .filter((entry): entry is MediaAttachment => Boolean(entry))
    : [];

  return {
    id,
    conversationId: String(candidate.conversationId || "").trim() || undefined,
    senderId,
    receiverId: String(candidate.receiverId || "").trim() || undefined,
    channelId: String(candidate.channelId || "").trim() || undefined,
    content,
    type,
    fileUrl: String(candidate.fileUrl || "").trim() || undefined,
    fileName: String(candidate.fileName || "").trim() || undefined,
    deliveredAt: candidate.deliveredAt || null,
    readAt: candidate.readAt || null,
    attachments,
    timestamp: String(candidate.timestamp || candidate.createdAt || new Date().toISOString())
  };
}

function normalizeDialogSummary(raw: unknown): DialogSummary | null {
  if (!raw || typeof raw !== "object") return null;
  const candidate = raw as Partial<DialogSummary>;
  const id = String(candidate.id || "").trim();
  const peer = normalizePublicUser(candidate.peer);
  if (!id || !peer) return null;

  return {
    id,
    type: "direct",
    peer,
    unreadCount: Math.max(0, Number(candidate.unreadCount || 0)),
    createdAt: String(candidate.createdAt || new Date().toISOString()),
    updatedAt: String(candidate.updatedAt || new Date().toISOString()),
    lastMessage: candidate.lastMessage ? normalizeMessage(candidate.lastMessage) : null
  };
}

function normalizeMediaPanel(raw: unknown): MediaPanelData {
  if (!raw || typeof raw !== "object") {
    return { tab: "media", media: [], files: [], audio: [], links: [], items: [] };
  }

  const candidate = raw as Partial<MediaPanelData> & { links?: unknown[] };
  const media = Array.isArray(candidate.media)
    ? candidate.media.map((item) => normalizeMediaAttachment(item)).filter((item): item is MediaAttachment => Boolean(item))
    : [];
  const files = Array.isArray(candidate.files)
    ? candidate.files.map((item) => normalizeMediaAttachment(item)).filter((item): item is MediaAttachment => Boolean(item))
    : [];
  const audio = Array.isArray(candidate.audio)
    ? candidate.audio.map((item) => normalizeMediaAttachment(item)).filter((item): item is MediaAttachment => Boolean(item))
    : [];

  const links = Array.isArray(candidate.links)
    ? candidate.links
        .map((entry) => {
          if (!entry || typeof entry !== "object") return null;
          const row = entry as { messageId?: string; url?: string; createdAt?: string; senderId?: string };
          const messageId = String(row.messageId || "").trim();
          const url = String(row.url || "").trim();
          if (!messageId || !url) return null;
          return {
            messageId,
            url,
            createdAt: String(row.createdAt || new Date().toISOString()),
            senderId: String(row.senderId || "")
          };
        })
        .filter(
          (entry): entry is { messageId: string; url: string; createdAt: string; senderId: string } =>
            Boolean(entry)
        )
    : [];

  const tab =
    candidate.tab === "files" || candidate.tab === "audio" || candidate.tab === "links"
      ? candidate.tab
      : "media";
  const items = tab === "files" ? files : tab === "audio" ? audio : tab === "links" ? links : media;

  return { tab, media, files, audio, links, items };
}

function normalizeRoom(raw: unknown, fallbackKind: RoomKind): ChannelData | null {
  if (!raw || typeof raw !== "object") return null;

  const candidate = raw as Partial<ChannelData>;
  const id = String(candidate.id || "").trim();
  const name = String(candidate.name || "").trim();
  const ownerId = String(candidate.ownerId || "").trim();

  if (!id || !name || !ownerId) {
    return null;
  }

  const kind = candidate.kind === "group" || candidate.kind === "channel" ? candidate.kind : fallbackKind;
  return {
    id,
    name,
    ownerId,
    kind,
    usernameSlug: String((candidate as { usernameSlug?: string; username_slug?: string }).usernameSlug || (candidate as { username_slug?: string }).username_slug || "").trim(),
    description: String((candidate as { description?: string }).description || "").trim(),
    avatarUrl: String((candidate as { avatarUrl?: string; avatar_url?: string }).avatarUrl || (candidate as { avatar_url?: string }).avatar_url || "").trim(),
    membersCount: Number(candidate.membersCount || 0),
    createdAt: String(candidate.createdAt || "")
  };
}

function normalizeArchive(raw: unknown): ArchiveData {
  if (!raw || typeof raw !== "object") {
    return { users: [], channels: [], groups: [] };
  }

  const candidate = raw as Partial<ArchiveData>;
  const users = Array.isArray(candidate.users)
    ? candidate.users
        .map((entry) => normalizePublicUser(entry))
        .filter((entry): entry is PublicUser => Boolean(entry))
    : [];

  const channels = Array.isArray(candidate.channels)
    ? candidate.channels
        .map((entry) => normalizeRoom(entry, "channel"))
        .filter((entry): entry is ChannelData => Boolean(entry))
    : [];

  const groups = Array.isArray(candidate.groups)
    ? candidate.groups
        .map((entry) => normalizeRoom(entry, "group"))
        .filter((entry): entry is ChannelData => Boolean(entry))
    : [];

  return { users, channels, groups };
}

function createCallId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }

  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function readStoredUser(): UserData | null {
  const raw = localStorage.getItem("user");
  if (!raw) return null;

  try {
    return normalizeUser(JSON.parse(raw));
  } catch {
    return null;
  }
}

function bubbleClass(style: ChatBubbleStyle, own: boolean): string {
  if (style === "compact") {
    return own
      ? "chat-bubble-sent px-3 py-2 rounded-xl text-xs"
      : "chat-bubble-received px-3 py-2 rounded-xl text-xs";
  }

  if (style === "rounded") {
    return own
      ? "chat-bubble-sent rounded-3xl rounded-tr-md"
      : "chat-bubble-received rounded-3xl rounded-tl-md";
  }

  return own ? "chat-bubble-sent" : "chat-bubble-received";
}

function avatarFallback(name: string): string {
  const value = name.trim();
  return value ? value[0].toUpperCase() : "U";
}

function detectAttachmentKind(
  mimeType: string,
  fileName: string,
  fileUrl: string,
  fallbackType?: MessageData["type"]
): AttachmentRenderKind {
  const safeMime = String(mimeType || "").toLowerCase();
  const source = `${String(fileName || "")}${String(fileUrl || "")}`.toLowerCase();

  if (fallbackType === "voice") {
    return "audio";
  }

  if (safeMime === "image/gif" || /\.gif(\?|$)/.test(source)) {
    return "gif";
  }

  if (safeMime.startsWith("image/")) {
    return "image";
  }

  if (safeMime.startsWith("video/")) {
    return "video";
  }

  if (safeMime.startsWith("audio/")) {
    return "audio";
  }

  if (/\.(jpg|jpeg|png|webp|bmp|svg)(\?|$)/.test(source)) {
    return "image";
  }
  if (/\.(mp4|webm|mov|m4v)(\?|$)/.test(source)) {
    return "video";
  }
  if (/\.(mp3|wav|ogg|m4a|aac|flac|webm)(\?|$)/.test(source)) {
    return "audio";
  }

  return "file";
}

function getIceServers(): RTCIceServer[] {
  const raw = String(import.meta.env.VITE_ICE_SERVERS || "").trim();
  if (!raw) {
    return [{ urls: "stun:stun.l.google.com:19302" }];
  }

  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed) && parsed.every((entry) => typeof entry === "object" && entry !== null)) {
      return parsed as RTCIceServer[];
    }
  } catch {
    // Fallback to default STUN server when env value is invalid.
  }

  return [{ urls: "stun:stun.l.google.com:19302" }];
}

const ICE_SERVERS = getIceServers();
const CALL_RING_TIMEOUT_MS = Math.max(5_000, Number(import.meta.env.VITE_CALL_RING_TIMEOUT_MS || 30_000));

export default function App() {
  const [token, setToken] = useState<string | null>(localStorage.getItem("token"));
  const [user, setUser] = useState<UserData | null>(readStoredUser());

  const [contacts, setContacts] = useState<PublicUser[]>([]);
  const [dialogs, setDialogs] = useState<DialogSummary[]>([]);
  const [channels, setChannels] = useState<ChannelData[]>([]);
  const [groups, setGroups] = useState<ChannelData[]>([]);
  const [archived, setArchived] = useState<ArchiveData>({ users: [], channels: [], groups: [] });
  const [archiveMode, setArchiveMode] = useState(false);
  const [customFolders, setCustomFolders] = useState<SidebarCustomFolder[]>(() => readStoredFolders());
  const [activeFolderId, setActiveFolderId] = useState<SidebarFolderId>("all");
  const [composeMenuOpen, setComposeMenuOpen] = useState(false);
  const [folderModalOpen, setFolderModalOpen] = useState(false);
  const [folderEditingId, setFolderEditingId] = useState<string | null>(null);
  const [toasts, setToasts] = useState<ToastData[]>([]);
  const [messages, setMessages] = useState<MessageData[]>([]);
  const [activeTarget, setActiveTarget] = useState<ChatTarget | null>(null);

  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<PublicUser[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);

  const [isRegistering, setIsRegistering] = useState(false);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");

  const [settingsOpen, setSettingsOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [profileData, setProfileData] = useState<ProfileData | null>(null);
  const [profileMedia, setProfileMedia] = useState<MediaPanelData>({
    tab: "media",
    media: [],
    files: [],
    audio: [],
    links: [],
    items: []
  });
  const [profileMediaTab, setProfileMediaTab] = useState<"media" | "files" | "links" | "audio">("media");
  const [channelProfileOpen, setChannelProfileOpen] = useState(false);
  const [channelProfile, setChannelProfile] = useState<ChannelProfileData | null>(null);
  const [channelMedia, setChannelMedia] = useState<MediaPanelData>({
    tab: "media",
    media: [],
    files: [],
    audio: [],
    links: [],
    items: []
  });
  const [channelMediaTab, setChannelMediaTab] = useState<"media" | "files" | "links" | "audio">("media");
  const [activeConversationId, setActiveConversationId] = useState("");

  const [settingsDraft, setSettingsDraft] = useState<SettingsDraft | null>(null);
  const [settingsSaving, setSettingsSaving] = useState(false);

  const [callState, setCallState] = useState<CallState>("idle");
  const [callId, setCallId] = useState("");
  const [callPeer, setCallPeer] = useState<PublicUser | null>(null);
  const [callOffer, setCallOffer] = useState<RTCSessionDescriptionInit | null>(null);
  const [callStartedAt, setCallStartedAt] = useState<number | null>(null);
  const [callElapsedSec, setCallElapsedSec] = useState(0);
  const [callMuted, setCallMuted] = useState(false);
  const [callWidgetCollapsed, setCallWidgetCollapsed] = useState(false);
  const [mediaViewer, setMediaViewer] = useState<MediaViewerData | null>(null);

  const messageListRef = useRef<HTMLDivElement>(null);
  const remoteAudioRef = useRef<HTMLAudioElement>(null);
  const peerConnectionRef = useRef<RTCPeerConnection | null>(null);
  const localAudioStreamRef = useRef<MediaStream | null>(null);
  const queuedCandidatesRef = useRef<RTCIceCandidateInit[]>([]);
  const composeMenuRef = useRef<HTMLDivElement>(null);
  const searchRequestRef = useRef(0);
  const deepLinkHandledRef = useRef(false);
  const callStateRef = useRef<CallState>("idle");
  const callIdRef = useRef("");
  const callPeerIdRef = useRef("");

  const activeKey = useMemo(() => {
    if (!activeTarget) return "";
    return `${activeTarget.kind}:${activeTarget.value.id}`;
  }, [activeTarget]);

  const pushToast = (text: string, kind: ToastKind = "info", timeoutMs = 3200) => {
    const clean = String(text || "").trim();
    if (!clean) return;

    const toastId = makeFolderId();
    setToasts((prev) => [...prev, { id: toastId, kind, text: clean }]);
    window.setTimeout(() => {
      setToasts((prev) => prev.filter((entry) => entry.id !== toastId));
    }, timeoutMs);
  };

  const removeToast = (toastId: string) => {
    setToasts((prev) => prev.filter((entry) => entry.id !== toastId));
  };

  useEffect(() => {
    const list = messageListRef.current;
    if (!list) return;

    list.scrollTo({
      top: list.scrollHeight,
      behavior: "smooth"
    });
  }, [messages, activeKey]);

  useEffect(() => {
    const theme = user?.settings.theme || "dark";
    document.body.setAttribute("data-theme", theme);
  }, [user?.settings.theme]);

  useEffect(() => {
    if (!token) return;

    const query = searchQuery.trim();
    if (!query) {
      setSearchResults([]);
      setSearchLoading(false);
      return;
    }

    const timer = window.setTimeout(() => {
      requestUserSearch(query, { silent: true, updateState: true, limit: 12 }).catch(() => undefined);
    }, 220);

    return () => {
      window.clearTimeout(timer);
    };
  }, [searchQuery, token]);

  useEffect(() => {
    localStorage.setItem(SIDEBAR_FOLDERS_STORAGE_KEY, JSON.stringify(customFolders));
  }, [customFolders]);

  useEffect(() => {
    if (!composeMenuOpen) return;

    const handleOutsideClick = (event: MouseEvent) => {
      const target = event.target as Node | null;
      if (target && composeMenuRef.current && !composeMenuRef.current.contains(target)) {
        setComposeMenuOpen(false);
      }
    };

    document.addEventListener("mousedown", handleOutsideClick);
    return () => {
      document.removeEventListener("mousedown", handleOutsideClick);
    };
  }, [composeMenuOpen]);

  useEffect(() => {
    if (!activeFolderId.startsWith("custom:")) return;
    const folderId = activeFolderId.replace("custom:", "");
    if (!customFolders.some((entry) => entry.id === folderId)) {
      setActiveFolderId("all");
    }
  }, [activeFolderId, customFolders]);

  useEffect(() => {
    if (!user) return;
    const message = error.trim();
    if (!message) return;
    pushToast(message, "error");
    setError("");
  }, [error, user]);

  useEffect(() => {
    if (!user) return;
    const message = info.trim();
    if (!message) return;
    pushToast(message, "success");
    setInfo("");
  }, [info, user]);

  useEffect(() => {
    callStateRef.current = callState;
  }, [callState]);

  useEffect(() => {
    callIdRef.current = callId;
  }, [callId]);

  useEffect(() => {
    callPeerIdRef.current = callPeer?.id || "";
  }, [callPeer?.id]);

  useEffect(() => {
    if (!user || !token) {
      return;
    }

    const registerSocket = () => {
      socket.emit("register", { userId: user.id, token });
    };

    registerSocket();
    socket.on("connect", registerSocket);

    return () => {
      socket.off("connect", registerSocket);
    };
  }, [user?.id, token]);

  useEffect(() => {
    if (callState !== "connected" || !callStartedAt) {
      setCallElapsedSec(0);
      return;
    }

    const intervalId = window.setInterval(() => {
      setCallElapsedSec(Math.max(0, Math.floor((Date.now() - callStartedAt) / 1000)));
    }, 1000);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [callState, callStartedAt]);

  useEffect(() => {
    if (!user) return;

    const pendingStates: CallState[] = ["incoming", "calling", "ringing"];
    const stateNow = callStateRef.current;
    const activeCallId = callIdRef.current;
    const activePeerId = callPeerIdRef.current;

    if (!pendingStates.includes(stateNow) || !activeCallId || !activePeerId) {
      return;
    }

    const timerId = window.setTimeout(() => {
      if (
        !pendingStates.includes(callStateRef.current) ||
        callIdRef.current !== activeCallId ||
        callPeerIdRef.current !== activePeerId
      ) {
        return;
      }

      if (callStateRef.current === "incoming") {
        socket.emit("call:decline", {
          callId: activeCallId,
          senderId: user.id,
          receiverId: activePeerId,
          reason: "timeout"
        });
      } else {
        socket.emit("call:end", {
          callId: activeCallId,
          senderId: user.id,
          receiverId: activePeerId,
          reason: "timeout"
        });
      }

      stopMediaForCall();
      resetCallState("Время ожидания звонка истекло");
    }, CALL_RING_TIMEOUT_MS);

    return () => {
      window.clearTimeout(timerId);
    };
  }, [user, callState, callId, callPeer?.id]);

  useEffect(() => {
    if (callState !== "connecting") {
      return;
    }

    const activeCallId = callIdRef.current;
    if (!activeCallId) return;

    const timeoutId = window.setTimeout(() => {
      if (callStateRef.current !== "connecting" || callIdRef.current !== activeCallId) {
        return;
      }

      endCall(true, "Не удалось установить соединение", "connect-timeout");
    }, 20_000);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [callState]);

  const findKnownUser = (id: string, fallback?: PublicUser | null): PublicUser => {
    if (fallback && fallback.id === id) {
      return fallback;
    }

    const currentActive =
      activeTarget?.kind === "user" && activeTarget.value.id === id ? activeTarget.value : null;
    if (currentActive) {
      return currentActive;
    }

    const inContacts = contacts.find((entry) => entry.id === id);
    if (inContacts) {
      return inContacts;
    }

    const inSearch = searchResults.find((entry) => entry.id === id);
    if (inSearch) {
      return inSearch;
    }

    return {
      id,
      userId: 0,
      username: `user_${id.slice(0, 6)}`,
      displayName: `User ${id.slice(0, 6)}`,
      uniqueId: id.slice(0, 6).toUpperCase(),
      bio: "",
      avatarUrl: ""
    };
  };

  const stopMediaForCall = () => {
    if (peerConnectionRef.current) {
      peerConnectionRef.current.onicecandidate = null;
      peerConnectionRef.current.ontrack = null;
      peerConnectionRef.current.onconnectionstatechange = null;
      peerConnectionRef.current.close();
      peerConnectionRef.current = null;
    }

    if (localAudioStreamRef.current) {
      localAudioStreamRef.current.getTracks().forEach((track) => track.stop());
      localAudioStreamRef.current = null;
    }

    if (remoteAudioRef.current) {
      remoteAudioRef.current.srcObject = null;
    }

    queuedCandidatesRef.current = [];
  };

  const resetCallState = (message?: string) => {
    setCallState("idle");
    setCallId("");
    setCallPeer(null);
    setCallOffer(null);
    setCallStartedAt(null);
    setCallMuted(false);
    setCallElapsedSec(0);
    setCallWidgetCollapsed(false);

    callStateRef.current = "idle";
    callIdRef.current = "";
    callPeerIdRef.current = "";

    if (message) {
      setInfo(message);
    }
  };

  const endCall = (notifyPeer: boolean, message?: string, reason?: string) => {
    const activeCallId = callIdRef.current;
    const activePeerId = callPeerIdRef.current;

    if (notifyPeer && user && activeCallId && activePeerId) {
      const payload = {
        callId: activeCallId,
        senderId: user.id,
        receiverId: activePeerId,
        reason: reason || "ended"
      };
      socket.emit("call:end", payload);
    }

    stopMediaForCall();
    resetCallState(message);
  };

  const flushQueuedCandidates = async () => {
    if (!peerConnectionRef.current || !peerConnectionRef.current.remoteDescription) {
      return;
    }

    while (queuedCandidatesRef.current.length > 0) {
      const candidate = queuedCandidatesRef.current.shift();
      if (!candidate) {
        continue;
      }

      try {
        await peerConnectionRef.current.addIceCandidate(new RTCIceCandidate(candidate));
      } catch {
        // Skip invalid stale candidate chunks after quick reconnects.
      }
    }
  };

  const createPeerConnection = (peerId: string, activeCallId: string): RTCPeerConnection => {
    const connection = new RTCPeerConnection({
      iceServers: ICE_SERVERS
    });

    connection.onicecandidate = (event) => {
      if (!event.candidate || !user) {
        return;
      }

      const payload = {
        callId: activeCallId,
        senderId: user.id,
        receiverId: peerId,
        candidate: event.candidate.toJSON()
      };
      socket.emit("webrtc:ice-candidate", payload);
    };

    connection.ontrack = (event) => {
      const [stream] = event.streams;
      if (remoteAudioRef.current) {
        remoteAudioRef.current.srcObject = stream;
      }
    };

    connection.onconnectionstatechange = () => {
      if (connection.connectionState === "connected") {
        callStateRef.current = "connected";
        setCallState("connected");
        setCallStartedAt((prev) => prev || Date.now());
        setInfo("Голосовой звонок подключен");
        return;
      }

      if (connection.connectionState === "failed" || connection.connectionState === "disconnected") {
        if (callStateRef.current !== "idle") {
          endCall(true, "Соединение потеряно");
        }
        return;
      }

      if (connection.connectionState === "closed" && callStateRef.current !== "idle") {
        stopMediaForCall();
        resetCallState("Звонок завершен");
      }
    };

    peerConnectionRef.current = connection;
    return connection;
  };

  const startVoiceCall = async (targetUser: PublicUser) => {
    if (!user) return;

    if (targetUser.id === user.id) {
      setInfo("Нельзя позвонить самому себе");
      return;
    }

    if (callStateRef.current !== "idle") {
      if (!callIdRef.current || !callPeerIdRef.current) {
        stopMediaForCall();
        resetCallState();
      } else {
        setInfo("Сначала завершите текущий звонок");
        return;
      }
    }

    try {
      const nextCallId = createCallId();
      setCallId(nextCallId);
      setCallPeer(targetUser);
      setCallOffer(null);
      setCallWidgetCollapsed(false);
      callStateRef.current = "calling";
      setCallState("calling");
      setCallStartedAt(null);
      callIdRef.current = nextCallId;
      callPeerIdRef.current = targetUser.id;

      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error("media-not-supported");
      }

      const localStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      localAudioStreamRef.current = localStream;
      setCallMuted(false);
      const connection = createPeerConnection(targetUser.id, nextCallId);
      localStream.getTracks().forEach((track) => connection.addTrack(track, localStream));

      const offer = await connection.createOffer({ offerToReceiveAudio: true });
      await connection.setLocalDescription(offer);

      const payload = {
        callId: nextCallId,
        senderId: user.id,
        receiverId: targetUser.id,
        offer,
        senderPreview: {
          id: user.id,
          userId: user.userId,
          username: user.username,
          displayName: user.displayName,
          uniqueId: user.uniqueId,
          bio: user.bio,
          avatarUrl: user.avatarUrl
        }
      };

      socket.emit("call:invite", payload);

      setInfo(`Звоним ${targetUser.displayName}...`);
    } catch (error) {
      stopMediaForCall();
      resetCallState();
      const message = error instanceof Error ? error.message : "";
      if (message === "media-not-supported") {
        setError("Браузер не поддерживает микрофон для звонков.");
        return;
      }
      if (!window.isSecureContext) {
        setError("Для звонков нужен HTTPS (или localhost). Откройте приложение по защищенному адресу.");
        return;
      }
      setError("Нет доступа к микрофону. Разрешите доступ в браузере.");
    }
  };

  const acceptIncomingCall = async () => {
    if (!user || !callPeer || !callOffer || !callId) {
      return;
    }

    if (callPeer.id === user.id) {
      socket.emit("call:decline", {
        callId,
        senderId: user.id,
        receiverId: callPeer.id,
        reason: "self-call"
      });
      stopMediaForCall();
      resetCallState("Нельзя позвонить самому себе");
      return;
    }

    try {
      const localStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      localAudioStreamRef.current = localStream;
      setCallMuted(false);

      const connection = createPeerConnection(callPeer.id, callId);
      localStream.getTracks().forEach((track) => connection.addTrack(track, localStream));

      await connection.setRemoteDescription(new RTCSessionDescription(callOffer));
      await flushQueuedCandidates();

      const answer = await connection.createAnswer();
      await connection.setLocalDescription(answer);

      const payload = {
        callId,
        senderId: user.id,
        receiverId: callPeer.id,
        answer
      };

      socket.emit("call:accept", payload);

      setCallOffer(null);
      callStateRef.current = "connecting";
      setCallState("connecting");
      setInfo(`Подключаемся к ${callPeer.displayName}...`);
    } catch {
      stopMediaForCall();
      resetCallState();
      setError("Не удалось принять звонок. Проверьте доступ к микрофону.");
    }
  };

  const rejectIncomingCall = () => {
    if (!user || !callId || !callPeer) {
      resetCallState();
      return;
    }

    const payload = {
      callId,
      senderId: user.id,
      receiverId: callPeer.id,
      reason: "declined"
    };

    socket.emit("call:decline", payload);

    stopMediaForCall();
    resetCallState("Звонок отклонен");
  };

  const toggleMute = () => {
    if (!localAudioStreamRef.current) return;

    const nextMuted = !callMuted;
    localAudioStreamRef.current.getAudioTracks().forEach((track) => {
      track.enabled = !nextMuted;
    });

    setCallMuted(nextMuted);
  };

  const persistUser = (nextUser: UserData, nextToken?: string) => {
    const normalized = normalizeUser(nextUser);
    if (!normalized) return;

    setUser(normalized);
    localStorage.setItem("user", JSON.stringify(normalized));

    if (nextToken) {
      setToken(nextToken);
      localStorage.setItem("token", nextToken);
    }
  };

  const loadMe = async (sessionToken: string) => {
    const response = await fetch("/api/me", { headers: headersWithAuth(sessionToken) });
    if (!response.ok) {
      return;
    }

    const me = normalizeUser(await response.json());
    if (!me) return;

    persistUser(me);
    socket.emit("register", { userId: me.id, token: sessionToken });
  };

  const loadFriends = async (sessionToken: string) => {
    const response = await fetch("/api/friends", { headers: headersWithAuth(sessionToken) });
    if (!response.ok) return;

    const result = (await response.json()) as unknown[];
    const users = result
      .map((item) => normalizePublicUser(item))
      .filter((item): item is PublicUser => Boolean(item));
    setContacts(users);
  };

  const loadDialogs = async (sessionToken: string) => {
    const response = await fetch("/api/dialogs", { headers: headersWithAuth(sessionToken) });
    if (!response.ok) return;

    const result = (await response.json()) as unknown[];
    const nextDialogs = Array.isArray(result)
      ? result
          .map((item) => normalizeDialogSummary(item))
          .filter((item): item is DialogSummary => Boolean(item))
      : [];
    setDialogs(nextDialogs);

    setContacts((prev) => {
      const map = new Map<string, PublicUser>();
      for (const userEntry of prev) {
        map.set(userEntry.id, userEntry);
      }
      for (const dialog of nextDialogs) {
        map.set(dialog.peer.id, dialog.peer);
      }
      return Array.from(map.values());
    });
  };

  const openOrCreateDialog = async (candidate: PublicUser): Promise<string | null> => {
    if (!token) return null;

    const existing = dialogs.find((entry) => entry.peer.id === candidate.id);
    if (existing) {
      setActiveConversationId(existing.id);
      setActiveTarget({ kind: "user", value: existing.peer });
      socket.emit("join_dialog", { conversationId: existing.id, userId: user?.id });
      return existing.id;
    }

    const response = await fetch("/api/dialogs/open", {
      method: "POST",
      headers: {
        ...headersWithAuth(token),
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ userId: candidate.id })
    });

    const result = await response.json();
    if (!response.ok) {
      setError(result.error || "Не удалось открыть диалог");
      return null;
    }

    const dialog = normalizeDialogSummary(result);
    if (!dialog) {
      setError("Некорректный ответ сервера");
      return null;
    }

    setDialogs((prev) => [dialog, ...prev.filter((entry) => entry.id !== dialog.id)]);
    setContacts((prev) => (prev.some((entry) => entry.id === dialog.peer.id) ? prev : [dialog.peer, ...prev]));
    setActiveConversationId(dialog.id);
    setActiveTarget({ kind: "user", value: dialog.peer });
    socket.emit("join_dialog", { conversationId: dialog.id, userId: user?.id });
    return dialog.id;
  };

  const loadChannels = async (sessionToken: string) => {
    const response = await fetch("/api/channels", { headers: headersWithAuth(sessionToken) });
    if (!response.ok) return;

    const result = (await response.json()) as unknown[];
    const rooms = result
      .map((item) => normalizeRoom(item, "channel"))
      .filter((item): item is ChannelData => Boolean(item));
    setChannels(rooms);
  };

  const loadGroups = async (sessionToken: string) => {
    const response = await fetch("/api/groups", { headers: headersWithAuth(sessionToken) });
    if (!response.ok) return;

    const result = (await response.json()) as unknown[];
    const rooms = result
      .map((item) => normalizeRoom(item, "group"))
      .filter((item): item is ChannelData => Boolean(item));
    setGroups(rooms);
  };

  const loadArchive = async (sessionToken: string) => {
    const response = await fetch("/api/archive", { headers: headersWithAuth(sessionToken) });
    if (!response.ok) return;

    const result = await response.json();
    setArchived(normalizeArchive(result));
  };

  const openRoomBySlug = async (kind: RoomKind, slug: string) => {
    if (!token || !user) return;

    const lookupResponse = await fetch(`/api/channels/slug/${encodeURIComponent(slug)}`, {
      headers: headersWithAuth(token)
    });
    const lookupResult = await lookupResponse.json();
    if (!lookupResponse.ok) {
      setError(lookupResult.error || "Ссылка недействительна");
      window.history.replaceState({}, "", "/");
      return;
    }

    let room = normalizeRoom(lookupResult.room, kind);
    if (!room) {
      setError("Не удалось открыть ссылку");
      window.history.replaceState({}, "", "/");
      return;
    }

    let isMember = Boolean(lookupResult.isMember);
    if (!isMember) {
      const joinResponse = await fetch(`/api/channels/slug/${encodeURIComponent(slug)}/join`, {
        method: "POST",
        headers: headersWithAuth(token)
      });
      const joinResult = await joinResponse.json();
      if (!joinResponse.ok) {
        setError(joinResult.error || "Нет доступа к каналу");
        window.history.replaceState({}, "", "/");
        return;
      }

      const joinedRoom = normalizeRoom(joinResult.room, kind);
      if (joinedRoom) {
        room = joinedRoom;
      }
      isMember = true;
    }

    if (!isMember) {
      window.history.replaceState({}, "", "/");
      return;
    }

    const resolvedKind: RoomKind = room.kind === "group" ? "group" : "channel";

    if (resolvedKind === "group") {
      setGroups((prev) => [room, ...prev.filter((entry) => entry.id !== room.id)]);
      setActiveTarget({ kind: "group", value: { ...room, kind: "group" } });
    } else {
      setChannels((prev) => [room, ...prev.filter((entry) => entry.id !== room.id)]);
      setActiveTarget({ kind: "channel", value: { ...room, kind: "channel" } });
    }

    setActiveConversationId("");
    socket.emit("join_channel", { channelId: room.id, userId: user.id });
    window.history.replaceState({}, "", "/");
  };

  useEffect(() => {
    if (!token) return;

    loadMe(token).catch(() => undefined);
    loadDialogs(token).catch(() => undefined);
    loadFriends(token).catch(() => undefined);
    loadChannels(token).catch(() => undefined);
    loadGroups(token).catch(() => undefined);
    loadArchive(token).catch(() => undefined);
  }, [token]);

  useEffect(() => {
    if (!token || !user || deepLinkHandledRef.current) return;

    const match = window.location.pathname.match(/^\/(c|g)\/([a-z0-9_-]{3,48})\/?$/i);
    if (!match) return;

    deepLinkHandledRef.current = true;
    const kind: RoomKind = match[1].toLowerCase() === "g" ? "group" : "channel";
    const slug = String(match[2] || "").toLowerCase();

    openRoomBySlug(kind, slug).catch(() => {
      setError("Не удалось открыть ссылку");
      window.history.replaceState({}, "", "/");
    });
  }, [token, user]);

  useEffect(() => {
    return () => {
      stopMediaForCall();
    };
  }, []);

  useEffect(() => {
    if (!user) return;

    const upsertMessage = (incoming: MessageData) => {
      setMessages((prev) => {
        if (prev.some((entry) => entry.id === incoming.id)) {
          return prev.map((entry) => (entry.id === incoming.id ? { ...entry, ...incoming } : entry));
        }
        return [...prev, incoming];
      });
    };

    const onDialogMessage = (raw: unknown) => {
      const message = normalizeMessage(raw);
      if (!message) return;

      const peerId =
        message.senderId === user.id ? String(message.receiverId || "") : String(message.senderId || "");
      const dialogId = message.conversationId || dialogs.find((entry) => entry.peer.id === peerId)?.id || "";

      if (peerId) {
        setContacts((prev) => {
          if (prev.some((entry) => entry.id === peerId)) {
            return prev;
          }
          return [
            ...prev,
            {
              id: peerId,
              userId: 0,
              username: `user_${peerId.slice(0, 6)}`,
              displayName: `User ${peerId.slice(0, 6)}`,
              uniqueId: peerId.slice(0, 6).toUpperCase(),
              bio: "",
              avatarUrl: ""
            }
          ];
        });
      }

      if (dialogId && peerId) {
        setDialogs((prev) => {
          const existing = prev.find((entry) => entry.id === dialogId);
          if (!existing) {
            const unreadCount =
              message.senderId !== user.id &&
              !(activeTarget?.kind === "user" && activeTarget.value.id === peerId && activeConversationId === dialogId)
                ? 1
                : 0;
            const fallbackPeer = findKnownUser(peerId || message.senderId);
            return [
              {
                id: dialogId,
                type: "direct",
                peer: fallbackPeer,
                unreadCount,
                createdAt: message.timestamp,
                updatedAt: message.timestamp,
                lastMessage: message
              },
              ...prev
            ];
          }

          const unreadIncrement =
            message.senderId !== user.id &&
            !(activeTarget?.kind === "user" && activeTarget.value.id === peerId && activeConversationId === dialogId)
              ? 1
              : 0;

          const updatedDialog: DialogSummary = {
            ...existing,
            unreadCount: unreadIncrement > 0 ? existing.unreadCount + unreadIncrement : existing.unreadCount,
            updatedAt: message.timestamp,
            lastMessage: message
          };
          return [updatedDialog, ...prev.filter((entry) => entry.id !== dialogId)];
        });
      }

      if (activeTarget?.kind !== "user") {
        return;
      }

      const activePeerId = activeTarget.value.id;
      const matchByConversation =
        Boolean(activeConversationId) &&
        Boolean(message.conversationId) &&
        activeConversationId === message.conversationId;
      const matchByParticipants =
        (message.senderId === user.id && message.receiverId === activePeerId) ||
        (message.senderId === activePeerId && message.receiverId === user.id);

      if (matchByConversation || matchByParticipants) {
        upsertMessage(message);
      }
    };

    const onDialogDelivered = (payload: { messageId?: string; deliveredAt?: string | null; conversationId?: string }) => {
      const messageId = String(payload.messageId || "");
      if (!messageId) return;
      setMessages((prev) =>
        prev.map((entry) =>
          entry.id === messageId ? { ...entry, deliveredAt: payload.deliveredAt || new Date().toISOString() } : entry
        )
      );
    };

    const onDialogRead = (payload: { conversationId?: string; readerUserId?: string; readAt?: string }) => {
      const conversationId = String(payload.conversationId || "");
      const readerUserId = String(payload.readerUserId || "");
      const readAt = payload.readAt || new Date().toISOString();

      if (readerUserId !== user.id && conversationId && activeConversationId === conversationId) {
        setMessages((prev) =>
          prev.map((entry) =>
            entry.senderId === user.id && entry.conversationId === conversationId ? { ...entry, readAt } : entry
          )
        );
      }

      if (readerUserId === user.id && conversationId) {
        setDialogs((prev) =>
          prev.map((entry) => (entry.id === conversationId ? { ...entry, unreadCount: 0 } : entry))
        );
      }
    };

    const onReceiveChannel = (raw: unknown) => {
      const message = normalizeMessage(raw);
      if (!message) return;
      if (
        activeTarget &&
        activeTarget.kind !== "user" &&
        message.channelId === activeTarget.value.id
      ) {
        upsertMessage(message);
      }
    };

    socket.on("receive_message", onDialogMessage);
    socket.on("message_sent", onDialogMessage);
    socket.on("dialog:message", onDialogMessage);
    socket.on("dialog:message-delivered", onDialogDelivered);
    socket.on("dialog:messages-read", onDialogRead);
    socket.on("receive_channel_message", onReceiveChannel);
    socket.on("channel:message", onReceiveChannel);

    return () => {
      socket.off("receive_message", onDialogMessage);
      socket.off("message_sent", onDialogMessage);
      socket.off("dialog:message", onDialogMessage);
      socket.off("dialog:message-delivered", onDialogDelivered);
      socket.off("dialog:messages-read", onDialogRead);
      socket.off("receive_channel_message", onReceiveChannel);
      socket.off("channel:message", onReceiveChannel);
    };
  }, [user, activeKey, dialogs, activeConversationId]);

  useEffect(() => {
    if (!user) return;

    const onIncomingCall = (payload: IncomingCallPayload) => {
      const nextCallId = String(payload.callId || "");
      const senderId = String(payload.senderId || "");
      const offer = payload.offer;

      if (!nextCallId || !senderId || !offer) {
        return;
      }

      if (senderId === user.id) {
        socket.emit("call:decline", {
          callId: nextCallId,
          senderId: user.id,
          receiverId: senderId,
          reason: "self-call"
        });
        return;
      }

      if (callStateRef.current === "incoming" && callIdRef.current === nextCallId) {
        return;
      }

      if (callStateRef.current !== "idle") {
        socket.emit("call:busy", {
          callId: nextCallId,
          senderId: user.id,
          receiverId: senderId
        });
        return;
      }

      const preview = normalizePublicUser(payload.senderPreview || null);
      const peer = findKnownUser(senderId, preview);

      setCallId(nextCallId);
      setCallPeer(peer);
      setCallOffer(offer);
      setCallWidgetCollapsed(false);
      callIdRef.current = nextCallId;
      callPeerIdRef.current = senderId;
      callStateRef.current = "incoming";
      setCallState("incoming");
      setInfo(`Входящий звонок от ${peer.displayName}`);
    };

    const onCallRinging = (payload: { callId?: string; receiverId?: string }) => {
      if (String(payload.callId || "") !== callIdRef.current) {
        return;
      }

      if (callStateRef.current === "calling" || callStateRef.current === "ringing") {
        callStateRef.current = "ringing";
        setCallState("ringing");
        setInfo("Идут гудки...");
      }
    };

    const onCallAnswered = async (payload: CallAnsweredPayload) => {
      const activeCallId = callIdRef.current;
      const incomingCallId = String(payload.callId || "");
      const answer = payload.answer;

      if (!activeCallId || incomingCallId !== activeCallId || !answer || !peerConnectionRef.current) {
        return;
      }

      if (peerConnectionRef.current.remoteDescription) {
        return;
      }

      try {
        await peerConnectionRef.current.setRemoteDescription(new RTCSessionDescription(answer));
        await flushQueuedCandidates();
        callStateRef.current = "connecting";
        setCallState("connecting");
        setInfo("Подключение...");
      } catch {
        stopMediaForCall();
        resetCallState("Ошибка звонка");
      }
    };

    const onCallIceCandidate = async (payload: CallIcePayload) => {
      const activeCallId = callIdRef.current;
      const incomingCallId = String(payload.callId || "");
      const candidate = payload.candidate;

      if (!activeCallId || incomingCallId !== activeCallId || !candidate) {
        return;
      }

      const connection = peerConnectionRef.current;
      if (!connection || !connection.remoteDescription) {
        queuedCandidatesRef.current.push(candidate);
        return;
      }

      try {
        await connection.addIceCandidate(new RTCIceCandidate(candidate));
      } catch {
        // Ignore transient candidate race conditions.
      }
    };

    const onCallRejected = (payload: CallControlSignal) => {
      if (String(payload.callId || "") !== callIdRef.current) {
        return;
      }

      stopMediaForCall();
      const reason = String(payload.reason || "").trim().toLowerCase();
      if (reason === "self-call") {
        resetCallState("Нельзя позвонить самому себе");
        return;
      }
      if (reason === "not-registered") {
        if (user && token) {
          socket.emit("register", { userId: user.id, token });
        }
        resetCallState("Переподключаем звонки... попробуйте еще раз");
        return;
      }
      if (reason === "timeout") {
        resetCallState("Время ожидания звонка истекло");
        return;
      }
      resetCallState("Звонок отклонен");
    };

    const onCallBusy = (payload: CallControlSignal) => {
      if (String(payload.callId || "") !== callIdRef.current) {
        return;
      }

      stopMediaForCall();
      const reason = String(payload.reason || "").trim().toLowerCase();
      if (reason === "self-call") {
        resetCallState("Нельзя позвонить самому себе");
        return;
      }
      resetCallState("Пользователь уже в другом звонке");
    };

    const onCallMissed = (payload: CallControlSignal) => {
      if (String(payload.callId || "") !== callIdRef.current) {
        return;
      }

      stopMediaForCall();
      const reason = String(payload.reason || "").trim().toLowerCase();
      if (reason === "timeout") {
        resetCallState("Время ожидания звонка истекло");
        return;
      }
      resetCallState("Звонок пропущен");
    };

    const onCallUnavailable = (payload: CallControlSignal) => {
      if (String(payload.callId || "") !== callIdRef.current) {
        return;
      }

      stopMediaForCall();
      resetCallState("Пользователь не в сети");
    };

    const onCallEnded = (payload: CallControlSignal) => {
      if (String(payload.callId || "") !== callIdRef.current) {
        return;
      }

      stopMediaForCall();
      const reason = String(payload.reason || "").trim().toLowerCase();
      if (reason === "timeout") {
        resetCallState("Время ожидания звонка истекло");
        return;
      }
      if (reason.includes("disconnect")) {
        resetCallState("Собеседник отключился");
        return;
      }
      resetCallState("Звонок завершен");
    };

    socket.on("call:incoming", onIncomingCall);
    socket.on("call:ringing", onCallRinging);
    socket.on("call:accept", onCallAnswered);
    socket.on("webrtc:answer", onCallAnswered);
    socket.on("webrtc:ice-candidate", onCallIceCandidate);
    socket.on("call:decline", onCallRejected);
    socket.on("call:busy", onCallBusy);
    socket.on("call:missed", onCallMissed);
    socket.on("call_unavailable", onCallUnavailable);
    socket.on("call:end", onCallEnded);

    return () => {
      socket.off("call:incoming", onIncomingCall);
      socket.off("call:ringing", onCallRinging);
      socket.off("call:accept", onCallAnswered);
      socket.off("webrtc:answer", onCallAnswered);
      socket.off("webrtc:ice-candidate", onCallIceCandidate);
      socket.off("call:decline", onCallRejected);
      socket.off("call:busy", onCallBusy);
      socket.off("call:missed", onCallMissed);
      socket.off("call_unavailable", onCallUnavailable);
      socket.off("call:end", onCallEnded);
    };
  }, [user, token, contacts, searchResults, activeTarget]);

  useEffect(() => {
    const loadHistory = async () => {
      if (!activeTarget || !token || !user) {
        setMessages([]);
        return;
      }

      if (activeTarget.kind === "user") {
        const dialogId =
          activeConversationId || dialogs.find((dialog) => dialog.peer.id === activeTarget.value.id)?.id;
        if (!dialogId) {
          setMessages([]);
          return;
        }

        socket.emit("join_dialog", { conversationId: dialogId, userId: user.id });
        const response = await fetch(`/api/dialogs/${dialogId}/messages?limit=200`, {
          headers: headersWithAuth(token)
        });

        if (!response.ok) {
          setMessages([]);
          return;
        }

        const rawHistory = (await response.json()) as unknown[];
        const history = Array.isArray(rawHistory)
          ? rawHistory
              .map((item) => normalizeMessage(item))
              .filter((item): item is MessageData => Boolean(item))
          : [];
        setMessages(history);

        await fetch(`/api/dialogs/${dialogId}/read`, {
          method: "POST",
          headers: {
            ...headersWithAuth(token),
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            upToMessageId: history.length > 0 ? history[history.length - 1].id : undefined
          })
        }).catch(() => undefined);

        setDialogs((prev) =>
          prev.map((dialog) =>
            dialog.id === dialogId ? { ...dialog, unreadCount: 0, updatedAt: new Date().toISOString() } : dialog
          )
        );
        setActiveConversationId(dialogId);
        return;
      }

      socket.emit("join_channel", { channelId: activeTarget.value.id, userId: user.id });
      const endpoint =
        activeTarget.kind === "group"
          ? `/api/groups/${activeTarget.value.id}/messages`
          : `/api/channels/${activeTarget.value.id}/messages`;

      const response = await fetch(endpoint, {
        headers: headersWithAuth(token)
      });

      if (!response.ok) {
        setMessages([]);
        return;
      }

      const rawHistory = (await response.json()) as unknown[];
      const history = Array.isArray(rawHistory)
        ? rawHistory
            .map((item) => normalizeMessage(item))
            .filter((item): item is MessageData => Boolean(item))
        : [];
      setMessages(history);
    };

    loadHistory().catch(() => {
      setMessages([]);
    });
  }, [activeKey, token, user, activeConversationId]);

  const handleLogin = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);

    const payload = {
      username: String(formData.get("username") || ""),
      password: String(formData.get("password") || "")
    };

    try {
      const response = await fetch("/api/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });

      const result = await response.json();
      if (!response.ok) {
        setError(result.error || "Ошибка входа");
        return;
      }

      const nextUser = normalizeUser(result.user);
      if (!nextUser) {
        setError("Некорректный ответ сервера");
        return;
      }

      setError("");
      setInfo("");
      persistUser(nextUser, result.token);
      socket.emit("register", { userId: nextUser.id, token: result.token });
    } catch {
      setError("Ошибка соединения");
    }
  };

  const handleRegister = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);

    const payload = {
      username: String(formData.get("username") || ""),
      password: String(formData.get("password") || ""),
      displayName: String(formData.get("displayName") || ""),
      email: String(formData.get("email") || ""),
      bio: String(formData.get("bio") || "")
    };

    try {
      const response = await fetch("/api/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });

      const result = await response.json();
      if (!response.ok) {
        setError(result.error || "Ошибка регистрации");
        return;
      }

      const nextUser = normalizeUser(result.user);
      if (!nextUser) {
        setError("Некорректный ответ сервера");
        return;
      }

      setError("");
      setInfo("Регистрация успешна");
      setIsRegistering(false);
      persistUser(nextUser, result.token);
      socket.emit("register", { userId: nextUser.id, token: result.token });
    } catch {
      setError("Ошибка соединения");
    }
  };

  const requestUserSearch = async (
    rawQuery: string,
    options?: { silent?: boolean; updateState?: boolean; limit?: number }
  ): Promise<PublicUser[]> => {
    if (!token) return [];

    const query = rawQuery.trim();
    if (!query) {
      if (options?.updateState !== false) {
        setSearchResults([]);
        setSearchLoading(false);
      }
      return [];
    }

    const requestId = searchRequestRef.current + 1;
    searchRequestRef.current = requestId;
    const shouldUpdateState = options?.updateState !== false;
    const limit = Math.min(30, Math.max(1, Number(options?.limit || 12)));

    if (shouldUpdateState) {
      setSearchLoading(true);
    }

    try {
      const response = await fetch(
        `/api/users/search?query=${encodeURIComponent(query)}&limit=${limit}`,
        {
          headers: headersWithAuth(token)
        }
      );

      const result = await response.json();
      if (!response.ok) {
        if (!options?.silent) {
          setError(result.error || "Ошибка поиска");
        }
        return [];
      }

      const users = Array.isArray(result)
        ? result
            .map((item) => normalizePublicUser(item))
            .filter((item): item is PublicUser => Boolean(item))
        : [];

      if (shouldUpdateState && searchRequestRef.current === requestId) {
        setSearchResults(users);
        setError("");
      }

      return users;
    } catch {
      if (!options?.silent) {
        setError("Ошибка поиска");
      }
      return [];
    } finally {
      if (shouldUpdateState && searchRequestRef.current === requestId) {
        setSearchLoading(false);
      }
    }
  };

  const handleSearch = async () => {
    await requestUserSearch(searchQuery, { silent: false, updateState: true, limit: 20 });
  };

  const handleComposeNewMessage = async () => {
    if (!token) return;

    const query = window.prompt("Введите username или ID пользователя");
    if (!query || !query.trim()) return;

    try {
      const candidates = await requestUserSearch(query.trim(), {
        silent: false,
        updateState: false,
        limit: 10
      });

      if (candidates.length === 0) {
        setInfo("Пользователь не найден");
        return;
      }

      await openOrCreateDialog(candidates[0]);
      setInfo("");
      setError("");
      setSearchQuery("");
      setSearchResults([]);
    } catch {
      setError("Ошибка поиска пользователя");
    }
  };

  const addFriend = async (candidate: PublicUser) => {
    if (!token) return;

    const response = await fetch(`/api/friends/${candidate.id}`, {
      method: "POST",
      headers: headersWithAuth(token)
    });

    const result = await response.json();
    if (!response.ok) {
      setError(result.error || "Не удалось добавить друга");
      return;
    }

    const friend = result as PublicUser;
    setContacts((prev) => {
      if (prev.some((item) => item.id === friend.id)) return prev;
      return [friend, ...prev];
    });
    await openOrCreateDialog(friend);
    setSearchResults([]);
    setSearchQuery("");
    setError("");
  };

  const callByContact = async (candidate: PublicUser) => {
    if (user && candidate.id === user.id) {
      setInfo("Нельзя позвонить самому себе");
      return;
    }

    setContacts((prev) => (prev.some((entry) => entry.id === candidate.id) ? prev : [candidate, ...prev]));
    const dialogPromise = openOrCreateDialog(candidate).catch(() => null);
    await startVoiceCall(candidate);
    await dialogPromise;
  };

  const handleCreateChannel = async () => {
    if (!token) return;

    const name = window.prompt("Название канала");
    if (!name || !name.trim()) return;

    const response = await fetch("/api/channels", {
      method: "POST",
      headers: {
        ...headersWithAuth(token),
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ name: name.trim() })
    });

    const result = await response.json();
    if (!response.ok) {
      setError(result.error || "Не удалось создать канал");
      return;
    }

    const created = normalizeRoom(result, "channel");
    if (!created) {
      setError("Некорректный ответ сервера");
      return;
    }

    setChannels((prev) => [created, ...prev.filter((item) => item.id !== created.id)]);
    setActiveConversationId("");
    setActiveTarget({ kind: "channel", value: created });
    if (user) {
      socket.emit("join_channel", { channelId: created.id, userId: user.id });
    }
  };

  const handleCreateGroup = async () => {
    if (!token) return;

    const name = window.prompt("Название группы");
    if (!name || !name.trim()) return;

    const response = await fetch("/api/groups", {
      method: "POST",
      headers: {
        ...headersWithAuth(token),
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ name: name.trim() })
    });

    const result = await response.json();
    if (!response.ok) {
      setError(result.error || "Не удалось создать группу");
      return;
    }

    const created = normalizeRoom(result, "group");
    if (!created) {
      setError("Некорректный ответ сервера");
      return;
    }

    setGroups((prev) => [created, ...prev.filter((item) => item.id !== created.id)]);
    setActiveConversationId("");
    setActiveTarget({ kind: "group", value: created });
    if (user) {
      socket.emit("join_channel", { channelId: created.id, userId: user.id });
    }
  };

  const handleSaveFolder = (
    payload: { name: string; filter: SidebarFolderFilter },
    folderId?: string
  ) => {
    const cleanName = sanitizeFolderName(payload.name);
    if (!cleanName) {
      setError("Введите название папки");
      return;
    }

    const hasAnyType =
      payload.filter.includeDirect || payload.filter.includeGroups || payload.filter.includeChannels;
    if (!hasAnyType) {
      setError("Выберите хотя бы один тип чатов");
      return;
    }

    const nextFolder: SidebarCustomFolder = {
      id: folderId || makeFolderId(),
      name: cleanName,
      filter: {
        includeDirect: payload.filter.includeDirect,
        includeGroups: payload.filter.includeGroups,
        includeChannels: payload.filter.includeChannels,
        unreadOnly: payload.filter.unreadOnly,
        includeArchived: payload.filter.includeArchived
      }
    };

    setCustomFolders((prev) => {
      if (!folderId) {
        return [...prev, nextFolder];
      }
      return prev.map((entry) => (entry.id === folderId ? nextFolder : entry));
    });
    setActiveFolderId(`custom:${nextFolder.id}`);
    setFolderModalOpen(false);
    setFolderEditingId(null);
    setComposeMenuOpen(false);
    setInfo(folderId ? `Папка "${nextFolder.name}" обновлена` : `Папка "${nextFolder.name}" создана`);
    setError("");
  };

  const handleDeleteFolder = (folderId: string) => {
    const folder = customFolders.find((entry) => entry.id === folderId);
    if (!folder) return;

    const confirmed = window.confirm(`Удалить папку "${folder.name}"?`);
    if (!confirmed) return;

    setCustomFolders((prev) => prev.filter((entry) => entry.id !== folderId));
    if (activeFolderId === `custom:${folderId}`) {
      setActiveFolderId("all");
    }
    setFolderModalOpen(false);
    setFolderEditingId(null);
    setComposeMenuOpen(false);
    setInfo(`Папка "${folder.name}" удалена`);
  };

  const addMemberToRoom = async (target: ChannelData, kind: "channel" | "group") => {
    if (!token) return;
    if (!user || target.ownerId !== user.id) {
      setError("Добавлять участников может только владелец");
      return;
    }

    const query = window.prompt(
      "Введите ID пользователя, @username или уникальный ID друга для добавления"
    );
    if (!query || !query.trim()) return;

    const endpoint =
      kind === "group"
        ? `/api/groups/${target.id}/members`
        : `/api/channels/${target.id}/members`;

    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        ...headersWithAuth(token),
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ query: query.trim() })
    });

    const result = await response.json();
    if (!response.ok) {
      setError(result.error || "Не удалось добавить участника");
      return;
    }

    const updateMembers = (items: ChannelData[]) =>
      items.map((item) =>
        item.id === target.id ? { ...item, membersCount: item.membersCount + 1 } : item
      );

    if (kind === "group") {
      setGroups((prev) => updateMembers(prev));
    } else {
      setChannels((prev) => updateMembers(prev));
    }

    if (activeTarget && activeTarget.kind !== "user" && activeTarget.value.id === target.id) {
      setActiveTarget({
        kind: activeTarget.kind,
        value: { ...activeTarget.value, membersCount: activeTarget.value.membersCount + 1 }
      });
    }

    setInfo("Пользователь добавлен");
  };

  const archiveTarget = async (target: ChatTarget) => {
    if (!token) return;

    const targetType =
      target.kind === "user" ? "user" : target.kind === "group" ? "group" : "channel";

    const response = await fetch("/api/archive", {
      method: "POST",
      headers: {
        ...headersWithAuth(token),
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        targetType,
        targetId: target.value.id
      })
    });

    const result = await response.json();
    if (!response.ok) {
      setError(result.error || "Не удалось отправить чат в архив");
      return;
    }

    const toRoom = (room: ChannelData, fallbackKind: RoomKind): ChannelData => ({
      ...room,
      kind: room.kind || fallbackKind
    });

    if (target.kind === "user") {
      setArchived((prev) => ({
        ...prev,
        users: [target.value, ...prev.users.filter((item) => item.id !== target.value.id)]
      }));
      setContacts((prev) => prev.filter((item) => item.id !== target.value.id));
      setDialogs((prev) => prev.filter((item) => item.peer.id !== target.value.id));
    } else if (target.kind === "group") {
      setArchived((prev) => ({
        ...prev,
        groups: [toRoom(target.value, "group"), ...prev.groups.filter((item) => item.id !== target.value.id)]
      }));
      setGroups((prev) => prev.filter((item) => item.id !== target.value.id));
    } else {
      setArchived((prev) => ({
        ...prev,
        channels: [
          toRoom(target.value, "channel"),
          ...prev.channels.filter((item) => item.id !== target.value.id)
        ]
      }));
      setChannels((prev) => prev.filter((item) => item.id !== target.value.id));
    }

    setActiveTarget(null);
    setActiveConversationId("");
    setMessages([]);
    setInfo("Чат отправлен в архив");
  };

  const unarchiveItem = async (
    targetType: "user" | "channel" | "group",
    target: PublicUser | ChannelData,
    options?: { openDialog?: boolean }
  ) => {
    if (!token) return;
    const openDialog = options?.openDialog === true;

    const response = await fetch("/api/archive", {
      method: "DELETE",
      headers: {
        ...headersWithAuth(token),
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ targetType, targetId: target.id })
    });

    const result = await response.json();
    if (!response.ok) {
      setError(result.error || "Не удалось восстановить чат из архива");
      return;
    }

    if (targetType === "user") {
      const userTarget = target as PublicUser;
      setArchived((prev) => ({
        ...prev,
        users: prev.users.filter((item) => item.id !== userTarget.id)
      }));
      setContacts((prev) => (prev.some((item) => item.id === userTarget.id) ? prev : [userTarget, ...prev]));
      if (openDialog) {
        openOrCreateDialog(userTarget).catch(() => undefined);
      }
    } else if (targetType === "group") {
      const groupTarget = target as ChannelData;
      setArchived((prev) => ({
        ...prev,
        groups: prev.groups.filter((item) => item.id !== groupTarget.id)
      }));
      setGroups((prev) => (prev.some((item) => item.id === groupTarget.id) ? prev : [groupTarget, ...prev]));
    } else {
      const channelTarget = target as ChannelData;
      setArchived((prev) => ({
        ...prev,
        channels: prev.channels.filter((item) => item.id !== channelTarget.id)
      }));
      setChannels((prev) =>
        prev.some((item) => item.id === channelTarget.id) ? prev : [channelTarget, ...prev]
      );
    }

    setInfo("Чат восстановлен из архива");
  };

  const restoreArchivedTarget = async (target: ChatTarget) => {
    if (target.kind === "user") {
      await unarchiveItem("user", target.value, { openDialog: false });
      return;
    }

    if (target.kind === "group") {
      await unarchiveItem("group", target.value, { openDialog: false });
      return;
    }

    await unarchiveItem("channel", target.value, { openDialog: false });
  };

  const openProfile = async (targetUserId: string) => {
    if (!token) return;

    const response = await fetch(`/api/users/${targetUserId}/profile`, {
      headers: headersWithAuth(token)
    });

    const result = await response.json();
    if (!response.ok) {
      setError(result.error || "Профиль недоступен");
      return;
    }

    setProfileData(result as ProfileData);
    setProfileOpen(true);
    const mediaResponse = await fetch(
      `/api/users/${targetUserId}/media?tab=${profileMediaTab}&limit=100`,
      { headers: headersWithAuth(token) }
    );
    if (mediaResponse.ok) {
      setProfileMedia(normalizeMediaPanel(await mediaResponse.json()));
    }
  };

  const reloadProfileMedia = async (tab: "media" | "files" | "links" | "audio", userId?: string) => {
    if (!token) return;
    const targetId = userId || profileData?.id;
    if (!targetId) return;
    setProfileMediaTab(tab);

    const response = await fetch(`/api/users/${targetId}/media?tab=${tab}&limit=100`, {
      headers: headersWithAuth(token)
    });
    if (!response.ok) return;
    setProfileMedia(normalizeMediaPanel(await response.json()));
  };

  const openChannelProfile = async (target: ChannelData, kind: "channel" | "group") => {
    if (!token) return;
    const response = await fetch(`/api/channels/${target.id}/profile`, {
      headers: headersWithAuth(token)
    });
    const result = await response.json();
    if (!response.ok) {
      setError(result.error || "Профиль канала недоступен");
      return;
    }

    const profile: ChannelProfileData = {
      id: String(result.id || target.id),
      kind: normalizeRoom(result, kind)?.kind || kind,
      name: String(result.name || target.name),
      usernameSlug: String(result.usernameSlug || ""),
      publicPath: String(result.publicPath || ""),
      description: String(result.description || ""),
      avatarUrl: String(result.avatarUrl || ""),
      ownerId: String(result.ownerId || target.ownerId),
      membersCount: Number(result.membersCount || target.membersCount || 0),
      mediaCount: Number(result.mediaCount || 0)
    };
    setChannelProfile(profile);
    setChannelProfileOpen(true);

    const mediaResponse = await fetch(`/api/channels/${target.id}/media?tab=${channelMediaTab}&limit=100`, {
      headers: headersWithAuth(token)
    });
    if (mediaResponse.ok) {
      setChannelMedia(normalizeMediaPanel(await mediaResponse.json()));
    }
  };

  const reloadChannelMedia = async (tab: "media" | "files" | "links" | "audio", channelId?: string) => {
    if (!token) return;
    const targetId = channelId || channelProfile?.id;
    if (!targetId) return;
    setChannelMediaTab(tab);

    const response = await fetch(`/api/channels/${targetId}/media?tab=${tab}&limit=100`, {
      headers: headersWithAuth(token)
    });
    if (!response.ok) return;
    setChannelMedia(normalizeMediaPanel(await response.json()));
  };

  const copyToClipboard = async (text: string, successMessage: string) => {
    const value = String(text || "").trim();
    if (!value) return;

    try {
      await navigator.clipboard.writeText(value);
      setInfo(successMessage);
    } catch {
      setError("Не удалось скопировать ссылку");
    }
  };

  const saveChannelSlug = async (channelId: string, slug: string) => {
    if (!token) return;

    const response = await fetch(`/api/channels/${channelId}/slug`, {
      method: "PATCH",
      headers: {
        ...headersWithAuth(token),
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ slug })
    });
    const result = await response.json();
    if (!response.ok) {
      setError(result.error || "Не удалось обновить ссылку");
      return;
    }

    const nextSlug = String(result.usernameSlug || slug || "").trim().toLowerCase();
    const nextPath = String(result.publicPath || roomPublicPath(result.kind === "group" ? "group" : "channel", nextSlug));

    setChannelProfile((prev) =>
      prev
        ? {
            ...prev,
            usernameSlug: nextSlug,
            publicPath: nextPath
          }
        : prev
    );

    const updateList = (list: ChannelData[]) =>
      list.map((entry) =>
        entry.id === channelId
          ? { ...entry, usernameSlug: nextSlug }
          : entry
      );
    setChannels((prev) => updateList(prev));
    setGroups((prev) => updateList(prev));
    setInfo("Публичная ссылка обновлена");
  };

  const openSettings = () => {
    if (!user) return;

    setSettingsDraft({
      displayName: user.displayName,
      username: user.username,
      email: user.email,
      bio: user.bio,
      theme: user.settings.theme,
      chatBubbleStyle: user.settings.chatBubbleStyle,
      chatWallpaper: user.settings.chatWallpaper,
      messageFontScale: user.settings.messageFontScale
    });
    setSettingsOpen(true);
  };

  const saveSettings = async () => {
    if (!token || !settingsDraft) return;

    setSettingsSaving(true);
    const response = await fetch("/api/me", {
      method: "PATCH",
      headers: {
        ...headersWithAuth(token),
        "Content-Type": "application/json"
      },
      body: JSON.stringify(settingsDraft)
    });

    const result = await response.json();
    setSettingsSaving(false);

    if (!response.ok) {
      setError(result.error || "Не удалось сохранить настройки");
      return;
    }

    const nextUser = normalizeUser(result.user || result);
    if (!nextUser) {
      setError("Некорректный ответ сервера");
      return;
    }

    persistUser(nextUser, typeof result.token === "string" ? result.token : undefined);
    if (typeof result.token === "string") {
      socket.emit("register", { userId: nextUser.id, token: result.token });
    }
    setSettingsOpen(false);
    setInfo("Настройки сохранены");
  };

  const uploadAvatar = async (event: React.ChangeEvent<HTMLInputElement>) => {
    if (!token) return;

    const file = event.target.files?.[0];
    if (!file) return;

    const formData = new FormData();
    formData.append("avatar", file);

    const response = await fetch("/api/me/avatar", {
      method: "POST",
      headers: headersWithAuth(token),
      body: formData
    });

    const result = await response.json();
    if (!response.ok) {
      setError(result.error || "Не удалось загрузить аватар");
      return;
    }

    const nextUser = normalizeUser(result);
    if (!nextUser) {
      setError("Некорректный ответ сервера");
      return;
    }

    persistUser(nextUser);
    if (settingsDraft) {
      setSettingsDraft({
        ...settingsDraft,
        displayName: nextUser.displayName,
        username: nextUser.username,
        email: nextUser.email,
        bio: nextUser.bio
      });
    }
  };

  const logout = () => {
    endCall(true);
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    setToken(null);
    setUser(null);
    setContacts([]);
    setDialogs([]);
    setChannels([]);
    setGroups([]);
    setArchived({ users: [], channels: [], groups: [] });
    setArchiveMode(false);
    setActiveFolderId("all");
    setComposeMenuOpen(false);
    setFolderModalOpen(false);
    setFolderEditingId(null);
    setToasts([]);
    setMessages([]);
    setActiveTarget(null);
    setSearchResults([]);
    setActiveConversationId("");
    setProfileData(null);
    setProfileMedia({ tab: "media", media: [], files: [], audio: [], links: [], items: [] });
    setChannelProfile(null);
    setChannelMedia({ tab: "media", media: [], files: [], audio: [], links: [], items: [] });
    deepLinkHandledRef.current = false;
    socket.disconnect();
    socket.connect();
  };

  const isActiveArchived = (() => {
    if (!activeTarget) return false;

    if (activeTarget.kind === "user") {
      return archived.users.some((item) => item.id === activeTarget.value.id);
    }

    if (activeTarget.kind === "group") {
      return archived.groups.some((item) => item.id === activeTarget.value.id);
    }

    return archived.channels.some((item) => item.id === activeTarget.value.id);
  })();

  const archivedUsersSet = useMemo(() => new Set(archived.users.map((item) => item.id)), [archived.users]);
  const archivedChannelsSet = useMemo(() => new Set(archived.channels.map((item) => item.id)), [archived.channels]);
  const archivedGroupsSet = useMemo(() => new Set(archived.groups.map((item) => item.id)), [archived.groups]);
  const dialogByPeerId = useMemo(() => new Map(dialogs.map((item) => [item.peer.id, item] as const)), [dialogs]);

  const mergedContacts = useMemo(
    () => [
      ...dialogs.map((dialog) => dialog.peer),
      ...contacts.filter((contact) => !dialogs.some((dialog) => dialog.peer.id === contact.id))
    ],
    [dialogs, contacts]
  );

  const folderTabs = useMemo<SidebarFolderTab[]>(
    () => [
      { id: "all", label: "Все" },
      ...customFolders.map((folder) => ({
        id: `custom:${folder.id}` as SidebarFolderId,
        label: folder.name,
        custom: true
      }))
    ],
    [customFolders]
  );

  const activeCustomFolder = useMemo(() => {
    if (!activeFolderId.startsWith("custom:")) return null;
    const folderId = activeFolderId.replace("custom:", "");
    return customFolders.find((entry) => entry.id === folderId) || null;
  }, [activeFolderId, customFolders]);

  const sidebarChatItems = useMemo<SidebarChatItem[]>(() => {
    const items: SidebarChatItem[] = [];

    const usersMap = new Map<string, PublicUser>();
    for (const contact of mergedContacts) {
      usersMap.set(contact.id, contact);
    }
    for (const archivedUser of archived.users) {
      if (!usersMap.has(archivedUser.id)) {
        usersMap.set(archivedUser.id, archivedUser);
      }
    }

    for (const contact of usersMap.values()) {
      const dialog = dialogByPeerId.get(contact.id);
      const lastActivity =
        dialog?.lastMessage?.timestamp || dialog?.updatedAt || dialog?.createdAt || new Date(0).toISOString();

      items.push({
        id: contact.id,
        key: `user:${contact.id}`,
        kind: "user",
        title: contact.displayName,
        subtitle: dialog?.lastMessage?.content || contact.bio || "Нет сообщений",
        unreadCount: Number(dialog?.unreadCount || 0),
        lastActivity,
        isArchived: archivedUsersSet.has(contact.id),
        avatarUrl: contact.avatarUrl,
        contact
      });
    }

    const channelMap = new Map<string, ChannelData>();
    for (const channel of channels) {
      channelMap.set(channel.id, { ...channel, kind: "channel" });
    }
    for (const channel of archived.channels) {
      if (!channelMap.has(channel.id)) {
        channelMap.set(channel.id, { ...channel, kind: "channel" });
      }
    }

    for (const channel of channelMap.values()) {
      items.push({
        id: channel.id,
        key: `channel:${channel.id}`,
        kind: "channel",
        title: channel.name,
        subtitle: `${channel.membersCount} участников · Канал`,
        unreadCount: 0,
        lastActivity: channel.createdAt || new Date(0).toISOString(),
        isArchived: archivedChannelsSet.has(channel.id),
        room: { ...channel, kind: "channel" }
      });
    }

    const groupsMap = new Map<string, ChannelData>();
    for (const group of groups) {
      groupsMap.set(group.id, { ...group, kind: "group" });
    }
    for (const group of archived.groups) {
      if (!groupsMap.has(group.id)) {
        groupsMap.set(group.id, { ...group, kind: "group" });
      }
    }

    for (const group of groupsMap.values()) {
      items.push({
        id: group.id,
        key: `group:${group.id}`,
        kind: "group",
        title: group.name,
        subtitle: `${group.membersCount} участников · Группа`,
        unreadCount: 0,
        lastActivity: group.createdAt || new Date(0).toISOString(),
        isArchived: archivedGroupsSet.has(group.id),
        room: { ...group, kind: "group" }
      });
    }

    return items.sort((a, b) => {
      const dateA = Date.parse(a.lastActivity);
      const dateB = Date.parse(b.lastActivity);
      const safeA = Number.isNaN(dateA) ? 0 : dateA;
      const safeB = Number.isNaN(dateB) ? 0 : dateB;
      return safeB - safeA;
    });
  }, [
    mergedContacts,
    archived.users,
    channels,
    archived.channels,
    groups,
    archived.groups,
    dialogByPeerId,
    archivedUsersSet,
    archivedChannelsSet,
    archivedGroupsSet
  ]);

  const baseVisibleChats = useMemo(() => {
    if (activeFolderId === "all") {
      return sidebarChatItems.filter((item) => !item.isArchived);
    }

    const customId = activeFolderId.replace("custom:", "");
    const folder = customFolders.find((entry) => entry.id === customId);
    if (!folder) {
      return sidebarChatItems.filter((item) => !item.isArchived);
    }

    return sidebarChatItems.filter((item) => {
      if (!folder.filter.includeArchived && item.isArchived) {
        return false;
      }

      const byType =
        (item.kind === "user" && folder.filter.includeDirect) ||
        (item.kind === "group" && folder.filter.includeGroups) ||
        (item.kind === "channel" && folder.filter.includeChannels);

      if (!byType) {
        return false;
      }

      if (folder.filter.unreadOnly && item.unreadCount <= 0) {
        return false;
      }

      return true;
    });
  }, [activeFolderId, sidebarChatItems, customFolders]);

  const archivedChats = useMemo(
    () => sidebarChatItems.filter((item) => item.isArchived),
    [sidebarChatItems]
  );

  const visibleChats = archiveMode ? archivedChats : baseVisibleChats;

  const openSidebarChat = (item: SidebarChatItem) => {
    if (item.kind === "user" && item.contact) {
      openOrCreateDialog(item.contact).catch(() => undefined);
      return;
    }

    if (item.room) {
      setActiveConversationId("");
      setActiveTarget({ kind: item.kind, value: item.room });
    }
  };

  const unarchiveSidebarItem = async (item: SidebarChatItem) => {
    if (item.kind === "user" && item.contact) {
      await unarchiveItem("user", item.contact, { openDialog: false });
      return;
    }

    if (!item.room) return;
    const targetType = item.kind === "group" ? "group" : "channel";
    await unarchiveItem(targetType, item.room, { openDialog: false });
  };

  if (!user) {
    return (
      <div className="min-h-screen auth-shell px-4 py-10 flex items-center justify-center">
        <div className="auth-orb auth-orb-top" />
        <div className="auth-orb auth-orb-bottom" />

        <motion.div
          initial={{ opacity: 0, y: 18, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          className="auth-card w-full max-w-md relative z-10"
        >
          <div className="auth-brand mb-7">
            <div className="auth-logo-wrap">
              <img src={BRAND_LOGO_SRC} alt={`${BRAND_NAME} logo`} className="auth-logo-image" />
            </div>
            <div>
              <h1 className="auth-title">{BRAND_NAME}</h1>
              <p className="auth-subtitle">Современный мессенджер для чатов и звонков</p>
            </div>
          </div>

          <form onSubmit={isRegistering ? handleRegister : handleLogin} className="space-y-3">
            {isRegistering && (
              <>
                <label className="field-wrap">
                  <UserRound size={16} className="field-icon" />
                  <input name="displayName" required placeholder="Имя профиля" className="field-input" />
                </label>
                <label className="field-wrap">
                  <Mail size={16} className="field-icon" />
                  <input name="email" type="email" required placeholder="Почта" className="field-input" />
                </label>
                <textarea
                  name="bio"
                  placeholder="Коротко о себе"
                  rows={2}
                  className="field-input field-textarea"
                />
              </>
            )}

            <label className="field-wrap">
              <AtSign size={16} className="field-icon" />
              <input name="username" required placeholder="Username" className="field-input" />
            </label>

            <label className="field-wrap">
              <Lock size={16} className="field-icon" />
              <input name="password" type="password" required placeholder="Пароль" className="field-input" />
            </label>

            {error && <p className="notice notice-error">{error}</p>}
            {info && <p className="notice notice-success">{info}</p>}

            <button type="submit" className="btn btn-primary w-full h-12">
              {isRegistering ? "Создать аккаунт" : "Войти"}
            </button>
          </form>

          <div className="mt-5 text-center">
            <button
              onClick={() => {
                setIsRegistering((prev) => !prev);
                setError("");
                setInfo("");
              }}
              className="btn btn-ghost w-full"
            >
              {isRegistering ? "Уже есть аккаунт? Войти" : "Нет аккаунта? Регистрация"}
            </button>
          </div>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="app-shell">
      <div className="app-layout">
        <aside
          className={`app-sidebar w-full md:w-[360px] lg:w-[380px] xl:w-[400px] ${
            activeTarget ? "max-md:hidden" : ""
          }`}
        >
          <div className="sidebar-header">
            <div className="sidebar-profile-block">
              <div className="flex items-center justify-between gap-3">
                <button onClick={() => openProfile(user.id)} className="profile-summary">
                  <div className="avatar avatar-lg profile-avatar">
                    {user.avatarUrl ? (
                      <img src={user.avatarUrl} alt={user.displayName} className="w-full h-full object-cover" />
                    ) : (
                      <span className="avatar-fallback">{avatarFallback(user.displayName)}</span>
                    )}
                  </div>
                  <div className="min-w-0 text-left">
                    <p className="profile-title truncate">{user.displayName}</p>
                    <p className="profile-subtitle truncate">@{user.username} · #{user.uniqueId}</p>
                  </div>
                </button>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => {
                      setArchiveMode((prev) => !prev);
                      setComposeMenuOpen(false);
                    }}
                    className={`btn btn-icon ${archiveMode ? "btn-icon-active" : ""}`}
                    title={archiveMode ? "Вернуться к чатам" : "Открыть архив"}
                  >
                    <Archive size={16} />
                  </button>
                  <button onClick={openSettings} className="btn btn-icon" title="Настройки">
                    <Settings size={16} />
                  </button>
                </div>
              </div>
            </div>

            <div className="search-shell sidebar-search-block">
              <Search className="search-icon" size={16} />
              <input
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                onKeyDown={(event) => event.key === "Enter" && handleSearch()}
                placeholder="Поиск по username или ID"
                className="search-input"
              />
              <button onClick={handleSearch} className="btn btn-primary btn-xs" title="Поиск">
                <Search size={14} />
                Поиск
              </button>
            </div>

            <div className="sidebar-toolbar-row">
              <div className="sidebar-toolbar-label">{archiveMode ? "Архив" : "Сообщения"}</div>
              <div ref={composeMenuRef} className="relative">
                <button
                  onClick={() => setComposeMenuOpen((prev) => !prev)}
                  className="btn btn-compose"
                  title="Создать"
                >
                  <Pencil size={14} />
                </button>

                {composeMenuOpen && (
                  <ComposeMenu
                    onClose={() => setComposeMenuOpen(false)}
                    onNewMessage={() => {
                      setComposeMenuOpen(false);
                      handleComposeNewMessage().catch(() => undefined);
                    }}
                    onCreateGroup={() => {
                      setComposeMenuOpen(false);
                      handleCreateGroup().catch(() => undefined);
                    }}
                    onCreateChannel={() => {
                      setComposeMenuOpen(false);
                      handleCreateChannel().catch(() => undefined);
                    }}
                    onCreateFolder={() => {
                      setComposeMenuOpen(false);
                      setFolderEditingId(null);
                      setFolderModalOpen(true);
                    }}
                    canManageActiveFolder={Boolean(activeCustomFolder)}
                    onEditActiveFolder={() => {
                      if (!activeCustomFolder) return;
                      setComposeMenuOpen(false);
                      setFolderEditingId(activeCustomFolder.id);
                      setFolderModalOpen(true);
                    }}
                    onDeleteActiveFolder={() => {
                      if (!activeCustomFolder) return;
                      handleDeleteFolder(activeCustomFolder.id);
                    }}
                  />
                )}
              </div>
            </div>

            {searchQuery.trim().length > 0 && (
              <div className="search-results">
                {searchLoading ? (
                  <div className="search-result-item text-xs text-text-secondary">Ищем пользователей...</div>
                ) : searchResults.length === 0 ? (
                  <div className="search-result-item text-xs text-text-secondary">
                    Ничего не найдено. Попробуйте другой username или ID.
                  </div>
                ) : (
                  searchResults.map((candidate) => (
                    <div key={`sr-${candidate.id}`} className="search-result-item">
                      <button
                        onClick={() => {
                          openOrCreateDialog(candidate).catch(() => undefined);
                          setSearchQuery("");
                          setSearchResults([]);
                        }}
                        className="search-result-main"
                      >
                        <div className="avatar avatar-sm">
                          {candidate.avatarUrl ? (
                            <img src={candidate.avatarUrl} alt={candidate.displayName} className="w-full h-full object-cover" />
                          ) : (
                            <span className="avatar-fallback">{avatarFallback(candidate.displayName)}</span>
                          )}
                        </div>
                        <div className="min-w-0">
                          <p className="search-result-title">{candidate.displayName}</p>
                          <p className="search-result-subtitle">
                            @{candidate.username} · ID {candidate.userId > 0 ? candidate.userId : "—"}
                          </p>
                          <p className="search-result-bio">{candidate.bio || "Нет описания"}</p>
                        </div>
                      </button>
                      <div className="grid grid-cols-3 gap-2 mt-2">
                        <button
                          onClick={() => openProfile(candidate.id)}
                          className="btn btn-secondary btn-xs"
                          title="Открыть профиль"
                        >
                          <User size={13} />
                          Профиль
                        </button>
                        <button
                          onClick={() => addFriend(candidate)}
                          className="btn btn-secondary btn-xs"
                          title="Добавить в друзья"
                        >
                          <UserPlus size={13} />
                          Добавить
                        </button>
                        <button
                          onClick={() => callByContact(candidate).catch(() => undefined)}
                          className="btn btn-primary btn-xs"
                          title="Позвонить"
                        >
                          <Phone size={13} />
                          Звонок
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}
          </div>

          <div className="sidebar-scroll sidebar-sections">
            {archiveMode ? (
              <div className="archive-mode-head">
                <button onClick={() => setArchiveMode(false)} className="btn btn-ghost btn-xs">
                  <ArrowLeft size={13} />
                  К чатам
                </button>
                <span className="archive-mode-caption">Архив · {archivedChats.length}</span>
              </div>
            ) : (
              <FolderTabs tabs={folderTabs} activeId={activeFolderId} onSelect={setActiveFolderId} />
            )}

            {visibleChats.length > 0 ? (
              visibleChats.map((chat) => {
                const isActive =
                  (chat.kind === "user" &&
                    activeTarget?.kind === "user" &&
                    activeTarget.value.id === chat.id) ||
                  (chat.kind === "channel" &&
                    activeTarget?.kind === "channel" &&
                    activeTarget.value.id === chat.id) ||
                  (chat.kind === "group" &&
                    activeTarget?.kind === "group" &&
                    activeTarget.value.id === chat.id);

                return (
                  <div
                    key={chat.key}
                    role="button"
                    tabIndex={0}
                    onClick={() => openSidebarChat(chat)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        openSidebarChat(chat);
                      }
                    }}
                    className={`chat-list-item ${isActive ? "chat-list-item-active" : ""}`}
                  >
                    <div className={`avatar avatar-md ${chat.kind === "channel" ? "avatar-channel" : chat.kind === "group" ? "avatar-group" : ""}`}>
                      {chat.kind === "user" ? (
                        chat.avatarUrl ? (
                          <img src={chat.avatarUrl} alt={chat.title} className="w-full h-full object-cover" />
                        ) : (
                          <span className="avatar-fallback">{avatarFallback(chat.title)}</span>
                        )
                      ) : chat.kind === "channel" ? (
                        <Radio size={14} />
                      ) : (
                        <Users size={14} />
                      )}
                    </div>

                    <div className="min-w-0 flex-1 text-left">
                      <div className="flex items-center justify-between gap-2">
                        <p className="chat-list-title truncate">{chat.title}</p>
                        {chat.lastActivity && Date.parse(chat.lastActivity) > 0 && (
                          <span className="chat-list-time">
                            {new Date(chat.lastActivity).toLocaleTimeString([], {
                              hour: "2-digit",
                              minute: "2-digit"
                            })}
                          </span>
                        )}
                      </div>
                      <p className="chat-list-subtitle truncate">{chat.subtitle}</p>
                    </div>

                    {chat.isArchived && <span className="chat-pill-muted">Архив</span>}
                    {chat.unreadCount > 0 && (
                      <span className="unread-badge">{Math.min(99, chat.unreadCount)}</span>
                    )}
                    {archiveMode && chat.isArchived && (
                      <button
                        onClick={(event) => {
                          event.stopPropagation();
                          unarchiveSidebarItem(chat).catch(() => undefined);
                        }}
                        className="btn btn-icon btn-xs chat-unarchive-btn"
                        title="Вернуть из архива"
                      >
                        <ArrowLeft size={13} />
                      </button>
                    )}
                    {(chat.kind === "channel" || chat.kind === "group") && !chat.isArchived && (
                      <ChevronRight size={14} className="text-text-muted" />
                    )}
                  </div>
                );
              })
            ) : (
              <div className="sidebar-empty">
                <MessageCircle size={18} />
                <p>{archiveMode ? "Архив пуст" : "В этой папке пока нет чатов"}</p>
              </div>
            )}
          </div>
        </aside>

        <main
          className={`chat-stage ${
            user.settings.chatWallpaper === "plain"
              ? "bg-bg-primary"
              : user.settings.chatWallpaper === "mesh"
                ? "chat-wallpaper-mesh"
                : "chat-wallpaper-gradient"
          } ${!activeTarget ? "max-md:hidden" : ""}`}
        >
          {activeTarget ? (
            <>
              <div className="chat-topbar">
                <div className="flex items-center gap-3 min-w-0">
                  <button
                    onClick={() => {
                      setActiveTarget(null);
                      setActiveConversationId("");
                    }}
                    className="btn btn-icon md:hidden"
                    title="Назад"
                  >
                    <ArrowLeft size={16} />
                  </button>

                  <div className="avatar avatar-md">
                    {activeTarget.kind === "user" ? (
                      activeTarget.value.avatarUrl ? (
                        <img src={activeTarget.value.avatarUrl} alt={activeTarget.value.displayName} className="w-full h-full object-cover" />
                      ) : (
                        <span className="avatar-fallback">{avatarFallback(activeTarget.value.displayName)}</span>
                      )
                    ) : activeTarget.kind === "group" ? (
                      <Users size={15} />
                    ) : (
                      <Hash size={15} />
                    )}
                  </div>

                  <div className="min-w-0">
                    <p className="chat-header-title truncate">
                      {activeTarget.kind === "user" ? activeTarget.value.displayName : activeTarget.value.name}
                    </p>
                    <p className="chat-header-subtitle truncate">
                      {activeTarget.kind === "user"
                        ? `@${activeTarget.value.username} · #${activeTarget.value.uniqueId}`
                        : `${activeTarget.value.membersCount} участников · ${activeTarget.kind === "group" ? "Группа" : "Канал"}`}
                    </p>
                  </div>
                </div>

                {activeTarget.kind === "user" ? (
                  <div className="flex items-center gap-2 flex-wrap justify-end">
                    <button
                      onClick={() => callByContact(activeTarget.value).catch(() => undefined)}
                      disabled={callState !== "idle" && callPeer?.id !== activeTarget.value.id}
                      className="btn btn-primary btn-xs disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <PhoneCall size={14} />
                      {callPeer?.id === activeTarget.value.id && callState !== "idle" ? "В звонке" : "Звонок"}
                    </button>
                    <button className="btn btn-secondary btn-xs opacity-60 cursor-not-allowed" disabled>
                      <Video size={14} />
                      Видео
                    </button>
                    <button onClick={() => openProfile(activeTarget.value.id)} className="btn btn-secondary btn-xs">
                      <User size={14} />
                      Профиль
                    </button>
                    {isActiveArchived ? (
                      <button
                        onClick={() => restoreArchivedTarget(activeTarget).catch(() => undefined)}
                        className="btn btn-secondary btn-xs"
                      >
                        <ArrowLeft size={14} />
                        Вернуть
                      </button>
                    ) : (
                      <button
                        onClick={() => archiveTarget(activeTarget).catch(() => undefined)}
                        className="btn btn-secondary btn-xs"
                      >
                        <Archive size={14} />
                        Архив
                      </button>
                    )}
                  </div>
                ) : (
                  <div className="flex items-center gap-2 flex-wrap justify-end">
                    <button
                      onClick={() =>
                        openChannelProfile(activeTarget.value, activeTarget.kind === "group" ? "group" : "channel").catch(
                          () => undefined
                        )
                      }
                      className="btn btn-secondary btn-xs"
                    >
                      <Hash size={14} />
                      Профиль
                    </button>
                    <button
                      onClick={() =>
                        addMemberToRoom(activeTarget.value, activeTarget.kind === "group" ? "group" : "channel").catch(
                          () => undefined
                        )
                      }
                      className="btn btn-secondary btn-xs"
                    >
                      <UserPlus size={14} />
                      Добавить
                    </button>
                    <button
                      onClick={() =>
                        (isActiveArchived
                          ? restoreArchivedTarget(activeTarget)
                          : archiveTarget(activeTarget)
                        ).catch(() => undefined)
                      }
                      className="btn btn-secondary btn-xs"
                    >
                      {isActiveArchived ? <ArrowLeft size={14} /> : <Archive size={14} />}
                      {isActiveArchived ? "Вернуть" : "Архив"}
                    </button>
                  </div>
                )}
              </div>

              <div ref={messageListRef} className="chat-stream">
                {messages.length === 0 ? (
                  <div className="chat-empty-state">
                    <MessageSquare size={34} className="opacity-80" />
                    <h3>Начните диалог</h3>
                    <p>
                      {activeTarget.kind === "user"
                        ? "Напишите первое сообщение или отправьте голосовое."
                        : "Пока сообщений нет. Начните общение первым."}
                    </p>
                  </div>
                ) : (
                  messages.map((message) => (
                    <MessageBubble
                      key={message.id}
                      message={message}
                      own={message.senderId === user.id}
                      bubbleStyle={user.settings.chatBubbleStyle}
                      fontScale={user.settings.messageFontScale}
                      isChannel={activeTarget.kind !== "user"}
                      onOpenMedia={(media) => setMediaViewer(media)}
                    />
                  ))
                )}
              </div>

              <ChatInput
                target={activeTarget}
                senderId={user.id}
                token={token!}
                conversationId={
                  activeTarget.kind === "user"
                    ? activeConversationId || dialogs.find((dialog) => dialog.peer.id === activeTarget.value.id)?.id || ""
                    : ""
                }
              />
            </>
          ) : (
            <div className="chat-placeholder-screen">
              <div className="chat-empty-state chat-empty-state-brand">
                <div className="empty-brand-logo-wrap">
                  <img src={BRAND_LOGO_SRC} alt={`${BRAND_NAME} logo`} className="empty-brand-logo-image" />
                </div>
                <p className="empty-brand-name">{BRAND_NAME}</p>
                <h3>Выберите чат</h3>
                <p>Откройте диалог, канал или группу в левой панели, чтобы начать общение.</p>
              </div>
            </div>
          )}
        </main>
      </div>
      <ToastViewport toasts={toasts} onDismiss={removeToast} />
      <VoiceCallPanel
        state={callState}
        peer={callPeer}
        muted={callMuted}
        elapsedSec={callElapsedSec}
        collapsed={callWidgetCollapsed}
        onAccept={acceptIncomingCall}
        onReject={rejectIncomingCall}
        onEnd={() => endCall(true, "Звонок завершен")}
        onToggleCollapse={() => setCallWidgetCollapsed((prev) => !prev)}
        onToggleMute={toggleMute}
      />
      <MediaViewerModal media={mediaViewer} onClose={() => setMediaViewer(null)} />

      <audio ref={remoteAudioRef} autoPlay playsInline className="hidden" />

      {folderModalOpen && (
        <CreateFolderModal
          mode={folderEditingId ? "edit" : "create"}
          initialFolder={customFolders.find((entry) => entry.id === folderEditingId) || null}
          onClose={() => {
            setFolderModalOpen(false);
            setFolderEditingId(null);
          }}
          onSave={(payload) => handleSaveFolder(payload, folderEditingId || undefined)}
          onDelete={folderEditingId ? () => handleDeleteFolder(folderEditingId) : undefined}
        />
      )}

      {settingsOpen && settingsDraft && (
        <SettingsModal
          user={user}
          draft={settingsDraft}
          saving={settingsSaving}
          onChange={setSettingsDraft}
          onClose={() => setSettingsOpen(false)}
          onSave={saveSettings}
          onLogout={logout}
          onAvatarUpload={uploadAvatar}
        />
      )}

      {profileOpen && profileData && (
        <ProfileModal
          profile={profileData}
          media={profileMedia}
          mediaTab={profileMediaTab}
          onMediaTabChange={(tab) => {
            reloadProfileMedia(tab, profileData.id).catch(() => undefined);
          }}
          onClose={() => setProfileOpen(false)}
        />
      )}

      {channelProfileOpen && channelProfile && (
        <ChannelProfileModal
          profile={channelProfile}
          currentUserId={user.id}
          media={channelMedia}
          mediaTab={channelMediaTab}
          onMediaTabChange={(tab) => {
            reloadChannelMedia(tab, channelProfile.id).catch(() => undefined);
          }}
          onSaveSlug={(slug) => saveChannelSlug(channelProfile.id, slug)}
          onCopyLink={(link) => {
            copyToClipboard(link, "Ссылка скопирована");
          }}
          onClose={() => setChannelProfileOpen(false)}
        />
      )}
    </div>
  );
}

function ComposeMenu({
  onClose,
  onNewMessage,
  onCreateGroup,
  onCreateChannel,
  onCreateFolder,
  canManageActiveFolder,
  onEditActiveFolder,
  onDeleteActiveFolder
}: {
  onClose: () => void;
  onNewMessage: () => void;
  onCreateGroup: () => void;
  onCreateChannel: () => void;
  onCreateFolder: () => void;
  canManageActiveFolder: boolean;
  onEditActiveFolder: () => void;
  onDeleteActiveFolder: () => void;
}) {
  const items: Array<{ key: string; label: string; icon: React.ReactNode; onClick: () => void }> = [
    { key: "new-message", label: "Новое сообщение", icon: <MessageCircle size={14} />, onClick: onNewMessage },
    { key: "new-group", label: "Создать группу", icon: <Users size={14} />, onClick: onCreateGroup },
    { key: "new-channel", label: "Создать канал", icon: <Radio size={14} />, onClick: onCreateChannel },
    { key: "new-folder", label: "Создать папку", icon: <FolderPlus size={14} />, onClick: onCreateFolder }
  ];

  return (
    <div className="compose-menu" role="menu" aria-label="Создать">
      <div className="compose-menu-title">Создать</div>
      {items.map((item) => (
        <button key={item.key} type="button" className="compose-menu-item" onClick={item.onClick} role="menuitem">
          {item.icon}
          <span>{item.label}</span>
        </button>
      ))}
      {canManageActiveFolder && (
        <>
          <button type="button" className="compose-menu-item" onClick={onEditActiveFolder}>
            <Pencil size={14} />
            <span>Изменить текущую папку</span>
          </button>
          <button type="button" className="compose-menu-item compose-menu-item-danger" onClick={onDeleteActiveFolder}>
            <X size={14} />
            <span>Удалить текущую папку</span>
          </button>
        </>
      )}
      <button type="button" className="compose-menu-item compose-menu-item-muted" onClick={onClose}>
        <X size={14} />
        <span>Закрыть</span>
      </button>
    </div>
  );
}

function FolderTabs({
  tabs,
  activeId,
  onSelect
}: {
  tabs: SidebarFolderTab[];
  activeId: SidebarFolderId;
  onSelect: (id: SidebarFolderId) => void;
}) {
  return (
    <div className="folder-tabs-wrap">
      <div className="folder-tabs" role="tablist" aria-label="Фильтры сообщений">
        {tabs.map((tab) => {
          const active = tab.id === activeId;
          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={active}
              className={`folder-tab ${active ? "folder-tab-active" : ""} ${tab.custom ? "folder-tab-custom" : ""}`}
              onClick={() => onSelect(tab.id)}
            >
              {tab.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function CreateFolderModal({
  mode,
  initialFolder,
  onClose,
  onSave,
  onDelete
}: {
  mode: "create" | "edit";
  initialFolder: SidebarCustomFolder | null;
  onClose: () => void;
  onSave: (payload: { name: string; filter: SidebarFolderFilter }) => void;
  onDelete?: () => void;
}) {
  const [name, setName] = useState(initialFolder?.name || "");
  const [filter, setFilter] = useState<SidebarFolderFilter>(initialFolder?.filter || DEFAULT_CUSTOM_FOLDER_FILTER);

  useEffect(() => {
    setName(initialFolder?.name || "");
    setFilter(initialFolder?.filter || DEFAULT_CUSTOM_FOLDER_FILTER);
  }, [initialFolder]);

  const toggleField = (field: keyof SidebarFolderFilter) => {
    setFilter((prev) => ({
      ...prev,
      [field]: !prev[field]
    }));
  };

  return (
    <div className="modal-backdrop">
      <div className="modal-card w-full max-w-md">
        <div className="flex items-center justify-between mb-5">
          <h3 className="modal-title">{mode === "edit" ? "Настроить папку" : "Создать папку"}</h3>
          <button onClick={onClose} className="btn btn-icon" title="Закрыть">
            <X size={18} />
          </button>
        </div>

        <label className="text-xs uppercase tracking-[0.14em] text-text-muted">Название папки</label>
        <input
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="Например: Работа"
          className="app-input mt-2"
          maxLength={32}
        />

        <div className="mt-5">
          <p className="text-xs uppercase tracking-[0.14em] text-text-muted mb-3">Показывать в папке</p>
          <div className="space-y-2">
            <label className="folder-check-row">
              <input type="checkbox" checked={filter.includeDirect} onChange={() => toggleField("includeDirect")} />
              <span>Личные чаты</span>
            </label>
            <label className="folder-check-row">
              <input type="checkbox" checked={filter.includeGroups} onChange={() => toggleField("includeGroups")} />
              <span>Группы</span>
            </label>
            <label className="folder-check-row">
              <input
                type="checkbox"
                checked={filter.includeChannels}
                onChange={() => toggleField("includeChannels")}
              />
              <span>Каналы</span>
            </label>
            <label className="folder-check-row">
              <input type="checkbox" checked={filter.unreadOnly} onChange={() => toggleField("unreadOnly")} />
              <span>Только непрочитанные</span>
            </label>
            <label className="folder-check-row">
              <input
                type="checkbox"
                checked={filter.includeArchived}
                onChange={() => toggleField("includeArchived")}
              />
              <span>Включать архив</span>
            </label>
          </div>
        </div>

        <div className="mt-6 flex items-center justify-end gap-2">
          {mode === "edit" && onDelete && (
            <button onClick={onDelete} className="btn btn-danger mr-auto">
              Удалить папку
            </button>
          )}
          <button onClick={onClose} className="btn btn-secondary">Отмена</button>
          <button
            onClick={() => onSave({ name, filter })}
            className="btn btn-primary"
            disabled={!name.trim()}
          >
            {mode === "edit" ? "Обновить" : "Сохранить"}
          </button>
        </div>
      </div>
    </div>
  );
}

function ToastViewport({
  toasts,
  onDismiss
}: {
  toasts: ToastData[];
  onDismiss: (id: string) => void;
}) {
  if (toasts.length === 0) {
    return null;
  }

  return (
    <div className="toast-stack">
      {toasts.map((toast) => (
        <div key={toast.id} className={`toast-item toast-${toast.kind}`}>
          <p className="toast-text">{toast.text}</p>
          <button className="toast-close" onClick={() => onDismiss(toast.id)} aria-label="Закрыть уведомление">
            <X size={14} />
          </button>
        </div>
      ))}
    </div>
  );
}

function MessageBubble({
  message,
  own,
  bubbleStyle,
  fontScale,
  isChannel,
  onOpenMedia
}: {
  message: MessageData;
  own: boolean;
  bubbleStyle: ChatBubbleStyle;
  fontScale: number;
  isChannel: boolean;
  onOpenMedia: (media: MediaViewerData) => void;
}) {
  const [playing, setPlaying] = useState(false);
  const audioRef = useRef<HTMLAudioElement>(null);

  const togglePlayback = () => {
    const audio = audioRef.current;
    if (!audio) return;

    if (playing) {
      audio.pause();
    } else {
      audio.play().catch(() => undefined);
    }
    setPlaying((prev) => !prev);
  };

  const deliveryMark = own
    ? message.readAt
      ? "✓✓"
      : message.deliveredAt
        ? "✓✓"
        : "✓"
    : "";

  const effectiveFontScale =
    bubbleStyle === "compact"
      ? Math.max(70, Math.round(fontScale * 0.86))
      : bubbleStyle === "rounded"
        ? Math.max(80, Math.round(fontScale * 0.94))
        : fontScale;

  const attachments = useMemo<AttachmentRenderItem[]>(() => {
    const output: AttachmentRenderItem[] = [];
    const seen = new Set<string>();

    const pushAttachment = (entry: {
      id: string;
      url: string;
      fileName: string;
      mimeType: string;
      fallbackType?: MessageData["type"];
    }) => {
      const url = String(entry.url || "").trim();
      if (!url) return;
      const fileName = String(entry.fileName || "").trim() || "Файл";
      const key = `${url}|${fileName}`.toLowerCase();
      if (seen.has(key)) return;
      seen.add(key);

      output.push({
        id: String(entry.id || key),
        url,
        fileName,
        mimeType: String(entry.mimeType || "").trim(),
        kind: detectAttachmentKind(entry.mimeType, fileName, url, entry.fallbackType)
      });
    };

    for (const attachment of message.attachments || []) {
      pushAttachment({
        id: attachment.id,
        url: attachment.publicUrl,
        fileName: attachment.fileName,
        mimeType: attachment.mimeType,
        fallbackType: message.type
      });
    }

    if (message.fileUrl) {
      pushAttachment({
        id: `${message.id}:legacy`,
        url: message.fileUrl,
        fileName: message.fileName || "Файл",
        mimeType: "",
        fallbackType: message.type
      });
    }

    return output;
  }, [message]);

  const voiceAttachment = attachments.find((entry) => entry.kind === "audio");
  const voiceUrl = message.type === "voice" ? message.fileUrl || voiceAttachment?.url || "" : "";
  const hasVisualAttachment = attachments.some(
    (entry) => entry.kind === "image" || entry.kind === "gif" || entry.kind === "video"
  );
  const textContent = String(message.content || "").trim();
  const isMediaBubble = hasVisualAttachment && message.type !== "voice";
  const showOverlayMeta = isMediaBubble && !textContent;
  const messageTime = new Date(message.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  const messageMetaLabel = `${messageTime}${deliveryMark ? ` · ${deliveryMark}` : ""}`;
  const channelPrefix = isChannel && !own ? `sender: ${message.senderId.slice(0, 8)}... · ` : "";
  const bubbleClasses = isMediaBubble
    ? `message-media-bubble ${own ? "message-media-bubble-sent" : "message-media-bubble-received"}`
    : `${bubbleClass(bubbleStyle, own)} message-bubble-shadow`;

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className={`message-row ${own ? "items-end" : "items-start"}`}
    >
      <div className={bubbleClasses} style={{ fontSize: `${effectiveFontScale}%` }}>
        {!isMediaBubble && textContent ? <p className="leading-relaxed whitespace-pre-wrap">{textContent}</p> : null}

        {message.type === "voice" && voiceUrl && (
          <div className="flex items-center gap-3 min-w-[220px]">
            <button onClick={togglePlayback} className="btn btn-icon !w-9 !h-9 message-voice-btn">
              {playing ? <Pause size={15} /> : <Play size={15} />}
            </button>
            <div className="voice-wave" />
            <audio ref={audioRef} src={voiceUrl} onEnded={() => setPlaying(false)} className="hidden" />
          </div>
        )}

        {attachments.length > 0 && (
          <div className={isMediaBubble ? "message-media-attachments" : "message-attachments-list"}>
            {attachments.map((attachment) => {
              if (message.type === "voice" && attachment.kind === "audio") {
                return null;
              }

              if (attachment.kind === "image" || attachment.kind === "gif") {
                return (
                  <button
                    key={attachment.id}
                    type="button"
                    className="message-media-button"
                    onClick={() => onOpenMedia({ url: attachment.url, fileName: attachment.fileName, kind: attachment.kind })}
                  >
                    <img src={attachment.url} alt={attachment.fileName} className="message-media-thumb" loading="lazy" />
                    {attachment.kind === "gif" ? <span className="message-gif-badge">GIF</span> : null}
                  </button>
                );
              }

              if (attachment.kind === "video") {
                return (
                  <video
                    key={attachment.id}
                    src={attachment.url}
                    controls
                    preload="metadata"
                    className="message-video-preview"
                  />
                );
              }

              if (attachment.kind === "audio") {
                return (
                  <audio key={attachment.id} src={attachment.url} controls preload="metadata" className="message-audio-preview" />
                );
              }

              return (
                <a key={attachment.id} href={attachment.url} target="_blank" rel="noreferrer" className="message-file-link">
                  <File size={16} className="shrink-0" />
                  <span className="truncate max-w-64">{attachment.fileName || "Файл"}</span>
                </a>
              );
            })}
          </div>
        )}

        {isMediaBubble && textContent ? <p className="message-media-caption">{textContent}</p> : null}

        {isMediaBubble && !showOverlayMeta ? (
          <span className="message-media-meta-line">
            {channelPrefix}
            {messageMetaLabel}
          </span>
        ) : null}
        {showOverlayMeta ? <span className="message-media-meta-pill">{messageMetaLabel}</span> : null}
      </div>

      {!isMediaBubble && (
        <span className="message-meta mt-1 px-1">
          {channelPrefix}
          {messageMetaLabel}
        </span>
      )}
    </motion.div>
  );
}

function ChatInput({
  target,
  senderId,
  token,
  conversationId
}: {
  target: ChatTarget;
  senderId: string;
  token: string;
  conversationId?: string;
}) {
  const [text, setText] = useState("");
  const [recording, setRecording] = useState(false);
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [gifPanelOpen, setGifPanelOpen] = useState(false);
  const [gifQuery, setGifQuery] = useState("");
  const [gifLoading, setGifLoading] = useState(false);
  const [gifItems, setGifItems] = useState<MediaAttachment[]>([]);
  const [gifError, setGifError] = useState("");

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const toolsRef = useRef<HTMLDivElement>(null);
  const gifUploadRef = useRef<HTMLInputElement>(null);
  const mediaRecorder = useRef<MediaRecorder | null>(null);
  const audioChunks = useRef<Blob[]>([]);

  const sendPayload = (payload: {
    type: "text" | "file" | "voice";
    content?: string;
    fileUrl?: string;
    fileName?: string;
    attachmentId?: string;
  }) => {
    if (target.kind === "user") {
      const eventPayload = {
        conversationId,
        senderId,
        receiverId: target.value.id,
        ...payload
      };
      socket.emit("dialog:send-message", eventPayload);
      return;
    }

    socket.emit("send_channel_message", {
      senderId,
      channelId: target.value.id,
      ...payload
    });
  };

  const sendText = () => {
    const value = text.trim();
    if (!value) return;

    sendPayload({ type: "text", content: value });
    setText("");
  };

  const sendUploadedAttachment = async (file: File) => {
    const formData = new FormData();
    formData.append("file", file);

    const response = await fetch("/api/upload", {
      method: "POST",
      headers: headersWithAuth(token),
      body: formData
    });

    const result = await response.json();
    if (!response.ok) return;

    sendPayload({
      type: "file",
      content: "",
      fileUrl: result.fileUrl,
      fileName: result.fileName,
      attachmentId: result.attachmentId
    });
  };

  const uploadFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    await sendUploadedAttachment(file);
    event.target.value = "";
  };

  const uploadGifFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const isGif = file.type.toLowerCase() === "image/gif" || file.name.toLowerCase().endsWith(".gif");
    if (!isGif) {
      setGifError("Загрузите GIF в формате .gif");
      event.target.value = "";
      return;
    }

    await sendUploadedAttachment(file);
    setGifPanelOpen(false);
    setGifQuery("");
    setGifError("");
    event.target.value = "";
  };

  const startVoice = async () => {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const recorder = new MediaRecorder(stream);

    mediaRecorder.current = recorder;
    audioChunks.current = [];

    recorder.ondataavailable = (event) => {
      audioChunks.current.push(event.data);
    };

    recorder.onstop = async () => {
      const audioBlob = new Blob(audioChunks.current, { type: "audio/webm" });
      const file = new File([audioBlob], "voice-message.webm", { type: "audio/webm" });
      const formData = new FormData();
      formData.append("file", file);

      const response = await fetch("/api/upload", {
        method: "POST",
        headers: headersWithAuth(token),
        body: formData
      });

      const result = await response.json();
      if (response.ok) {
        sendPayload({
          type: "voice",
          content: "",
          fileUrl: result.fileUrl,
          fileName: "Голосовое сообщение",
          attachmentId: result.attachmentId
        });
      }

      stream.getTracks().forEach((track) => track.stop());
    };

    recorder.start();
    setRecording(true);
  };

  const stopVoice = () => {
    if (!mediaRecorder.current || !recording) return;

    mediaRecorder.current.stop();
    setRecording(false);
  };

  const insertEmoji = (emoji: string) => {
    const input = textareaRef.current;
    const start = input?.selectionStart ?? text.length;
    const end = input?.selectionEnd ?? text.length;
    const nextText = `${text.slice(0, start)}${emoji}${text.slice(end)}`;
    const caret = start + emoji.length;
    setText(nextText);
    window.requestAnimationFrame(() => {
      const targetInput = textareaRef.current;
      if (!targetInput) return;
      targetInput.focus();
      targetInput.setSelectionRange(caret, caret);
    });
  };

  const sendGif = (gif: MediaAttachment) => {
    sendPayload({
      type: "file",
      content: "",
      fileUrl: gif.publicUrl,
      fileName: gif.fileName,
      attachmentId: gif.id
    });
    setGifPanelOpen(false);
    setGifQuery("");
    setGifError("");
  };

  useEffect(() => {
    if (!gifPanelOpen) return;

    const timer = window.setTimeout(async () => {
      try {
        setGifLoading(true);
        const query = gifQuery.trim();
        const response = await fetch(`/api/gifs?limit=36&query=${encodeURIComponent(query)}`, {
          headers: headersWithAuth(token)
        });
        const result = await response.json();
        if (!response.ok) {
          setGifError(result.error || "Не удалось загрузить GIF");
          return;
        }
        const items = Array.isArray(result.items)
          ? result.items
              .map((entry) => normalizeMediaAttachment(entry))
              .filter((entry): entry is MediaAttachment => Boolean(entry))
              .filter((entry) => detectAttachmentKind(entry.mimeType, entry.fileName, entry.publicUrl) === "gif")
          : [];
        setGifItems(items);
        setGifError("");
      } catch {
        setGifError("Не удалось загрузить GIF");
      } finally {
        setGifLoading(false);
      }
    }, 220);

    return () => {
      window.clearTimeout(timer);
    };
  }, [gifPanelOpen, gifQuery, token]);

  useEffect(() => {
    if (!emojiOpen && !gifPanelOpen) return;

    const onMouseDown = (event: MouseEvent) => {
      if (!toolsRef.current) return;
      if (!toolsRef.current.contains(event.target as Node)) {
        setEmojiOpen(false);
        setGifPanelOpen(false);
      }
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setEmojiOpen(false);
        setGifPanelOpen(false);
      }
    };

    document.addEventListener("mousedown", onMouseDown);
    document.addEventListener("keydown", onKeyDown);

    return () => {
      document.removeEventListener("mousedown", onMouseDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [emojiOpen, gifPanelOpen]);

  return (
    <div className="chat-input-wrap">
      <div className="chat-input-inner">
        <div className="chat-input-shell">
          <div className="chat-input-tools" ref={toolsRef}>
            <button
              type="button"
              className={`btn btn-icon chat-input-icon ${emojiOpen ? "chat-input-icon-active" : ""}`}
              title="Смайлики"
              onClick={() => {
                setEmojiOpen((prev) => !prev);
                setGifPanelOpen(false);
              }}
            >
              <Smile size={18} />
            </button>
            <button
              type="button"
              className={`chat-gif-toggle ${gifPanelOpen ? "chat-gif-toggle-active" : ""}`}
              title="GIF"
              onClick={() => {
                setGifPanelOpen((prev) => !prev);
                setEmojiOpen(false);
              }}
            >
              <Image size={14} />
              GIF
            </button>
            <label className="btn btn-icon chat-input-icon" title="Прикрепить файл">
              <Paperclip size={18} />
              <input type="file" className="hidden" onChange={uploadFile} />
            </label>

            {emojiOpen && (
              <div className="composer-popup emoji-picker-panel">
                {EMOJI_SETS.map((group) => (
                  <div key={group.title} className="emoji-section">
                    <p className="emoji-section-title">{group.title}</p>
                    <div className="emoji-grid">
                      {group.values.map((emoji) => (
                        <button key={emoji} type="button" className="emoji-cell" onClick={() => insertEmoji(emoji)}>
                          {emoji}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {gifPanelOpen && (
              <div className="composer-popup gif-picker-panel">
                <div className="gif-picker-head">
                  <input
                    value={gifQuery}
                    onChange={(event) => setGifQuery(event.target.value)}
                    placeholder="Поиск по вашим GIF..."
                    className="gif-picker-search"
                  />
                  <button type="button" className="btn btn-secondary btn-xs" onClick={() => gifUploadRef.current?.click()}>
                    Загрузить GIF
                  </button>
                  <input ref={gifUploadRef} type="file" accept="image/gif" className="hidden" onChange={uploadGifFile} />
                </div>

                {gifLoading ? <p className="gif-picker-empty">Загружаем GIF...</p> : null}
                {!gifLoading && gifError ? <p className="gif-picker-error">{gifError}</p> : null}
                {!gifLoading && !gifError && gifItems.length === 0 ? (
                  <p className="gif-picker-empty">Пока нет GIF. Загрузите первую.</p>
                ) : null}

                {!gifLoading && gifItems.length > 0 && (
                  <div className="gif-picker-grid">
                    {gifItems.map((gif) => (
                      <button key={gif.id} type="button" className="gif-picker-item" onClick={() => sendGif(gif)}>
                        <img src={gif.publicUrl} alt={gif.fileName} loading="lazy" />
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {recording ? (
            <div className="flex-1 py-3 px-2 flex items-center justify-between text-red-300">
              <span className="text-sm font-medium">Recording voice message...</span>
              <button onClick={stopVoice} className="btn btn-icon text-red-200 hover:text-white">
                <X size={18} />
              </button>
            </div>
          ) : (
            <textarea
              ref={textareaRef}
              rows={1}
              value={text}
              onChange={(event) => setText(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  sendText();
                }
              }}
              placeholder={
                target.kind === "group"
                  ? "Message the group..."
                  : target.kind === "channel"
                    ? "Post to channel..."
                    : "Message your friend..."
              }
              className="chat-input-textarea"
            />
          )}
        </div>

        {text.trim() ? (
          <button onClick={sendText} className="btn btn-primary btn-circle" title="Send message">
            <Send size={18} />
          </button>
        ) : (
          <button
            onMouseDown={() => startVoice().catch(() => undefined)}
            onMouseUp={stopVoice}
            className={`btn btn-circle ${recording ? "btn-danger" : "btn-primary"}`}
            title={recording ? "Stop recording" : "Hold to record voice"}
          >
            <Mic size={18} />
          </button>
        )}
      </div>
    </div>
  );
}

function MediaViewerModal({ media, onClose }: { media: MediaViewerData | null; onClose: () => void }) {
  useEffect(() => {
    if (!media) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };

    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [media, onClose]);

  if (!media) {
    return null;
  }

  return (
    <div className="media-viewer-backdrop" onClick={onClose}>
      <div className="media-viewer-card" onClick={(event) => event.stopPropagation()}>
        <button className="media-viewer-close" onClick={onClose} aria-label="Закрыть просмотр">
          <X size={18} />
        </button>
        <img src={media.url} alt={media.fileName} className="media-viewer-image" />
        <p className="media-viewer-caption">
          {media.kind === "gif" ? "GIF · " : ""}
          {media.fileName}
        </p>
      </div>
    </div>
  );
}

function formatCallTime(totalSec: number): string {
  const minutes = Math.floor(totalSec / 60)
    .toString()
    .padStart(2, "0");
  const seconds = (totalSec % 60).toString().padStart(2, "0");
  return `${minutes}:${seconds}`;
}

function VoiceCallPanel({
  state,
  peer,
  muted,
  elapsedSec,
  collapsed,
  onAccept,
  onReject,
  onEnd,
  onToggleCollapse,
  onToggleMute
}: {
  state: CallState;
  peer: PublicUser | null;
  muted: boolean;
  elapsedSec: number;
  collapsed: boolean;
  onAccept: () => void;
  onReject: () => void;
  onEnd: () => void;
  onToggleCollapse: () => void;
  onToggleMute: () => void;
}) {
  if (state === "idle" || !peer) {
    return null;
  }

  const title =
    state === "incoming"
      ? "Входящий голосовой звонок"
      : state === "calling"
        ? "Вызов..."
        : state === "ringing"
          ? "Идут гудки..."
        : state === "connecting"
          ? "Подключение..."
          : `Разговор ${formatCallTime(elapsedSec)}`;

  const isConnected = state === "connected";

  if (isConnected) {
    return (
      <AnimatePresence>
        {collapsed ? (
          <motion.button
            key="call-handle"
            initial={{ opacity: 0, x: 26 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 26 }}
            onClick={onToggleCollapse}
            className="call-collapsed-handle"
            title="Развернуть панель звонка"
          >
            <PhoneCall size={15} />
            <span>Звонок {formatCallTime(elapsedSec)}</span>
            <ChevronDown size={14} className="rotate-90" />
          </motion.button>
        ) : (
          <motion.div
            key="call-floating"
            initial={{ opacity: 0, y: 16, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 18, scale: 0.96 }}
            className="call-floating-panel call-panel"
          >
            <div className="call-floating-head">
              <div className="call-floating-peer">
                <div className="call-avatar-surface w-10 h-10 rounded-xl overflow-hidden flex items-center justify-center">
                  {peer.avatarUrl ? (
                    <img src={peer.avatarUrl} alt={peer.displayName} className="w-full h-full object-cover" />
                  ) : (
                    <span className="text-sm font-semibold">{avatarFallback(peer.displayName)}</span>
                  )}
                </div>
                <div className="min-w-0">
                  <p className="call-floating-name">{peer.displayName}</p>
                  <p className="call-floating-status">{title}</p>
                </div>
              </div>
              <button onClick={onToggleCollapse} className="btn btn-icon btn-xs" title="Свернуть">
                <ChevronDown size={14} />
              </button>
            </div>

            <div className="call-floating-actions">
              <button
                onClick={onToggleMute}
                className={`btn ${muted ? "btn-warning" : "btn-secondary"} call-floating-action-btn`}
                title={muted ? "Включить микрофон" : "Выключить микрофон"}
              >
                {muted ? <MicOff size={15} /> : <Mic size={15} />}
                {muted ? "Unmute" : "Mute"}
              </button>
              <button onClick={onEnd} className="btn btn-danger call-floating-action-btn" title="Завершить звонок">
                <PhoneOff size={15} />
                End
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    );
  }

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="call-overlay"
      >
        <motion.div
          initial={{ opacity: 0, y: 22, scale: 0.96 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 20, scale: 0.95 }}
          className="call-panel call-panel-modal"
        >
          <div className="call-panel-head">
            <p className="call-panel-label">Nexli Voice Call</p>
            <p className="call-panel-status">{title}</p>
          </div>

          <div className="call-panel-main">
            <div className="call-avatar-ring call-avatar-surface call-avatar-large">
              {peer.avatarUrl ? (
                <img src={peer.avatarUrl} alt={peer.displayName} className="w-full h-full object-cover" />
              ) : (
                <span className="text-3xl font-semibold">{avatarFallback(peer.displayName)}</span>
              )}
            </div>
            <div className="text-center">
              <p className="call-peer-name">{peer.displayName}</p>
              <p className="call-peer-username">@{peer.username}</p>
            </div>
          </div>

          <div className="call-panel-actions">
            {state === "incoming" ? (
              <>
                <button onClick={onReject} className="btn btn-danger call-action-btn" title="Отклонить звонок">
                  <PhoneOff size={18} />
                  Отклонить
                </button>
                <button onClick={onAccept} className="btn btn-success call-action-btn" title="Принять звонок">
                  <Phone size={18} />
                  Принять
                </button>
              </>
            ) : (
              <>
                <button
                  onClick={onToggleMute}
                  className={`btn call-action-btn ${muted ? "btn-warning" : "btn-secondary"}`}
                  title={muted ? "Включить микрофон" : "Выключить микрофон"}
                >
                  {muted ? <MicOff size={17} /> : <Mic size={17} />}
                  {muted ? "Включить микрофон" : "Выключить микрофон"}
                </button>
                <button onClick={onEnd} className="btn btn-danger call-action-btn" title="Завершить звонок">
                  <PhoneOff size={18} />
                  Завершить
                </button>
              </>
            )}
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}

function SettingsModal({
  user,
  draft,
  saving,
  onChange,
  onClose,
  onSave,
  onLogout,
  onAvatarUpload
}: {
  user: UserData;
  draft: SettingsDraft;
  saving: boolean;
  onChange: (next: SettingsDraft) => void;
  onClose: () => void;
  onSave: () => void;
  onLogout: () => void;
  onAvatarUpload: (event: React.ChangeEvent<HTMLInputElement>) => void;
}) {
  const [accentColor, setAccentColor] = useState("#5a8dff");
  const [bubbleShadowEnabled, setBubbleShadowEnabled] = useState(true);
  const [compactListEnabled, setCompactListEnabled] = useState(false);
  const [animationsEnabled, setAnimationsEnabled] = useState(true);

  const themePresets = [
    {
      id: "night",
      title: "Night",
      subtitle: "Telegram dark",
      theme: "dark" as Theme,
      wallpaper: "gradient" as ChatWallpaper,
      bubbleStyle: "modern" as ChatBubbleStyle
    },
    {
      id: "tinted",
      title: "Tinted",
      subtitle: "Мягкий контраст",
      theme: "dark" as Theme,
      wallpaper: "mesh" as ChatWallpaper,
      bubbleStyle: "rounded" as ChatBubbleStyle
    },
    {
      id: "classic",
      title: "Classic",
      subtitle: "Чистый минимализм",
      theme: "dark" as Theme,
      wallpaper: "plain" as ChatWallpaper,
      bubbleStyle: "compact" as ChatBubbleStyle
    },
    {
      id: "day",
      title: "Day",
      subtitle: "Светлая тема",
      theme: "light" as Theme,
      wallpaper: "plain" as ChatWallpaper,
      bubbleStyle: "modern" as ChatBubbleStyle
    }
  ];

  const activePresetId =
    themePresets.find(
      (preset) =>
        preset.theme === draft.theme &&
        preset.wallpaper === draft.chatWallpaper &&
        preset.bubbleStyle === draft.chatBubbleStyle
    )?.id || null;

  const wallpaperOptions: Array<{ value: ChatWallpaper; label: string; description: string }> = [
    { value: "gradient", label: "Градиент", description: "Глубокий плавный фон" },
    { value: "mesh", label: "Сетка", description: "Лёгкий паттерн поверх тёмного слоя" },
    { value: "plain", label: "Однотонный", description: "Спокойный чистый background" }
  ];

  const bubbleOptions: Array<{ value: ChatBubbleStyle; label: string }> = [
    { value: "modern", label: "Современный" },
    { value: "rounded", label: "Округлый" },
    { value: "compact", label: "Компактный" }
  ];

  const accentPalette = ["#5a8dff", "#6b7dff", "#4cb4ff", "#2dd4bf", "#8b7bff", "#ff7ab6", "#ff9f6b"];

  const previewBackgroundClass =
    draft.chatWallpaper === "gradient"
      ? "settings-preview-bg-gradient"
      : draft.chatWallpaper === "mesh"
        ? "settings-preview-bg-mesh"
        : "settings-preview-bg-plain";

  const previewOutgoingClass =
    draft.chatBubbleStyle === "compact"
      ? "settings-preview-bubble-out settings-preview-bubble-compact"
      : draft.chatBubbleStyle === "rounded"
        ? "settings-preview-bubble-out settings-preview-bubble-rounded"
        : "settings-preview-bubble-out";

  const previewIncomingClass =
    draft.chatBubbleStyle === "compact"
      ? "settings-preview-bubble-in settings-preview-bubble-compact"
      : draft.chatBubbleStyle === "rounded"
        ? "settings-preview-bubble-in settings-preview-bubble-rounded"
        : "settings-preview-bubble-in";
  const previewThemeClass = draft.theme === "light" ? "settings-preview-theme-light" : "settings-preview-theme-dark";

  return (
    <div className="modal-backdrop">
      <div className="modal-card settings-modal-shell w-full max-w-4xl max-h-[92vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-5">
          <h3 className="modal-title">Настройки профиля и чата</h3>
          <button onClick={onClose} className="btn btn-icon" title="Закрыть">
            <X size={18} />
          </button>
        </div>

        <div className="settings-layout">
          <section className="settings-section">
            <div className="settings-section-head">
              <p className="settings-section-title">Профиль</p>
              <p className="settings-section-subtitle">Базовые данные аккаунта</p>
            </div>

            <div className="flex items-center gap-4 mb-4">
              <div className="avatar avatar-lg profile-avatar">
                {user.avatarUrl ? (
                  <img src={user.avatarUrl} alt={user.displayName} className="w-full h-full object-cover" />
                ) : (
                  <span className="avatar-fallback text-lg">{avatarFallback(user.displayName)}</span>
                )}
              </div>
              <label className="btn btn-secondary cursor-pointer">
                <Paperclip size={14} />
                Сменить аватар
                <input type="file" className="hidden" accept="image/*" onChange={onAvatarUpload} />
              </label>
            </div>

            <div className="settings-field-grid">
              <input
                value={draft.displayName}
                onChange={(e) => onChange({ ...draft, displayName: e.target.value })}
                placeholder="Имя профиля"
                className="app-input"
              />
              <input
                value={draft.username}
                onChange={(e) => onChange({ ...draft, username: e.target.value })}
                placeholder="Логин"
                className="app-input"
              />
              <input
                value={draft.email}
                onChange={(e) => onChange({ ...draft, email: e.target.value })}
                placeholder="Почта"
                className="app-input md:col-span-2"
              />
              <textarea
                value={draft.bio}
                onChange={(e) => onChange({ ...draft, bio: e.target.value })}
                placeholder="Описание профиля"
                rows={3}
                className="app-textarea md:col-span-2"
              />
            </div>
          </section>

          <section className="settings-section">
            <div className="settings-section-head">
              <p className="settings-section-title">Theme</p>
              <p className="settings-section-subtitle">Готовые Telegram-style пресеты</p>
            </div>

            <div className="settings-theme-grid">
              {themePresets.map((preset) => (
                <button
                  key={preset.id}
                  onClick={() =>
                    onChange({
                      ...draft,
                      theme: preset.theme,
                      chatWallpaper: preset.wallpaper,
                      chatBubbleStyle: preset.bubbleStyle
                    })
                  }
                  className={`settings-theme-card ${activePresetId === preset.id ? "settings-theme-card-active" : ""}`}
                >
                  <div className={`settings-theme-preview settings-theme-preview-${preset.id}`} />
                  <div className="settings-theme-meta">
                    <p>{preset.title}</p>
                    <span>{preset.subtitle}</span>
                  </div>
                  {activePresetId === preset.id && <Check size={14} className="settings-theme-check" />}
                </button>
              ))}
            </div>
          </section>

          <section className="settings-section">
            <div className="settings-section-head">
              <p className="settings-section-title">Colors</p>
              <p className="settings-section-subtitle">Акцент и цвет исходящих сообщений</p>
            </div>

            <div className="settings-swatches-row">
              {accentPalette.map((color) => (
                <button
                  key={color}
                  className={`settings-swatch ${accentColor === color ? "settings-swatch-active" : ""}`}
                  style={{ background: color }}
                  onClick={() => setAccentColor(color)}
                  title={`Accent ${color}`}
                />
              ))}
            </div>
          </section>

          <section className="settings-section">
            <div className="settings-section-head">
              <p className="settings-section-title">Messages</p>
              <p className="settings-section-subtitle">Стиль пузырей и читаемость</p>
            </div>

            <SegmentedControl
              value={draft.chatBubbleStyle}
              options={bubbleOptions}
              onChange={(value) => onChange({ ...draft, chatBubbleStyle: value as ChatBubbleStyle })}
            />

            <div className="settings-slider-wrap">
              <div className="settings-slider-head">
                <span>Размер текста сообщений</span>
                <span>{draft.messageFontScale}%</span>
              </div>
              <input
                type="range"
                min={85}
                max={120}
                step={1}
                value={draft.messageFontScale}
                onChange={(event) =>
                  onChange({
                    ...draft,
                    messageFontScale: normalizeMessageFontScale(event.target.value)
                  })
                }
                className="settings-slider"
              />
            </div>
          </section>

          <section className="settings-section">
            <div className="settings-section-head">
              <p className="settings-section-title">Chat Background</p>
              <p className="settings-section-subtitle">Кастомный dropdown вместо native select</p>
            </div>

            <SettingsSelect
              value={draft.chatWallpaper}
              options={wallpaperOptions}
              onChange={(value) => onChange({ ...draft, chatWallpaper: value as ChatWallpaper })}
            />
          </section>

          <section className="settings-section">
            <div className="settings-section-head">
              <p className="settings-section-title">Interface</p>
              <p className="settings-section-subtitle">Микро-поведение и визуальная плотность</p>
            </div>

            <div className="settings-switch-list">
              <SettingsSwitch
                checked={animationsEnabled}
                label="Плавные анимации интерфейса"
                onChange={setAnimationsEnabled}
              />
              <SettingsSwitch
                checked={compactListEnabled}
                label="Компактный список чатов"
                onChange={setCompactListEnabled}
              />
              <SettingsSwitch
                checked={bubbleShadowEnabled}
                label="Тени у message bubbles"
                onChange={setBubbleShadowEnabled}
              />
            </div>
          </section>

          <section className="settings-section">
            <div className="settings-section-head">
              <p className="settings-section-title">Preview</p>
              <p className="settings-section-subtitle">Живой предпросмотр применённых параметров</p>
            </div>

            <div className={`settings-preview-card ${previewBackgroundClass} ${previewThemeClass}`}>
              <div className="settings-preview-topbar">
                <div className="flex items-center gap-2">
                  <span className="settings-preview-dot" />
                  <p>Telegram-like Preview</p>
                </div>
                <SlidersHorizontal size={14} />
              </div>

              <div className="settings-preview-messages" style={{ fontSize: `${draft.messageFontScale}%` }}>
                {compactListEnabled ? null : (
                  <div className="settings-preview-author">
                    <span className="avatar avatar-sm">
                      <span className="avatar-fallback">A</span>
                    </span>
                    <span>Alex</span>
                  </div>
                )}
                <div className={`${previewIncomingClass} ${bubbleShadowEnabled ? "settings-preview-shadow" : ""}`}>
                  Привет! Проверяем новый стиль настроек.
                </div>
                <div
                  className={`${previewOutgoingClass} ${bubbleShadowEnabled ? "settings-preview-shadow" : ""}`}
                  style={{ background: accentColor }}
                >
                  Да, теперь всё выглядит как premium dark messenger.
                </div>
                <p className="settings-preview-meta">
                  {draft.theme === "dark" ? "Night mode" : "Day mode"} · {draft.chatBubbleStyle}
                  {animationsEnabled ? " · animations on" : " · animations off"}
                </p>
              </div>
            </div>
          </section>
        </div>

        <div className="mt-6 flex justify-end gap-2 settings-footer">
          <button onClick={onClose} className="btn btn-secondary">Отмена</button>
          <button onClick={onSave} disabled={saving} className="btn btn-primary disabled:opacity-60">
            {saving ? "Сохраняем..." : "Сохранить"}
          </button>
        </div>

        <div className="settings-danger-zone">
          <p className="settings-danger-title">Аккаунт</p>
          <button onClick={onLogout} className="btn btn-danger settings-logout-btn" title="Выйти из аккаунта">
            <LogOut size={15} />
            Выйти из аккаунта
          </button>
        </div>
      </div>
    </div>
  );
}

function SegmentedControl({
  value,
  options,
  onChange
}: {
  value: string;
  options: Array<{ value: string; label: string }>;
  onChange: (value: string) => void;
}) {
  return (
    <div className="settings-segmented" role="tablist">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          role="tab"
          aria-selected={value === option.value}
          className={`settings-segmented-item ${value === option.value ? "settings-segmented-item-active" : ""}`}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

function SettingsSelect({
  value,
  options,
  onChange
}: {
  value: string;
  options: Array<{ value: string; label: string; description?: string }>;
  onChange: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const selectRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handleOutsideClick = (event: MouseEvent) => {
      const target = event.target as Node | null;
      if (target && selectRef.current && !selectRef.current.contains(target)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handleOutsideClick);
    return () => document.removeEventListener("mousedown", handleOutsideClick);
  }, [open]);

  const selected = options.find((option) => option.value === value) || options[0];

  return (
    <div className="settings-select" ref={selectRef}>
      <button type="button" className="settings-select-trigger" onClick={() => setOpen((prev) => !prev)}>
        <div className="settings-select-value">
          <Palette size={14} />
          <div>
            <p>{selected?.label}</p>
            {selected?.description ? <span>{selected.description}</span> : null}
          </div>
        </div>
        <ChevronDown size={14} className={`settings-select-chevron ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div className="settings-select-menu">
          {options.map((option) => (
            <button
              key={option.value}
              type="button"
              className={`settings-select-option ${option.value === value ? "settings-select-option-active" : ""}`}
              onClick={() => {
                onChange(option.value);
                setOpen(false);
              }}
            >
              <div>
                <p>{option.label}</p>
                {option.description ? <span>{option.description}</span> : null}
              </div>
              {option.value === value ? <Check size={13} /> : null}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function SettingsSwitch({
  checked,
  label,
  onChange
}: {
  checked: boolean;
  label: string;
  onChange: (value: boolean) => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      className="settings-switch-row"
      onClick={() => onChange(!checked)}
    >
      <span>{label}</span>
      <span className={`settings-switch ${checked ? "settings-switch-on" : ""}`}>
        <span className="settings-switch-thumb" />
      </span>
    </button>
  );
}

function ProfileModal({
  profile,
  media,
  mediaTab,
  onMediaTabChange,
  onClose
}: {
  profile: ProfileData;
  media: MediaPanelData;
  mediaTab: "media" | "files" | "links" | "audio";
  onMediaTabChange: (tab: "media" | "files" | "links" | "audio") => void;
  onClose: () => void;
}) {
  const tabItems = media.items || [];
  const bioText = String(profile.bio || "").trim();

  return (
    <div className="modal-backdrop">
      <div className="modal-card w-full max-w-2xl max-h-[92vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <h3 className="modal-title">Профиль пользователя</h3>
          <button onClick={onClose} className="btn btn-icon" title="Закрыть">
            <X size={18} />
          </button>
        </div>

        <div className="flex items-center gap-3 mb-3">
          <div className="avatar avatar-lg profile-avatar">
            {profile.avatarUrl ? (
              <img src={profile.avatarUrl} alt={profile.displayName} className="w-full h-full object-cover" />
            ) : (
              <span className="avatar-fallback">{avatarFallback(profile.displayName)}</span>
            )}
          </div>
          <div>
            <p className="text-base font-semibold tracking-tight">{profile.displayName}</p>
            <p className="text-sm text-text-secondary">@{profile.username} · #{profile.uniqueId}</p>
          </div>
        </div>

        {bioText ? <p className="profile-info-card">{bioText}</p> : null}
        {profile.email && <p className="text-sm mt-3 text-text-secondary">Почта: {profile.email}</p>}
        <p className="text-xs mt-2 text-text-secondary/70">Создан: {new Date(profile.createdAt).toLocaleDateString()}</p>
        {typeof profile.mediaCount === "number" && (
          <p className="text-xs mt-1 text-text-secondary/70">Медиа в диалоге: {profile.mediaCount}</p>
        )}

        {profile.usernameHistory && profile.usernameHistory.length > 0 && (
          <div className="profile-history-card">
            <p className="profile-history-title">История username</p>
            <div className="space-y-1">
              {profile.usernameHistory.slice(0, 5).map((entry) => (
                <p key={`${entry.changedAt}-${entry.newUsername}`} className="text-xs text-text-secondary">
                  @{entry.oldUsername} → @{entry.newUsername}
                </p>
              ))}
            </div>
          </div>
        )}

        <div className="profile-media-divider">
          <div className="flex flex-wrap gap-2 mb-3">
            {([
              { key: "media", label: "Media", icon: <File size={12} /> },
              { key: "files", label: "Files", icon: <Paperclip size={12} /> },
              { key: "links", label: "Links", icon: <Hash size={12} /> },
              { key: "audio", label: "Audio", icon: <Mic size={12} /> }
            ] as Array<{ key: "media" | "files" | "links" | "audio"; label: string; icon: React.ReactNode }>).map((tab) => (
              <button
                key={tab.key}
                onClick={() => onMediaTabChange(tab.key)}
                className={`btn btn-xs ${
                  mediaTab === tab.key ? "btn-primary text-white" : "btn-secondary text-text-primary"
                }`}
              >
                {tab.icon}
                {tab.label}
              </button>
            ))}
          </div>

          <div className="profile-media-list">
            {tabItems.length === 0 && <p className="text-xs text-text-secondary">Пока пусто</p>}
            {tabItems.map((item) =>
              "publicUrl" in item ? (
                <a
                  key={item.id}
                  href={item.publicUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="media-link-row"
                >
                  <span className="truncate">{item.fileName}</span>
                  <span className="text-[11px] text-text-secondary">{item.mediaKind}</span>
                </a>
              ) : (
                <a
                  key={`${item.messageId}-${item.url}`}
                  href={item.url}
                  target="_blank"
                  rel="noreferrer"
                  className="block text-sm text-brand-300 truncate hover:underline"
                >
                  {item.url}
                </a>
              )
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function ChannelProfileModal({
  profile,
  currentUserId,
  media,
  mediaTab,
  onMediaTabChange,
  onSaveSlug,
  onCopyLink,
  onClose
}: {
  profile: ChannelProfileData;
  currentUserId: string;
  media: MediaPanelData;
  mediaTab: "media" | "files" | "links" | "audio";
  onMediaTabChange: (tab: "media" | "files" | "links" | "audio") => void;
  onSaveSlug: (slug: string) => Promise<void> | void;
  onCopyLink: (link: string) => void;
  onClose: () => void;
}) {
  const tabItems = media.items || [];
  const canEditSlug = profile.ownerId === currentUserId;
  const descriptionText = String(profile.description || "").trim();
  const [slugDraft, setSlugDraft] = useState(profile.usernameSlug || "");
  const [slugSaving, setSlugSaving] = useState(false);

  useEffect(() => {
    setSlugDraft(profile.usernameSlug || "");
  }, [profile.usernameSlug]);

  const publicLink = profile.usernameSlug
    ? roomPublicLink(profile.kind, profile.usernameSlug)
    : "";

  return (
    <div className="modal-backdrop">
      <div className="modal-card w-full max-w-2xl max-h-[92vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <h3 className="modal-title">{profile.kind === "group" ? "Профиль группы" : "Профиль канала"}</h3>
          <button onClick={onClose} className="btn btn-icon" title="Закрыть">
            <X size={18} />
          </button>
        </div>

        <div className="profile-channel-card">
          <div className="flex items-center gap-3 mb-3">
            <div className={`avatar avatar-lg ${profile.kind === "group" ? "avatar-group" : "avatar-channel"}`}>
              {profile.avatarUrl ? (
                <img src={profile.avatarUrl} alt={profile.name} className="w-full h-full object-cover" />
              ) : profile.kind === "group" ? (
                <Users size={20} />
              ) : (
                <Radio size={20} />
              )}
            </div>
            <div className="min-w-0">
              <p className="text-base font-semibold truncate">{profile.name}</p>
              {profile.usernameSlug ? (
                <p className="text-xs text-text-secondary mt-1">@{profile.usernameSlug}</p>
              ) : (
                <p className="text-xs text-text-muted mt-1">Публичная ссылка не настроена</p>
              )}
            </div>
          </div>

          {publicLink ? (
            <div className="channel-link-row">
              <a href={publicLink} className="truncate text-brand-200 text-xs hover:underline" target="_blank" rel="noreferrer">
                {publicLink}
              </a>
              <button className="btn btn-secondary btn-xs" onClick={() => onCopyLink(publicLink)}>
                Копировать
              </button>
            </div>
          ) : null}

          {canEditSlug && (
            <div className="mt-3">
              <p className="text-[11px] uppercase tracking-[0.12em] text-text-muted mb-2">Slug</p>
              <div className="flex items-center gap-2">
                <input
                  value={slugDraft}
                  onChange={(event) => setSlugDraft(event.target.value)}
                  className="app-input h-9"
                  placeholder="например my_group"
                  maxLength={48}
                />
                <button
                  className="btn btn-primary btn-xs"
                  disabled={slugSaving || !slugDraft.trim()}
                  onClick={async () => {
                    setSlugSaving(true);
                    await onSaveSlug(slugDraft);
                    setSlugSaving(false);
                  }}
                >
                  {slugSaving ? "..." : "Сохранить"}
                </button>
              </div>
            </div>
          )}

          {descriptionText ? (
            <p className="text-sm text-text-secondary mt-3">{descriptionText}</p>
          ) : null}
          <p className="text-xs text-text-secondary/80 mt-2">
            Участников: {profile.membersCount} · Медиа: {profile.mediaCount}
          </p>
        </div>

        <div className="profile-media-divider">
          <div className="flex flex-wrap gap-2 mb-3">
            {([
              { key: "media", label: "Media", icon: <File size={12} /> },
              { key: "files", label: "Files", icon: <Paperclip size={12} /> },
              { key: "links", label: "Links", icon: <Hash size={12} /> },
              { key: "audio", label: "Audio", icon: <Mic size={12} /> }
            ] as Array<{ key: "media" | "files" | "links" | "audio"; label: string; icon: React.ReactNode }>).map((tab) => (
              <button
                key={tab.key}
                onClick={() => onMediaTabChange(tab.key)}
                className={`btn btn-xs ${
                  mediaTab === tab.key ? "btn-primary text-white" : "btn-secondary text-text-primary"
                }`}
              >
                {tab.icon}
                {tab.label}
              </button>
            ))}
          </div>

          <div className="profile-media-list">
            {tabItems.length === 0 && <p className="text-xs text-text-secondary">Пока пусто</p>}
            {tabItems.map((item) =>
              "publicUrl" in item ? (
                <a
                  key={item.id}
                  href={item.publicUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="media-link-row"
                >
                  <span className="truncate">{item.fileName}</span>
                  <span className="text-[11px] text-text-secondary">{item.mediaKind}</span>
                </a>
              ) : (
                <a
                  key={`${item.messageId}-${item.url}`}
                  href={item.url}
                  target="_blank"
                  rel="noreferrer"
                  className="block text-sm text-brand-300 truncate hover:underline"
                >
                  {item.url}
                </a>
              )
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
