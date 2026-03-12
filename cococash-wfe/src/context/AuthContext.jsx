import React, { createContext, useState, useContext, useEffect } from 'react';
import {
  signIn as cognitoSignIn,
  signUp as cognitoSignUp,
  confirmSignUp as cognitoConfirmSignUp,
  resendConfirmationCode as cognitoResendCode,
  signOut as cognitoSignOut,
  getCurrentSession,
  getUserAttributes,
} from '../services/cognito';

const AuthContext = createContext();

export const useAuth = () => useContext(AuthContext);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  // Check for an existing Cognito session on mount
  useEffect(() => {
    (async () => {
      try {
        const session = await getCurrentSession();
        if (session && session.isValid()) {
          const attrs = await getUserAttributes();
          setUser({
            email: attrs?.email,
            name: attrs?.name || attrs?.email?.split('@')[0],
            sub: session.getIdToken().payload.sub,
          });
        }
      } catch {
        // No active session
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  /**
   * Login with email + password via Cognito SRP.
   * Returns the session on success.
   */
  const login = async (email, password) => {
    const session = await cognitoSignIn(email, password);
    const attrs = await getUserAttributes();
    const userObj = {
      email: attrs?.email || email,
      name: attrs?.name || email.split('@')[0],
      sub: session.getIdToken().payload.sub,
    };
    setUser(userObj);
    return session;
  };

  /**
   * Register a new user via Cognito.
   * After this step the user must confirm with the code sent to their email.
   */
  const register = async (email, password, name) => {
    const result = await cognitoSignUp(email, password, name);
    return result;
  };

  /**
   * Confirm sign-up with the verification code.
   */
  const confirmSignUp = async (email, code) => {
    const result = await cognitoConfirmSignUp(email, code);
    return result;
  };

  /**
   * Resend the confirmation code.
   */
  const resendCode = async (email) => {
    return cognitoResendCode(email);
  };

  const logout = () => {
    cognitoSignOut();
    setUser(null);
  };

  return (
    <AuthContext.Provider
      value={{ user, login, logout, register, confirmSignUp, resendCode, loading }}
    >
      {!loading && children}
    </AuthContext.Provider>
  );
};
