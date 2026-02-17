import React from 'react';
import { Link } from 'react-router-dom';
import Button from '../components/Button';

const Landing = () => {
  return (
    <div className="min-h-screen bg-coco-offwhite flex flex-col">
      {/* Header */}
      <header className="container mx-auto px-6 py-4 flex justify-between items-center">
        <div className="flex items-center gap-2">
          <img src="/assets/isotipo.png" alt="CocoCash Logo" className="w-10 h-10 object-contain" />
          <span className="text-2xl font-bold text-coco-dark">CocoCash</span>
        </div>
        <div className="space-x-4">
          <Link to="/login">
            <Button variant="ghost">Iniciar Sesión</Button>
          </Link>
          <Link to="/register">
            <Button variant="primary">Registrarse</Button>
          </Link>
        </div>
      </header>

      {/* Hero Section */}
      <section className="flex-1 container mx-auto px-6 flex flex-col md:flex-row items-center justify-center gap-12 py-12">
        <div className="flex-1 space-y-6 text-center md:text-left">
          <h1 className="text-5xl md:text-6xl font-bold text-coco-dark leading-tight">
            Tu dinero, <br />
            <span className="text-coco-green"> Seguro y Rápido.</span>
          </h1>
          <p className="text-xl text-gray-600 max-w-lg mx-auto md:mx-0">
            La billetera digital nativa de la nube que escala contigo. Transferencias instantáneas y control total de tus finanzas.
          </p>
          <div className="flex gap-4 justify-center md:justify-start">
            <Link to="/register">
              <Button variant="primary" className="text-lg px-8 py-3">Empezar Ahora</Button>
            </Link>
            <Button variant="outline" className="text-lg px-8 py-3">Saber Más</Button>
          </div>
        </div>
        <div className="flex-1 relative">
          <div className="absolute top-0 right-0 -z-10 bg-coco-green/20 w-72 h-72 rounded-full blur-3xl"></div>
          <div className="absolute bottom-0 left-0 -z-10 bg-coco-brown/20 w-72 h-72 rounded-full blur-3xl"></div>
          <img src="/assets/imagotipo.png" alt="App Preview" className="w-full max-w-md mx-auto drop-shadow-2xl hover:scale-105 transition-transform duration-500" />
        </div>
      </section>

      {/* Features */}
      <section className="bg-white py-20">
        <div className="container mx-auto px-6 grid md:grid-cols-3 gap-8">
          <div className="p-6 border border-gray-100 rounded-xl hover:shadow-xl transition-shadow">
            <div className="w-12 h-12 bg-coco-green/10 rounded-full flex items-center justify-center mb-4 text-coco-green text-2xl">🛡️</div>
            <h3 className="text-xl font-bold mb-2">Seguridad Total</h3>
            <p className="text-gray-600">Encriptación de punta a punta para todas tus transacciones.</p>
          </div>
          <div className="p-6 border border-gray-100 rounded-xl hover:shadow-xl transition-shadow">
            <div className="w-12 h-12 bg-coco-brown/10 rounded-full flex items-center justify-center mb-4 text-coco-brown text-2xl">⚡</div>
            <h3 className="text-xl font-bold mb-2">Velocidad Rayo</h3>
            <p className="text-gray-600">Tus transferencias llegan en segundos, no en días.</p>
          </div>
          <div className="p-6 border border-gray-100 rounded-xl hover:shadow-xl transition-shadow">
            <div className="w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center mb-4 text-blue-600 text-2xl">☁️</div>
            <h3 className="text-xl font-bold mb-2">100% Cloud</h3>
            <p className="text-gray-600">Accede desde cualquier dispositivo, en cualquier momento.</p>
          </div>
        </div>
      </section>
    </div>
  );
};

export default Landing;
