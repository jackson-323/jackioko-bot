const brain = require('./modules/brain');

(async () => {
    const tests = [
        "hello",
        "hi",
        "sasa",
        "niaje",
        "good morning",
        "thanks",
        "bye",
        "I am sad"
    ];

    for (const msg of tests) {
        console.log("=================================");
        console.log("INPUT :", msg);

        const result = await brain.reply(msg, {
            id: "test-user"
        });

        console.log("OUTPUT:");
        console.dir(result, { depth: null });
    }
})();