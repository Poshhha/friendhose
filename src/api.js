export async function api(path, options = {}) {
  let response;
  try {
    response = await fetch(`/api${path}`, {
      ...options,
      headers: {
        ...(options.body ? { 'Content-Type': 'application/json' } : {}),
        ...options.headers,
      },
      body: options.body ? JSON.stringify(options.body) : undefined,
    });
  } catch (error) {
    if (error.name === 'AbortError') throw error;
    throw new Error('We couldn’t reach the conversation. Check your connection and try again.');
  }
  let data = null;
  if (response.status !== 204) {
    try {
      data = await response.json();
    } catch (error) {
      // A fetch can be cancelled after its headers arrive but before its body is read.
      // Keep that cancellation intact so stale feed requests never update React state.
      if (error.name === 'AbortError') throw error;
      throw new Error('The server returned an unreadable response. Please try again.');
    }
  }
  if (!response.ok)
    throw Object.assign(
      new Error(data.error || 'Something went quiet on our end. Please try again.'),
      { status: response.status },
    );
  return data;
}

const STORAGE_KEY = 'unsaid.private.v1';
function read() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}') || {};
  } catch {
    return {};
  }
}
function update(fn) {
  const data = read();
  fn(data);
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch {
    throw new Error(
      'Enable browser storage to keep your private deletion keys. Your message hasn’t been sent.',
    );
  }
}
export const privateKeys = {
  token() {
    return btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32))))
      .replaceAll('+', '-')
      .replaceAll('/', '_')
      .replaceAll('=', '');
  },
  prepare() {
    const deletionToken = this.token(),
      threadToken = this.token();
    update((data) => {
      data.pending = { deletionToken, threadToken };
    });
    return { deletionToken, threadToken };
  },
  remember(type, id, deletionToken, postId, threadToken) {
    update((data) => {
      data.deletions ??= {};
      data.threads ??= {};
      data.deletions[`${type}:${id}`] = deletionToken;
      data.threads[postId] = threadToken;
      delete data.pending;
    });
  },
  owns(type, id) {
    return Boolean(read().deletions?.[`${type}:${id}`]);
  },
  deletion(type, id) {
    return read().deletions?.[`${type}:${id}`];
  },
  forget(type, id) {
    update((data) => {
      delete data.deletions?.[`${type}:${id}`];
      if (type === 'post') delete data.threads?.[id];
    });
  },
  thread(id) {
    return read().threads?.[id];
  },
  heart(type, id) {
    return read().hearts?.[`${type}:${id}`] || { liked: false };
  },
  saveHeart(type, id, value) {
    update((data) => {
      data.hearts ??= {};
      data.hearts[`${type}:${id}`] = value;
    });
  },
  report(type, id) {
    let token = read().reports?.[`${type}:${id}`];
    if (!token) {
      token = this.token();
      update((data) => {
        data.reports ??= {};
        data.reports[`${type}:${id}`] = token;
      });
    }
    return token;
  },
};

export function relativeTime(timestamp) {
  const seconds = Math.max(0, Math.floor((Date.now() - timestamp) / 1000));
  if (seconds < 60) return 'just now';
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  if (seconds < 604800) return `${Math.floor(seconds / 86400)}d ago`;
  return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' }).format(timestamp);
}
