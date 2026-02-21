import React from 'react';
import { useWallet } from '../context/WalletContext';

const Balance = () => {
  const { transactions } = useWallet();

  return (
    <div>
      <h2 className="text-2xl font-bold mb-6 text-coco-dark">Historial de Movimientos</h2>

      <div className="bg-white rounded-xl shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead className="bg-gray-50 text-gray-600 uppercase text-xs">
              <tr>
                <th className="px-6 py-4 font-semibold">Fecha</th>
                <th className="px-6 py-4 font-semibold">Descripción / Destino</th>
                <th className="px-6 py-4 font-semibold">ID Transacción</th>
                <th className="px-6 py-4 font-semibold text-right">Monto</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {transactions.map((tx) => (
                <tr key={tx.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-6 py-4 text-gray-600 text-sm whitespace-nowrap">
                    {tx.date}
                  </td>
                  <td className="px-6 py-4 font-medium text-gray-800">
                    {tx.destination}
                  </td>
                  <td className="px-6 py-4 text-gray-400 text-xs font-mono">
                    #{tx.id}
                  </td>
                  <td className={`px-6 py-4 text-right font-bold ${tx.amount > 0 ? 'text-coco-green' : 'text-red-500'}`}>
                    {tx.amount > 0 ? '+' : ''}
                    ${Math.abs(tx.amount).toFixed(2)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          
          {transactions.length === 0 && (
             <div className="p-12 text-center text-gray-500">
               No hay movimientos recientes.
             </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default Balance;
