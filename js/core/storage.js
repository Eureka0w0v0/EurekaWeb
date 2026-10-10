/* localStorage access that survives storage being unavailable. */
export function safeStorageGet(key) {
  try {
    return window.localStorage.getItem(key);
  } catch (error) {
    return null;
  }
}

export function safeStorageSet(key, value) {
  try {
    window.localStorage.setItem(key, value);
  } catch (error) {
    /* Storage is unavailable in private/restricted contexts; preference lives for this session only. */
  }
}
