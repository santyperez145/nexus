import type { ChatChunk } from "./types.js";
export declare function iterateSSE(res: Response): AsyncGenerator<ChatChunk>;
