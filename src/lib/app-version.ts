import packageJson from "../../package.json";

/**
 * The version of Neuravex that is running, from `package.json` and nowhere
 * else.
 *
 * It was written in three places once, and they disagreed; the launchers now
 * read the same file. The builder itself never said at all, so a customer
 * asked which version they had could only go and open a JSON file.
 */
export const APP_VERSION: string = packageJson.version;
