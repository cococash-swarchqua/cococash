import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { WalletProvider } from './context/WalletContext';
import Landing from './pages/Landing';
import Login from './pages/Login';
import Register from './pages/Register';
import Dashboard from './pages/Dashboard';
import Transfer from './pages/Transfer';
import Balance from './pages/Balance';
import Deposit from './pages/Deposit';
import Certificates from './pages/Certificates';
import Layout from './components/Layout';

const PrivateRoute = ({ children }) => {
  const { user, loading } = useAuth();

  if (loading) return <div className="min-h-screen flex items-center justify-center bg-coco-offwhite text-coco-green">Cargando...</div>;

  return user ? children : <Navigate to="/login" />;
};

function App() {
  return (
    <AuthProvider>
      <WalletProvider>
        <Router>
          <Routes>
            <Route path="/" element={<Landing />} />
            <Route path="/login" element={<Login />} />
            <Route path="/register" element={<Register />} />

            <Route path="/dashboard" element={
              <PrivateRoute>
                <Layout>
                  <Dashboard />
                </Layout>
              </PrivateRoute>
            } />

            <Route path="/transfer" element={
              <PrivateRoute>
                <Layout>
                  <Transfer />
                </Layout>
              </PrivateRoute>
            } />

            <Route path="/balance" element={
              <PrivateRoute>
                <Layout>
                  <Balance />
                </Layout>
              </PrivateRoute>
            } />

            <Route path="/deposit" element={
              <PrivateRoute>
                <Layout>
                  <Deposit />
                </Layout>
              </PrivateRoute>
            } />

            <Route path="/certificates" element={
              <PrivateRoute>
                <Layout>
                  <Certificates />
                </Layout>
              </PrivateRoute>
            } />
          </Routes>
        </Router>
      </WalletProvider>
    </AuthProvider>
  );
}

export default App;
