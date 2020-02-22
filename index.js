require('dotenv').config();
//const bodyParser = require("body-parser");
const Constants = require("./constants");
const express = require('express');
const https = require('https');
const Util = require("./Util");
const git = require("git-last-commit");
const fs = require('fs');
const app = express();
const port = 443;

app.set("env", "production");
app.set("x-powered-by", false);

app.use((req, res, next) => {
    res.set("Access-Control-Allow-Origin", "*");
    res.set("Referrer-Policy", "same-origin");
    res.set("X-Content-Type-Options", "nosniff");
    res.set("X-Frame-Options", "SAMEORIGIN");
    res.set("X-XSS-Protection", "1; mode=block");

    next();
});

app.use(express.static('public'));
console.log(fs.readdirSync("./"));
//app.use(bodyParser.json());

app.get("/api/soundtracks", (req, res) => Util.SendResponse(res, 200, Constants.Soundtracks));

app.all("*", (req, res) => Util.SendResponse(res, req.method == "GET" || req.method == "HEAD" ? 404 : 405));

app.use((error, req, res, next) => {
    console.log("An error occurred while serving `" + req.path + "` to " + Util.IPFromRequest(req) + ": " + error.stack);
    Util.log("An error occurred while serving `" + req.path + "` to " + Util.IPFromRequest(req) + ": " + error.stack);
    Util.SendResponse(res, error.stack.toLowerCase().includes("JSON.parse") || error.stack.toLowerCase().includes("URIError") ? 400 : 500);
    next();
});

https.createServer({
    key: fs.readFileSync('/etc/letsencrypt/live/site/privkey.pem'),
    cert: fs.readFileSync('/etc/letsencrypt/live/site/fullchain.pem'),
    passphrase: process.env.PASSPHRASE
}, app).listen(port, "0.0.0.0", () => {
    console.log(`Server listening on port ${port}`)

    git.getLastCommit((err, commit) => {
        if (err) {
            console.log(err);
            Util.log("Couldn't fetch last commit: " + err);
            return;
        }
    
        Util.log(`Server listening on port \`${port}\`, commit \`#${commit.shortHash}\` by \`${commit.committer.name}\`:\n\`${commit.subject}\`\nhttp://gideonbot.co.vu`);
    });
});
