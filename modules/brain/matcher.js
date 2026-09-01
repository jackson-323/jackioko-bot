const fs = require('fs');
const path = require('path');

const cache = {};

function load(category) {
  if (cache[category]) return cache[category];

  const fileNames = {
    greeting: 'greetings.json',
    farewell: 'farewells.json',
    thanks: 'thanks.json',
    emotion: 'emotions.json',
    smalltalk: 'smalltalk.json',
    fallback: 'fallback.json'
};

const file = path.join(__dirname, 'data', fileNames[category]);
  if (!fs.existsSync(file)) {
    return null;
  }

  const json = JSON.parse(fs.readFileSync(file, 'utf8'));

  cache[category] = json;

  return json;
}

async function find(category, message) {
  const data = load(category);

  if (!data) return null;

  const text = message.toLowerCase();

  for (const pattern of data.patterns) {
    if (text.includes(pattern.toLowerCase())) {
      return data;
    }
  }

  return null;
}

module.exports = {
  find
};