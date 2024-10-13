import React from "react";
import { getCardInfo, getSuitColorId, getSuitSymbol } from "../../game/logic";
import { cva, cx } from "class-variance-authority";

const suitStyles = cva("", {
  variants: {
    isRed: {
      true: "text-red-500",
    },
  },
});

const CardValue = ({ cardId }: { cardId: number }) => {
  const { suit, rank } = getCardInfo(cardId);
  return (
    <div>
      <span className={suitStyles({ isRed: suit % 2 === 1 })}>
        {getSuitSymbol(suit)}
      </span>{" "}
      {rank}
    </div>
  );
};

const Card = ({ cardId }: { cardId: number }) => {
  if (cardId === null) return null;
  if (cardId === undefined) return null;
  const { suit, rank } = getCardInfo(cardId);
  return (
    <div className="flex bg-white h-24 w-16 border rounded px-2 flex-col justify-between">
      <div className="flex text-sm">
        <CardValue cardId={cardId} />
      </div>
      <div
        className={cx(
          "flex justify-center text-2xl",
          suitStyles({ isRed: suit % 2 === 1 }),
        )}
      >
        {getSuitSymbol(suit)}
      </div>
      <div className="flex justify-end text-sm">
        <CardValue cardId={cardId} />
      </div>
    </div>
  );
};

export default Card;
