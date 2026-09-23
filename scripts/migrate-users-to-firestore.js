require("dotenv").config();

const fs = require("fs");
const path = require("path");
const { db } = require("../web/firebase-admin");

const USERS_FILE = path.join(
    __dirname,
    "..",
    "web",
    "database",
    "users.json"
);

async function migrateUsers() {
    console.log("Starting users migration...");

    if (!fs.existsSync(USERS_FILE)) {
        throw new Error(`Users file not found: ${USERS_FILE}`);
    }

    const users = JSON.parse(
        fs.readFileSync(USERS_FILE, "utf8")
    );

    if (!Array.isArray(users)) {
        throw new Error("users.json must contain an array.");
    }

    if (users.length === 0) {
        console.log("No users found in users.json.");
        return;
    }

    const collection = db.collection("users");

    let migrated = 0;
    let skipped = 0;

    for (const user of users) {
        if (
            !user.id ||
            !user.username ||
            !user.passwordHash ||
            !user.createdAt
        ) {
            console.log(
                `Skipping invalid user record: ${user.username || "unknown"}`
            );
            skipped++;
            continue;
        }

        const username = String(user.username)
            .trim()
            .toLowerCase();

        const docRef = collection.doc(username);
        const existing = await docRef.get();

        if (existing.exists) {
            console.log(
                `SKIPPED: ${username} already exists in Firestore.`
            );
            skipped++;
            continue;
        }

        await docRef.create({
            id: user.id,
            username,
            passwordHash: user.passwordHash,
            createdAt: user.createdAt,
            migratedAt: new Date().toISOString()
        });

        console.log(`MIGRATED: ${username}`);
        migrated++;
    }

    console.log("");
    console.log("Migration complete.");
    console.log(`Migrated: ${migrated}`);
    console.log(`Skipped: ${skipped}`);
}

migrateUsers().catch(error => {
    console.error("");
    console.error("MIGRATION FAILED:", error);
    process.exit(1);
});