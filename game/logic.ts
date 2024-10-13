import { produce } from "immer";
import {
  ActorRefFrom,
  SnapshotFrom,
  assign,
  createActor,
  enqueueActions,
  raise,
  sendTo,
  setup,
} from "xstate";
import { RequestMachineActor, requestMachine } from "./requestMachine";

// util for easy adding logs
const addLog = (message: string, logs: GameState["log"]): GameState["log"] => {
  return [{ dt: new Date().getTime(), message: message }, ...logs].slice(
    0,
    MAX_LOG_SIZE,
  );
};

// If there is anything you want to track for a specific user, change this interface
export interface User {
  // TODO: this it the username but should use ids eventually
  id: string;
  name: string;
}

// Do not change this! Every game has a list of users and log of actions
interface BaseGameState {
  users: User[];
  log: {
    dt: number;
    message: string;
  }[];
}

// Do not change!
export type Action = DefaultAction | GameAction;

// Do not change!
export type ServerAction = WithUser<DefaultAction> | WithUser<GameAction>;

// The maximum log size, change as needed
const MAX_LOG_SIZE = 4;

type WithUser<T> = T & { user: User };

export type DefaultAction = { type: "UserEntered" } | { type: "UserExit" };

const suitSymbols = ["♠", "♦", "♣", "♥"] as const;
export const getSuitSymbol = (suit: Suit) => suitSymbols[suit];
export type Suit = number;
export type CardInfo = { suit: Suit; rank: string };
const getCardRank = (rank: number) => {
  switch (rank) {
    case 1:
      return "A";
    case 11:
      return "J";
    case 12:
      return "Q";
    case 13:
      return "K";
    default:
      return rank.toString();
  }
};

export function getCardInfo(cardId: number): CardInfo {
  const suit = Math.floor(cardId / 13);
  const rank = getCardRank((cardId % 13) + 1);
  return { suit, rank };
}

export const getCardScore = (cardId: number) => {
  const { suit, rank } = getCardInfo(cardId);
  if (suit === 3) return 1;
  if (suit === 0 && rank === "Q") return 13;
  return 0;
};

export type Card = number;
export type Cards = number[];
export type Hand = Cards;
export type Deck = Cards;
export type Table = Cards;
export type HandRank = number;
export type HandSuit = Suit;

const createDeck = () => {
  const deck: Deck = [];

  for (let i = 0; i < 52; i++) {
    deck.push(i);
  }

  return deck;
};

export type PlayerId = string;

export type Player = {
  id: PlayerId;
  name: string;
  hand: Hand;
  playArea: Hand;
  score: number;
};

// This interface holds all the information about your game
export interface GameState extends BaseGameState {
  gameInfo: SnapshotFrom<typeof gameMachine>;
}

// State of the game. Custom per game
interface GameInfo {
  deck: Deck;
  players: Record<PlayerId, Player>;
  playerCount: number;
  currentPlayer: PlayerId;
  winner: Player | null;
  round: number;
  // TODO: Use a play area
  table: Table;
  discard: Deck;
  playerOrder: PlayerId[];
}

// Resued for all games
interface GameContext {
  activeRequests: RequestMachineActor[];
}

export const nextPlayer = (
  playerOrder: PlayerId[],
  initialPlayerId: PlayerId,
  count = 1,
) => {
  return playerOrder[
    (playerOrder.indexOf(initialPlayerId) + count) % playerOrder.length
  ];
};

// Here are all the actions we can dispatch for a user
type GameAction =
  | { type: "pass"; cardId: number; playerId: PlayerId }
  | { type: "play"; cardId: number; playerId: PlayerId }
  | { type: "request"; value: unknown; requestId: string }
  | { type: "xstate.done.actor.request.*"; output: { value: unknown } };

let requestId = 0;
const getRequestId = () => {
  requestId += 1;
  return requestId.toString();
};

export const gameMachine = setup({
  types: {
    context: {} as GameInfo & GameContext,
    events: {} as GameAction & { user: { id: string } },
    input: {} as {
      players: User[];
    },
  },
  actors: {
    requestMachine: requestMachine,
  },
  actions: {
    resetDeck: assign({
      deck: createDeck(),
    }),
    pass: assign(
      (
        { context },
        { playerId, cardId }: { playerId: PlayerId; cardId: number },
      ) => {
        return {
          ...context,
          table: context.table.concat(cardId),
          players: {
            ...context.players,
            [playerId]: {
              ...context.players[playerId],
              hand: context.players[playerId].hand.filter((x) => x !== cardId),
            },
          },
        };
      },
    ),
    // TODO: try to use produce again
    play: assign(
      (
        { context },
        { playerId, cardId }: { playerId: PlayerId; cardId: number },
      ) => {
        return {
          ...context,
          // table: context.table.concat(cardId),
          players: {
            ...context.players,
            [playerId]: {
              ...context.players[playerId],
              hand: context.players[playerId].hand.filter((x) => x !== cardId),
              playArea: context.players[playerId].playArea.concat(cardId),
            },
          },
        };
      },
    ),
    shuffle: assign(({ context }) =>
      produce(context, (newGameState) => {
        newGameState.deck.sort(() => Math.random() - 0.5);
      }),
    ),
    deal: enqueueActions(({ context, enqueue }) => {
      const newPlayerHands = Object.values(context.players).map((player) => [
        ...player.hand,
      ]);
      context.deck.forEach((card, index) => {
        const offset = index % Object.keys(context.players).length;
        newPlayerHands[offset].push(card);
      });
      newPlayerHands.forEach((hand) => hand.sort((a, b) => a - b));

      enqueue.assign({
        players: produce(context.players, (players) => {
          Object.values(players).forEach((player, index) => {
            player.hand = newPlayerHands[index];
          });
        }),
        deck: [],
      });
    }),
  },
  guards: {
    isCurrentPlayer: ({ context }, { playerId }: { playerId: PlayerId }) => {
      return context.currentPlayer === playerId;
    },
    cardsOnTable: ({ context }, { count }: { count: number }) => {
      return context.table.length === count;
    },
    cardInAllPlayersPlayArea: ({ context }) =>
      Object.values(context.players).every(
        (player) => player.playArea.length > 0,
      ),
    isRound: ({ context }, { roundNumber }: { roundNumber: number }) => {
      return context.round === roundNumber;
    },
  },
}).createMachine({
  id: "game",
  context: ({ input }) => ({
    deck: [],
    activeRequests: [],
    players: Object.fromEntries(
      input.players.map((player) => [
        player.id,
        {
          name: player.name,
          hand: [],
          playArea: [],
          score: 0,
          id: player.id,
        },
      ]),
    ),
    currentPlayer: input.players[0].id,
    playerCount: input.players.length,
    round: 1,
    winner: null,
    table: [],
    discard: [],
    playerOrder: Object.values(input.players).map((player) => player.id),
  }),
  on: {
    request: {
      actions: sendTo(
        ({ system, event }) => {
          return system.get(event.requestId);
        },
        ({ event }) => event,
      ),
    },
  },
  entry: ["resetDeck", "shuffle", "deal"],
  initial: "playing",
  states: {
    passing: {
      id: "passing",
      // TODO: implement passing phase
      after: {
        1000: {
          target: "playing",
        },
      },
      on: {
        pass: {
          actions: [
            {
              type: "pass",
              params: ({ event }) => {
                return {
                  cardId: event.cardId,
                  playerId: event.playerId,
                };
              },
            },
          ],
        },
      },
    },
    playing: {
      initial: "requesting",
      states: {
        requesting: {
          entry: enqueueActions(({ enqueue, context }) => {
            // HACK: Can't use invoke as the systemId is not dynamic
            const requestId = getRequestId();
            enqueue.spawnChild("requestMachine", {
              id: `request.${requestId}`,
              input: {
                playerId: context.currentPlayer,
                tag: "hand",
              },
              systemId: requestId,
            });
          }),
          on: {
            "xstate.done.actor.request.*": {
              actions: [
                enqueueActions(({ enqueue, event }) => {
                  const requestId = event.type.split(".")[4];
                  enqueue.stopChild(`request.${requestId}`);
                }),
                raise(({ event, context }) => ({
                  type: "play",
                  cardId: event.output.value as number,
                  playerId: context.currentPlayer,
                  // TODO: This isn't needed
                  user: { id: context.currentPlayer },
                })),
              ],
              target: "resolvingRequest",
            },
          },
        },
        resolvingRequest: {
          on: {
            play: {
              // guard: {
              //   type: "isCurrentPlayer",
              //   params: ({ event }) => {
              //     return {
              //       playerId: event.playerId,
              //     };
              //   },
              // },
              actions: [
                {
                  type: "play",
                  params: ({ event }) => {
                    return {
                      cardId: event.cardId,
                      playerId: event.playerId,
                    };
                  },
                },
              ],
              target: "_nextPlayer",
            },
          },
        },
        _nextPlayer: {
          always: [
            {
              guard: {
                type: "cardInAllPlayersPlayArea",
              },
              actions: enqueueActions(({ enqueue, context }) => {
                const winningPlayer = Object.values(context.players).reduce(
                  (acc, curr) => {
                    if (curr.playArea[0] > context.players[acc].playArea[0]) {
                      return curr.id;
                    }
                    return acc;
                  },
                  Object.keys(context.players)[0],
                );
                const totalScore = Object.values(context.players).reduce(
                  (acc, curr) => {
                    acc += getCardScore(curr.playArea[0]);
                    return acc;
                  },
                  0,
                );
                enqueue.assign({
                  players: ({ context }) => {
                    return produce(context.players, (players) => {
                      players[winningPlayer].score += totalScore;
                    });
                  },
                });
                enqueue.assign({
                  currentPlayer: winningPlayer,
                });
              }),
              // Add points and determine the next player
              target: "endTurn",
            },
            {
              actions: assign({
                currentPlayer: ({ context }) =>
                  nextPlayer(context.playerOrder, context.currentPlayer),
              }),
              target: "requesting",
            },
          ],
        },
        endTurn: {
          after: {
            1000: [
              {
                guard: {
                  type: "isRound",
                  params: { roundNumber: 13 },
                },
                actions: [
                  "resetDeck",
                  "shuffle",
                  "deal",
                  assign({
                    round: 1,
                  }),
                ],
                target: "#passing",
              },
              {
                actions: [
                  enqueueActions(({ enqueue }) => {
                    // Reset play area
                    enqueue.assign({
                      players: ({ context }) =>
                        produce(context.players, (players) => {
                          Object.values(players).forEach((player) => {
                            player.playArea = [];
                          });
                        }),
                    });
                  }),
                  assign({
                    round: ({ context }) => context.round + 1,
                  }),
                ],
                target: "requesting",
              },
            ],
          },
        },
      },
    },
  },
});

export type GameMachineActor = ActorRefFrom<typeof gameMachine>;
export type GameMachineSnapshot = SnapshotFrom<typeof gameMachine>;

// export const gameActor = createActor(gameMachine, {
//   input: {
//     players: [
//       {
//         id: "Player:1",
//         name: "Player:1",
//       },
//       {
//         id: "Player:2",
//         name: "Player:2",
//       },
//       {
//         id: "Player:3",
//         name: "Player:3",
//       },
//       {
//         id: "Player:4",
//         name: "Player:4",
//       },
//     ],
//   },
// });
// gameActor.start();

// This is how a fresh new game starts out, it's a function so you can make it dynamic!
// In the case of the guesser game we start out with a random target
// export const initialGame = () =>
//   ({
//     users: [],
//     gameInfo: gameActor.getPersistedSnapshot() as GameMachineSnapshot,
//     log: addLog("Game Created!", []),
//   }) as GameState;

// TODO: Move this over to a single machine
export const gameUpdater = (
  action: ServerAction,
  state: GameState,
): GameState => {
  // This switch should have a case for every action type you add.

  // "UserEntered" & "UserExit" are defined by default

  // Every action has a user field that represent the user who dispatched the action,
  // you don't need to add this yourself
  switch (action.type) {
    case "UserEntered":
      return {
        ...state,
        users: [...state.users, action.user],
        log: addLog(`user ${action.user.id} joined 🎉`, state.log),
      };

    case "UserExit":
      return {
        ...state,
        users: state.users.filter((user) => user.id !== action.user.id),
        log: addLog(`user ${action.user.id} left 😢`, state.log),
      };

    default:
      return state;
    // gameActor.send(action);
    // return {
    //   ...state,
    //   gameInfo: gameActor.getPersistedSnapshot() as GameMachineSnapshot,
    //   log: addLog(`action ${JSON.stringify(action)}`, state.log),
    // };
  }
};
