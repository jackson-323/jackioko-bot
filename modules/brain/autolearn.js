const trainer = require("./trainer");

async function learn(message) {

    if (!message) return;

    const text = String(message).trim();

    if (text.length < 3) return;

    // Ignore commands
    if (text.startsWith(".")) return;

    // Ignore links
    if (text.includes("http")) return;

    // Ignore very long messages
    if (text.length > 250) return;

    trainer.learn(text);

}

module.exports = {
    learn
};