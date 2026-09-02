async function fetchTrivia() {
  const res = await fetch("https://opentdb.com/api.php?amount=1&type=multiple");
  const json = await res.json();
  return json.results[0];
}

async function fetchHoroscope(sign) {
  try {
    const res = await fetch(
      `https://freehoroscopeapi.com/api/v1/get-horoscope/daily?sign=${sign}&day=today`,
    );
    if (!res.ok) return null;
    const json = await res.json();
    return json?.data?.horoscope ?? null;
  } catch (err) {
    console.error("Fetch error:", err);
    return null;
  }
}

async function fetchMeme() {
  const res = await fetch("https://meme-api.com/gimme");
  return res.json();
}

async function fetchDefinition(term) {
  const res = await fetch(
    `https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(term)}`,
  );
  if (!res.ok) return null;
  const json = await res.json();
  return json[0] ?? null;
}

module.exports = {
  fetchTrivia,
  fetchHoroscope,
  fetchMeme,
  fetchDefinition,
};
