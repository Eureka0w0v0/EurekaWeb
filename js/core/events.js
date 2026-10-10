/* The page's publish/subscribe hub. */
/* A small synchronous publish/subscribe hub. The shared layers -- language,
   theme, viewport -- announce what changed instead of calling into every
   section that happens to care, and each section subscribes to what it needs
   in its own bind...Reactions() function. Listeners run in subscription
   order, and initApp subscribes the sections in a fixed order on purpose:
   it reproduces the order the direct calls used to run in.

   No try/catch around listeners: a throwing listener propagates to whoever
   emitted, exactly as the direct call it replaces would have. */
export const pageEvents = (() => {
  const listeners = new Map();
  return {
    on(type, listener) {
      if (!listeners.has(type)) {
        listeners.set(type, []);
      }
      listeners.get(type).push(listener);
    },
    emit(type, detail) {
      (listeners.get(type) || []).forEach((listener) => listener(detail));
    },
  };
})();
