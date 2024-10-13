import type * as Party from "partykit/server";

import {
  gameUpdater,
  Action,
  ServerAction,
  GameMachineActor,
  gameMachine,
  GameMachineSnapshot,
} from "../game/logic";
import { GameState } from "../game/logic";
import { createActor } from "xstate";

interface ServerMessage {
  state: GameState;
}

export default class Server implements Party.Server {
  private gameActor: GameMachineActor;
  private gameState: GameState;

  constructor(readonly party: Party.Party) {
    this.gameActor = createActor(gameMachine, {
      input: {
        players: [
          {
            id: "Player:1",
            name: "Player:1",
          },
          {
            id: "Player:2",
            name: "Player:2",
          },
          {
            id: "Player:3",
            name: "Player:3",
          },
          {
            id: "Player:4",
            name: "Player:4",
          },
        ],
      },
    }).start();

    // this.gameState = this.gameActor.getPersistedSnapshot() as GameMachineSnapshot;
    this.gameState = {
      users: [],
      gameInfo: this.gameActor.getPersistedSnapshot() as GameMachineSnapshot,
      log: [],
    };
    console.log("Room created:", party.id);

    // Subscribe to the game actor here and broadcast a message on change
    this.gameActor.subscribe(() => {
      this.gameState = {
        ...this.gameState,
        gameInfo: this.gameActor.getPersistedSnapshot() as GameMachineSnapshot,
      };
      this.party.broadcast(JSON.stringify(this.gameState));
    });
    // party.storage.put;
  }

  onConnect(connection: Party.Connection, ctx: Party.ConnectionContext) {
    // A websocket just connected!
    this.gameState = gameUpdater(
      { type: "UserEntered", user: { id: connection.id } },
      this.gameState,
    );
    this.party.broadcast(JSON.stringify(this.gameState));
  }

  onClose(connection: Party.Connection) {
    this.gameState = gameUpdater(
      {
        type: "UserExit",
        user: { id: connection.id },
      },
      this.gameState,
    );
    this.party.broadcast(JSON.stringify(this.gameState));
  }

  onMessage(message: string, sender: Party.Connection) {
    const action: ServerAction = {
      ...(JSON.parse(message) as Action),
      // Attach the user id to the action
      user: { id: sender.id },
    };
    console.log(
      `Received action ${JSON.stringify(action)} from user ${sender.id}`,
    );
    this.gameActor.send(action);
    // this.gameState = gameUpdater(action, this.gameState);
    // TODO: filter out the reduced state for each player
    // this.party.broadcast(JSON.stringify(this.gameState));
  }
}

Server satisfies Party.Worker;
