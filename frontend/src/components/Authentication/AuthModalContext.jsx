import React, { createContext, useContext, useState } from 'react';

const AuthModalContext = createContext();

export const AuthModalProvider = ({ children }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [authMode, setAuthMode] = useState('signin');

  const openSignIn = () => {
    setAuthMode('signin');
    setIsOpen(true);
  };

  const openSignUp = () => {
    setAuthMode('signup');
    setIsOpen(true);
  };

  const closeModal = () => {
    setIsOpen(false);
  };

  const value = {
    isOpen,
    authMode,
    openSignIn,
    openSignUp,
    closeModal,
    switchToSignIn: () => setAuthMode('signin'),
    switchToSignUp: () => setAuthMode('signup'),
  };

  return (
    <AuthModalContext.Provider value={value}>
      {children}
    </AuthModalContext.Provider>
  );
};

export const useAuthModal = () => useContext(AuthModalContext);
