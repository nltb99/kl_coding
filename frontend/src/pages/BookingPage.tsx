import React, { useState, useEffect } from 'react';
import { api, type Dealership, type ServiceType, type AvailabilityResponse, type Customer, type Vehicle } from '../services/api';
import BookingForm from '../components/BookingForm';
import AvailabilitySlots from '../components/AvailabilitySlots';

const cardStyle: React.CSSProperties = {
  background: '#fff',
  borderRadius: '12px',
  padding: '32px',
  boxShadow: '0 2px 12px rgba(0,0,0,0.08)',
};

export default function BookingPage() {
  const [dealerships, setDealerships] = useState<Dealership[]>([]);
  const [serviceTypes, setServiceTypes] = useState<ServiceType[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);

  const [dealershipId, setDealershipId] = useState('');
  const [serviceTypeId, setServiceTypeId] = useState('');
  const [date, setDate] = useState('');
  const [desiredTime, setDesiredTime] = useState('');
  const [customerId, setCustomerId] = useState('');
  const [vehicleId, setVehicleId] = useState('');

  const [availability, setAvailability] = useState<AvailabilityResponse | null>(null);
  const [selectedTech, setSelectedTech] = useState('');
  const [selectedBay, setSelectedBay] = useState('');

  const [checkLoading, setCheckLoading] = useState(false);
  const [bookLoading, setBookLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  useEffect(() => {
    Promise.all([api.getDealerships(), api.getServiceTypes(), api.getCustomers()])
      .then(([d, s, c]) => {
        setDealerships(d);
        setServiceTypes(s);
        setCustomers(c);
        if (c.length > 0) setCustomerId(c[0].id);
      })
      .catch(() => setError('Failed to load data'));
  }, []);

  useEffect(() => {
    if (!customerId) { setVehicles([]); setVehicleId(''); return; }
    api.getVehicles(customerId).then((v) => {
      setVehicles(v);
      setVehicleId(v[0]?.id ?? '');
    }).catch(() => {});
  }, [customerId]);

  const handleCheckAvailability = async () => {
    if (!dealershipId || !serviceTypeId || !date || !desiredTime) {
      setError('Please fill in all fields');
      return;
    }
    setError('');
    setSuccess('');
    setAvailability(null);
    setCheckLoading(true);
    try {
      const startTimeISO = new Date(`${date}T${desiredTime}:00`).toISOString();
      const result = await api.checkAvailability(dealershipId, serviceTypeId, startTimeISO);
      setAvailability(result);
      if (result.available) {
        setSelectedTech(result.availableTechs[0]?.id ?? '');
        setSelectedBay(result.availableBays[0]?.id ?? '');
      }
    } catch (e: any) {
      setError(e.message ?? 'Failed to check availability');
    } finally {
      setCheckLoading(false);
    }
  };

  const handleConfirmBooking = async () => {
    if (!availability || !selectedTech || !selectedBay) return;
    if (!customerId || !vehicleId) {
      setError('Please select a customer and vehicle before booking.');
      return;
    }

    setError('');
    setBookLoading(true);
    try {
      const appointment = await api.createAppointment({
        customerId,
        vehicleId,
        technicianId: selectedTech,
        serviceBayId: selectedBay,
        serviceTypeId,
        startTime: new Date(`${date}T${desiredTime}:00`).toISOString(), // local → UTC
      });
      setSuccess(`Appointment booked! ID: ${appointment.id}`);
      setAvailability(null);
    } catch (e: any) {
      setError(e.message ?? 'Booking failed');
    } finally {
      setBookLoading(false);
    }
  };

  const selectStyle: React.CSSProperties = {
    width: '100%',
    padding: '8px 12px',
    border: '1px solid #ddd',
    borderRadius: '6px',
    fontSize: '14px',
    marginBottom: '16px',
  };

  return (
    <div>
      <h1 style={{ marginTop: 0, fontSize: '24px' }}>Book a Service</h1>
      <div style={cardStyle}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 16px' }}>
          <div>
            <label style={{ fontSize: '13px', fontWeight: 600, display: 'block', marginBottom: '4px' }}>Customer</label>
            <select value={customerId} onChange={(e) => setCustomerId(e.target.value)} style={selectStyle}>
              <option value="">— select customer —</option>
              {customers.map((c) => (
                <option key={c.id} value={c.id}>{c.name} ({c.email})</option>
              ))}
            </select>
          </div>
          <div>
            <label style={{ fontSize: '13px', fontWeight: 600, display: 'block', marginBottom: '4px' }}>Vehicle</label>
            <select value={vehicleId} onChange={(e) => setVehicleId(e.target.value)} style={selectStyle} disabled={!customerId}>
              <option value="">— select vehicle —</option>
              {vehicles.map((v) => (
                <option key={v.id} value={v.id}>{v.year} {v.make} {v.model} ({v.vin})</option>
              ))}
            </select>
          </div>
        </div>
        <BookingForm
          dealerships={dealerships}
          serviceTypes={serviceTypes}
          dealershipId={dealershipId}
          serviceTypeId={serviceTypeId}
          date={date}
          desiredTime={desiredTime}
          onDealershipChange={setDealershipId}
          onServiceTypeChange={setServiceTypeId}
          onDateChange={setDate}
          onTimeChange={setDesiredTime}
          onSubmit={handleCheckAvailability}
          loading={checkLoading}
        />

        {error && (
          <div style={{
            marginTop: '16px',
            padding: '12px 16px',
            background: '#ffebee',
            color: '#c62828',
            borderRadius: '6px',
            fontSize: '14px',
          }}>
            {error}
          </div>
        )}

        {success && (
          <div style={{
            marginTop: '16px',
            padding: '12px 16px',
            background: '#e8f5e9',
            color: '#2e7d32',
            borderRadius: '6px',
            fontSize: '14px',
          }}>
            {success}
          </div>
        )}

        {availability && (
          <AvailabilitySlots
            availability={availability}
            selectedTech={selectedTech}
            selectedBay={selectedBay}
            onTechChange={setSelectedTech}
            onBayChange={setSelectedBay}
            onConfirm={handleConfirmBooking}
            loading={bookLoading}
          />
        )}
      </div>

    </div>
  );
}
