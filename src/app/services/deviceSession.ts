import { UAParser } from 'ua-parser-js';
import { 
  doc, setDoc, deleteDoc, onSnapshot, 
  serverTimestamp, collection, query, getDocs, getDoc,
  Unsubscribe
} from 'firebase/firestore';
import { db } from '../firebase';
import { createLogger } from '../utils/logger';

const log = createLogger('SESSION');
const DEVICE_ID_KEY = 'securevault_device_id';

export interface DeviceSession {
  id: string; // Document ID
  browser: string;
  os: string;
  ip?: string;
  city?: string;
  country?: string;
  createdAt: any; // Firestore Timestamp
  lastActive: any; // Firestore Timestamp
}

export function getLocalDeviceId(): string {
  let deviceId = localStorage.getItem(DEVICE_ID_KEY);
  if (!deviceId) {
    deviceId = crypto.randomUUID();
    localStorage.setItem(DEVICE_ID_KEY, deviceId);
    log.info('Generated new local device ID', { deviceId });
  }
  return deviceId;
}

export function getDeviceInfo() {
  const parser = new UAParser();
  const result = parser.getResult();
  return {
    browser: `${result.browser.name || 'Unknown'} ${result.browser.version || ''}`.trim(),
    os: `${result.os.name || 'Unknown'} ${result.os.version || ''}`.trim(),
  };
}

export async function getIpLocation(): Promise<{ ip: string; city: string; country: string } | null> {
  try {
    const response = await fetch('https://ipapi.co/json/');
    if (!response.ok) return null;
    const data = await response.json();
    log.info('Fetched IP Location', { city: data.city, country: data.country_name });
    return {
      ip: data.ip || 'Unknown',
      city: data.city || 'Unknown',
      country: data.country_name || 'Unknown',
    };
  } catch (error) {
    log.error('Failed to fetch IP location', error);
    return null;
  }
}

// 2. Firestore & Sessions

/** Detects if the user is logging in from a significantly new place */
async function checkLocationAlert(uid: string, newLocation: {city: string; country: string}) {
  try {
    const devicesRef = collection(db, `users/${uid}/devices`);
    const q = query(devicesRef);
    const snap = await getDocs(q);
    
    let isNewLocation = true;
    snap.forEach(docSnap => {
      const data = docSnap.data();
      // If we've seen this country and city before on another device, it's not strictly "new"
      if (data.country === newLocation.country && data.city === newLocation.city) {
        isNewLocation = false;
      }
    });

    if (isNewLocation) {
      log.warn('New login location detected!', newLocation);
      // NOTE: Here is where we would trigger an email. 
      // E.g., add to a 'mail' collection if using Firebase Trigger Email extension
      // await addDoc(collection(db, 'mail'), { to: userEmail, message: ...new_login_template... })
    }
  } catch (error) {
    log.error('Failed to check location alert', error);
  }
}

let lastActiveUpdateTime = 0;
const THROTTLE_MS = 10 * 60 * 1000; // 10 minutes

export async function updateLastActive(uid: string) {
  const now = Date.now();
  if (now - lastActiveUpdateTime < THROTTLE_MS) {
    return; // Throttled
  }
  
  try {
    const deviceId = getLocalDeviceId();
    const deviceRef = doc(db, `users/${uid}/devices/${deviceId}`);
    // Use merge: true so we don't overwrite if it doesn't exist yet, or just update
    await setDoc(deviceRef, {
      lastActive: serverTimestamp()
    }, { merge: true });
    
    lastActiveUpdateTime = now;
    log.debug('Updated lastActive heartbeat', { deviceId });
  } catch (error) {
    log.error('Failed to update lastActive heartbeat', error);
  }
}

export async function registerCurrentDevice(uid: string) {
  try {
    const deviceId = getLocalDeviceId();
    const { browser, os } = getDeviceInfo();
    const location = await getIpLocation();

    if (location) {
        await checkLocationAlert(uid, { city: location.city, country: location.country });
    }

    const deviceRef = doc(db, `users/${uid}/devices/${deviceId}`);
    
    // Check if device already exists
    const deviceSnap = await getDoc(deviceRef);
    if (!deviceSnap.exists()) {
        const payload = {
            browser,
            os,
            ip: location?.ip || null,
            city: location?.city || null,
            country: location?.country || null,
            createdAt: serverTimestamp(),
            lastActive: serverTimestamp()
        };
        await setDoc(deviceRef, payload);
        log.info('Registered new device session', { deviceId });
    } else {
        // Just update last active and maybe location
        const payload = {
            lastActive: serverTimestamp(),
            ...(location && {
              ip: location.ip,
              city: location.city,
              country: location.country
            })
        };
        await setDoc(deviceRef, payload, { merge: true });
        log.info('Updated existing device session', { deviceId });
    }
    
    lastActiveUpdateTime = Date.now();
  } catch (error) {
    log.error('Failed to register device', error);
  }
}

export function subscribeToDevices(uid: string, onDevicesChanged: (devices: DeviceSession[]) => void): Unsubscribe {
  const devicesRef = collection(db, `users/${uid}/devices`);
  const q = query(devicesRef);

  return onSnapshot(q, (snap) => {
    const devices: DeviceSession[] = [];
    snap.forEach(docSnap => {
      devices.push({
        id: docSnap.id,
        ...docSnap.data()
      } as DeviceSession);
    });
    onDevicesChanged(devices);
  }, (error) => {
    log.error('Failed to subscribe to devices', error);
  });
}

export async function revokeDevice(uid: string, targetDeviceId: string) {
  try {
    // 1. Delete target device document
    const targetRef = doc(db, `users/${uid}/devices/${targetDeviceId}`);
    await deleteDoc(targetRef);
    log.info('Revoked device', { targetDeviceId });

    // 2. Bump tokenVersion
    const tokenRef = doc(db, `users/${uid}/data/tokenVersion`);
    
    const tokenSnap = await getDoc(tokenRef);
    let currentVersion = 0;
    if (tokenSnap.exists() && typeof tokenSnap.data().version === 'number') {
        currentVersion = tokenSnap.data().version;
    }
    
    await setDoc(tokenRef, { version: currentVersion + 1 }, { merge: true });
    log.info('Incremented tokenVersion', { newVersion: currentVersion + 1 });
  } catch (error) {
    log.error('Failed to revoke device', error);
    throw error;
  }
}

export async function revokeAllOtherDevices(uid: string) {
  try {
    const currentDeviceId = getLocalDeviceId();
    const devicesRef = collection(db, `users/${uid}/devices`);
    const snap = await getDocs(query(devicesRef));
    
    const deletePromises: Promise<void>[] = [];
    let count = 0;
    snap.forEach(docSnap => {
      if (docSnap.id !== currentDeviceId) {
        deletePromises.push(deleteDoc(docSnap.ref));
        count++;
      }
    });
    
    if (count === 0) return;

    await Promise.all(deletePromises);
    log.info('Revoked all other devices', { count });

    // Bump tokenVersion
    const tokenRef = doc(db, `users/${uid}/data/tokenVersion`);
    const tokenSnap = await getDoc(tokenRef);
    let currentVersion = 0;
    if (tokenSnap.exists() && typeof tokenSnap.data().version === 'number') {
        currentVersion = tokenSnap.data().version;
    }
    await setDoc(tokenRef, { version: currentVersion + 1 }, { merge: true });
    log.info('Incremented tokenVersion', { newVersion: currentVersion + 1 });
  } catch (error) {
    log.error('Failed to revoke all other devices', error);
    throw error;
  }
}

// Memory cache of the token version at login time
let sessionTokenVersion: number | null = null;

export function listenForRevocation(uid: string, onRevoked: () => void): () => void {
  log.info('Starting revocation listener for device');
  const currentDeviceId = getLocalDeviceId();
  
  // 1. Listen to current device doc deletion
  const deviceRef = doc(db, `users/${uid}/devices/${currentDeviceId}`);
  const unsubDevice = onSnapshot(deviceRef, (snap) => {
    // If we're listening and the doc disappears, we've been revoked
    // Check if it exists... sometimes initial load might be empty, wait, it should exist
    // Actually, on first load, if we just registered, it will exist.
    // If we register on unlock, we should be fine. Wait, let's watch out for race condition
    // where listener fires before doc is written. Let's ignore it if we have sessionTokenVersion null? No.
  }, (err) => {
    log.error('Revocation listener (device) error', err);
  });

  // 2. Listen to tokenVersion increment
  const tokenRef = doc(db, `users/${uid}/data/tokenVersion`);
  const unsubToken = onSnapshot(tokenRef, (snap) => {
    if (snap.exists() && typeof snap.data().version === 'number') {
      const serverVersion = snap.data().version;
      
      if (sessionTokenVersion === null) {
        // First load, save it
        sessionTokenVersion = serverVersion;
        log.debug('Initialized session tokenVersion', { version: sessionTokenVersion });
      } else if (serverVersion > sessionTokenVersion) {
        // Version bumped! Another device revoked a session.
        log.warn('Server tokenVersion is higher! Forcing logout.', { local: sessionTokenVersion, server: serverVersion });
        onRevoked();
      }
    } else if (sessionTokenVersion === null) {
       sessionTokenVersion = 0; // default if doc doesn't exist
    }
  }, (err) => {
    log.error('Revocation listener (token) error', err);
  });

  return () => {
    unsubDevice();
    unsubToken();
    sessionTokenVersion = null; // reset on unmount
  };
}
