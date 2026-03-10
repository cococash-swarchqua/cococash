import React from 'react';
import { Link } from 'react-router-dom';
import { useWallet } from '../context/WalletContext';

const Dashboard = () => {
  const { balance } = useWallet();

  return (
    <div className="space-y-8">
      {/* Overview Card */}
      <div className="bg-gradient-to-r from-coco-dark to-coco-brown-dark rounded-2xl p-8 text-white shadow-xl relative overflow-hidden">
        <div className="relative z-10">
          <p className="text-coco-green font-medium mb-1">Saldo Disponible</p>
          <h2 className="text-4xl md:text-5xl font-bold">${balance.toLocaleString('en-US', { minimumFractionDigits: 2 })}</h2>
          <div className="mt-8 flex gap-4">
             <div className="text-sm bg-white/10 px-3 py-1 rounded-full">**** 4582</div>
             <div className="text-sm bg-coco-green/20 text-coco-green px-3 py-1 rounded-full">Activa</div>
          </div>
        </div>
        <div className="absolute right-0 bottom-0 opacity-10 transform translate-x-10 translate-y-10">
           <img src="/assets/imagotipo.png" className="w-64 h-64" alt="Decoration" />
        </div>
      </div>

      {/* Action Modules */}
      <div className="grid md:grid-cols-2 gap-6">
        <Link to="/transfer" className="group">
          <div className="bg-white p-6 rounded-xl shadow-sm hover:shadow-md transition-all border border-transparent hover:border-coco-green h-full flex flex-col justify-between">
            <div>
              <div className="w-12 h-12 bg-coco-green/10 text-coco-green rounded-lg flex items-center justify-center mb-4 text-2xl group-hover:scale-110 transition-transform">
                💸
              </div>
              <h3 className="text-xl font-bold text-gray-800 mb-2">Realizar Transferencia</h3>
              <p className="text-gray-500">Envía dinero a otros usuarios de CocoCash o bancos externos de forma segura.</p>
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
              <p className="text-gray-500">Consulta tu historial, descarga extractos y revisa tus gastos mensuales.</p>
            </div>
            <div className="mt-4 text-coco-brown font-medium flex items-center gap-2">
              Ver Historial <span>→</span>
            </div>
          </div>
        </Link>
      </div>
    </div>
  );
};

export default Dashboard;
