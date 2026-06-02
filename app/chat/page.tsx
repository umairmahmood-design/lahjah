"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { onAuthStateChanged } from "firebase/auth";
import {
  collection,
  addDoc,
  query,
  orderBy,
  onSnapshot,
  serverTimestamp,
  doc,
  updateDoc,
  Timestamp,
} from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { auth, db, storage } from "@/lib/firebase";
import DashboardNav from "@/components/DashboardNav";

type Language = "en" | "ar";

interface ConversationDoc {
  id: string;
  title: string;
  createdAt: Timestamp | null;
  updatedAt: Timestamp | null;
}

interface MessageDoc {
  id: string;
  role: "user" | "assistant";
  content: string;
  imageUrl?: string;
  language: Language;
  createdAt: Timestamp | null;
}

const SUGGESTIONS = [
  "Give me CTA variations",
  "Review this error message",
  "Translate this to Arabic",
];

function formatTime(ts: Timestamp | null): string {
  if (!ts) return "";
  return ts.toDate().toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });
}

function formatDate(ts: Timestamp | null): string {
  if (!ts) return "";
  return ts.toDate().toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

async function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export default function ChatPage() {
  const router = useRouter();
  const [uid, setUid] = useState<string | null>(null);
  const [conversations, setConversations] = useState<ConversationDoc[]>([]);
  const [activeConvId, setActiveConvId] = useState<string | null>(null);
  const [messages, setMessages] = useState<MessageDoc[]>([]);
  const [inputText, setInputText] = useState("");
  const [pendingImage, setPendingImage] = useState<File | null>(null);
  const [pendingImagePreview, setPendingImagePreview] = useState<string | null>(null);
  const [language, setLanguage] = useState<Language>("en");
  const [sending, setSending] = useState(false);
  const [streamingContent, setStreamingContent] = useState<string | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Auth guard
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (user) => {
      if (!user) { router.replace("/login"); return; }
      setUid(user.uid);
    });
    return unsub;
  }, [router]);

  // Conversations list (real-time)
  useEffect(() => {
    if (!uid) return;
    const q = query(
      collection(db, "chats", uid, "conversations"),
      orderBy("updatedAt", "desc")
    );
    return onSnapshot(q, (snap) => {
      setConversations(
        snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<ConversationDoc, "id">) }))
      );
    });
  }, [uid]);

  // Messages for active conversation (real-time)
  useEffect(() => {
    if (!uid || !activeConvId) { setMessages([]); return; }
    const q = query(
      collection(db, "chats", uid, "conversations", activeConvId, "messages"),
      orderBy("createdAt", "asc")
    );
    return onSnapshot(q, (snap) => {
      setMessages(
        snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<MessageDoc, "id">) }))
      );
    });
  }, [uid, activeConvId]);

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, streamingContent]);

  function handleNewChat() {
    setActiveConvId(null);
    setMessages([]);
    setInputText("");
    removePendingImage();
  }

  function handleImageSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setPendingImage(file);
    setPendingImagePreview(URL.createObjectURL(file));
    e.target.value = "";
  }

  function removePendingImage() {
    if (pendingImagePreview) URL.revokeObjectURL(pendingImagePreview);
    setPendingImage(null);
    setPendingImagePreview(null);
  }

  async function handleSend(overrideText?: string) {
    const text = (overrideText ?? inputText).trim();
    if (!text || sending || !uid) return;

    setSending(true);
    setInputText("");

    // Capture image + message history before any async state changes
    const imageFile = pendingImage;
    const historySnapshot = messages;
    setPendingImage(null);
    setPendingImagePreview(null);

    try {
      // 1. Create conversation if needed
      let convId = activeConvId;
      if (!convId) {
        const convRef = await addDoc(collection(db, "chats", uid, "conversations"), {
          title: text.slice(0, 50),
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
        convId = convRef.id;
        setActiveConvId(convId);
      }

      // 2. Upload image to Storage if attached
      let imageUrl: string | undefined;
      let imageBase64: string | undefined;
      if (imageFile) {
        const path = `chats/${uid}/${convId}/${Date.now()}_${imageFile.name}`;
        const storageRef = ref(storage, path);
        await uploadBytes(storageRef, imageFile);
        imageUrl = await getDownloadURL(storageRef);
        imageBase64 = await fileToBase64(imageFile);
        if (pendingImagePreview) URL.revokeObjectURL(pendingImagePreview);
      }

      // 3. Save user message to Firestore
      await addDoc(
        collection(db, "chats", uid, "conversations", convId, "messages"),
        {
          role: "user",
          content: text,
          ...(imageUrl ? { imageUrl } : {}),
          language,
          createdAt: serverTimestamp(),
        }
      );
      await updateDoc(doc(db, "chats", uid, "conversations", convId), {
        updatedAt: serverTimestamp(),
      });

      // 4. Build history for API (from snapshot — excludes the message just saved)
      const history = [
        ...historySnapshot.map((m) => ({ role: m.role, content: m.content })),
        {
          role: "user" as const,
          content: text,
          ...(imageBase64 ? { imageBase64, mimeType: imageFile?.type } : {}),
        },
      ];

      // 5. Stream response from API
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: history, language }),
      });

      if (!res.ok || !res.body) throw new Error("Chat API error");

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let accumulated = "";
      setStreamingContent("");

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        accumulated += decoder.decode(value, { stream: true });
        setStreamingContent(accumulated);
      }
      setStreamingContent(null);

      // 6. Save assistant message to Firestore
      await addDoc(
        collection(db, "chats", uid, "conversations", convId, "messages"),
        {
          role: "assistant",
          content: accumulated,
          language,
          createdAt: serverTimestamp(),
        }
      );
      await updateDoc(doc(db, "chats", uid, "conversations", convId), {
        updatedAt: serverTimestamp(),
      });
    } catch (err) {
      console.error("[chat] Error:", err);
      setStreamingContent(null);
    } finally {
      setSending(false);
    }
  }

  if (!uid) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-brand border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen bg-gray-50">
      <DashboardNav />

      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar */}
        <aside className="w-60 bg-white border-r border-gray-100 flex flex-col shrink-0">
          <div className="p-3 border-b border-gray-100">
            <button
              onClick={handleNewChat}
              className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors border border-gray-200"
            >
              <span className="text-base leading-none font-light">+</span>
              New chat
            </button>
          </div>
          <div className="flex-1 overflow-y-auto">
            {conversations.map((conv) => (
              <button
                key={conv.id}
                onClick={() => setActiveConvId(conv.id)}
                className={`w-full text-left px-3 py-3 border-b border-gray-50 hover:bg-gray-50 transition-colors ${
                  activeConvId === conv.id ? "bg-gray-100" : ""
                }`}
              >
                <p className="text-sm text-gray-800 truncate leading-snug">{conv.title}</p>
                <p className="text-xs text-gray-400 mt-0.5">{formatDate(conv.updatedAt)}</p>
              </button>
            ))}
          </div>
        </aside>

        {/* Main area */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Messages */}
          <div className="flex-1 overflow-y-auto px-6 py-6">
            {messages.length === 0 && streamingContent === null ? (
              <div className="h-full flex flex-col items-center justify-center text-center">
                <div className="w-12 h-12 rounded-2xl bg-ink flex items-center justify-center mb-4">
                  <ChatBubbleIcon />
                </div>
                <h2 className="text-lg font-semibold text-gray-900 mb-1">
                  What are you working on?
                </h2>
                <p className="text-sm text-gray-500 max-w-sm mb-6">
                  Describe a UI element or paste a screenshot and Lahjah will suggest copy for it.
                </p>
                <div className="flex flex-wrap gap-2 justify-center">
                  {SUGGESTIONS.map((s) => (
                    <button
                      key={s}
                      onClick={() => handleSend(s)}
                      className="px-4 py-2 rounded-full border border-gray-200 text-sm text-gray-700 hover:bg-gray-50 hover:border-gray-300 transition-colors"
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <div className="max-w-2xl mx-auto space-y-4">
                {messages.map((msg) => (
                  <MessageBubble key={msg.id} msg={msg} />
                ))}
                {streamingContent !== null && (
                  <StreamingBubble content={streamingContent} />
                )}
                <div ref={messagesEndRef} />
              </div>
            )}
          </div>

          {/* Input area */}
          <div className="border-t border-gray-100 bg-white px-6 py-4 shrink-0">
            <div className="max-w-2xl mx-auto">
              {pendingImagePreview && (
                <div className="relative inline-block mb-3">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={pendingImagePreview}
                    alt="Attached"
                    className="h-20 w-20 rounded-lg object-cover border border-gray-200"
                  />
                  <button
                    onClick={removePendingImage}
                    className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-gray-700 text-white rounded-full text-xs flex items-center justify-center hover:bg-ink"
                  >
                    ×
                  </button>
                </div>
              )}
              <div className="flex items-center gap-2">
                <button
                  onClick={() => fileInputRef.current?.click()}
                  title="Attach image"
                  className="p-2 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors shrink-0"
                >
                  <PaperclipIcon />
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  onChange={handleImageSelect}
                  className="hidden"
                />
                <input
                  type="text"
                  value={inputText}
                  onChange={(e) => setInputText(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      handleSend();
                    }
                  }}
                  placeholder="Ask Lahjah anything about copy..."
                  className="flex-1 px-4 py-2.5 rounded-xl border border-gray-200 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-brand focus:border-transparent"
                />
                <button
                  onClick={() => setLanguage(language === "en" ? "ar" : "en")}
                  className="px-3 py-2.5 rounded-xl border border-gray-200 text-xs font-semibold text-gray-600 hover:bg-gray-50 transition-colors shrink-0 w-12"
                >
                  {language === "en" ? "EN" : "AR"}
                </button>
                <button
                  onClick={() => handleSend()}
                  disabled={sending || !inputText.trim()}
                  className="px-4 py-2.5 rounded-xl bg-brand text-ink text-sm font-semibold hover:bg-brand-dark transition-colors disabled:opacity-50 disabled:cursor-not-allowed shrink-0"
                >
                  Send
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function MessageBubble({ msg }: { msg: MessageDoc }) {
  const isUser = msg.role === "user";
  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
      <div className={`max-w-lg flex flex-col gap-1 ${isUser ? "items-end" : "items-start"}`}>
        {msg.imageUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={msg.imageUrl}
            alt="Attached screenshot"
            className="max-h-48 rounded-xl border border-gray-200 object-contain"
          />
        )}
        {msg.content && (
          <div
            className={`px-4 py-2.5 rounded-2xl text-sm leading-relaxed whitespace-pre-wrap ${
              isUser
                ? "bg-ink text-white rounded-br-sm"
                : "bg-white text-gray-900 border border-gray-100 shadow-sm rounded-bl-sm"
            }`}
          >
            {msg.content}
          </div>
        )}
        <span className="text-xs text-gray-400 px-1">{formatTime(msg.createdAt)}</span>
      </div>
    </div>
  );
}

function StreamingBubble({ content }: { content: string }) {
  return (
    <div className="flex justify-start">
      <div className="max-w-lg flex flex-col gap-1 items-start">
        <div className="px-4 py-2.5 rounded-2xl rounded-bl-sm text-sm leading-relaxed whitespace-pre-wrap bg-white text-gray-900 border border-gray-100 shadow-sm min-w-[3rem]">
          {content || (
            <span className="inline-flex gap-1 items-center py-0.5">
              <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce [animation-delay:0ms]" />
              <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce [animation-delay:150ms]" />
              <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce [animation-delay:300ms]" />
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

function ChatBubbleIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
    </svg>
  );
}

function PaperclipIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l8.57-8.57A4 4 0 1 1 18 8.84l-8.59 8.57a2 2 0 0 1-2.83-2.83l8.49-8.48" />
    </svg>
  );
}
