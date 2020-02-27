import Discord from "discord.js";

export const config: Config;
export const HTTP_Codes: Record<number, string>;
export function log(message: string): boolean;
export function SendResponse(res: Express.Response, code: number, obj?: object, pretty?: boolean): void;
export function IPFromRequest(req: Express.Request): string;
export function GetCertExpirationDays(host: string): Promise<number>;

interface Config {
    avatar: string;
}
