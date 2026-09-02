const fs = require("fs");
const path = require("path");
const { execFile } = require("child_process");

function downloadInstagram(url) {
  return new Promise((resolve, reject) => {
    const rootDir = path.resolve(__dirname, "..", "..");
    const exactFilePath = path.join(rootDir, `videos\\ig_${Date.now()}.mp4`);
    console.log("url: " + url + "\npath: " + exactFilePath);
    const command = "C:\\utilities\\python\\python.exe";
    const args = [
      "-m",
      "yt_dlp",
      "--no-playlist",
      "-S",
      "vcodec:h264,res,acodec:m4a",
      "-f",
      "b[ext=mp4]",
      "--merge-output-format",
      "mp4",
      "--no-warnings",
      "--cookies",
      path.join(rootDir, "cookies.txt"),
      "-o",
      exactFilePath,
      url,
    ];

    execFile(command, args, { timeout: 180_000 }, (err, stdout, stderr) => {
      if (err) {
        const errorText = (stderr || err.message || "Unknown error")
          .toString()
          .replace(/\r/g, "\n");
        return reject(new Error(errorText));
      }
      if (!fs.existsSync(exactFilePath)) {
        return reject(
          new Error(
            "yt-dlp finished, but the file was not found at the expected path.",
          ),
        );
      }
      resolve(exactFilePath);
    });
  });
}

module.exports = {
  downloadInstagram,
};
