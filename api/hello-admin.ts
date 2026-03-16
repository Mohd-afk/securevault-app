import type { VercelRequest, VercelResponse } from '@vercel/node';
import { adminAuth } from './lib/firebase-admin';

export default async function handler(
  request: VercelRequest,
  response: VercelResponse
) {
  try {
    // --- 1. TOKEN VERIFICATION LAYER ---
    const authHeader = request.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      console.warn("API Auth Warning: Missing or malformed Authorization header.");
      return response.status(401).json({ error: 'Unauthorized: No token provided' });
    }

    const idToken = authHeader.split('Bearer ')[1];
    let decodedToken;
    try {
      decodedToken = await adminAuth.verifyIdToken(idToken);
      console.info(`API Auth Success: Token verified securely for UID: ${decodedToken.uid}`);
    } catch (tokenError: any) {
      console.error(`API Auth Error: Token verification failed: ${tokenError.message}`);
      return response.status(403).json({ error: 'Unauthorized: Invalid or expired token' });
    }

    // --- 2. SECURE BACKEND ACTION ---
    console.info(`API Action Executing: Fetching user summary triggered by authenticated user ${decodedToken.uid}`);
    // This is an Admin-only action: Listing the metadata of the last 10 users
    const listUsersResult = await adminAuth.listUsers(10);
    
    const userSummary = listUsersResult.users.map(user => ({
      uid: user.uid,
      email: user.email,
      lastSignInTime: user.metadata.lastSignInTime,
    }));

    return response.status(200).json({
      success: true,
      message: "Fetched user summary via Firebase Admin SDK",
      count: userSummary.length,
      users: userSummary
    });
  } catch (error: any) {
    console.error("Admin SDK Error:", error);
    return response.status(500).json({
      success: false,
      error: error.message
    });
  }
}
