import React, { useState, useEffect, useCallback } from 'react';
import { api, type Appointment } from '../services/api';

const tableStyle: React.CSSProperties = {
  width: '100%',
  borderCollapse: 'collapse',
  background: '#fff',
  borderRadius: '12px',
  overflow: 'hidden',
  boxShadow: '0 2px 12px rgba(0,0,0,0.08)',
};

const thStyle: React.CSSProperties = {
  padding: '12px 16px',
  textAlign: 'left',
  fontSize: '12px',
  fontWeight: 700,
  textTransform: 'uppercase',
  letterSpacing: '0.05em',
  color: '#555',
  background: '#f9f9f9',
  borderBottom: '1px solid #e0e0e0',
};

const tdStyle: React.CSSProperties = {
  padding: '12px 16px',
  fontSize: '14px',
  borderBottom: '1px solid #f0f0f0',
  verticalAlign: 'top',
};

const actionBtnBase: React.CSSProperties = {
  padding: '5px 10px',
  borderRadius: '4px',
  fontSize: '12px',
  cursor: 'pointer',
  fontWeight: 500,
  marginRight: '6px',
};

const STATUS_COLORS: Record<string, { bg: string; color: string }> = {
  confirmed: { bg: '#e8f5e9', color: '#2e7d32' },
  cancelled: { bg: '#ffebee', color: '#c62828' },
  completed: { bg: '#e3f2fd', color: '#1565c0' },
};

function StatusBadge({ status }: { status: string }) {
  const c = STATUS_COLORS[status] ?? { bg: '#f5f5f5', color: '#555' };
  return (
    <span style={{
      background: c.bg,
      color: c.color,
      padding: '3px 10px',
      borderRadius: '12px',
      fontSize: '12px',
      fontWeight: 600,
    }}>
      {status}
    </span>
  );
}

function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString([], {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

// Minimum datetime string for input[type=datetime-local] set to now + 1 min
function minDateTimeLocal() {
  const d = new Date(Date.now() + 60_000);
  return d.toISOString().slice(0, 16);
}

interface RescheduleFormProps {
  appointmentId: string;
  onDone: () => void;
  onCancel: () => void;
}

function RescheduleForm({ appointmentId, onDone, onCancel }: RescheduleFormProps) {
  const [newDatetime, setNewDatetime] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async () => {
    if (!newDatetime) { setError('Please select a new date and time'); return; }
    setError('');
    setLoading(true);
    try {
      await api.rescheduleAppointment(appointmentId, {
        newStartTime: new Date(newDatetime).toISOString(),
      });
      onDone();
    } catch (e: any) {
      setError(e.message ?? 'Reschedule failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{
      padding: '12px 16px',
      background: '#fffde7',
      borderTop: '1px solid #f0e0a0',
      display: 'flex',
      alignItems: 'center',
      gap: '10px',
      flexWrap: 'wrap',
    }}>
      <span style={{ fontSize: '13px', fontWeight: 600, color: '#555' }}>New date & time:</span>
      <input
        type="datetime-local"
        min={minDateTimeLocal()}
        value={newDatetime}
        onChange={(e) => setNewDatetime(e.target.value)}
        style={{
          padding: '5px 8px',
          border: '1px solid #ddd',
          borderRadius: '4px',
          fontSize: '13px',
        }}
      />
      {error && <span style={{ color: '#c62828', fontSize: '12px' }}>{error}</span>}
      <button
        onClick={handleSubmit}
        disabled={loading}
        style={{
          ...actionBtnBase,
          background: '#f57c00',
          color: '#fff',
          border: 'none',
          opacity: loading ? 0.7 : 1,
          marginRight: 0,
        }}
      >
        {loading ? 'Saving...' : 'Confirm Reschedule'}
      </button>
      <button
        onClick={onCancel}
        disabled={loading}
        style={{ ...actionBtnBase, background: '#fff', color: '#555', border: '1px solid #ccc' }}
      >
        Cancel
      </button>
    </div>
  );
}

export default function AppointmentsPage() {
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [reschedulingId, setReschedulingId] = useState<string | null>(null);

  const load = useCallback(async (status?: string) => {
    setLoading(true);
    setError('');
    try {
      const data = await api.getAppointments(undefined, status || undefined);
      setAppointments(data);
    } catch (e: any) {
      setError(e.message ?? 'Failed to load appointments');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load(statusFilter);
  }, [load, statusFilter]);

  const handleCancel = async (id: string) => {
    if (!confirm('Cancel this appointment?')) return;
    setActionLoading(id + ':cancel');
    try {
      await api.cancelAppointment(id);
      await load(statusFilter);
    } catch (e: any) {
      setError(e.message ?? 'Cancel failed');
    } finally {
      setActionLoading(null);
    }
  };

  const handleComplete = async (id: string) => {
    if (!confirm('Mark this appointment as completed?')) return;
    setActionLoading(id + ':complete');
    try {
      await api.completeAppointment(id);
      await load(statusFilter);
    } catch (e: any) {
      setError(e.message ?? 'Complete failed');
    } finally {
      setActionLoading(null);
    }
  };

  const handleRescheduleDone = async () => {
    setReschedulingId(null);
    await load(statusFilter);
  };

  if (loading) {
    return <p style={{ color: '#555', padding: '32px' }}>Loading appointments...</p>;
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap', gap: '8px' }}>
        <h1 style={{ margin: 0, fontSize: '24px' }}>Appointments</h1>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            style={{
              padding: '7px 10px',
              border: '1px solid #ddd',
              borderRadius: '6px',
              fontSize: '13px',
              background: '#fff',
            }}
          >
            <option value="">All statuses</option>
            <option value="confirmed">Confirmed</option>
            <option value="completed">Completed</option>
            <option value="cancelled">Cancelled</option>
          </select>
          <button
            onClick={() => load(statusFilter)}
            style={{
              padding: '8px 16px',
              background: '#1a1a2e',
              color: '#fff',
              border: 'none',
              borderRadius: '6px',
              fontSize: '13px',
              cursor: 'pointer',
            }}
          >
            Refresh
          </button>
        </div>
      </div>

      {error && (
        <div style={{
          padding: '12px 16px',
          background: '#ffebee',
          color: '#c62828',
          borderRadius: '6px',
          fontSize: '14px',
          marginBottom: '16px',
        }}>
          {error}
        </div>
      )}

      {appointments.length === 0 ? (
        <div style={{
          background: '#fff',
          borderRadius: '12px',
          padding: '48px',
          textAlign: 'center',
          color: '#999',
          boxShadow: '0 2px 12px rgba(0,0,0,0.08)',
        }}>
          No appointments found. Book a service to get started.
        </div>
      ) : (
        <table style={tableStyle}>
          <thead>
            <tr>
              <th style={thStyle}>Date & Time</th>
              <th style={thStyle}>Customer</th>
              <th style={thStyle}>Vehicle</th>
              <th style={thStyle}>Service</th>
              <th style={thStyle}>Dealership</th>
              <th style={thStyle}>Technician</th>
              <th style={thStyle}>Bay</th>
              <th style={thStyle}>Status</th>
              <th style={thStyle}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {appointments.map((apt) => (
              <React.Fragment key={apt.id}>
                <tr>
                  <td style={tdStyle}>
                    {apt.during?.start ? formatDateTime(apt.during.start) : '—'}
                  </td>
                  <td style={tdStyle}>
                    <div style={{ fontWeight: 500 }}>{apt.customer?.name ?? '—'}</div>
                    <div style={{ fontSize: '12px', color: '#888' }}>{apt.customer?.email ?? ''}</div>
                  </td>
                  <td style={tdStyle}>
                    {apt.vehicle
                      ? `${apt.vehicle.year} ${apt.vehicle.make} ${apt.vehicle.model}`
                      : '—'}
                  </td>
                  <td style={tdStyle}>{apt.serviceType?.name ?? '—'}</td>
                  <td style={tdStyle}>{apt.serviceBay?.dealership?.name ?? '—'}</td>
                  <td style={tdStyle}>{apt.technician?.name ?? '—'}</td>
                  <td style={tdStyle}>{apt.serviceBay?.name ?? '—'}</td>
                  <td style={tdStyle}>
                    <StatusBadge status={apt.status} />
                  </td>
                  <td style={tdStyle}>
                    {apt.status === 'confirmed' && (
                      <>
                        <button
                          onClick={() => setReschedulingId(reschedulingId === apt.id ? null : apt.id)}
                          disabled={actionLoading !== null}
                          style={{
                            ...actionBtnBase,
                            background: '#fff3e0',
                            color: '#e65100',
                            border: '1px solid #e65100',
                          }}
                        >
                          Reschedule
                        </button>
                        <button
                          onClick={() => handleComplete(apt.id)}
                          disabled={actionLoading !== null}
                          style={{
                            ...actionBtnBase,
                            background: '#e3f2fd',
                            color: '#1565c0',
                            border: '1px solid #1565c0',
                            opacity: actionLoading === apt.id + ':complete' ? 0.7 : 1,
                          }}
                        >
                          {actionLoading === apt.id + ':complete' ? '...' : 'Complete'}
                        </button>
                        <button
                          onClick={() => handleCancel(apt.id)}
                          disabled={actionLoading !== null}
                          style={{
                            ...actionBtnBase,
                            background: '#fff',
                            color: '#c62828',
                            border: '1px solid #c62828',
                            marginRight: 0,
                            opacity: actionLoading === apt.id + ':cancel' ? 0.7 : 1,
                          }}
                        >
                          {actionLoading === apt.id + ':cancel' ? '...' : 'Cancel'}
                        </button>
                      </>
                    )}
                  </td>
                </tr>
                {reschedulingId === apt.id && (
                  <tr>
                    <td colSpan={9} style={{ padding: 0 }}>
                      <RescheduleForm
                        appointmentId={apt.id}
                        onDone={handleRescheduleDone}
                        onCancel={() => setReschedulingId(null)}
                      />
                    </td>
                  </tr>
                )}
              </React.Fragment>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
