import React from 'react';
import './ChatComponents.css';
import { Activity } from 'lucide-react';

interface ActivityNodeProps {
  message: string;
}

export const ActivityNode: React.FC<ActivityNodeProps> = ({ message }) => {
  return (
    <div className="activity-node">
      <Activity size={14} className="activity-icon" />
      <span className="activity-text">{message}</span>
    </div>
  );
};
