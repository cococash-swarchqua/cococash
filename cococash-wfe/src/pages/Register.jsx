import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import Button from '../components/Button';
import Input from '../components/Input';

const Register = () => {
  const [formData, setFormData] = useState({
    username: '',
    email: '',
    password: '',
    confirmPassword: ''
  });
  const { register } = useAuth();
  const navigate = useNavigate();

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.id]: e.target.value });
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (formData.password !== formData.confirmPassword) {
      alert("Las contraseñas no coinciden");
      return;
    }
    register({ email: formData.email, name: formData.username });
    navigate('/dashboard');
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-coco-offwhite px-4 py-12">
      <div className="bg-white p-8 rounded-2xl shadow-xl w-full max-w-md">
        <div className="text-center mb-8">
          <img src="/assets/isotipo.png" alt="Logo" className="w-16 h-16 mx-auto mb-4" />
          <h2 className="text-3xl font-bold text-coco-dark">Crea tu cuenta</h2>
          <p className="text-gray-500">Únete a la revolución financiera</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <Input 
            label="Nombre de Usuario" 
            id="username" 
            placeholder="JuanPerez"
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
          
          <Button type="submit" variant="primary" className="w-full py-3 mt-4">
            Registrarse
          </Button>
        </form>

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
