import React from 'react';
import { useWallet } from '../context/WalletContext';

const Balance = () => {
  const { transactions, walletLoading, account, refreshWallet } = useWallet();

  if (walletLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-coco-green mx-auto"></div>
      </div>
    );
  }

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-2xl font-bold text-coco-dark">Historial de Movimientos</h2>
        <button
          onClick={refreshWallet}
          className="text-sm text-coco-green hover:underline"
        >
          ↻ Actualizar
        </button>
      </div>

      <div className="bg-white rounded-xl shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead className="bg-gray-50 text-gray-600 uppercase text-xs">
              <tr>
                <th className="px-6 py-4 font-semibold">Fecha</th>
                <th className="px-6 py-4 font-semibold">Destino</th>
                <th className="px-6 py-4 font-semibold">Estado</th>
                <th className="px-6 py-4 font-semibold">ID Transacción</th>
                <th className="px-6 py-4 font-semibold text-right">Monto</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {transactions.map((tx) => {
                const isSent = tx.sourceAccountNumber === account?.accountNumber ||
                               tx.sourceAccountId === (account?.id || account?.accountId);
                const displayAmount = parseFloat(tx.amount) || 0;
                const date = tx.createdAt
                  ? new Date(tx.createdAt).toLocaleDateString('es-CO')
                  : tx.date || '—';
                const destination = isSent
                  ? tx.destinationAccountNumber || 'Enviado'
                  : tx.sourceAccountNumber || 'Recibido';
                const statusColor = {
                  completed: 'text-green-600 bg-green-50',
                  pending: 'text-yellow-600 bg-yellow-50',
                  processing: 'text-blue-600 bg-blue-50',
                  failed: 'text-red-600 bg-red-50',
                };
                const status = tx.status || 'completed';

                return (
                  <tr key={tx.id || tx.transferId} className="hover:bg-gray-50 transition-colors">
                    <td className="px-6 py-4 text-gray-600 text-sm whitespace-nowrap">
                      {date}
                    </td>
                    <td className="px-6 py-4 font-medium text-gray-800">
                      {isSent ? `→ ${destination}` : `← ${destination}`}
                    </td>
                    <td className="px-6 py-4">
                      <span className={`text-xs px-2 py-1 rounded-full font-medium ${statusColor[status] || 'text-gray-600 bg-gray-50'}`}>
                        {status.charAt(0).toUpperCase() + status.slice(1)}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-gray-400 text-xs font-mono">
                      #{(tx.id || tx.transferId || '').toString().slice(0, 8)}
                    </td>
                    <td className={`px-6 py-4 text-right font-bold ${isSent ? 'text-red-500' : 'text-coco-green'}`}>
                      {isSent ? '-' : '+'}${Math.abs(displayAmount).toFixed(2)}
                    </td>
                  </tr>
                );
              })}
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
