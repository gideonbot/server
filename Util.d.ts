import Discord from "discord.js";

export const config: Config;
export function log(message: string): boolean;

interface Config {
    avatar: string;
}
