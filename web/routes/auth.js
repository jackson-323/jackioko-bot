const express = require("express");
const bcrypt = require("bcryptjs");
const { db } = require("../firebase-admin");

const router = express.Router();

const USERS_COLLECTION = "users";

// Find a user by username
async function findUserByUsername(username) {
    const cleanUsername = String(username)
        .trim()
        .toLowerCase();

    const snapshot = await db
        .collection(USERS_COLLECTION)
        .where("username", "==", cleanUsername)
        .limit(1)
        .get();

    if (snapshot.empty) {
        return null;
    }

    return snapshot.docs[0].data();
}

// REGISTER
router.post("/register", async (req, res) => {
    try {
        const { username, password } = req.body;

        if (!username || !password) {
            return res.status(400).json({
                success: false,
                message: "Username and password are required."
            });
        }

        const cleanUsername = String(username)
            .trim()
            .toLowerCase();

        if (cleanUsername.length < 3) {
            return res.status(400).json({
                success: false,
                message: "Username must be at least 3 characters."
            });
        }

        if (password.length < 6) {
            return res.status(400).json({
                success: false,
                message: "Password must be at least 6 characters."
            });
        }

        const existingUser = await findUserByUsername(cleanUsername);

        if (existingUser) {
            return res.status(409).json({
                success: false,
                message: "Username already exists."
            });
        }

        const passwordHash = await bcrypt.hash(password, 12);

        const user = {
            id: `user_${Date.now()}`,
            username: cleanUsername,
            passwordHash,
            createdAt: new Date().toISOString()
        };

        await db
            .collection(USERS_COLLECTION)
            .doc(cleanUsername)
            .create(user);

        res.json({
            success: true,
            message: "Account created successfully."
        });

    } catch (error) {
        console.error("Registration error:", error);

        res.status(500).json({
            success: false,
            message: "Registration failed."
        });
    }
});

// LOGIN
router.post("/login", async (req, res) => {
    try {
        const { username, password } = req.body;

        if (!username || !password) {
            return res.status(400).json({
                success: false,
                message: "Username and password are required."
            });
        }

        const cleanUsername = String(username)
            .trim()
            .toLowerCase();

        const user = await findUserByUsername(cleanUsername);

        if (!user) {
            return res.status(401).json({
                success: false,
                message: "Invalid username or password."
            });
        }

        const passwordMatch = await bcrypt.compare(
            password,
            user.passwordHash
        );

        if (!passwordMatch) {
            return res.status(401).json({
                success: false,
                message: "Invalid username or password."
            });
        }

        req.session.userId = user.id;
        req.session.username = user.username;

        res.json({
            success: true,
            message: "Login successful.",
            user: {
                id: user.id,
                username: user.username
            }
        });

    } catch (error) {
        console.error("Login error:", error);

        res.status(500).json({
            success: false,
            message: "Login failed."
        });
    }
});

// LOGOUT
router.post("/logout", (req, res) => {
    req.session.destroy(error => {

        if (error) {
            return res.status(500).json({
                success: false,
                message: "Logout failed."
            });
        }

        res.json({
            success: true,
            message: "Logged out successfully."
        });
    });
});

// CURRENT USER
router.get("/me", (req, res) => {

    if (!req.session.userId) {
        return res.status(401).json({
            success: false,
            message: "Not authenticated."
        });
    }

    res.json({
        success: true,
        user: {
            id: req.session.userId,
            username: req.session.username
        }
    });
});

module.exports = router;