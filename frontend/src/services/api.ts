const BASE = '/api';

export interface Dealership {
  id: string;
  name: string;
  address: string;
}

export interface ServiceType {
  id: string;
  name: string;
  durationMinutes: number;
  requiredSkill: string;
}

export interface Technician {
  id: string;
  name: string;
  skills: string[];
}

export interface ServiceBay {
  id: string;
  name: string;
}

export interface AvailabilityResponse {
  available: boolean;
  startTime: string;
  endTime: string;
  availableBays: ServiceBay[];
  availableTechs: Technician[];
  serviceType: ServiceType;
}

export interface Appointment {
  id: string;
  status: string;
  notes?: string;
  during: { start: string; end: string };
  customer: { id: string; name: string; email: string };
  vehicle: { id: string; make: string; model: string; year: number; vin: string };
  technician: { id: string; name: string };
  serviceBay: { id: string; name: string; dealership?: { id: string; name: string } };
  serviceType: { id: string; name: string; durationMinutes: number };
  createdAt: string;
}

export interface Customer {
  id: string;
  name: string;
  email: string;
  phone: string;
}

export interface Vehicle {
  id: string;
  customerId: string;
  vin: string;
  make: string;
  model: string;
  year: number;
}

export interface CreateAppointmentDto {
  customerId: string;
  vehicleId: string;
  technicianId: string;
  serviceBayId: string;
  serviceTypeId: string;
  startTime: string;
  notes?: string;
}

export interface RescheduleAppointmentDto {
  newStartTime: string;
  technicianId?: string;
  serviceBayId?: string;
  notes?: string;
}

async function apiFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  const data = await res.json();
  if (!res.ok) {
    const message = data?.message ?? `HTTP ${res.status}`;
    throw new Error(Array.isArray(message) ? message.join('; ') : message);
  }
  return data as T;
}

export const api = {
  getDealerships: () => apiFetch<Dealership[]>('/dealerships'),
  getServiceTypes: () => apiFetch<ServiceType[]>('/service-types'),
  getCustomers: () => apiFetch<Customer[]>('/customers'),
  getVehicles: (customerId: string) => apiFetch<Vehicle[]>(`/vehicles?customerId=${customerId}`),

  checkAvailability: (
    dealershipId: string,
    serviceTypeId: string,
    startTime: string,
  ) =>
    apiFetch<AvailabilityResponse>(
      `/availability?dealershipId=${dealershipId}&serviceTypeId=${serviceTypeId}&startTime=${encodeURIComponent(startTime)}`,
    ),

  createAppointment: (dto: CreateAppointmentDto) =>
    apiFetch<Appointment>('/appointments', {
      method: 'POST',
      body: JSON.stringify(dto),
    }),

  getAppointments: (customerId?: string, status?: string) => {
    const params = new URLSearchParams();
    if (customerId) params.set('customerId', customerId);
    if (status) params.set('status', status);
    return apiFetch<Appointment[]>(`/appointments${params.toString() ? '?' + params : ''}`);
  },

  cancelAppointment: (id: string) =>
    apiFetch<Appointment>(`/appointments/${id}/cancel`, { method: 'PATCH' }),

  completeAppointment: (id: string) =>
    apiFetch<Appointment>(`/appointments/${id}/complete`, { method: 'PATCH' }),

  rescheduleAppointment: (id: string, dto: RescheduleAppointmentDto) =>
    apiFetch<Appointment>(`/appointments/${id}/reschedule`, {
      method: 'PATCH',
      body: JSON.stringify(dto),
    }),
};
