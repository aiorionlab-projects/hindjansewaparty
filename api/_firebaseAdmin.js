import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

// The service account key is stored as one env var (FIREBASE_SERVICE_ACCOUNT)
// so it can live in Vercel Project Settings without a physical file.
// It can be set as either the raw JSON string or that JSON base64-encoded
// (base64 is safer if your platform mangles newlines in the private key).
function getServiceAccount() {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!raw) return null;
  try {
    const jsonText = raw.trim().startsWith("{")
      ? raw
      : Buffer.from(raw, "base64").toString("utf8");
    return JSON.parse(jsonText);
  } catch (err) {
    console.error("Could not parse FIREBASE_SERVICE_ACCOUNT:", err);
    return null;
  }
}

// initializeApp() must only ever be called once per process — getApps()
// guards against Vercel re-invoking this module on a warm lambda.
export function getAdminDb() {
  if (!getApps().length) {
    const serviceAccount = getServiceAccount();
    if (!serviceAccount) {
      throw new Error(
        "FIREBASE_SERVICE_ACCOUNT env var is missing or invalid — generate one from " +
        "Firebase console -> Project settings -> Service accounts -> Generate new private key."
      );
    }
    initializeApp({ credential: cert(serviceAccount) });
  }
  return getFirestore();
}
