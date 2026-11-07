/* Copy this file to level-access.config.js (that name is gitignored).
   Do not put a private key, a service-account file, or a password in here.
   The Firebase web config is public by design. Access is limited by firestore.rules.
   Leave enabled set to false until the rules are deployed and a teacher user exists.
   Firebase's free Spark plan is one way to host this. It is not already set up. */
window.KENJ_LEVEL_ACCESS = {
  enabled: false,
  firebase: {
    apiKey: "YOUR_API_KEY",
    authDomain: "YOUR_PROJECT.firebaseapp.com",
    projectId: "YOUR_PROJECT",
    storageBucket: "YOUR_PROJECT.appspot.com",
    messagingSenderId: "YOUR_SENDER_ID",
    appId: "YOUR_APP_ID"
  },
  /* Lower case. Use the same addresses in firestore.rules. */
  teacherEmails: ["replace-with-teacher@example.com"]
};
