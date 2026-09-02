import { useEffect, useState, useCallback, useRef } from "react";
import { io, Socket } from "socket.io-client";
import type { WalletState } from "./useWallet";
import type { MemoryVaultDescriptor } from "../types/MemoryVault";
import { deviceMemoryVault, deviceVaultDescriptor, type DeviceVaultDescriptor } from '../storage/DeviceMemoryVault';

export interface GoogleDriveConnectionState {
  provider: 'GOOGLE_DRIVE';
  status: 'CONNECTED' | 'NOT_CONNECTED' | 'UNAVAILABLE';
  vaultFolderId?: string;
  connectedAt?: string;
}

export interface ThreadsConnectionState {
  provider: 'THREADS';
  status: 'CONNECTED' | 'NOT_CONNECTED' | 'UNAVAILABLE';
  username?: string;
  name?: string;
  profilePictureUrl?: string;
  threadsUserId?: string;
  connectedAt?: string;
}

export interface TelegramConnectionState {
  provider: 'TELEGRAM';
  status: 'CONNECTED' | 'NOT_CONNECTED' | 'UNAVAILABLE';
}

export function useSocket(
  setWalletState: React.Dispatch<React.SetStateAction<WalletState>>,
  setMode: (mode: "light" | "dark") => void,
  deviceScope: string = 'anonymous'
) {
  const [socket, setSocket] = useState<Socket | null>(null);
  const [messages, setMessages] = useState<any[]>([]);
  const [currentActivity, setCurrentActivity] = useState<string | null>(null);
  const [memoryVault, setMemoryVault] = useState<MemoryVaultDescriptor | null>(null);
  const [deviceVault, setDeviceVault] = useState<DeviceVaultDescriptor>(() => deviceVaultDescriptor('CHECKING'));
  const [googleDrive, setGoogleDrive] = useState<GoogleDriveConnectionState>({ provider: 'GOOGLE_DRIVE', status: 'UNAVAILABLE' });
  const [threads, setThreads] = useState<ThreadsConnectionState>({ provider: 'THREADS', status: 'UNAVAILABLE' });
  const [telegram, setTelegram] = useState<TelegramConnectionState>({ provider: 'TELEGRAM', status: 'UNAVAILABLE' });
  const [telegramLinkCode, setTelegramLinkCode] = useState<string | null>(null);
  const [governanceRecommendations, setGovernanceRecommendations] = useState<any[]>([]);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const outboxQueue = useRef<Array<{ id: number; clientMessageId?: string; text: string; images?: string[]; documents?: any[] }>>([]);
  const initialServerHistoryReceived = useRef(false);
  const deviceVaultWriteQueue = useRef(Promise.resolve());
  const googleDrivePopup = useRef<Window | null>(null);
  const threadsPopup = useRef<Window | null>(null);
  const skipNextDeviceVaultWrite = useRef(false);

  const localChatKey = `chat-history:${deviceScope}`;

  useEffect(() => {
    let active = true;
    setDeviceVault(deviceVaultDescriptor('CHECKING'));
    void deviceMemoryVault.get<any[]>(localChatKey)
      .then((history) => {
        if (!active) return;
        setMessages((previous) => {
          // If we already have messages on screen (e.g. typed before wallet connected), preserve them!
          if (previous && previous.length > 0) {
            if (!history || history.length === 0) return previous;
            const existingIds = new Set(previous.map(p => p.clientMessageId || p.id));
            const additional = history.filter(h => !existingIds.has(h.clientMessageId || h.id));
            return [...previous, ...additional];
          }
          return history ?? [];
        });
        setDeviceVault(deviceVaultDescriptor('ACTIVE'));
      })
      .catch(() => {
        if (active) setDeviceVault(deviceVaultDescriptor('UNAVAILABLE'));
      });
    return () => { active = false; };
  }, [localChatKey]);

  useEffect(() => {
    if (deviceVault.status !== 'ACTIVE') return;
    if (skipNextDeviceVaultWrite.current) {
      skipNextDeviceVaultWrite.current = false;
      return;
    }
    const durableMessages = messages.filter((message) => message.type !== 'activity' && !message.streaming);
    deviceVaultWriteQueue.current = deviceVaultWriteQueue.current
      .catch(() => undefined)
      .then(() => deviceMemoryVault.set(localChatKey, durableMessages))
      .catch(() => setDeviceVault(deviceVaultDescriptor('UNAVAILABLE')));
  }, [messages, localChatKey, deviceVault.status]);

  const streamReply = useCallback((fullText: string, id: number, actionLinks?: any[]) => {
    setCurrentActivity(null); // Clear activity when starting to stream reply
    setMessages((prev) => {
      const exists = prev.find(m => m.id === id);
      if (!exists) {
        return [...prev, { id, role: "agent", content: fullText, streaming: false, actionLinks }];
      }
      return prev.map((m) => (m.id === id ? { ...m, content: fullText, streaming: false, actionLinks } : m));
    });
  }, []);

  const cancelChat = useCallback(() => {
    if (socket) {
      socket.emit("chat:cancel");
      // Give immediate visual feedback by clearing the spinner
      setCurrentActivity(null);
    }
  }, [socket]);

  const deleteDeviceMemory = useCallback(() => {
    // Do not immediately recreate an empty local record after deleting it.
    skipNextDeviceVaultWrite.current = true;
    setMessages([]);
    deviceVaultWriteQueue.current = deviceVaultWriteQueue.current
      .catch(() => undefined)
      .then(() => deviceMemoryVault.delete(localChatKey))
      .catch(() => setDeviceVault(deviceVaultDescriptor('UNAVAILABLE')));
    socket?.emit('chat:clear');
  }, [socket, localChatKey]);

  const connectGoogleDrive = useCallback(() => {
    if (!socket) return;
    googleDrivePopup.current = window.open('', 'sera-google-drive', 'popup=yes,width=520,height=700');
    socket.emit('google_drive:connect');
  }, [socket]);

  const disconnectGoogleDrive = useCallback(() => {
    socket?.emit('google_drive:disconnect');
  }, [socket]);

  const connectThreads = useCallback(() => {
    if (!socket) return;
    const isMobile = /Android|iPhone|iPad|iPod|webOS|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
    if (!isMobile) {
      threadsPopup.current = window.open('', 'sera-threads', 'popup=yes,width=560,height=720');
    }
    socket.emit('threads:connect');
  }, [socket]);

  const disconnectThreads = useCallback(() => {
    socket?.emit('threads:disconnect');
  }, [socket]);

  const respondToGovernanceRecommendation = useCallback((recommendationId: string, decision: 'APPROVED' | 'REJECTED' | 'MODIFIED', rationale?: string) => {
    if (socket) {
      socket.emit('governance:respond_recommendation', { recommendationId, decision, rationale });
    }
  }, [socket]);

  useEffect(() => {
    const wsUrl = import.meta.env.VITE_WS_URL || 
      (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1' 
        ? "ws://127.0.0.1:3001" 
        : "wss://api.seraos.xyz");
    
    const newSocket = io(wsUrl);
    initialServerHistoryReceived.current = false;
    setSocket(newSocket);

    newSocket.on("connect", () => {
      console.log("[useSocket] Socket connected to Core.");
    });

    newSocket.on("disconnect", () => {
      console.log("[useSocket] Socket disconnected from Core.");
      setIsAuthenticated(false);
    });

    newSocket.on("auth:success", () => {
      console.log("[useSocket] Socket authenticated successfully.");
      setIsAuthenticated(true);

      // Drain and flush pending outbox messages
      if (outboxQueue.current.length > 0) {
        console.log(`[useSocket] Draining ${outboxQueue.current.length} pending message(s) from outbox...`);
        outboxQueue.current.forEach((item: any) => {
          newSocket.emit("chat:message", { clientMessageId: item.clientMessageId, message: item.text, images: item.images, documents: item.documents });
        });
        const flushedIds = new Set(outboxQueue.current.map((i: any) => i.clientMessageId || i.id));
        setMessages((prev) => prev.map((m) => (flushedIds.has(m.clientMessageId) || flushedIds.has(m.id)) ? { ...m, status: 'sent' } : m));
        outboxQueue.current = [];
      }
    });

    newSocket.on("auth:error", () => {
      setIsAuthenticated(false);
    });

    newSocket.on("chat:ack", (ackData: any) => {
      if (!ackData) return;
      setMessages((prev) => prev.map((m) => {
        if (ackData.clientMessageId && m.clientMessageId === ackData.clientMessageId) {
          return { ...m, status: 'sent' };
        }
        return m;
      }));
    });

    newSocket.on("chat:history", (history: any[]) => {
      initialServerHistoryReceived.current = true;
      
      // Explicit chat clear or empty server history
      if (Array.isArray(history) && history.length === 0) {
        setMessages([]);
        deviceVaultWriteQueue.current = deviceVaultWriteQueue.current
          .catch(() => undefined)
          .then(() => deviceMemoryVault.delete(localChatKey))
          .catch(() => setDeviceVault(deviceVaultDescriptor('UNAVAILABLE')));
        return;
      }

      setMessages((previous) => {
        if (!previous || previous.length === 0) return history || [];
        if (!history) return previous;

        // Smart Deterministic Reconciliation:
        // Merge server history with any local in-flight messages that haven't arrived yet
        const merged = [...history];

        previous.forEach((localMsg) => {
          const alreadyInServer = history.some((serverMsg) => {
            if (localMsg.clientMessageId && serverMsg.clientMessageId) {
              return localMsg.clientMessageId === serverMsg.clientMessageId;
            }
            if (localMsg.id && serverMsg.id && localMsg.id === serverMsg.id) {
              return true;
            }
            if (localMsg.role === serverMsg.role && localMsg.content === serverMsg.content) {
              const timeDiff = Math.abs((localMsg.id || 0) - (serverMsg.id || 0));
              return timeDiff < 120000;
            }
            return false;
          });

          if (!alreadyInServer) {
            merged.push(localMsg);
          }
        });

        return merged;
      });
    });

    newSocket.on("chat:reply", (data: any) => {
      setCurrentActivity(null);
      streamReply(data.content, data.id || Date.now(), data.actionLinks);
    });

    newSocket.on("chat:activity", (data: any) => {
      // Set ephemeral activity instead of pushing to permanent messages
      setCurrentActivity(data.content);
    });

    newSocket.on("chat:proposal", (data: any) => {
      setCurrentActivity(null);
      setMessages(prev => [...prev, { id: data.id || Date.now(), role: "agent", proposal: data }]);
    });

    newSocket.on("ui:command", (cmd: any) => {
      if (cmd.type === "SET_THEME") {
        setMode(cmd.payload);
      } else if (cmd.type === "CLEAR_CHAT") {
        newSocket.emit("chat:clear");
      } else if (cmd.type === "CLEAR_CHAT_COUNTDOWN") {
        setMessages(prev => [...prev, { id: Date.now() + Math.random(), type: 'clear_chat_countdown', role: 'agent' }]);
      }
    });

    newSocket.on("wallet:update", (data: any) => {
      if (data.syncing) {
        // TX in flight — keep current numbers, just show the spinner
        setWalletState(prev => ({ ...prev, syncing: true }));
      } else {
        // TX confirmed (or initial load) — update with real values
        setWalletState(prev => ({
          ...prev,
          address: data.address.slice(0, 6) + "..." + data.address.slice(-4),
          fullAddress: data.address,
          balance: `${Number(data.balance).toFixed(2)} ${data.asset || 'USDC'}`,
          vaultBalance: data.vaultBalance ? `${Number(data.vaultBalance).toFixed(2)} ${data.asset || 'USDC'}` : prev.vaultBalance,
          vaultBalances: data.vaultBalances ? {
            base: data.vaultBalances.base || '0',
            polygon: data.vaultBalances.polygon || '0',
            ethereum: data.vaultBalances.ethereum || '0',
          } : prev.vaultBalances,
          chain: data.network,
          vaultAddress: data.vaultAddress || prev.vaultAddress,
          syncing: false,
        }));
      }
    });

    newSocket.on("billing:update", (data: { periods: number, agentCredits?: number }) => {
      setWalletState(prev => ({
        ...prev,
        tier: data.periods >= 15 ? "WHALE" : (data.periods > 0 ? "PRO" : "FREE"),
        agentCredits: data.agentCredits ?? prev.agentCredits,
      }));
    });

    newSocket.on('memory:vault_status', (data: MemoryVaultDescriptor) => {
      setMemoryVault(data);
    });

    newSocket.on('google_drive:status', (data: GoogleDriveConnectionState) => {
      setGoogleDrive(data);
      if (data.status === 'CONNECTED' && googleDrivePopup.current && !googleDrivePopup.current.closed) {
        googleDrivePopup.current.close();
        googleDrivePopup.current = null;
      }
    });

    newSocket.on('google_drive:authorization', (data: { authorizationUrl?: string }) => {
      if (!data.authorizationUrl) return;
      try {
        if (googleDrivePopup.current && !googleDrivePopup.current.closed) {
          googleDrivePopup.current.location.href = data.authorizationUrl;
          return;
        }
      } catch (e) {
        console.warn('[useSocket] Popup navigation error, falling back:', e);
      }
      window.open(data.authorizationUrl, 'sera-google-drive', 'popup=yes,width=520,height=700') || window.location.assign(data.authorizationUrl);
    });

    newSocket.on('google_drive:error', () => {
      try {
        if (googleDrivePopup.current && !googleDrivePopup.current.closed) googleDrivePopup.current.close();
      } catch {}
      googleDrivePopup.current = null;
    });

    newSocket.on('threads:status', (data: ThreadsConnectionState) => {
      setThreads(data);
      try {
        if (data.status === 'CONNECTED' && threadsPopup.current && !threadsPopup.current.closed) {
          threadsPopup.current.close();
          threadsPopup.current = null;
        }
      } catch {}
    });

    newSocket.on('threads:authorization', (data: { authorizationUrl?: string }) => {
      if (!data.authorizationUrl) return;
      try {
        if (threadsPopup.current && !threadsPopup.current.closed) {
          threadsPopup.current.location.href = data.authorizationUrl;
          return;
        }
      } catch (e) {
        console.warn('[useSocket] Threads popup navigation error, falling back:', e);
      }
      window.open(data.authorizationUrl, 'sera-threads', 'popup=yes,width=560,height=720') || window.location.assign(data.authorizationUrl);
    });

    newSocket.on('threads:error', () => {
      try {
        if (threadsPopup.current && !threadsPopup.current.closed) threadsPopup.current.close();
      } catch {}
      threadsPopup.current = null;
    });

    newSocket.on('telegram:status', (data: TelegramConnectionState) => {
      setTelegram(data);
    });

    newSocket.on('telegram:link_generated', (data: { code: string }) => {
      setTelegramLinkCode(data.code);
    });

    newSocket.on('governance:recommendation_list', (list: any[]) => {
      setGovernanceRecommendations(list);
    });

    newSocket.on('governance:recommendation_pending', (rec: any) => {
      setGovernanceRecommendations((prev) => {
        if (prev.some((r) => r.id === rec.id)) return prev;
        return [...prev, rec];
      });
    });

    return () => {
      newSocket.off('memory:vault_status');
      newSocket.off('google_drive:status');
      newSocket.off('google_drive:authorization');
      newSocket.off('google_drive:error');
      newSocket.off('threads:status');
      newSocket.off('threads:authorization');
      newSocket.off('threads:error');
      newSocket.off('telegram:status');
      newSocket.off('telegram:link_generated');
      newSocket.off('governance:recommendation_list');
      newSocket.off('governance:recommendation_pending');
      newSocket.close();
    };
  }, [streamReply, setWalletState, setMode, localChatKey]);

  const sendMessage = useCallback((text: string, images?: string[], documents?: any[]) => {
    if ((!text || !text.trim()) && (!images || images.length === 0) && (!documents || documents.length === 0)) return;
    const clientMessageId = `msg-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    const msgId = Date.now();
    const isReady = !!(socket && socket.connected && isAuthenticated);
    const userMsg = { 
      id: msgId, 
      clientMessageId,
      role: "user", 
      content: text, 
      images,
      documents,
      status: isReady ? 'sent' : 'pending' 
    };

    setMessages((prev) => [...prev, userMsg]);

    if (isReady) {
      socket.emit("chat:message", { clientMessageId, message: text, images, documents });
    } else {
      console.log(`[useSocket] Socket not yet fully authenticated. Enqueueing message (${clientMessageId}) into Outbox.`);
      outboxQueue.current.push({ id: msgId, clientMessageId, text, images, documents });
      
      // If socket is connected but not auth, trigger a challenge to speed up authentication
      if (socket && socket.connected && !isAuthenticated) {
        socket.emit("auth:challenge");
      }
    }
  }, [socket, isAuthenticated]);

  return {
    socket,
    messages,
    setMessages,
    sendMessage,
    isAuthenticated,
    streamReply,
    currentActivity,
    cancelChat,
    memoryVault,
    deviceVault,
    deleteDeviceMemory,
    googleDrive,
    connectGoogleDrive,
    disconnectGoogleDrive,
    threads,
    connectThreads,
    disconnectThreads,
    telegram,
    telegramLinkCode,
    generateTelegramLink: useCallback(() => {
      socket?.emit("telegram:generate_link");
    }, [socket]),
    governanceRecommendations,
    respondToGovernanceRecommendation,
  };
}
