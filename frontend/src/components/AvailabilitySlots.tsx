import React from 'react';
import type { AvailabilityResponse, Technician, ServiceBay } from '../services/api';

interface Props {
  availability: AvailabilityResponse;
  selectedTech: string;
  selectedBay: string;
  onTechChange: (v: string) => void;
  onBayChange: (v: string) => void;
  onConfirm: () => void;
  loading: boolean;
}

const cardStyle: React.CSSProperties = {
  background: '#fff',
  border: '1px solid #e0e0e0',
  borderRadius: '8px',
  padding: '16px',
  marginTop: '16px',
};

const successBadge: React.CSSProperties = {
  background: '#e8f5e9',
  color: '#2e7d32',
  padding: '6px 12px',
  borderRadius: '20px',
  fontSize: '13px',
  fontWeight: 600,
  display: 'inline-block',
  marginBottom: '12px',
};

const unavailableBadge: React.CSSProperties = {
  ...successBadge,
  background: '#ffebee',
  color: '#c62828',
};

const selectStyle: React.CSSProperties = {
  padding: '8px 12px',
  borderRadius: '6px',
  border: '1px solid #ddd',
  fontSize: '14px',
  width: '100%',
  background: '#fff',
};

const confirmBtn: React.CSSProperties = {
  padding: '10px 24px',
  background: '#2e7d32',
  color: '#fff',
  border: 'none',
  borderRadius: '6px',
  fontSize: '14px',
  fontWeight: 600,
  cursor: 'pointer',
  marginTop: '16px',
};

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export default function AvailabilitySlots({
  availability,
  selectedTech,
  selectedBay,
  onTechChange,
  onBayChange,
  onConfirm,
  loading,
}: Props) {
  if (!availability.available) {
    return (
      <div style={cardStyle}>
        <span style={unavailableBadge}>No Availability</span>
        <p style={{ margin: 0, fontSize: '14px', color: '#555' }}>
          No technicians or service bays are available for this time slot. Please try a different time.
        </p>
      </div>
    );
  }

  const startStr = formatTime(availability.startTime);
  const endStr = formatTime(availability.endTime);

  return (
    <div style={cardStyle}>
      <span style={successBadge}>Available</span>
      <p style={{ margin: '0 0 16px', fontSize: '14px', color: '#555' }}>
        Slot: <strong>{startStr} – {endStr}</strong> ({availability.serviceType.durationMinutes} min)
      </p>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '8px' }}>
        <div>
          <label style={{ fontSize: '13px', fontWeight: 600, color: '#555', display: 'block', marginBottom: '4px' }}>
            Technician
          </label>
          <select style={selectStyle} value={selectedTech} onChange={(e) => onTechChange(e.target.value)}>
            {availability.availableTechs.map((t: Technician) => (
              <option key={t.id} value={t.id}>{t.name}</option>
            ))}
          </select>
        </div>
        <div>
          <label style={{ fontSize: '13px', fontWeight: 600, color: '#555', display: 'block', marginBottom: '4px' }}>
            Service Bay
          </label>
          <select style={selectStyle} value={selectedBay} onChange={(e) => onBayChange(e.target.value)}>
            {availability.availableBays.map((b: ServiceBay) => (
              <option key={b.id} value={b.id}>{b.name}</option>
            ))}
          </select>
        </div>
      </div>

      <button
        style={{ ...confirmBtn, opacity: loading || !selectedTech || !selectedBay ? 0.7 : 1 }}
        onClick={onConfirm}
        disabled={loading || !selectedTech || !selectedBay}
      >
        {loading ? 'Booking...' : 'Confirm Booking'}
      </button>
    </div>
  );
}
