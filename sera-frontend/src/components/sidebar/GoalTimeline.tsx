import React from 'react';
import './SidebarComponents.css';
import { Circle, CheckCircle2, MoreHorizontal } from 'lucide-react';

interface TimelineStepProps {
  label: string;
  status: 'completed' | 'current' | 'pending';
}

const TimelineStep: React.FC<TimelineStepProps> = ({ label, status }) => {
  return (
    <div className={`timeline-step ${status}`}>
      <div className="timeline-icon-wrapper">
        {status === 'completed' && <CheckCircle2 size={16} className="timeline-icon completed-icon" />}
        {status === 'current' && <MoreHorizontal size={16} className="timeline-icon current-icon" />}
        {status === 'pending' && <Circle size={16} className="timeline-icon pending-icon" />}
      </div>
      <div className="timeline-label">{label}</div>
    </div>
  );
};

export const GoalTimeline: React.FC = () => {
  const steps: TimelineStepProps[] = [
    { label: 'Initiated', status: 'completed' },
    { label: 'Analyzing Request', status: 'completed' },
    { label: 'Awaiting Approval', status: 'current' },
    { label: 'Executing Transfer', status: 'pending' },
    { label: 'Completed', status: 'pending' }
  ];

  return (
    <div className="goal-timeline">
      {steps.map((step, idx) => (
        <React.Fragment key={idx}>
          <TimelineStep label={step.label} status={step.status} />
          {idx < steps.length - 1 && <div className={`timeline-line ${step.status === 'completed' ? 'line-completed' : ''}`} />}
        </React.Fragment>
      ))}
    </div>
  );
};
