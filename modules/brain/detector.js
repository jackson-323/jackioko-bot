const categories = {
  greeting: [
    "hi",
    "hello",
    "hey",
    "yo",
    "sasa",
    "niaje",
    "mambo",
    "habari",
    "vipi",
    "good morning",
    "good afternoon",
    "good evening"
  ],

  farewell: [
    "bye",
    "goodbye",
    "see you",
    "later",
    "usiku mwema",
    "lala salama",
    "kwaheri"
  ],

  thanks: [
    "thanks",
    "thank you",
    "thankyou",
    "asante",
    "asante sana",
    "shukran"
  ],

  emotion: [
    "sad",
    "happy",
    "angry",
    "lonely",
    "depressed",
    "tired",
    "bored",
    "excited",
    "stress",
    "crying"
  ]
};

function normalize(text) {
  return String(text)
    .toLowerCase()
    .replace(/[^\w\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

async function detect(text) {
  const msg = normalize(text);

  for (const [category, words] of Object.entries(categories)) {
    for (const word of words) {
      if (msg.includes(word)) {
        return category;
      }
    }
  }

  return null;
}

module.exports = {
  detect
};