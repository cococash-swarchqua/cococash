import React from 'react';
import { Link } from 'react-router-dom';
import { useWallet } from '../context/WalletContext';

const Dashboard = () => {
  const { balance, account, walletLoading, error } = useWallet();

  if (walletLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-coco-green mx-auto mb-4"></div>
          <p className="text-gray-500">Cargando tu billetera...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6 bg-red-50 border border-red-200 rounded-xl text-red-700">
        <p className="font-semibold">Error al cargar tu billetera</p>
        <p className="text-sm mt-1">{error}</p>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Overview Card */}
      <div className="bg-gradient-to-r from-coco-dark to-coco-brown-dark rounded-2xl p-8 text-white shadow-xl relative overflow-hidden">
        <div className="relative z-10">
          <p className="text-coco-green font-medium mb-1">Saldo Disponible</p>
          <h2 className="text-4xl md:text-5xl font-bold">${balance.toLocaleString('en-US', { minimumFractionDigits: 2 })}</h2>
          <div className="mt-8 flex gap-4">
             {account?.accountNumber && (
               <div className="text-sm bg-white/10 px-3 py-1 rounded-full">
                 Cuenta: {account.accountNumber}
               </div>
             )}
             <div className="text-sm bg-coco-green/20 text-coco-green px-3 py-1 rounded-full">Activa</div>
          </div>
        </div>
        <div className="absolute right-0 bottom-0 opacity-10 transform translate-x-10 translate-y-10">
           <img src="/assets/imagotipo.png" className="w-64 h-64" alt="Decoration" />
        </div>
      </div>

      {/* Action Modules */}
      <div className="grid md:grid-cols-3 gap-6">
        <Link to="/transfer" className="group">
          <div className="bg-white p-6 rounded-xl shadow-sm hover:shadow-md transition-all border border-transparent hover:border-coco-green h-full flex flex-col justify-between">
            <div>
              <div className="w-12 h-12 bg-coco-green/10 text-coco-green rounded-lg flex items-center justify-center mb-4 text-2xl group-hover:scale-110 transition-transform">
                💸
              </div>
              <h3 className="text-xl font-bold text-gray-800 mb-2">Realizar Transferencia</h3>
              <p className="text-gray-500">Envía dinero a otros usuarios de CocoCash de forma segura.</p>
            </div>
            <div className="mt-4 text-coco-green font-medium flex items-center gap-2">
              Ir a Transferencias <span>→</span>
            </div>
          </div>
        </Link>

        <Link to="/balance" className="group">
          <div className="bg-white p-6 rounded-xl shadow-sm hover:shadow-md transition-all border border-transparent hover:border-coco-brown h-full flex flex-col justify-between">
            <div>
              <div className="w-12 h-12 bg-coco-brown/10 text-coco-brown rounded-lg flex items-center justify-center mb-4 text-2xl group-hover:scale-110 transition-transform">
                📊
              </div>
              <h3 className="text-xl font-bold text-gray-800 mb-2">Ver Movimientos</h3>
              <p className="text-gray-500">Consulta tu historial de transferencias y revisa tus movimientos.</p>
            </div>
            <div className="mt-4 text-coco-brown font-medium flex items-center gap-2">
              Ver Historial <span>→</span>
            </div>
          </div>
        </Link>

        <Link to="/certificates" className="group">
          <div className="bg-white p-6 rounded-xl shadow-sm hover:shadow-md transition-all border border-transparent hover:border-blue-500 h-full flex flex-col justify-between">
            <div>
              <div className="w-12 h-12 bg-blue-50 text-blue-500 rounded-lg flex items-center justify-center mb-4 text-2xl group-hover:scale-110 transition-transform">
                📄
              </div>
              <h3 className="text-xl font-bold text-gray-800 mb-2">Certificados</h3>
              <p className="text-gray-500">Descarga tus extractos bancarios mensuales en formato PDF.</p>
            </div>
            <div className="mt-4 text-blue-500 font-medium flex items-center gap-2">
              Ver Extractos <span>→</span>
            </div>
          </div>
        </Link>
      </div>
    </div>
  );
};

export default Dashboard;
