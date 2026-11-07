/* Public Firebase web settings for the General English app.
   enabled stays false on purpose. A teacher email or user id has not been
   listed, and these rules have not been deployed from this repository.
   Until both are done, the app must not treat level locks as live.
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
  /* Not a real teacher. Replace this before setting enabled to true,
     and use the same address in firestore.rules. */
  teacherEmails: ["replace-with-teacher@example.com"]
};
