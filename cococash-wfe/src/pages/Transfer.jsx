import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useWallet } from '../context/WalletContext';
import Button from '../components/Button';
import Input from '../components/Input';

const Transfer = () => {
  const [destination, setDestination] = useState('');
  const [amount, setAmount] = useState('');
  const { addTransaction, balance } = useWallet();
  const navigate = useNavigate();

  const handleSubmit = (e) => {
    e.preventDefault();
    if (parseFloat(amount) > balance) {
      alert("Fondos insuficientes");
      return;
    }
    
    // Simulate API delay
    const confirm = window.confirm(`¿Confirmas enviar $${amount} a ${destination}?`);
    if (confirm) {
      addTransaction(destination, amount);
      navigate('/balance');
    }
  };

  return (
    <div className="max-w-2xl mx-auto">
      <h2 className="text-2xl font-bold mb-6 text-coco-dark">Nueva Transferencia</h2>
      
      <div className="bg-white p-8 rounded-xl shadow-sm">
        <div className="mb-6 p-4 bg-coco-offwhite rounded-lg flex justify-between items-center">
          <span className="text-gray-600">Saldo Disponible</span>
          <span className="font-bold text-xl text-coco-green">${balance.toFixed(2)}</span>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          <Input 
            label="Cuenta Destino / Email" 
            id="destination" 
            placeholder="1234-5678-9012"
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
            <Button type="submit" variant="primary" className="w-full py-3 text-lg">
              Enviar Dinero
            </Button>
            <p className="text-xs text-center text-gray-400 mt-4">
              Transacción protegida con cifrado de extremo a extremo.
            </p>
          </div>
        </form>
      </div>
    </div>
  );
};

export default Transfer;
