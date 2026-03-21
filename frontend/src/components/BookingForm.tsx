import React from 'react';
import type { Dealership, ServiceType } from '../services/api';

interface Props {
  dealerships: Dealership[];
  serviceTypes: ServiceType[];
  dealershipId: string;
  serviceTypeId: string;
  date: string;
  desiredTime: string;
  onDealershipChange: (v: string) => void;
  onServiceTypeChange: (v: string) => void;
  onDateChange: (v: string) => void;
  onTimeChange: (v: string) => void;
  onSubmit: () => void;
  loading: boolean;
}

const fieldStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '4px',
};

const labelStyle: React.CSSProperties = {
  fontSize: '13px',
  fontWeight: 600,
  color: '#555',
};

const selectStyle: React.CSSProperties = {
  padding: '8px 12px',
  borderRadius: '6px',
  border: '1px solid #ddd',
  fontSize: '14px',
  background: '#fff',
};

const inputStyle: React.CSSProperties = {
  padding: '8px 12px',
  borderRadius: '6px',
  border: '1px solid #ddd',
  fontSize: '14px',
};

const btnStyle: React.CSSProperties = {
  padding: '10px 24px',
  background: '#1a1a2e',
  color: '#fff',
  border: 'none',
  borderRadius: '6px',
  fontSize: '14px',
  fontWeight: 600,
  cursor: 'pointer',
  alignSelf: 'flex-end',
};

export default function BookingForm({
  dealerships,
  serviceTypes,
  dealershipId,
  serviceTypeId,
  date,
  desiredTime,
  onDealershipChange,
  onServiceTypeChange,
  onDateChange,
  onTimeChange,
  onSubmit,
  loading,
}: Props) {
  const canCheckAvailability = Boolean(dealershipId && serviceTypeId && date && desiredTime);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      <div style={fieldStyle}>
        <label style={labelStyle}>Dealership</label>
        <select
          style={selectStyle}
          value={dealershipId}
          onChange={(e) => onDealershipChange(e.target.value)}
        >
          <option value="">Select dealership...</option>
          {dealerships.map((d) => (
            <option key={d.id} value={d.id}>
              {d.name}
            </option>
          ))}
        </select>
      </div>

      <div style={fieldStyle}>
        <label style={labelStyle}>Service Type</label>
        <select
          style={selectStyle}
          value={serviceTypeId}
          onChange={(e) => onServiceTypeChange(e.target.value)}
        >
          <option value="">Select service...</option>
          {serviceTypes.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name} ({s.durationMinutes} min)
            </option>
          ))}
        </select>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
        <div style={fieldStyle}>
          <label style={labelStyle}>Date</label>
          <input
            type="date"
            style={inputStyle}
            value={date}
            onChange={(e) => onDateChange(e.target.value)}
          />
        </div>
        <div style={fieldStyle}>
          <label style={labelStyle}>Time</label>
          <input
            type="time"
            style={inputStyle}
            value={desiredTime}
            onChange={(e) => onTimeChange(e.target.value)}
          />
        </div>
      </div>

      <button
        type="button"
        style={{
          ...btnStyle,
          opacity: loading ? 0.7 : canCheckAvailability ? 1 : 0.75,
          // Button stays clickable so BookingPage can show validation error.
          cursor: loading ? 'not-allowed' : 'pointer',
        }}
        onClick={onSubmit}
        disabled={loading}
      >
        {loading ? 'Checking...' : 'Check Availability'}
      </button>
    </div>
  );
}
