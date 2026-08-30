const STORAGE_KEY = 'origin-money-game-v1';
const EMPTY = { results: {} };

function read() {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (!parsed || typeof parsed !== 'object' || typeof parsed.results !== 'object') return structuredClone(EMPTY);
    return parsed;
  } catch {
    return structuredClone(EMPTY);
  }
}

function write(value) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(value));
  } catch {
    // The game remains playable when storage is unavailable.
  }
}

function previousDate(dateString) {
  const date = new Date(`${dateString}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() - 1);
  return date.toISOString().slice(0, 10);
}

export function getDailyResult(date) {
  return read().results[date] || null;
}

export function saveDailyResult(date, result) {
  const state = read();
  const previousModel = Number(state.results[date]?.model) || 0;
  const nextModel = Number(result.model) || 0;
  if (!state.results[date] || nextModel > previousModel || state.results[date].moneyId !== result.moneyId) {
    state.results[date] = result;
    write(state);
  }
  return state.results[date];
}

export function getStats() {
  const results = read().results;
  const dates = Object.keys(results).sort();
  const scores = dates.map((date) => Number(results[date].score) || 0);
  let best = 0;
  let run = 0;
  let previous = null;
  for (const date of dates) {
    run = previous === previousDate(date) ? run + 1 : 1;
    best = Math.max(best, run);
    previous = date;
  }

  const today = new Date().toISOString().slice(0, 10);
  const yesterday = previousDate(today);
  let streak = 0;
  let cursor = results[today] ? today : results[yesterday] ? yesterday : null;
  while (cursor && results[cursor]) {
    streak += 1;
    cursor = previousDate(cursor);
  }

  return {
    played: dates.length,
    average: scores.length ? Math.round(scores.reduce((sum, value) => sum + value, 0) / scores.length) : 0,
    streak,
    best,
  };
}
