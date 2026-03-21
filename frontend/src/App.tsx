import React from 'react';
import { BrowserRouter, Routes, Route, NavLink } from 'react-router-dom';
import BookingPage from './pages/BookingPage';
import AppointmentsPage from './pages/AppointmentsPage';

const navStyle: React.CSSProperties = {
  background: '#1a1a2e',
  padding: '0 24px',
  display: 'flex',
  alignItems: 'center',
  gap: '24px',
  height: '56px',
};

const logoStyle: React.CSSProperties = {
  color: '#fff',
  fontWeight: 700,
  fontSize: '18px',
  textDecoration: 'none',
  marginRight: 'auto',
};

const linkStyle = ({ isActive }: { isActive: boolean }): React.CSSProperties => ({
  color: isActive ? '#4fc3f7' : '#ccc',
  textDecoration: 'none',
  fontWeight: isActive ? 600 : 400,
  fontSize: '14px',
});

export default function App() {
  return (
    <BrowserRouter>
      <nav style={navStyle}>
        <span style={logoStyle}>Keyloop Scheduler</span>
        <NavLink to="/" style={linkStyle} end>Book Service</NavLink>
        <NavLink to="/appointments" style={linkStyle}>Appointments</NavLink>
      </nav>
      <main style={{ maxWidth: '960px', margin: '32px auto', padding: '0 16px' }}>
        <Routes>
          <Route path="/" element={<BookingPage />} />
          <Route path="/appointments" element={<AppointmentsPage />} />
        </Routes>
      </main>
    </BrowserRouter>
  );
}
