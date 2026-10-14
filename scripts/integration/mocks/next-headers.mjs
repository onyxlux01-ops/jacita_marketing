const store = new Map();

export async function cookies() {
  return {
    get: (name) => (store.has(name) ? { name, value: store.get(name) } : undefined),
    getAll: () => [...store.entries()].map(([name, value]) => ({ name, value })),
    set: (name, value) => {
      store.set(name, value);
    },
    delete: (name) => {
      store.delete(name);
    },
  };
}

export async function headers() {
  return new Headers({ host: "localhost:3000" });
}
