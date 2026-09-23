require("dotenv").config();

const { initializeApp, cert, getApps } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");

if (getApps().length === 0) {
    if (!process.env.FIREBASE_SERVICE_ACCOUNT_JSON_BASE64) {
        throw new Error(
            "FIREBASE_SERVICE_ACCOUNT_JSON_BASE64 is not configured."
        );
    }

    const serviceAccount = JSON.parse(
        Buffer.from(
            process.env.FIREBASE_SERVICE_ACCOUNT_JSON_BASE64,
            "base64"
        ).toString("utf8")
    );

    initializeApp({
        credential: cert(serviceAccount)
    });
}

const db = getFirestore();

module.exports = {
    db
};