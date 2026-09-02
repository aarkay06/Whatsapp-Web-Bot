const Genius = require("genius-lyrics");

const geniusClient = new Genius.Client(process.env.GENIUS_API_KEY);

async function lyrics(songName) {
  try {
    const searches = await geniusClient.songs.search(songName);
    if (searches.length === 0) return "Song not found.";
    return await searches[0].lyrics();
  } catch (err) {
    console.error("Lyrics error:", err);
    return "Error fetching lyrics.";
  }
}

module.exports = {
  geniusClient,
  lyrics,
};
