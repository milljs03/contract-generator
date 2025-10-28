import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
// --- UPDATED THIS LINE ---
import { getFirestore, collection, doc, addDoc, getDoc, setDoc, query, onSnapshot, collectionGroup, getDocs, where } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { getAuth, GoogleAuthProvider, signInWithPopup, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";

// TODO: Get this config from your new project's "Project settings"
const firebaseConfig = {
  apiKey: "AIzaSyD298Zc28yfJZ3jiZUZd26wIKDOSbjUANM",
  authDomain: "cfn-contract.firebaseapp.com",
  projectId: "cfn-contract",
  storageBucket: "cfn-contract.firebasestorage.app",
  messagingSenderId: "174728297272",
  appId: "1:174728297272:web:7a64047f734340b0951fcd",
  measurementId: "G-JC12JQTKRJ"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);
const googleProvider = new GoogleAuthProvider();

// --- UPDATED THIS BLOCK ---
export { 
  db, auth, googleProvider,
  collection, doc, addDoc, getDoc, setDoc, query, onSnapshot, collectionGroup,
  getDocs, where, // <-- Added missing exports
  onAuthStateChanged, signInWithPopup, signOut 
};
