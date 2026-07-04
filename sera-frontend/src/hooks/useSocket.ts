import { useEffect, useState, useCallback } from "react";
import { io, Socket } from "socket.io-client";
import type { WalletState } from "./useWallet";
import type { CognitiveObservationPayload } from "../../../src/core/events/types";

export function useSocket(
  setWalletState: React.Dispatch<React.SetStateAction<WalletState>>,
  setMode: (mode: "light" | "dark") => void
) {
  const [socket, setSocket] = useState<Socket | null>(null);
  const [messages, setMessages] = useState<any[]>([]);
  const [observations, setObservations] = useState<CognitiveObservationPayload[]>([]);

  const streamReply = useCallback((fullText: string, id: number) => {
    let i = 0;
    const step = () => {
      i += Math.max(1, Math.round(fullText.length / 90));
      const chunk = fullText.slice(0, i);
      setMessages((prev) => {
        const exists = prev.find(m => m.id === id);
        if (!exists) {
          return [...prev, { id, role: "agent", content: chunk, streaming: i < fullText.length }];
        }
        return prev.map((m) => (m.id === id ? { ...m, content: chunk, streaming: i < fullText.length } : m));
      });
      if (i < fullText.length) {
        setTimeout(step, 16);
      }
    };
    step();
  }, []);

  useEffect(() => {
    const newSocket = io("ws://localhost:3001");
    setSocket(newSocket);

    newSocket.on("chat:history", (history: any[]) => {
      setMessages(history);
    });

    newSocket.on("observations:history", (history: any[]) => {
      // Map history to raw payloads and inject timestamp from the record
      const payloads = history.map((record: any) => ({ 
        ...record.payload, 
        timestamp: record.timestamp 
      }));
      setObservations(payloads);
    });

    newSocket.on("observations:new", (obs: CognitiveObservationPayload) => {
      setObservations(prev => [...prev, obs]);
    });

    newSocket.on("chat:reply", (data: any) => {
      streamReply(data.content, data.id || Date.now());
    });

    newSocket.on("chat:activity", (data: any) => {
      setMessages(prev => [...prev, { id: data.id || Date.now(), type: "activity", content: data.content }]);
    });

    newSocket.on("chat:proposal", (data: any) => {
      setMessages(prev => [...prev, { id: data.id || Date.now(), role: "agent", proposal: data }]);
    });

    newSocket.on("ui:command", (cmd: any) => {
      if (cmd.type === "SET_THEME") {
        setMode(cmd.payload);
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

    return () => { newSocket.close(); };
  }, [streamReply, setWalletState, setMode]);

  return {
    socket,
    messages,
    setMessages,
    observations,
    streamReply
  };
}
