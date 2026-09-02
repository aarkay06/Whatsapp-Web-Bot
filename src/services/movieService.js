const { TMDB } = require("tmdb-ts");

const tmdb = new TMDB(process.env.TMDB_API_KEY);

async function movie(movieName) {
  try {
    return await tmdb.search.movies({ query: movieName });
  } catch (err) {
    console.error("TMDB error:", err);
    return null;
  }
}

module.exports = {
  tmdb,
  movie,
};
