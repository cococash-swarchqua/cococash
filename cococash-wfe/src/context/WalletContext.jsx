import React, { createContext, useState, useContext } from 'react';

const WalletContext = createContext();

export const useWallet = () => useContext(WalletContext);

export const WalletProvider = ({ children }) => {
  const [balance, setBalance] = useState(15420.50); // Hardcoded initial balance
  const [transactions, setTransactions] = useState([
    { id: 1, date: '2023-10-25', destination: 'Netflix Inc.', amount: -15.99, type: 'expense' },
    { id: 2, date: '2023-10-24', destination: 'Juan Pérez', amount: 500.00, type: 'income' },
    { id: 3, date: '2023-10-22', destination: 'Supermercado', amount: -120.50, type: 'expense' },
    { id: 4, date: '2023-10-20', destination: 'Uber Trip', amount: -25.00, type: 'expense' },
    { id: 5, date: '2023-10-15', destination: 'Nomina', amount: 2500.00, type: 'income' },
  ]);

  const addTransaction = (destination, amount) => {
    const numAmount = parseFloat(amount);
    const newTransaction = {
      id: Date.now(),
      date: new Date().toISOString().split('T')[0],
      destination,
      amount: -numAmount, // Transfers are expenses
      type: 'expense'
    };
    
    setBalance(prev => prev - numAmount);
    setTransactions(prev => [newTransaction, ...prev]);
  };

  return (
    <WalletContext.Provider value={{ balance, transactions, addTransaction }}>
      {children}
    </WalletContext.Provider>
  );
};
