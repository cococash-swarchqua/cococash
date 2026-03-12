import React, { createContext, useState, useContext, useEffect, useCallback } from 'react';
import { useAuth } from './AuthContext';
import { getMyAccount, createAccount, getTransferHistory, initiateTransfer, depositFunds } from '../services/api';

const WalletContext = createContext();

export const useWallet = () => useContext(WalletContext);

export const WalletProvider = ({ children }) => {
  const { user } = useAuth();
  const [account, setAccount] = useState(null);
  const [balance, setBalance] = useState(0);
  const [transactions, setTransactions] = useState([]);
  const [walletLoading, setWalletLoading] = useState(false);
  const [error, setError] = useState(null);

  /**
   * Fetch (or create) the user's wallet and load transactions.
   */
  const loadWallet = useCallback(async () => {
    if (!user) return;
    setWalletLoading(true);
    setError(null);
    try {
      // JITP: GET /v1/accounts/me creates the account if it doesn't exist
      let res;
      try {
        res = await getMyAccount();
      } catch (err) {
        // If the account doesn't exist yet, create it
        if (err.status === 404) {
          res = await createAccount();
        } else {
          throw err;
        }
      }

      const acct = res.data;
      setAccount(acct);
      setBalance(parseFloat(acct.balance) || 0);

      // Load transfer history
      if (acct.id || acct.accountId) {
        try {
          const historyRes = await getTransferHistory(acct.id || acct.accountId);
          const transfers = historyRes.data || [];
          setTransactions(transfers);
        } catch {
          // No transactions yet — that's fine
          setTransactions([]);
        }
      }
    } catch (err) {
      console.error('Failed to load wallet:', err);
      setError(err.message || 'Error al cargar la billetera');
    } finally {
      setWalletLoading(false);
    }
  }, [user]);

  // Reload wallet data when the user changes (login/logout)
  useEffect(() => {
    if (user) {
      loadWallet();
    } else {
      setAccount(null);
      setBalance(0);
      setTransactions([]);
    }
  }, [user, loadWallet]);

  /**
   * Deposit funds into the current user's wallet.
   */
  const deposit = async (amount, description = '') => {
    const result = await depositFunds(amount, description);
    // Refresh balance after deposit
    setTimeout(() => loadWallet(), 1500);
    return result.data;
  };

  /**
   * Send a transfer and refresh wallet data.
   */
  const addTransaction = async (destinationAccountNumber, amount) => {
    if (!account) throw new Error('Wallet no inicializada');

    const sourceAccountNumber = account.accountNumber;
    const result = await initiateTransfer(sourceAccountNumber, destinationAccountNumber, amount);

    // Refresh wallet data after a short delay (async processing)
    setTimeout(() => loadWallet(), 2000);

    return result;
  };

  return (
    <WalletContext.Provider
      value={{
        account,
        balance,
        transactions,
        addTransaction,
        deposit,
        walletLoading,
        error,
        refreshWallet: loadWallet,
      }}
    >
      {children}
    </WalletContext.Provider>
  );
};
