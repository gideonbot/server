require('dotenv').config();
const bodyParser = require("body-parser");
const Constants = require("./constants");
const exec = require("child_process").exec;
const crypto = require("crypto");
const express = require('express');
const http = require("http");
const https = require('https');
const Util = require("./Util");
const git = require("git-last-commit");
const fs = require('fs');

const app = express();
const http_port = 80;
const https_port = 443;

const supports_https = fs.existsSync('privkey.pem') && fs.existsSync('cert.pem') && fs.existsSync('ca.crt');

let http_server = http.createServer(app);
let https_server = https.createServer(app);

git.getLastCommit((err, commit) => {
    if (err) {
        console.log(err);
        Util.log("Couldn't fetch last commit: " + err);
        return;
    }

    Util.log(`Server${supports_https ? 's' : ''} starting on port${supports_https ? 's' : ''} \`${http_port}\`${supports_https ? ' & '  + '`' + https_port + '`' : ''}, commit \`#${commit.shortHash}\` by \`${commit.committer.name}\`:\n\`${commit.subject}\`\nhttps://gideonbot.co.vu`);
});

if (!process.env.CI) {
    http_server.listen(http_port, "0.0.0.0", () => {
        console.log(`HTTP server listening on port ${http_port}`);
        Util.log(`HTTP server listening on port \`${http_port}\``);
    });
}

if (supports_https) {
    https_server = https.createServer({
        key: fs.readFileSync('privkey.pem', 'utf8'),
        cert: fs.readFileSync('cert.pem', 'utf8'),
        ca: [fs.readFileSync('ca.crt', 'utf8')],
        minVersion: "TLSv1.2"
    }, app);

    https_server.listen(https_port, "0.0.0.0", () => {
        console.log(`HTTPS server listening on port ${https_port}`);
        Util.log(`HTTPS server listening on port \`${https_port}\``);
    });
}

app.set("env", "production");
app.set("x-powered-by", false);

app.use((req, res, next) => {
    res.set("Access-Control-Allow-Origin", "*");
    res.set("Referrer-Policy", "same-origin");
    res.set("X-Content-Type-Options", "nosniff");
    res.set("X-Frame-Options", "SAMEORIGIN");
    res.set("X-XSS-Protection", "1; mode=block");

    if (https_server.listening && !req.secure) {
        //requests that send data HAVE to go through https
        if (req.method != "GET" && req.method != "HEAD") return Util.SendResponse(res, 405);
        return res.redirect(307, "https://gideonbot.co.vu" + req.url);
    }

    next();
});

app.use(express.static('public'));
app.use(bodyParser.json());

app.get("/api", (req, res) => Util.SendResponse(res, 200, Constants.API));
app.get("/api/soundtracks", (req, res) => Util.SendResponse(res, 200, Constants.Soundtracks));
app.get("/api/quotes", (req, res) => Util.SendResponse(res, 200, Constants.Quotes));
app.get("/api/speedsters", (req, res) => Util.SendResponse(res, 200, Constants.Speedsters));
app.get("/api/abilities", (req, res) => Util.SendResponse(res, 200, Constants.Abilities));

app.post("/api/github", (req, res) => {
    const secret = process.env.GITHUB_SECRET;
    if (!secret) return Util.SendResponse(res, 501);

    let body = req.body;
    if (!body) return Util.SendResponse(res, 400);

    let github_secret = req.get("x-hub-signature");
    if (!github_secret) return Util.SendResponse(res, 401);

    const hmac = crypto.createHmac("sha1", secret);
    const digest = Buffer.from("sha1=" + hmac.update(JSON.stringify(body)).digest("hex"), "utf8");
    const checksum = Buffer.from(github_secret, "utf8");

    if (checksum.length !== digest.length || !crypto.timingSafeEqual(digest, checksum)) return Util.SendResponse(res, 401);

    //we send response and then handle our thing (connection would end abruptly if we updated during request)
    Util.SendResponse(res, 204);
    
    let repo = body.repository.name;

    if (body.action == "completed") {
        if (body.check_run && body.check_run.conclusion == "success") {
            console.log("CI build passed successfully for " + repo);
            Util.log("CI build passed successfully for `" + repo + "`");
    
            let path = repo == "server" ? "./" : repo == "web" ? "./public" : "../" + repo;
            exec("git pull", {cwd: path}, error => {
                if (error) {
                    console.log(error);
                    Util.log("Error while syncing repo: " + error);
                }
            });
        }
    }

    else if (req.get("x-github-event") == "push") {
        console.log("Push for " + repo);
        Util.log("Push detected for `" + repo + "`");

        let path = repo == "web" ? "./public" : null;
        if (!path) {
            console.log("Unknown repo @push: " + repo);
            Util.log("Unknown repo @push: `" + repo + "`");
            return;
        }

        exec("git pull", {cwd: path}, error => {
            if (error) {
                console.log(error);
                Util.log("Error while syncing repo: " + error);
            }
        });
    }
});

app.all("*", (req, res) => Util.SendResponse(res, req.method == "GET" || req.method == "HEAD" ? 404 : 405));

app.use((error, req, res, next) => {
    console.log("An error occurred while serving `" + req.path + "` to " + Util.IPFromRequest(req) + ": " + error.stack);
    Util.log("An error occurred while serving `" + req.path + "` to " + Util.IPFromRequest(req) + ": " + error.stack);
    Util.SendResponse(res, error.stack.toLowerCase().includes("JSON.parse") || error.stack.toLowerCase().includes("URIError") ? 400 : 500);
    next();
});

process.on("uncaughtException", err => {
    console.log(err);
    Util.log("Uncaught Exception: " + err.stack);

    if (process.env.CI) {
        console.log("Exception detected, marking as failed");
        process.exit(1);
    }
});

process.on("unhandledRejection", err => {
    console.log(err);
    Util.log("Unhandled Rejection: " + err.stack + "\n\nJSON: " + JSON.stringify(err, null, 2));

    if (process.env.CI) {
        console.log("Unhandled Rejection detected, marking as failed");
        process.exit(1);
    }
});