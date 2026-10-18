const KEY = 'floor-studio:project:v1';

export function isValidProject(data) {
  return (
    Boolean(data) &&
    typeof data === 'object' &&
    Array.isArray(data.floors) &&
    data.floors.length > 0 &&
    data.floors.every((f) => f && typeof f.id === 'string' && Array.isArray(f.walls ?? []) && Array.isArray(f.rooms ?? [])) &&
    Array.isArray(data.furniture ?? [])
  );
}

export function loadProject() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    return isValidProject(data) ? data : null;
  } catch {
    return null;
  }
}

export function saveProject(project) {
  try {
    localStorage.setItem(KEY, JSON.stringify(project));
    return true;
  } catch {
    return false;
  }
}

export function clearProject() {
  try {
    localStorage.removeItem(KEY);
  } catch {
  }
}
