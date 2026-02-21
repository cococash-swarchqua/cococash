import React, { createContext, useState, useContext, useEffect } from 'react';

const AuthContext = createContext();

export const useAuth = () => useContext(AuthContext);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Simulate checking for a persisted session
    const storedUser = localStorage.getItem('cococash_user');
    if (storedUser) {
      setUser(JSON.parse(storedUser));
    }
    setLoading(false);
  }, []);

  const login = (userData) => {
    // In a real app, you'd validate credentials here
    const userObj = { ...userData, id: Date.now() };
    setUser(userObj);
    localStorage.setItem('cococash_user', JSON.stringify(userObj));
    return true;
  };

  const logout = () => {
    setUser(null);
    localStorage.removeItem('cococash_user');
  };

  const register = (userData) => {
    // Simulation
    return login(userData);
  };

  return (
    <AuthContext.Provider value={{ user, login, logout, register, loading }}>
      {!loading && children}
    </AuthContext.Provider>
  );
};
