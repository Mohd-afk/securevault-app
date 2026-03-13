import { initializeApp, cert, getApp, getApps } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';

/**
 * Initializes the Firebase Admin SDK using environment variables.
 * This is designed to run in a serverless environment (like Vercel).
 */
const serviceAccount = {
  projectId: process.env.FIREBASE_PROJECT_ID,
  clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
  // The private key must handle newline characters correctly
  privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
};

function initAdmin() {
  if (getApps().length === 0) {
    return initializeApp({
      credential: cert(serviceAccount),
    });
  }
  return getApp();
}

const adminApp = initAdmin();

export const adminAuth = getAuth(adminApp);
export const adminDb = getFirestore(adminApp);
