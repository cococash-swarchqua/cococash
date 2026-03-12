import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useWallet } from '../context/WalletContext';

const Layout = ({ children }) => {
  const { user, logout } = useAuth();
  const { balance, walletLoading } = useWallet();
  const location = useLocation();

  const isActive = (path) => location.pathname === path;

  const displayBalance = walletLoading ? '...' : `$${balance.toFixed(2)}`;

  return (
    <div className="min-h-screen bg-coco-offwhite flex">
      {/* Sidebar */}
      <aside className="w-64 bg-coco-dark text-white fixed h-full hidden md:flex flex-col">
        <div className="p-6">
          <Link to="/dashboard" className="flex items-center gap-2">
            <img src="/assets/isotipo.png" alt="Logo" className="w-10 h-10 object-contain bg-white rounded-full p-1" />
            <span className="text-2xl font-bold text-coco-green">CocoCash</span>
          </Link>
        </div>

        <nav className="flex-1 px-4 py-4 space-y-2">
          <Link to="/dashboard" className={`block px-4 py-3 rounded-lg transition-colors ${isActive('/dashboard') ? 'bg-coco-green text-white' : 'hover:bg-gray-800 text-gray-300'}`}>
            Dashboard
          </Link>
          <Link to="/deposit" className={`block px-4 py-3 rounded-lg transition-colors ${isActive('/deposit') ? 'bg-coco-green text-white' : 'hover:bg-gray-800 text-gray-300'}`}>
            Depositar
          </Link>
          <Link to="/transfer" className={`block px-4 py-3 rounded-lg transition-colors ${isActive('/transfer') ? 'bg-coco-green text-white' : 'hover:bg-gray-800 text-gray-300'}`}>
            Transferir
          </Link>
          <Link to="/balance" className={`block px-4 py-3 rounded-lg transition-colors ${isActive('/balance') ? 'bg-coco-green text-white' : 'hover:bg-gray-800 text-gray-300'}`}>
            Movimientos
          </Link>
        </nav>

        <div className="p-4 border-t border-gray-800">
          <div className="mb-4">
            <p className="text-sm text-gray-400">Saldo Actual</p>
            <p className="text-xl font-bold text-coco-green">{displayBalance}</p>
          </div>
          <button
            onClick={logout}
            className="w-full text-left px-4 py-2 text-red-400 hover:bg-red-400/10 rounded-lg transition-colors"
          >
            Cerrar Sesión
          </button>
        </div>
      </aside>

      {/* Mobile Header */}
      <div className="md:hidden fixed top-0 w-full bg-coco-dark text-white z-50 p-4 flex justify-between items-center shadow-lg">
        <span className="font-bold text-coco-green">CocoCash</span>
        <button onClick={logout} className="text-sm text-gray-300">Salir</button>
      </div>

      {/* Main Content */}
      <main className="flex-1 md:ml-64 p-6 mt-16 md:mt-0">
        <header className="mb-8 flex justify-between items-center">
          <div>
            <h1 className="text-2xl font-bold text-coco-brown-dark">Hola, {user?.name || 'Usuario'}</h1>
            <p className="text-gray-600">Bienvenido a tu billetera digital.</p>
          </div>
        </header>
        {children}
      </main>
    </div>
  );
};

export default Layout;
