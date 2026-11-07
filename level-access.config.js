/* Public Firebase web settings for the General English app.
   The only teacher address is tchmk9@gmail.com. enabled stays false until
   Email/Password sign-in exists, Firestore is created, and firestore.rules
   are deployed. Until then the app must not treat level locks as live.
   Do not add a private key, a service account, or a password.
   Analytics is not used. */
window.KENJ_LEVEL_ACCESS = {
  enabled: false,
  firebase: {
    apiKey: "AIzaSyDqjYB9uM4K9defw4RG4tXmNnfFaU5VMbc",
    authDomain: "general-english-c7371.firebaseapp.com",
    projectId: "general-english-c7371",
    storageBucket: "general-english-c7371.firebasestorage.app",
    messagingSenderId: "734532385308",
    appId: "1:734532385308:web:36e1ea30442838423d3dd9"
  },
  /* The only account allowed to write, once the rules are deployed. */
  teacherEmails: ["tchmk9@gmail.com"]
};
