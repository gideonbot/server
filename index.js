//#region Requirements
require('dotenv').config();
const bodyParser = require('body-parser');
const Constants = require('./constants');
const { Controller } = require('request-controller');
const cookieParser = require('cookie-parser');
const crypto = require('crypto');
const DiscordOauth2 = require('discord-oauth2');
const exec = require('child_process').exec;
const express = require('express');
const fs = require('fs');
const git = require('git-last-commit');
const http = require('http');
const rateLimit = require('express-rate-limit');
const Util = require('./Util');
const url = require('url');
const ws = require('ws');
//#endregion

//#region Variables
const oauth = new DiscordOauth2();
const app = express();
const http_port = process.env.PORT || 80;
const hostname = 'gideonbot.com';

const CLIENT_ID = process.env.CLIENT_ID;
const CLIENT_SECRET = process.env.CLIENT_SECRET;
const redirect = 'http://localhost:80/discord/callback';

const websocket_server = new ws.Server({noServer: true, clientTracking: true});
let gideon_ws = null;
let http_server = http.createServer(app);
//#endregion

//#region Config
const config_path = './server.json';
let config = {
    //pls don't store api keys like this, it is bad
    api_keys: [],
    discord_invite: 'https://discord.gg/h9SEQaU',
    bot_invite: 'https://discordapp.com/oauth2/authorize?client_id=595328879397437463&permissions=37088320&scope=bot'
};

InitConfig();
function InitConfig() {
    if (!fs.existsSync(config_path)) WriteConfig();
    
    config = JSON.parse(fs.readFileSync(config_path));
    WriteConfig();
}

function WriteConfig() {
    fs.writeFileSync(config_path, JSON.stringify(config, null, 2));
}
//#endregion

//#region Functions
function CheckCertificate() {
    Util.GetCertExpirationDays(hostname).then(days => {
        if (days <= 4) Util.log('Certificate will expire in less than 4 days!');
    }, failed => Util.log('Failed to check certificate: ' + failed));
}

function LogStart() {
    git.getLastCommit((err, commit) => {
        if (err) Util.log('Couldn\'t fetch last commit: ' + err);
        else Util.log(`Server starting, commit \`#${commit.shortHash}\` by \`${commit.committer.name}\`:\n\`${commit.subject}\`\nhttps://${hostname}`);
    });
}

http_server.on('upgrade', Upgrade);

function Upgrade(request, socket, head) {
    const pathname = url.parse(request.url).pathname;

    if (pathname != '/ws') return socket.destroy();

    websocket_server.handleUpgrade(request, socket, head, ws => websocket_server.emit('connection', ws));
}

function GetDiscordStats() {
    return new Promise((resolve, reject) => {
        if (!gideon_ws) return reject('Gideon unavailable');

        let timer = null;

        let handler = data => {
            if (data.type == 'STATS') {
                gideon_ws.off('data', handler);
                clearTimeout(timer);
                
                delete data.type;

                resolve(data);
            }
        };

        timer = setTimeout(() => {
            gideon_ws.off('data', handler);
            reject('Timeout');
        }, 1000);

        gideon_ws.on('data', handler);
        gideon_ws.send(JSON.stringify({op: 1, d: {type: 'REQUEST_STATS'}}));
    });
}
//#endregion

//#region Init
LogStart();

if (!process.env.CI) {
    http_server.listen(http_port, () => Util.log(`HTTP server listening on port \`${http_port}\``));
    setInterval(CheckCertificate, 1000 * 60 * 60 * 2);
}
//#endregion

//#region Express
app.set('env', 'production');
app.set('trust proxy', true);
app.set('x-powered-by', false);

app.use((req, res, next) => {
    res.set('Referrer-Policy', 'same-origin');
    res.set('X-Content-Type-Options', 'nosniff');
    res.set('X-Frame-Options', 'SAMEORIGIN');
    res.set('X-XSS-Protection', '1; mode=block');

    next();
});


if (!process.env.CI) {
    const controller = new Controller({
        whitelisted_ips: ['167.99.153.39'],
        ban_threshold_count: 100,
        ban_threshold_time: 45,
        file_path: __dirname,
        response: {
            code: 403,
            ctype: 'text/html',
            body: __dirname + '/blocked.html'
        }
    });
    
    controller.on('ip_banned', ip => Util.log(ip + ' was banned because of too many requests'));
    
    app.use(controller.middleware);
}

app.use((req, res, next)=> {
    console.log(req.ip + ' ' + req.method + ' ' + req.path);
    next();
});

const apiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 250,
    skip: req => {
        if (req.path.startsWith('/dump')) return true;
        return false;
    }
});

app.use(cookieParser());
app.use('/img', express.static('public/img', {maxAge: 86400000}));
app.use('/', express.static('public', {extensions: ['html']}));
app.use('/api/', apiLimiter);
app.use(bodyParser.json());

//this merges all the same query string params into 1 
app.use((req, res, next) => {
    for (let key in req.query) {
        if (Array.isArray(req.query[key])) {
            let temp = req.query[key];
            req.query[key] = temp[temp.length - 1];
        }
    }
    next();
});

app.get('/api/status', (req, res) => Util.SendResponse(res, 200, Constants.API));
app.get('/api/soundtracks', (req, res) => Util.SendResponse(res, 200, Constants.Soundtracks));
app.get('/api/quotes', (req, res) => Util.SendResponse(res, 200, Constants.Quotes));
app.get('/api/speedsters', (req, res) => Util.SendResponse(res, 200, Constants.Speedsters));
app.get('/api/abilities', (req, res) => Util.SendResponse(res, 200, Constants.Abilities));
app.get('/api/timeline', (req, res) => Util.SendResponse(res, 200, Constants.Timeline));

app.get('/invite', (req, res) => res.redirect(307, config.bot_invite)); //307 - we don't want caching
app.get('/discord', (req, res) => res.redirect(307, config.discord_invite)); //307 - ^
app.get('/api/invite', (req, res) => Util.SendResponse(res, 200, {url: config.bot_invite}));
app.get('/api/discord', (req, res) => Util.SendResponse(res, 200, {url: config.discord_invite}));

app.all(/api\/dump/, (req, res) => Util.SendResponse(res, 200));

app.get('/login', async (req, res) => {
    res.redirect(`https://discordapp.com/api/oauth2/authorize?client_id=${CLIENT_ID}&scope=identify&response_type=code&redirect_uri=${encodeURIComponent(redirect)}`);
});

app.get('/discord/callback', async (req, res) => {
    let discordresponse = await oauth.tokenRequest({
        clientId: CLIENT_ID,
        clientSecret: CLIENT_SECRET,
     
        code: req.query.code,
        scope: 'identify',
        grantType: 'authorization_code',
        
        redirectUri: redirect
    }).then(console.log);

    const cookie = req.cookies.login;
    if (cookie === undefined)
    {
        res.cookie('login', discordresponse);
        console.log('cookie created successfully');
    } 
    res.redirect('/');
});

let discord_stats = null;

app.get('/api/discord/stats', (req, res) => {
    if (discord_stats) return Util.SendResponse(res, 200, discord_stats);

    GetDiscordStats().then(data => {
        discord_stats = data;
        setTimeout(() => discord_stats = null, 60e3);
        Util.SendResponse(res, 200, discord_stats);
    }, failed => {
        console.log(failed);
        Util.SendResponse(res, 500);
    });
});

app.post('/api/github', (req, res) => {
    const secret = process.env.GITHUB_SECRET;
    if (!secret) return Util.SendResponse(res, 501);

    let body = req.body;
    if (!body) return Util.SendResponse(res, 400);

    let github_secret = req.get('x-hub-signature');
    if (!github_secret) return Util.SendResponse(res, 401);

    const hmac = crypto.createHmac('sha1', secret);
    const digest = Buffer.from('sha1=' + hmac.update(JSON.stringify(body)).digest('hex'), 'utf8');
    const checksum = Buffer.from(github_secret, 'utf8');

    if (checksum.length !== digest.length || !crypto.timingSafeEqual(digest, checksum)) return Util.SendResponse(res, 401);

    //we send response and then handle our thing (connection would end abruptly if we updated during request)
    Util.SendResponse(res, 204);
    
    let repo = body.repository.name;

    if (body.action == 'completed') {
        if (body.check_run && body.check_run.conclusion == 'success') {
            Util.log('CI build passed successfully for `' + repo + '`');
    
            let path = repo == 'server' ? './' : '../' + repo;
            exec('sudo git stash & sudo git pull', {cwd: path}, error => {
                if (error) Util.log('Error while syncing repo: ' + error);
            });
        }
    }

    else if (req.get('x-github-event') == 'push') {
        Util.log('Push detected for `' + repo + '`');

        let path = repo == 'web' ? './public' : null;
        if (!path) {
            Util.log('Unknown repo at push: `' + repo + '`');
            return;
        }

        exec('git pull', {cwd: path}, error => {
            if (error) Util.log('Error while syncing repo: ' + error);
        });
    }
});

app.put('/api/invite', (req, res) => {
    let key = req.query.key;

    if (!key || !config.api_keys.includes(key)) return Util.SendResponse(res, 401);

    let body = req.body;
    if (!body || !body.url) return Util.SendResponse(res, 400);

    config.bot_invite = body.url;
    WriteConfig();
    Util.SendResponse(res, 204);
});

app.put('/api/discord/invite', (req, res) => {
    let key = req.query.key;

    if (!key || !config.api_keys.includes(key)) return Util.SendResponse(res, 401);

    let body = req.body;
    if (!body || !body.url) return Util.SendResponse(res, 400);

    config.discord_invite = body.url;
    WriteConfig();
    Util.SendResponse(res, 204);
});

app.all('*', (req, res) => Util.SendResponse(res, req.method == 'GET' || req.method == 'HEAD' ? 404 : 405));

app.use((error, req, res, next) => {
    Util.log('An error occurred while serving `' + req.path + '` to ' + Util.IPFromRequest(req) + ': ' + error.stack);
    Util.SendResponse(res, error.stack.toLowerCase().includes('json.parse') || error.stack.toLowerCase().includes('urierror') ? 400 : 500);
    next();
});
//#endregion

//#region Error handling
process.on('uncaughtException', err => {
    Util.log('Uncaught Exception: ' + err.stack);

    if (process.env.CI) {
        console.log('Exception detected, marking as failed');
        process.exit(1);
    }
});

process.on('unhandledRejection', err => {
    Util.log('Unhandled Rejection: ' + err.stack + '\n\nJSON: ' + JSON.stringify(err, null, 2));

    if (process.env.CI) {
        console.log('Unhandled Rejection detected, marking as failed');
        process.exit(1);
    }
});
//#endregion

//#region WS
websocket_server.on('error', e => Util.log(e));

websocket_server.on('connection', ws => {
    //close codes
    //4000 general close code (should be avoided)
    //4001 invalid request/JSON
    //4002 invalid opcode
    //4003 auth failed
    //4004 no heartbeat
    //4005 malformed request
    //4006 unauthorized

    //op codes
    //0 [send & receive] login/welcome
    //1 [send & receive] data
    //2 [send & receive] heartbeat
    //3 [send] heartbeat ack
    
    setTimeout(() => {
        //disconnect after 0.75s if not authorized
        if (ws.readyState != ws.OPEN || ws.authorized) return;
        ws.close(4003);
    }, 750);

    let timer = null;

    function StartHeartbeat() {
        timer = setInterval(Heartbeat, 15e3);
    }

    function Heartbeat() {
        if (ws.readyState == ws.OPEN) {
            if (ws.lastPing && !ws.lastPong) return ws.close(4004);

            let diff = Math.abs(ws.lastPong - ws.lastPing);
            if (diff >= 5e3) return ws.close(4004);

            ws.send(JSON.stringify({op: 2}));
            ws.lastPing = new Date();
        }
    }

    ws.on('message', d => {
        let json = Util.GetJSON(d);
        if (!json || json.op == undefined) return ws.close(4001);

        if (json.op != 0 && !ws.authorized) return ws.close(4006);

        switch (json.op) {
            case 0: {
                if (ws.authorized) return;

                let token = json.token;
                if (!token) return ws.close(4005);

                if (!config.api_keys.includes(json.token)) return ws.close(4003);

                ws.authorized = true;
                ws.send(JSON.stringify({op: 0}));

                gideon_ws = ws;
                StartHeartbeat();

                return;
            }

            case 1: {
                if (!json.d) return ws.close(4005);

                ws.emit('data', json.d);
                return;
            }

            case 2: {
                ws.lastPong = new Date();

                return ws.send(JSON.stringify({op: 3}));
            }

            default: return ws.close(4002);
        }
    });

    ws.on('close', (code, reason) => {
        clearTimeout(timer);
        console.log('WS disconnected: ' + code + (reason ? ' (' + reason + ')' : ''));
        gideon_ws = null;
    });

    ws.on('error', e => console.log(e));
    ws.on('unexpected-response', () => console.log('Unexpected response!'));
});
//#endregion
