function pixelify(wordToPixelify) {
  if (wordToPixelify.length === 1) return "_";
  let pixeled = "";
  for (let i = 0; i < wordToPixelify.length; i++) {
    pixeled +=
      Math.floor(Math.random() * 10) < 5 ? "_ " : `${wordToPixelify[i]} `;
  }
  return pixeled;
}

function decodeHtml(str) {
  return str
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&ldquo;/g, "\u201C")
    .replace(/&rdquo;/g, "\u201D")
    .replace(/&lsquo;/g, "\u2018")
    .replace(/&rsquo;/g, "\u2019");
}

function parseTimeString(timeStr) {
  const match = timeStr?.match(/^(\d+)([smhd])$/);
  if (!match) return null;
  const amount = parseInt(match[1]);
  const unit = match[2];
  const mul = { s: 1000, m: 60_000, h: 3_600_000, d: 86_400_000 };
  return { amount, unit, ms: amount * mul[unit] };
}

module.exports = {
  pixelify,
  decodeHtml,
  parseTimeString,
};
