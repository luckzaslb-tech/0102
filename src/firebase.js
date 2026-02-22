import { initializeApp } from "firebase/app";
import { getAuth, GoogleAuthProvider, OAuthProvider } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyDfuTaN4yugRx25mEaAPvyrF1_8lk8dOSA",
  authDomain: "finance-826f6.firebaseapp.com",
  projectId: "finance-826f6",
  storageBucket: "finance-826f6.firebasestorage.app",
  messagingSenderId: "1050683301564",
  appId: "1:1050683301564:web:243f98d688681481557ab9",
  measurementId: "G-K63Z1TR0L4"
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
export const googleProvider = new GoogleAuthProvider();
export const appleProvider = new OAuthProvider("apple.com");
