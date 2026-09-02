const https = require("https");

const MATCH_URL =
  "https://www.cricbuzz.com/live-cricket-scores/152097/mi-vs-rcb-54th-match-indian-premier-league-2026";

function fetchPage(url) {
  return new Promise((resolve, reject) => {
    const options = {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        Accept:
          "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.5",
        "Cache-Control": "no-cache",
      },
    };

    https
      .get(url, options, (res) => {
        if (res.statusCode === 301 || res.statusCode === 302) {
          return fetchPage(res.headers.location).then(resolve).catch(reject);
        }
        let data = "";
        res.on("data", (chunk) => (data += chunk));
        res.on("end", () => resolve(data));
      })
      .on("error", reject);
  });
}

function extractMiniscore(html) {
  const pushRegex = /self\.__next_f\.push\(\[1,"([\s\S]*?)"\]\)/g;
  let combined = "";
  let match;
  while ((match = pushRegex.exec(html)) !== null) {
    try {
      combined += JSON.parse(`"${match[1]}"`);
    } catch {
      combined += match[1];
    }
  }

  const key = '"miniscore":';
  const start = combined.indexOf(key);
  if (start === -1) throw new Error("miniscore key not found in page payload");

  let braceCount = 0;
  let objStart = -1;
  for (let i = start + key.length; i < combined.length; i++) {
    if (combined[i] === "{") {
      if (objStart === -1) objStart = i;
      braceCount++;
    } else if (combined[i] === "}") {
      braceCount--;
      if (braceCount === 0 && objStart !== -1) {
        const raw = combined.slice(objStart, i + 1);
        return JSON.parse(raw);
      }
    }
  }
  throw new Error("Could not extract complete miniscore object");
}

function buildScoreData(miniscore) {
  const {
    matchScoreDetails,
    batTeam,
    overs,
    batsmanStriker,
    batsmanNonStriker,
    status,
  } = miniscore;

  const innings = matchScoreDetails?.inningsScoreList ?? [];

  const formattedInnings = innings.map((inn) => ({
    inningsId: inn.inningsId,
    team: inn.batTeamName,
    score: inn.score,
    wickets: inn.wickets,
    overs: inn.overs,
    display: `${inn.batTeamName} ${inn.score}/${inn.wickets} (${inn.overs})`,
  }));

  const currentInnings =
    formattedInnings.find((i) => i.inningsId === 2) ??
    formattedInnings[formattedInnings.length - 1];

  return {
    matchStatus: status,
    currentInnings: {
      team: currentInnings?.team,
      score: batTeam?.teamScore ?? currentInnings?.score,
      wickets: batTeam?.teamWkts ?? currentInnings?.wickets,
      overs: overs ?? currentInnings?.overs,
      display: `${batTeam?.teamScore ?? currentInnings?.score}/${batTeam?.teamWkts ?? currentInnings?.wickets} (${overs ?? currentInnings?.overs})`,
    },
    allInnings: formattedInnings,
    currentBatsmen: [
      {
        name: batsmanStriker?.name,
        runs: batsmanStriker?.runs,
        balls: batsmanStriker?.balls,
        fours: batsmanStriker?.fours,
        sixes: batsmanStriker?.sixes,
        strikeRate: batsmanStriker?.strikeRate,
        onStrike: true,
      },
      {
        name: batsmanNonStriker?.name,
        runs: batsmanNonStriker?.runs,
        balls: batsmanNonStriker?.balls,
        fours: batsmanNonStriker?.fours,
        sixes: batsmanNonStriker?.sixes,
        strikeRate: batsmanNonStriker?.strikeRate,
        onStrike: false,
      },
    ],
    currentRunRate: miniscore.currentRunRate,
    requiredRunRate: miniscore.requiredRunRate,
    target: miniscore.target,
    lastWicket: miniscore.lastWicket,
    partnership: miniscore.partnerShip
      ? `${miniscore.partnerShip.runs}(${miniscore.partnerShip.balls})`
      : null,
  };
}

async function getMatchScore() {
  const html = await fetchPage(MATCH_URL);
  const miniscore = extractMiniscore(html);
  const scoreData = buildScoreData(miniscore);
  return scoreData;
}

module.exports = {
  fetchPage,
  extractMiniscore,
  buildScoreData,
  getMatchScore,
};
