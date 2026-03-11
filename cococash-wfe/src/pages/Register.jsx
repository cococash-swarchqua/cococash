import React, { useState, useEffect } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import Button from '../components/Button';
import Input from '../components/Input';

const Register = () => {
  const location = useLocation();
  const [step, setStep] = useState('register'); // 'register' | 'confirm'
  const [formData, setFormData] = useState({
    username: '',
    email: '',
    password: '',
    confirmPassword: ''
  });
  const [confirmCode, setConfirmCode] = useState('');
  const [pendingEmail, setPendingEmail] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const { register, confirmSignUp, resendCode, login } = useAuth();
  const navigate = useNavigate();

  // If redirected from Login because user is not confirmed
  useEffect(() => {
    if (location.state?.pendingConfirmation && location.state?.email) {
      setPendingEmail(location.state.email);
      setStep('confirm');
    }
  }, [location.state]);

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.id]: e.target.value });
  };

  const handleRegister = async (e) => {
    e.preventDefault();
    setError('');

    if (formData.password !== formData.confirmPassword) {
      setError('Las contraseñas no coinciden.');
      return;
    }

    if (formData.password.length < 8) {
      setError('La contraseña debe tener al menos 8 caracteres.');
      return;
    }

    setSubmitting(true);
    try {
      await register(formData.email, formData.password, formData.username);
      setPendingEmail(formData.email);
      setStep('confirm');
      setSuccess('¡Cuenta creada! Revisa tu correo electrónico para obtener el código de verificación.');
    } catch (err) {
      if (err.code === 'UsernameExistsException') {
        setError('Ya existe una cuenta con este correo electrónico.');
      } else {
        setError(err.message || 'Error al registrarse.');
      }
    } finally {
      setSubmitting(false);
    }
  };

  const handleConfirm = async (e) => {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      await confirmSignUp(pendingEmail, confirmCode);
      setSuccess('¡Cuenta verificada! Redirigiendo al login...');
      setTimeout(() => navigate('/login'), 1500);
    } catch (err) {
      if (err.code === 'CodeMismatchException') {
        setError('Código de verificación incorrecto.');
      } else if (err.code === 'ExpiredCodeException') {
        setError('El código ha expirado. Solicita uno nuevo.');
      } else {
        setError(err.message || 'Error al verificar.');
      }
    } finally {
      setSubmitting(false);
    }
  };

  const handleResendCode = async () => {
    setError('');
    try {
      await resendCode(pendingEmail);
      setSuccess('Código reenviado. Revisa tu correo electrónico.');
    } catch (err) {
      setError(err.message || 'Error al reenviar código.');
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-coco-offwhite px-4 py-12">
      <div className="bg-white p-8 rounded-2xl shadow-xl w-full max-w-md">
        <div className="text-center mb-8">
          <img src="/assets/isotipo.png" alt="Logo" className="w-16 h-16 mx-auto mb-4" />
          <h2 className="text-3xl font-bold text-coco-dark">
            {step === 'register' ? 'Crea tu cuenta' : 'Verifica tu correo'}
          </h2>
          <p className="text-gray-500">
            {step === 'register'
              ? 'Únete a la revolución financiera'
              : `Enviamos un código a ${pendingEmail}`}
          </p>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
            {error}
          </div>
        )}

        {success && (
          <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded-lg text-green-700 text-sm">
            {success}
          </div>
        )}

        {step === 'register' ? (
          <form onSubmit={handleRegister} className="space-y-4">
            <Input 
              label="Nombre" 
              id="username" 
              placeholder="Juan Pérez"
              value={formData.username}
              onChange={handleChange}
              required
            />
            <Input 
              label="Correo Electrónico" 
              id="email" 
              type="email" 
              placeholder="juan@ejemplo.com"
              value={formData.email}
              onChange={handleChange}
              required
            />
            <Input 
              label="Contraseña" 
              id="password" 
              type="password" 
              placeholder="••••••••"
              value={formData.password}
              onChange={handleChange}
              required
            />
            <Input 
              label="Confirmar Contraseña" 
              id="confirmPassword" 
              type="password" 
              placeholder="••••••••"
              value={formData.confirmPassword}
              onChange={handleChange}
              required
            />
            <p className="text-xs text-gray-400">
              Mínimo 8 caracteres, incluye mayúsculas, minúsculas y números.
            </p>
            
            <Button type="submit" variant="primary" className="w-full py-3 mt-4" disabled={submitting}>
              {submitting ? 'Registrando...' : 'Registrarse'}
            </Button>
          </form>
        ) : (
          <form onSubmit={handleConfirm} className="space-y-4">
            <Input 
              label="Código de Verificación" 
              id="confirmCode" 
              placeholder="123456"
              value={confirmCode}
              onChange={(e) => setConfirmCode(e.target.value)}
              required
            />

            <Button type="submit" variant="primary" className="w-full py-3" disabled={submitting}>
              {submitting ? 'Verificando...' : 'Verificar Cuenta'}
            </Button>

            <button
              type="button"
              onClick={handleResendCode}
              className="w-full text-center text-sm text-coco-green hover:underline mt-2"
            >
              ¿No recibiste el código? Reenviar
            </button>
          </form>
        )}

        <p className="mt-6 text-center text-gray-600">
          ¿Ya tienes cuenta?{' '}
          <Link to="/login" className="text-coco-green font-bold hover:underline">
            Inicia Sesión
          </Link>
        </p>
      </div>
    </div>
  );
};

export default Register;
