require('dotenv').config();
//const bodyParser = require("body-parser");
const Constants = require("./constants");
const express = require('express');
const Util = require("./Util");
const git = require("git-last-commit");
const app = express();
const port = 80;

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
//app.use(bodyParser.json());

app.get("/api/soundtracks", (req, res) => SendResponse(res, 200, Constants.Soundtracks));

app.all("*", (req, res) => SendResponse(res, req.method == "GET" || req.method == "HEAD" ? 404 : 405));

app.use((error, req, res, next) => {
    console.log("An error occurred while serving `" + req.path + "` to " + IPFromRequest(req) + ": " + error.stack);
    Util.log("An error occurred while serving `" + req.path + "` to " + IPFromRequest(req) + ": " + error.stack);
    SendResponse(res, error.stack.toLowerCase().includes("JSON.parse") || error.stack.toLowerCase().includes("URIError") ? 400 : 500);
    next();
});

app.listen(port, "0.0.0.0", () => {
    console.log(`Server listening on port ${port}`)

    git.getLastCommit((err, commit) => {
        if (err) {
            console.log(err);
            Util.log("Couldn't fetch last commit: " + err);
            return;
        }
    
        Util.log(`Server listening on port ${port}, commit \`#${commit.shortHash}\` by \`${commit.committer.name}\`:\n\`${commit.subject}\`\nhttp://gideonbot.co.vu`);
    });
});

/**
 * @param {Response} res 
 * @param {Number} code 
 * @param {Object} object 
 */
function SendResponse(res, code, obj = null, pretty = true) {
    if (!res || !code) throw new Error("Invalid Args");
    if (!(code in Constants.HTTP_Codes)) throw new Error(code + " is not a valid HTTP status code");

    if (obj == null || obj == undefined) {
        return res.status(code).set("Content-Type", "application/json").send(JSON.stringify({code: code, message: Constants.HTTP_Codes[code]}));
    }
    
    return res.status(code).set("Content-Type", "application/json").send(JSON.stringify(obj, null, pretty ? 2 : 0));
}

function IPFromRequest(req) {
    let IP = req.ip;
    if (!IP) return "MISSING IP";

    IP = IP.replace("::ffff:", "").replace("::1", "");
    return !IP ? "127.0.0.1" : IP;
}