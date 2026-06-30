import React from 'react';
import './Layout.css';
import { MobileHeader } from './MobileHeader';

interface LayoutProps {
  sidebar: React.ReactNode;
  main: React.ReactNode;
}

export const Layout: React.FC<LayoutProps> = ({ sidebar, main }) => {
  return (
    <div className="layout-container">
      <main className="layout-main">
        <MobileHeader />
        {main}
      </main>
      <aside className="layout-sidebar">{sidebar}</aside>
    </div>
  );
};
