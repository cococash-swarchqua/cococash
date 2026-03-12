/**
 * Cognito Auth Service — CocoCash Frontend
 *
 * Uses amazon-cognito-identity-js to handle:
 * - Sign Up (email + password + name)
 * - Confirm Sign Up (verification code via email)
 * - Sign In (email + password → JWT tokens)
 * - Get current session (auto-refresh tokens)
 * - Sign Out
 */

import {
  CognitoUserPool,
  CognitoUser,
  AuthenticationDetails,
  CognitoUserAttribute,
} from 'amazon-cognito-identity-js';

const POOL_DATA = {
  UserPoolId: import.meta.env.VITE_COGNITO_USER_POOL_ID,
  ClientId: import.meta.env.VITE_COGNITO_CLIENT_ID,
};

const userPool = new CognitoUserPool(POOL_DATA);

/**
 * Sign up a new user with email, password and name.
 * Returns a promise that resolves with the Cognito user.
 */
export function signUp(email, password, name) {
  const attributeList = [
    new CognitoUserAttribute({ Name: 'email', Value: email }),
    new CognitoUserAttribute({ Name: 'name', Value: name }),
  ];

  return new Promise((resolve, reject) => {
    userPool.signUp(email, password, attributeList, null, (err, result) => {
      if (err) {
        reject(err);
        return;
      }
      resolve(result);
    });
  });
}

/**
 * Confirm sign up with the verification code sent to email.
 */
export function confirmSignUp(email, code) {
  const cognitoUser = new CognitoUser({
    Username: email,
    Pool: userPool,
  });

  return new Promise((resolve, reject) => {
    cognitoUser.confirmRegistration(code, true, (err, result) => {
      if (err) {
        reject(err);
        return;
      }
      resolve(result);
    });
  });
}

/**
 * Resend the confirmation code to the user's email.
 */
export function resendConfirmationCode(email) {
  const cognitoUser = new CognitoUser({
    Username: email,
    Pool: userPool,
  });

  return new Promise((resolve, reject) => {
    cognitoUser.resendConfirmationCode((err, result) => {
      if (err) {
        reject(err);
        return;
      }
      resolve(result);
    });
  });
}

/**
 * Sign in with email + password (SRP).
 * Returns the Cognito session (contains idToken, accessToken, refreshToken).
 */
export function signIn(email, password) {
  const cognitoUser = new CognitoUser({
    Username: email,
    Pool: userPool,
  });

  const authDetails = new AuthenticationDetails({
    Username: email,
    Password: password,
  });

  return new Promise((resolve, reject) => {
    cognitoUser.authenticateUser(authDetails, {
      onSuccess: (session) => resolve(session),
      onFailure: (err) => reject(err),
    });
  });
}

/**
 * Get the current authenticated session. Auto-refreshes if needed.
 * Returns null if no user is signed in.
 */
export function getCurrentSession() {
  const cognitoUser = userPool.getCurrentUser();
  if (!cognitoUser) return Promise.resolve(null);

  return new Promise((resolve, reject) => {
    cognitoUser.getSession((err, session) => {
      if (err) {
        reject(err);
        return;
      }
      resolve(session);
    });
  });
}

/**
 * Get the ID token string for Authorization headers.
 * Returns null if no active session.
 */
export async function getIdToken() {
  try {
    const session = await getCurrentSession();
    if (!session) return null;
    return session.getIdToken().getJwtToken();
  } catch {
    return null;
  }
}

/**
 * Get the current Cognito user's attributes.
 */
export function getUserAttributes() {
  const cognitoUser = userPool.getCurrentUser();
  if (!cognitoUser) return Promise.resolve(null);

  return new Promise((resolve, reject) => {
    cognitoUser.getSession((err) => {
      if (err) {
        reject(err);
        return;
      }
      cognitoUser.getUserAttributes((err, attributes) => {
        if (err) {
          reject(err);
          return;
        }
        const attrs = {};
        attributes.forEach((attr) => {
          attrs[attr.getName()] = attr.getValue();
        });
        resolve(attrs);
      });
    });
  });
}

/**
 * Sign out the current user (local sign out).
 */
export function signOut() {
  const cognitoUser = userPool.getCurrentUser();
  if (cognitoUser) {
    cognitoUser.signOut();
  }
}
