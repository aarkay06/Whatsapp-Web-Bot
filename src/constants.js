const INSTAGRAM_REGEX =
  /https?:\/\/(www\.)?instagram\.com\/(reel|p|tv)\/[A-Za-z0-9_-]+\/?(\?[^\s]*)?/gi;

const wyrPrompts = [
  "Would you rather always be 10 minutes late or always be 20 minutes early?",
  "Would you rather lose the ability to read or lose the ability to speak?",
  "Would you rather have a rewind button or a pause button on your life?",
  "Would you rather always have a full phone battery or a full gas tank?",
  "Would you rather fight one horse-sized duck or a hundred duck-sized horses?",
];

const HANGMAN_STAGES = [
  "```\n  +---+\n  |   |\n      |\n      |\n      |\n      |\n=========```",
  "```\n  +---+\n  |   |\n  O   |\n      |\n      |\n      |\n=========```",
  "```\n  +---+\n  |   |\n  O   |\n  |   |\n      |\n      |\n=========```",
  "```\n  +---+\n  |   |\n  O   |\n /|   |\n      |\n      |\n=========```",
  "```\n  +---+\n  |   |\n  O   |\n /|\\  |\n      |\n      |\n=========```",
  "```\n  +---+\n  |   |\n  O   |\n /|\\  |\n /    |\n      |\n=========```",
  "```\n  +---+\n  |   |\n  O   |\n /|\\  |\n / \\  |\n      |\n=========```",
];

const ZODIAC_SIGNS = [
  "aries",
  "taurus",
  "gemini",
  "cancer",
  "leo",
  "virgo",
  "libra",
  "scorpio",
  "sagittarius",
  "capricorn",
  "aquarius",
  "pisces",
];

module.exports = {
  INSTAGRAM_REGEX,
  wyrPrompts,
  HANGMAN_STAGES,
  ZODIAC_SIGNS,
};
