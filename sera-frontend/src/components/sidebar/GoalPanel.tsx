import React from 'react';
import './SidebarComponents.css';
import { Target } from 'lucide-react';
import { GoalTimeline } from './GoalTimeline.tsx';

export const GoalPanel: React.FC = () => {
  return (
    <div className="goal-panel">
      <div className="goal-panel-header">
        <Target size={16} className="goal-icon" />
        <span className="goal-title">Active Goal</span>
      </div>
      <div className="goal-description">
        Transfer 0.05 ETH to 0xRecipient for monthly subscription.
      </div>
      
      <GoalTimeline />
    </div>
  );
};
