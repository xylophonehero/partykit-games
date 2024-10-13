import { ActorRefFrom, assign, sendParent, setup } from "xstate";
import { PlayerId } from "./logic";

interface RequestMachineInput {
  playerId: PlayerId;
  // requestId: string;
  // The type of value the request is asking for
  // Could refer to a zone or a resource...
  // Maybe need custom validation function?
  tag: string;
  // TODO: Validation is not JSON serializable
  // So we need to pass the list of valid values
  validation: (value: any) => boolean;
}

export interface RequestMachineContext extends RequestMachineInput {
  // TODO: Make this generic
  value: any | null;
}

type RequestMachineEvents = {
  type: "request";
  value: any;
  // Validating the reqest comes from the player
  // Injected by partykit context
  user: { id: PlayerId };
};

export const requestMachine = setup({
  types: {
    context: {} as RequestMachineContext,
    events: {} as RequestMachineEvents,
    input: {} as RequestMachineInput,
    output: {} as { value: any },
  },
  guards: {
    isFromPlayer: ({ context }, { playerId }: { playerId: PlayerId }) => {
      return context.playerId === playerId;
    },
    isValid: ({ context }, { value }: { value: any }) => {
      return context.validation(value);
    },
  },
}).createMachine({
  context: ({ input }) => ({
    ...input,
    value: null,
  }),
  id: "requestMachine",
  initial: "requesting",
  states: {
    requesting: {
      on: {
        request: {
          guard: {
            type: 'isValid',
            params: ({ event }) => ({ value: event.value }),
          },
          // TODO:
          // guard: {
          //   type: "isFromPlayer",
          //   params: ({ event }) => ({ playerId: event.user.id }),
          // },
          actions: [
            assign({
              value: ({ event }) => event.value,
            }),
            sendParent(({ context }) => ({ type: "play", ...context })),
          ],
          target: "completed",
        },
      },
    },
    completed: {
      type: "final",
    },
  },
  output: ({ context }) => ({ value: context.value }),
});

export type RequestMachine = typeof requestMachine;
export type RequestMachineActor = ActorRefFrom<typeof requestMachine>;
