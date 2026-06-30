import React from 'react';
import './Layout.css';
import { Menu } from 'lucide-react';

export const MobileHeader: React.FC = () => {
  return (
    <header className="mobile-header">
      <button className="menu-button">
        <Menu size={20} />
      </button>
      <div className="header-title">SERA Operational Partner</div>
      <div className="header-spacer" />
    </header>
  );
};
