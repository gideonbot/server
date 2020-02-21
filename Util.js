const Discord = require("discord.js");
const config = require("./config.json");

class Util {
    constructor() {
        throw new Error('This class cannot be instantiated!');
    }

    static get config() {
        return config;
    }

    /**
     * Log to a webhook
     * @param {string | Discord.MessageEmbed} message 
     */
    static log(message) {
        let url = process.env.LOG_WEBHOOK_URL;
        if (!url || !message) return false;

        url = url.replace("https://discordapp.com/api/webhooks/", "");
        let split = url.split("/");

        if (split.length < 2) return false;

        let client = new Discord.WebhookClient(split[0], split[1]);

        if (typeof(message) == "string") {
            for (let msg of Discord.Util.splitMessage(message, { maxLength: 1980 })) {
                client.send(msg, { avatarURL: Util.config.avatar, username: "Express-Logs" });
            }
        }

        else client.send(null, { embeds: [message], avatarURL: Util.config.avatar, username: "Express-Logs" });
        
        return true;
    }
}
module.exports = Util;
