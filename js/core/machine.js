/* Explicit state machines.

   A machine lists the states something can be in and, for each one, the
   events it accepts and the state each event leads to. That table is the
   whole contract: "can this happen from here?" is answered by reading it,
   instead of by tracing which combination of booleans the rest of the code
   happens to set.

   An event the current state does not accept is a bug in the caller, so
   send() throws instead of ignoring it -- a silently ignored transition is
   exactly the kind of drift the table exists to rule out. Callers that mean
   "only if possible" ask can() first. */

const hasOwn = (object, key) => Object.prototype.hasOwnProperty.call(object, key);

export function createMachine(name, { initial, states }) {
  if (!hasOwn(states, initial)) {
    throw new Error(`${name}: unknown initial state "${initial}"`);
  }
  for (const [state, events] of Object.entries(states)) {
    for (const [event, target] of Object.entries(events)) {
      if (!hasOwn(states, target)) {
        throw new Error(`${name}: ${state} --${event}--> leads to unknown state "${target}"`);
      }
    }
  }

  let current = initial;

  return {
    get state() {
      return current;
    },
    is(...candidates) {
      return candidates.includes(current);
    },
    can(event) {
      return hasOwn(states[current], event);
    },
    send(event) {
      if (!hasOwn(states[current], event)) {
        throw new Error(`${name}: "${event}" is not allowed in state "${current}"`);
      }
      current = states[current][event];
      return current;
    },
  };
}
