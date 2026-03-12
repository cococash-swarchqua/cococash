import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useWallet } from '../context/WalletContext';
import Button from '../components/Button';

const Deposit = () => {
    const [amount, setAmount] = useState('');
    const [description, setDescription] = useState('');
    const [error, setError] = useState('');
    const [success, setSuccess] = useState(null);
    const [submitting, setSubmitting] = useState(false);
    const { deposit, balance, account } = useWallet();
    const navigate = useNavigate();

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');
        setSuccess(null);

        const numAmount = parseFloat(amount);
        if (!amount || isNaN(numAmount) || numAmount <= 0) {
            setError('El monto debe ser un número mayor a cero.');
            return;
        }

        const confirmMsg = `¿Confirmas depositar $${numAmount.toFixed(2)} a tu cuenta?`;
        if (!window.confirm(confirmMsg)) return;

        setSubmitting(true);
        try {
            const result = await deposit(numAmount, description.trim());
            setSuccess(result);
            setAmount('');
            setDescription('');
        } catch (err) {
            setError(err.message || 'Error al realizar el depósito.');
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <div className="max-w-2xl mx-auto">
            <h2 className="text-2xl font-bold mb-6 text-coco-dark">Depositar Fondos</h2>

            <div className="bg-white p-8 rounded-xl shadow-sm">
                {/* Balance actual */}
                <div className="mb-6 p-4 bg-coco-offwhite rounded-lg flex justify-between items-center">
                    <div>
                        <span className="text-gray-600">Saldo Actual</span>
                        {account?.accountNumber && (
                            <p className="text-xs text-gray-400 mt-1">Cuenta: {account.accountNumber}</p>
                        )}
                    </div>
                    <span className="font-bold text-xl text-coco-green">${balance.toFixed(2)}</span>
                </div>

                {/* Resultado exitoso */}
                {success && (
                    <div className="mb-6 p-4 bg-green-50 border border-green-200 rounded-lg">
                        <p className="text-green-700 font-semibold mb-1">✓ Depósito exitoso</p>
                        <div className="text-sm text-green-600 space-y-1">
                            <p>Monto depositado: <span className="font-bold">${success.depositAmount?.toFixed(2)}</span></p>
                            <p>Nuevo saldo: <span className="font-bold">${success.newBalance?.toFixed(2)}</span></p>
                            <p className="text-xs text-green-500 mt-2">ID: {success.depositId}</p>
                        </div>
                    </div>
                )}

                {/* Error */}
                {error && (
                    <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
                        {error}
                    </div>
                )}

                <form onSubmit={handleSubmit} className="space-y-6">
                    {/* Monto */}
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                            Monto a Depositar
                        </label>
                        <div className="relative">
                            <span className="absolute left-4 top-2 text-gray-500">$</span>
                            <input
                                type="number"
                                id="deposit-amount"
                                min="0.01"
                                step="0.01"
                                className="w-full pl-8 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-coco-green outline-none"
                                value={amount}
                                onChange={(e) => setAmount(e.target.value)}
                                placeholder="0.00"
                                required
                            />
                        </div>
                    </div>

                    {/* Descripción (opcional) */}
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                            Descripción <span className="text-gray-400 font-normal">(opcional)</span>
                        </label>
                        <input
                            type="text"
                            id="deposit-description"
                            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-coco-green outline-none"
                            value={description}
                            onChange={(e) => setDescription(e.target.value)}
                            placeholder="ej: Carga inicial, Recarga mensual..."
                            maxLength={100}
                        />
                    </div>

                    <div className="pt-2">
                        <Button
                            type="submit"
                            variant="primary"
                            className="w-full py-3 text-lg"
                            disabled={submitting}
                        >
                            {submitting ? 'Procesando...' : 'Depositar'}
                        </Button>
                        <p className="text-xs text-center text-gray-400 mt-4">
                            El saldo se acreditará de inmediato para su uso en transferencias.
                        </p>
                    </div>
                </form>
            </div>
        </div>
    );
};

export default Deposit;
