import React, { useState } from 'react';
import './ChatComponents.css';
import { ShieldAlert, Check, X } from 'lucide-react';

interface ApprovalInlineProps {
  actionDescription: string;
  onApprove: () => void;
  onReject: () => void;
}

export const ApprovalInline: React.FC<ApprovalInlineProps> = ({ actionDescription, onApprove, onReject }) => {
  const [resolved, setResolved] = useState<'approved' | 'rejected' | null>(null);

  const handleApprove = () => {
    setResolved('approved');
    onApprove();
  };

  const handleReject = () => {
    setResolved('rejected');
    onReject();
  };

  if (resolved === 'approved') {
    return <div className="activity-node success-node"><Check size={14} className="activity-icon" /> Approved: {actionDescription}</div>;
  }

  if (resolved === 'rejected') {
    return <div className="activity-node error-node"><X size={14} className="activity-icon" /> Rejected: {actionDescription}</div>;
  }

  return (
    <div className="approval-card">
      <div className="approval-header">
        <ShieldAlert size={18} className="approval-icon" />
        <strong>Approval Required</strong>
      </div>
      <div className="approval-body">
        {actionDescription}
      </div>
      <div className="approval-actions">
        <button className="btn-reject" onClick={handleReject}>Reject</button>
        <button className="btn-approve" onClick={handleApprove}>Approve</button>
      </div>
    </div>
  );
};
