const API_URL = import.meta.env.VITE_API_URL;

export async function fetchUsers() {
  try {
    const res = await fetch(`${API_URL}/api/users`);
    if (!res.ok) throw new Error('Network error');
    return await res.json();
  } catch (err) {
    console.error('API fetch error:', err);
    return [];
  }
}

