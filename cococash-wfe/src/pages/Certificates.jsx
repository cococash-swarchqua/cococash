import React, { useState, useMemo } from 'react';
import { useWallet } from '../context/WalletContext';
import { getReportDownloadUrl } from '../services/api';

const Certificates = () => {
  const { account, walletLoading } = useWallet();
  const [selectedPeriod, setSelectedPeriod] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Generate available months: from account creation to last month
  const availableMonths = useMemo(() => {
    const months = [];
    const now = new Date();
    // For testing: allow downloading the current month
    const lastMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    // For testing/demonstration purposes: always allow seeing the last 6 months
    // regardless of when the account was created, so we can test the download flow.
    const startDate = new Date(now.getFullYear(), now.getMonth() - 6, 1);

    // Don't go before account creation
    const current = new Date(lastMonth);
    while (current >= startDate) {
      const year = current.getFullYear();
      const month = String(current.getMonth() + 1).padStart(2, '0');
      const label = current.toLocaleDateString('es-CO', { month: 'long', year: 'numeric' });
      months.push({
        value: `${year}-${month}`,
        label: label.charAt(0).toUpperCase() + label.slice(1),
      });
      current.setMonth(current.getMonth() - 1);
    }

    return months;
  }, [account]);

  const handleDownload = async () => {
    if (!selectedPeriod) {
      setError('Por favor selecciona un mes.');
      return;
    }

    setLoading(true);
    setError('');
    setSuccess('');

    try {
      const accountId = account?.id || account?.accountId;
      const response = await getReportDownloadUrl(accountId, selectedPeriod);

      if (response.data?.url) {
        // Open the presigned URL in a new tab to download the PDF
        window.open(response.data.url, '_blank');
        setSuccess('Descarga iniciada. El archivo se abrirá en una nueva pestaña.');
      } else {
        setError('No se recibió un enlace de descarga válido.');
      }
    } catch (err) {
      if (err.status === 404 || err.response?.status === 404) {
        setError('No hay extracto disponible para este período. Los extractos se generan automáticamente el primer día de cada mes.');
      } else {
        setError(err.message || 'Error al solicitar el extracto. Intenta de nuevo.');
      }
    } finally {
      setLoading(false);
    }
  };

  if (walletLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-coco-green mx-auto"></div>
      </div>
    );
  }

  return (
    <div>
      <h2 className="text-2xl font-bold text-coco-dark mb-6">Certificados y Extractos</h2>

      {/* Info Card */}
      <div className="bg-gradient-to-r from-coco-dark to-coco-brown-dark rounded-2xl p-8 text-white shadow-xl mb-8">
        <div className="flex items-start gap-4">
          <div className="w-14 h-14 bg-coco-green/20 text-coco-green rounded-xl flex items-center justify-center text-3xl flex-shrink-0">
            📄
          </div>
          <div>
            <h3 className="text-xl font-bold mb-2">Extractos Bancarios Mensuales</h3>
            <p className="text-gray-300 text-sm">
              Descarga el extracto de tu cuenta en formato PDF. Los extractos se generan automáticamente
              el primer día de cada mes e incluyen todas las transacciones del período.
            </p>
          </div>
        </div>
      </div>

      {/* Download Form */}
      <div className="bg-white rounded-xl shadow-sm p-8">
        <h3 className="text-lg font-bold text-gray-800 mb-6">Descargar Extracto</h3>

        <div className="max-w-md space-y-6">
          {/* Account Info */}
          {account?.accountNumber && (
            <div className="bg-gray-50 rounded-lg p-4">
              <p className="text-sm text-gray-500">Cuenta</p>
              <p className="font-mono font-medium text-gray-800">{account.accountNumber}</p>
            </div>
          )}

          {/* Month Selector */}
          <div>
            <label htmlFor="period-select" className="block text-sm font-medium text-gray-700 mb-2">
              Selecciona el mes
            </label>
            <select
              id="period-select"
              value={selectedPeriod}
              onChange={(e) => {
                setSelectedPeriod(e.target.value);
                setError('');
                setSuccess('');
              }}
              className="w-full px-4 py-3 rounded-lg border border-gray-300 focus:outline-none focus:ring-2 focus:ring-coco-green focus:border-transparent bg-white text-gray-800 appearance-none"
            >
              <option value="">— Selecciona un mes —</option>
              {availableMonths.map((month) => (
                <option key={month.value} value={month.value}>
                  {month.label}
                </option>
              ))}
            </select>
            {availableMonths.length === 0 && (
              <p className="text-sm text-gray-400 mt-2">
                No hay meses disponibles. Los extractos se generan a partir del mes siguiente a la creación de tu cuenta.
              </p>
            )}
          </div>

          {/* Error */}
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-700 text-sm">
              {error}
            </div>
          )}

          {/* Success */}
          {success && (
            <div className="bg-green-50 border border-green-200 rounded-lg p-4 text-green-700 text-sm">
              {success}
            </div>
          )}

          {/* Download Button */}
          <button
            id="download-report-btn"
            onClick={handleDownload}
            disabled={loading || !selectedPeriod}
            className={`w-full py-3 px-6 rounded-lg font-semibold transition-all flex items-center justify-center gap-2 ${
              loading || !selectedPeriod
                ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                : 'bg-coco-green text-white hover:brightness-110 shadow-lg hover:shadow-coco-green/30'
            }`}
          >
            {loading ? (
              <>
                <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
                Generando enlace...
              </>
            ) : (
              <>
                📥 Descargar Extracto PDF
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

export default Certificates;
