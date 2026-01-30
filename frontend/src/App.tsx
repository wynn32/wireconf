import { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import Layout from './components/Layout';
import Networks from './pages/Networks';
import Clients from './pages/Clients';
import LiveStatus from './pages/LiveStatus';
import SetupWizard from './pages/SetupWizard';
import Topology from './pages/Topology';
import ServerSettings from './pages/ServerSettings';
import api from './api';
import './App.css';

function App() {
  const [setupComplete, setSetupComplete] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    checkSetupStatus();
  }, []);

  const checkSetupStatus = async () => {
    try {
      const res = await api.get('/setup/status');
      setSetupComplete(res.data.setup_completed);
    } catch (err) {
      console.error('Failed to check setup status', err);
      setSetupComplete(false);
    } finally {
      setLoading(false);
    }
  };

  const handleSetupComplete = () => {
    setSetupComplete(true);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center">
        <div className="text-white text-xl">Loading...</div>
      </div>
    );
  }

  if (!setupComplete) {
    return <SetupWizard onComplete={handleSetupComplete} />;
  }

  return (
    <Router>
      <Layout>
        <Routes>
          <Route path="/networks" element={<Networks />} />
          <Route path="/clients" element={<Clients />} />
          <Route path="/status" element={<LiveStatus />} />
          <Route path="/topology" element={<Topology />} />
          <Route path="/settings" element={<ServerSettings />} />
          <Route path="/" element={<Navigate to="/clients" replace />} />
        </Routes>
      </Layout>
    </Router>
  );
}

export default App;
