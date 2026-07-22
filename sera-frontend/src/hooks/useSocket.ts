import { useEffect, useState, useCallback, useRef } from "react";
import { io, Socket } from "socket.io-client";
import type { WalletState } from "./useWallet";
import type { MemoryVaultDescriptor } from "../../../src/core/memory/MemoryVault";
import { deviceMemoryVault, deviceVaultDescriptor, type DeviceVaultDescriptor } from '../storage/DeviceMemoryVault';

export interface GoogleDriveConnectionState {
  provider: 'GOOGLE_DRIVE';
  status: 'CONNECTED' | 'NOT_CONNECTED' | 'UNAVAILABLE';
  vaultFolderId?: string;
  connectedAt?: string;
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
  const initialServerHistoryReceived = useRef(false);
  const deviceVaultWriteQueue = useRef(Promise.resolve());
  const googleDrivePopup = useRef<Window | null>(null);
  const skipNextDeviceVaultWrite = useRef(false);

  const localChatKey = `chat-history:${deviceScope}`;

  useEffect(() => {
    let active = true;
    setDeviceVault(deviceVaultDescriptor('CHECKING'));
    void deviceMemoryVault.get<any[]>(localChatKey)
      .then((history) => {
        if (!active) return;
        setMessages((previous) => previous.length > 0 ? previous : (history ?? []));
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

  useEffect(() => {
    const wsUrl = import.meta.env.VITE_WS_URL || 
      (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1' 
        ? "ws://127.0.0.1:3001" 
        : window.location.origin.replace(/^http/, 'ws'));
    
    const newSocket = io(wsUrl);
    initialServerHistoryReceived.current = false;
    setSocket(newSocket);

    newSocket.on("chat:history", (history: any[]) => {
      const isInitialHistory = !initialServerHistoryReceived.current;
      initialServerHistoryReceived.current = true;
      setMessages((previous) => isInitialHistory && previous.length > 0 ? previous : history);
      if (!isInitialHistory && history.length === 0) {
        deviceVaultWriteQueue.current = deviceVaultWriteQueue.current
          .catch(() => undefined)
          .then(() => deviceMemoryVault.delete(localChatKey))
          .catch(() => setDeviceVault(deviceVaultDescriptor('UNAVAILABLE')));
      }
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
          chain: data.network,
          vaultAddress: data.vaultAddress || prev.vaultAddress,
          syncing: false,
        }));
      }
    });

    newSocket.on("billing:update", (data: { periods: number }) => {
      setWalletState(prev => ({
        ...prev,
        tier: data.periods >= 15 ? "WHALE" : (data.periods > 0 ? "PRO" : "FREE")
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
      if (googleDrivePopup.current && !googleDrivePopup.current.closed) {
        googleDrivePopup.current.location.assign(data.authorizationUrl);
      } else {
        window.location.assign(data.authorizationUrl);
      }
    });

    newSocket.on('google_drive:error', () => {
      if (googleDrivePopup.current && !googleDrivePopup.current.closed) googleDrivePopup.current.close();
      googleDrivePopup.current = null;
    });

    return () => {
      newSocket.off('memory:vault_status');
      newSocket.off('google_drive:status');
      newSocket.off('google_drive:authorization');
      newSocket.off('google_drive:error');
      newSocket.close();
    };
  }, [streamReply, setWalletState, setMode, localChatKey]);

  return {
    socket,
    messages,
    setMessages,
    streamReply,
    currentActivity,
    cancelChat,
    memoryVault,
    deviceVault,
    deleteDeviceMemory,
    googleDrive,
    connectGoogleDrive,
    disconnectGoogleDrive,
  };
}
