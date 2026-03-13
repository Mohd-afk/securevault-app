import type { VercelRequest, VercelResponse } from '@vercel/node';
import { adminAuth } from './lib/firebase-admin';

export default async function handler(
  request: VercelRequest,
  response: VercelResponse
) {
  try {
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
