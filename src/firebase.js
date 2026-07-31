// ---------------------------------------------------------------------
// Firebase initialization for the Hind Jansewi Party website.
//
// REPLACE the values below with YOUR real Firebase project config
// (Firebase console -> Project settings -> General -> Your apps -> SDK
// setup and configuration). This MUST be the exact same project/config
// used in `public/admin.html`, otherwise the admin panel will read from
// a different database and never see new registrations.
// ---------------------------------------------------------------------
import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyALRv-BQ-43Ksspw7si6hE8AFtPDoBIgko",
  authDomain: "hind-jansevi-party.firebaseapp.com",
  projectId: "hind-jansevi-party",
  storageBucket: "hind-jansevi-party.firebasestorage.app",
  messagingSenderId: "354670866421",
  appId: "1:354670866421:web:c5a69872de7083db0e7abc",
  measurementId: "G-V2R34QS67J",
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
