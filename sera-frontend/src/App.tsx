import { useState } from 'react';
import { Layout } from './components/Layout';
import { GoalPanel } from './components/sidebar/GoalPanel';
import { MessageBubble } from './components/chat/MessageBubble';
import { ActivityNode } from './components/chat/ActivityNode';
import { ApprovalInline } from './components/chat/ApprovalInline';
import { ChatInput } from './components/chat/ChatInput';

function App() {
  const [approved, setApproved] = useState(false);
  const [rejected, setRejected] = useState(false);

  const handleApprove = () => setApproved(true);
  const handleReject = () => setRejected(true);

  return (
    <Layout
      sidebar={<GoalPanel />}
      main={
      <>
        <div style={{ display: 'flex', flexDirection: 'column', padding: '24px 0', gap: '8px', overflowY: 'auto', flex: 1 }}>
          <MessageBubble
            role="user"
            content="Tolong jadwalkan pembayaran bulanan untuk langganan layanan cloud kita sebesar 0.05 ETH."
          />
          <MessageBubble
            role="assistant"
            content="Baik. Saya telah merencanakan pembayaran bulanan sebesar 0.05 ETH ke alamat layanan cloud. Saya sedang memverifikasi batas otorisasi Spend Permission Anda."
          />
          <ActivityNode message="Memverifikasi batas Spend Permission on-chain (Base Sepolia)..." />
          <ActivityNode message="Batas tersedia: 0.10 ETH. Kebutuhan: 0.05 ETH. Verifikasi sukses." />
          
          <ApprovalInline 
            actionDescription="Execute Transfer: 0.05 ETH to 0xCloudServices" 
            onApprove={handleApprove}
            onReject={handleReject}
          />

          {approved && (
            <>
              <ActivityNode message="Mengeksekusi transaksi via Agentic Wallet..." />
              <ActivityNode message="Menunggu finalitas blok..." />
              <MessageBubble
                role="assistant"
                content="Transaksi berhasil dieksekusi (TX: 0x8f6fb...). Saldo Anda telah diperbarui dan pembayaran bulanan pertama telah diselesaikan. Apakah ada hal lain yang bisa saya bantu?"
              />
            </>
          )}

          {rejected && (
            <>
              <MessageBubble
                role="assistant"
                content="Baik, saya telah membatalkan transaksi tersebut atas instruksi Anda. Pembayaran tidak akan diproses."
              />
            </>
          )}
        </div>
        <ChatInput />
      </>
      }
    />
  );
}

export default App;
