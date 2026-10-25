import { defineRoom, defineServer } from "@colyseus/core";
import { WebSocketTransport } from "@colyseus/ws-transport";
import { ROOM_NAME, SERVER_PORT } from "@hangout/shared";
import { PlaygroundRoom } from "./PlaygroundRoom.ts";

const port = Number(process.env.PORT ?? SERVER_PORT);

const server = defineServer({
  transport: new WebSocketTransport(),
  rooms: {
    [ROOM_NAME]: defineRoom(PlaygroundRoom),
  },
});

server.listen(port).then(() => console.log(`playground server on :${port}`));
