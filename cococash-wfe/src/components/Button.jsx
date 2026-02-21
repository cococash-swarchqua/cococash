import React from 'react';

const Button = ({ children, onClick, variant = 'primary', className = '', type = 'button', ...props }) => {
  const baseStyles = "px-6 py-2 rounded-lg font-semibold transition-all duration-200 transform active:scale-95 focus:outline-none focus:ring-2 focus:ring-offset-2";
  
  const variants = {
    primary: "bg-coco-green hover:bg-coco-green-dark text-white shadow-lg shadow-coco-green/30 focus:ring-coco-green",
    secondary: "bg-coco-brown hover:bg-coco-brown-dark text-white shadow-lg shadow-coco-brown/30 focus:ring-coco-brown",
    outline: "border-2 border-coco-green text-coco-green hover:bg-coco-green/10 focus:ring-coco-green",
    ghost: "text-coco-brown hover:bg-coco-brown/10",
  };

  return (
    <button
      type={type}
      className={`${baseStyles} ${variants[variant]} ${className}`}
      onClick={onClick}
      {...props}
    >
      {children}
    </button>
  );
};

export default Button;
