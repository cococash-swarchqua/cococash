import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useWallet } from '../context/WalletContext';
import Button from '../components/Button';
import Input from '../components/Input';

const Transfer = () => {
  const [destination, setDestination] = useState('');
  const [amount, setAmount] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const { addTransaction, balance, account } = useWallet();
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    const numAmount = parseFloat(amount);
    if (numAmount <= 0) {
      setError('El monto debe ser mayor a cero.');
      return;
    }
    if (numAmount > balance) {
      setError('Fondos insuficientes.');
      return;
    }
    if (!destination.trim()) {
      setError('Ingresa un número de cuenta destino.');
      return;
    }
    if (destination.trim() === account?.accountNumber) {
      setError('No puedes transferir a tu propia cuenta.');
      return;
    }

    const confirmMsg = `¿Confirmas enviar $${numAmount.toFixed(2)} a la cuenta ${destination}?`;
    if (!window.confirm(confirmMsg)) return;

    setSubmitting(true);
    try {
      await addTransaction(destination.trim(), numAmount);
      navigate('/balance');
    } catch (err) {
      setError(err.message || 'Error al realizar la transferencia.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto">
      <h2 className="text-2xl font-bold mb-6 text-coco-dark">Nueva Transferencia</h2>
      
      <div className="bg-white p-8 rounded-xl shadow-sm">
        <div className="mb-6 p-4 bg-coco-offwhite rounded-lg flex justify-between items-center">
          <div>
            <span className="text-gray-600">Saldo Disponible</span>
            {account?.accountNumber && (
              <p className="text-xs text-gray-400 mt-1">Cuenta: {account.accountNumber}</p>
            )}
          </div>
          <span className="font-bold text-xl text-coco-green">${balance.toFixed(2)}</span>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-6">
          <Input 
            label="Número de Cuenta Destino" 
            id="destination" 
            placeholder="Número de cuenta del destinatario"
            value={destination}
            onChange={(e) => setDestination(e.target.value)}
            required
          />
          
          <div className="relative">
            <label className="block text-sm font-medium text-gray-700 mb-1">Monto a Transferir</label>
            <div className="relative">
              <span className="absolute left-4 top-2 text-gray-500">$</span>
              <input
                type="number"
                min="0.01"
                step="0.01"
                className="w-full pl-8 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-coco-green outline-none"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                required
              />
            </div>
          </div>

          <div className="pt-4">
            <Button type="submit" variant="primary" className="w-full py-3 text-lg" disabled={submitting}>
              {submitting ? 'Procesando...' : 'Enviar Dinero'}
            </Button>
            <p className="text-xs text-center text-gray-400 mt-4">
              Transacción protegida con autenticación Cognito y API Gateway.
            </p>
          </div>
        </form>
      </div>
    </div>
  );
};

export default Transfer;
