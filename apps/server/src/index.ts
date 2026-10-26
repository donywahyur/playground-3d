import { defineRoom, defineServer } from "@colyseus/core";
import { WebSocketTransport } from "@colyseus/ws-transport";
import { ROOM_NAME, SERVER_PORT, type ServerStatus } from "@hangout/shared";
import { BUILD_ID } from "./build.ts";
import { PlaygroundRoom } from "./PlaygroundRoom.ts";

const port = Number(process.env.PORT ?? SERVER_PORT);

const server = defineServer({
  transport: new WebSocketTransport(),
  rooms: {
    [ROOM_NAME]: defineRoom(PlaygroundRoom),
  },
  express: (app) => {
    // The join screen polls this to tell when an update is half deployed (see ui/home/useServerStatus.ts).
    app.get("/status", (_req: unknown, res: { set(h: Record<string, string>): void; json(body: unknown): void }) => {
      res.set({ "Access-Control-Allow-Origin": "*", "Cache-Control": "no-store" });
      res.json({ build: BUILD_ID } satisfies ServerStatus);
    });
  },
});

server.listen(port).then(() => console.log(`playground server on :${port}`));
