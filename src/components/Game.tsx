import { createContext, useContext, useState } from "react";
import { useGameRoom } from "@/hooks/useGameRoom";
import { stringToColor } from "@/utils";
import Card from "./Card";
import { cva } from "class-variance-authority";
import { Action, GameState, Player, nextPlayer } from "../../game/logic";
import { RequestMachineContext } from "../../game/requestMachine";

const handStyles = cva("flex", {
  variants: {
    direction: {
      horizontal: "flex-row -space-x-8",
      vertical: "flex-col items-center -space-y-16",
    },
  },
});

interface GameProps {
  username: string;
  roomId: string;
}

const Hand = ({
  hand,
  direction,
  playCard,
  isValid,
}: {
  hand: number[];
  direction: "horizontal" | "vertical";
  playCard: (cardId: number) => void;
  isValid?: ((cardId: number) => boolean) | null;
}) => {
  return (
    <div className={handStyles({ direction })}>
      {hand.map((cardId) => (
        <button
          key={cardId}
          className={cva("relative", {
            variants: {
              isValid: {
                true: "",
              },
            },
          })({ isValid: isValid ? isValid(cardId) : false })}
          type="button"
          onClick={() => playCard(cardId)}
        >
          <Card cardId={cardId} />
        </button>
      ))}
    </div>
  );
};

const PlayerHand = ({
  player,
  direction,
  currentRequestId,
  isValid,
}: {
  player: Player;
  direction: "horizontal" | "vertical";
  currentRequestId?: string | null;
  isValid?: (cardId: number) => boolean;
}) => {
  const { dispatch } = useGameRoomContext();
  const playCard = (cardId: number) => {
    if (!currentRequestId) return;
    dispatch({ type: "request", value: cardId, requestId: currentRequestId });
  };
  return (
    <div className="flex flex-col">
      <div>{player.name}</div>
      <div className="text-sm">Score: {player.score}</div>
      <Hand
        hand={player.hand}
        playCard={playCard}
        isValid={currentRequestId !== null ? isValid : null}
        direction={direction}
      />
    </div>
  );
};

const GameRoomContext = createContext<{
  gameState: GameState | null;
  dispatch: (action: Action) => void;
} | null>(
  {} as { gameState: GameState | null; dispatch: (action: Action) => void },
);

const useGameRoomContext = () => {
  const ctx = useContext(GameRoomContext);
  if (ctx === null) {
    throw new Error(
      "useGameRoomContext must be used within a GameRoomContext.Provider",
    );
  }
  return ctx;
};

const Game = ({ username, roomId }: GameProps) => {
  const gameRoom = useGameRoom(username, roomId);
  const { gameState, dispatch } = gameRoom;

  // Indicated that the game is loading
  if (gameState === null) {
    return (
      <p>
        <span className="transition-all w-fit inline-block mr-4 animate-bounce">
          🎲
        </span>
        Waiting for server...
      </p>
    );
  }

  const { gameInfo: gameSnapshot } = gameState;
  const {
    context: { currentPlayer, playerOrder, round, players },
    children,
  } = gameSnapshot;

  // TODO: Instanciate game with userId instead of username?
  const localPlayerId = username;

  const requestActor = Object.values(children).find(
    () => true,
    // TODO: Uncomment this when we have separate browsers
    // (actor) => actor.snapshot.context.playerId === localPlayerId,
  ) as
    | { snapshot: { context: RequestMachineContext }; systemId: string }
    | undefined;

  console.log(requestActor?.snapshot.context);
  return (
    <GameRoomContext.Provider value={gameRoom}>
      <h1 className="text-2xl border-b border-yellow-400 text-center relative">
        ❤️ Hearts!
      </h1>
      <div className="border-t border-yellow-400 py-2" />
      <section>
        <div className=" bg-yellow-100 flex flex-col p-4 rounded text-sm">
          {gameState.log.map((logEntry) => (
            <p key={logEntry.dt} className="animate-appear text-black">
              {logEntry.message}
            </p>
          ))}
        </div>

        <h2 className="text-lg">
          Players in room <span className="font-bold">{roomId}</span>
        </h2>
        <div className="flex flex-wrap gap-2">
          {gameState.users.map((user) => {
            return (
              <p
                className="inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 border-transparent text-white"
                style={{ backgroundColor: stringToColor(user.id + roomId) }}
                key={user.id}
              >
                {user.id}
              </p>
            );
          })}
        </div>
      </section>

      <div className="h-[820px] w-[820px] grid-cols-[auto_1fr_auto] grid-rows-[auto_1fr_auto] grid place-items-center grid-areas-[._player-north_.,player-west_table_player-east,._player-south_.]">
        <div className="area-[player-north]">
          <PlayerHand
            isValid={requestActor?.snapshot.context.validation}
            currentRequestId={
              requestActor?.snapshot.context.playerId ===
              nextPlayer(playerOrder, localPlayerId, 2)
                ? requestActor.systemId
                : null
            }
            player={players[nextPlayer(playerOrder, localPlayerId, 2)]}
            direction="horizontal"
          />
        </div>
        <div className="area-[player-west]">
          <PlayerHand
            isValid={requestActor?.snapshot.context.validation}
            currentRequestId={
              requestActor?.snapshot.context.playerId ===
              nextPlayer(playerOrder, localPlayerId, 1)
                ? requestActor.systemId
                : null
            }
            player={players[nextPlayer(playerOrder, localPlayerId, 1)]}
            direction="vertical"
          />
        </div>
        <div className="grid area-[table] grid-areas-[._north_.,_west_._east_,._south_.] place-items-center">
          <div className="area-[north]">
            <Card
              cardId={
                players[nextPlayer(playerOrder, localPlayerId, 2)].playArea[0]
              }
            />
          </div>
          <div className="area-[west]">
            <Card
              cardId={
                players[nextPlayer(playerOrder, localPlayerId, 1)].playArea[0]
              }
            />
          </div>
          <div className="area-[east]">
            <Card
              cardId={
                players[nextPlayer(playerOrder, localPlayerId, 3)].playArea[0]
              }
            />
          </div>
          <div className="area-[south]">
            <Card cardId={players[localPlayerId].playArea[0]} />
          </div>
        </div>
        <div className="area-[player-east]">
          <PlayerHand
            isValid={requestActor?.snapshot.context.validation}
            currentRequestId={
              requestActor?.snapshot.context.playerId ===
              nextPlayer(playerOrder, localPlayerId, 3)
                ? requestActor.systemId
                : null
            }
            player={players[nextPlayer(playerOrder, localPlayerId, 3)]}
            direction="vertical"
          />
        </div>
        <div className="area-[player-south]">
          <PlayerHand
            isValid={requestActor?.snapshot.context.validation}
            currentRequestId={
              requestActor?.snapshot.context.playerId === localPlayerId
                ? requestActor.systemId
                : null
            }
            player={players[localPlayerId]}
            direction="horizontal"
          />
        </div>
      </div>
      <div>Current:{players[currentPlayer].name}</div>
      <div>Round:{round}</div>
      {/* <pre>{JSON.stringify(gameState, null, 2)}</pre> */}
    </GameRoomContext.Provider>
  );
};

export default Game;
