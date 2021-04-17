export const config: Config;
export const HTTP_Codes: Record<number, string>;
export function log(message: string): boolean;
export function SendResponse(res: Express.Response, code: number, obj?: object, pretty?: boolean): void;
export function IPFromRequest(req: Express.Request): string;
export function GetCertExpirationDays(host: string): Promise<number>;
export function GetJSON(str: string): object;
export function GenerateSnowflake(): string;

interface Config {
    avatar: string;
}
