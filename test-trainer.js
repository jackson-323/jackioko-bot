const trainer = require("./modules/brain/trainer");

(async () => {

    await trainer.learn(
        "where are you",
        "I'm at home."
    );

    await trainer.learn(
        "where are you",
        "I'm at home."
    );

    await trainer.learn(
        "how are you",
        "I'm doing great!"
    );

    console.log(await trainer.find("where are you"));
    console.log(await trainer.find("how are you"));

})();