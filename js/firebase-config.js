// إعدادات Firebase — مشروع bus-oman
const firebaseConfig = {
  apiKey: "AIzaSyDkFAo5yHaa_2ecCYGtrvMmQXGkrNe-kIg",
  authDomain: "bus-oman.firebaseapp.com",
  projectId: "bus-oman",
  storageBucket: "bus-oman.firebasestorage.app",
  messagingSenderId: "546023690823",
  appId: "1:546023690823:web:d1f877f3d90c5aa0205762"
};

firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();
