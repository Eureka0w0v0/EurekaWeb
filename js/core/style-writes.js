/* Style and attribute writes that skip the DOM when nothing changed. */
const elementStyleCache = new WeakMap();

function getElementStyleCache(element) {
  let cache = elementStyleCache.get(element);

  if (!cache) {
    cache = new Map();
    elementStyleCache.set(element, cache);
  }

  return cache;
}

export function setStylePropertyIfChanged(element, name, value) {
  if (!element) {
    return;
  }

  const cache = getElementStyleCache(element);

  if (cache.get(name) === value) {
    return;
  }

  element.style.setProperty(name, value);
  cache.set(name, value);
}

export function setStyleFieldIfChanged(element, name, value) {
  if (!element) {
    return;
  }

  const cacheKey = `style:${name}`;
  const cache = getElementStyleCache(element);

  if (cache.get(cacheKey) === value) {
    return;
  }

  element.style[name] = value;
  cache.set(cacheKey, value);
}

export function setDataIfChanged(element, name, value) {
  if (!element || element.dataset[name] === value) {
    return;
  }

  element.dataset[name] = value;
}

export function setAttributeIfChanged(element, name, value) {
  if (!element || element.getAttribute(name) === value) {
    return;
  }

  element.setAttribute(name, value);
}
