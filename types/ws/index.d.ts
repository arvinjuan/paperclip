declare module "ws" {
  import { EventEmitter } from "node:events";
  import type { IncomingMessage } from "node:http";
  import type { Duplex } from "node:stream";

  export class WebSocket extends EventEmitter {
    static readonly OPEN: number;
    readyState: number;
    send(data: string | Buffer): void;
    ping(): void;
    terminate(): void;
    close(code?: number, reason?: string): void;
    on(event: "pong", listener: () => void): this;
    on(event: "close", listener: () => void): this;
    on(event: "error", listener: (err: Error) => void): this;
  }

  export class WebSocketServer extends EventEmitter {
    clients: Set<WebSocket>;
    constructor(options?: { noServer?: boolean });
    on(event: "connection", listener: (socket: WebSocket, req: IncomingMessage) => void): this;
    on(event: "close", listener: () => void): this;
    handleUpgrade(
      req: IncomingMessage,
      socket: Duplex,
      head: Buffer,
      callback: (ws: WebSocket) => void,
    ): void;
    emit(event: "connection", socket: WebSocket, req: IncomingMessage): boolean;
  }
}
