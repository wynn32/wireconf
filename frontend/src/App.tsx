import { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import Layout from './components/Layout';
import Networks from './pages/Networks';
import Clients from './pages/Clients';
import LiveStatus from './pages/LiveStatus';
import SetupWizard from './pages/SetupWizard';
import Topology from './pages/Topology';
import ServerSettings from './pages/ServerSettings';
import Login from './pages/Login';
import UserManagement from './pages/UserManagement';
import PresetManagement from './pages/PresetManagement';
import { AuthProvider, useAuth } from './AuthContext';
import api from './api';
import './App.css';

function AppRoutes() {
  const { user, isLoading: authLoading } = useAuth();
  const [setupComplete, setSetupComplete] = useState<boolean | null>(null);
  const [setupLoading, setSetupLoading] = useState(true);

  useEffect(() => {
    checkSetupStatus();
  }, []);

  const checkSetupStatus = async () => {
    try {
      const res = await api.get('/setup/status');
      setSetupComplete(res.data.setup_completed);
    } catch (err) {
      console.error('Failed to check setup status', err);
      // If setup check fails, it might be connectivity or auth (though setup status is usually public?).
      // Let's assume public.
      setSetupComplete(false);
    } finally {
      setSetupLoading(false);
    }
  };

  const handleSetupComplete = () => {
    setSetupComplete(true);
    // After setup, maybe reload to trigger auth check or create user?
    window.location.reload();
  };

  if (setupLoading || authLoading) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center">
        <div className="text-white text-xl">Loading...</div>
      </div>
    );
  }

  if (setupComplete === false) {
    return <SetupWizard onComplete={handleSetupComplete} />;
  }

  return (
    <Layout>
      <Routes>
        <Route path="/login" element={user ? <Navigate to="/" replace /> : <Login />} />

        <Route path="/networks" element={user ? <Networks /> : <Navigate to="/login" replace />} />
        <Route path="/clients" element={user ? <Clients /> : <Navigate to="/login" replace />} />
        <Route path="/status" element={user ? <LiveStatus /> : <Navigate to="/login" replace />} />
        <Route path="/topology" element={user ? <Topology /> : <Navigate to="/login" replace />} />
        <Route path="/settings" element={user ? <ServerSettings /> : <Navigate to="/login" replace />} />
        <Route path="/users" element={user ? <UserManagement /> : <Navigate to="/login" replace />} />
        <Route path="/presets" element={user ? <PresetManagement /> : <Navigate to="/login" replace />} />

        <Route path="/" element={<Navigate to={user ? "/clients" : "/login"} replace />} />
      </Routes>
    </Layout>
  );
}

function App() {
  return (
    <Router>
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
    </Router>
  );
}

export default App;
