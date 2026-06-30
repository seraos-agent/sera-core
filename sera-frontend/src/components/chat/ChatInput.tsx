import React, { useState } from 'react';
import './ChatComponents.css';
import { SendHorizonal } from 'lucide-react';

export const ChatInput: React.FC = () => {
  const [text, setText] = useState('');

  const handleSend = (e: React.FormEvent) => {
    e.preventDefault();
    if (!text.trim()) return;
    // In a real app, this would send the message to the backend
    setText('');
  };

  return (
    <div className="chat-input-container">
      <form className="chat-input-wrapper" onSubmit={handleSend}>
        <input
          type="text"
          className="chat-input-field"
          placeholder="Tulis pesan ke SERA..."
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
        <button 
          type="submit" 
          className={`chat-input-button ${text.trim() ? 'active' : ''}`}
          disabled={!text.trim()}
        >
          <SendHorizonal size={18} />
        </button>
      </form>
      <div className="chat-input-footer">
        SERA is an Operational Partner. AI can make mistakes. Check important information.
      </div>
    </div>
  );
};
