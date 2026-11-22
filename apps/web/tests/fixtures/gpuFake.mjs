// A fake GPU provider for the tests, behind the same small interface as the real one (lib/gpuProvider.ts).
// The test drives it through globalThis.__gpuFake: machines in a map, the price, the notebook, failures.
const F = (globalThis.__gpuFake ??= { machines: new Map(), stopped: [], price: 0.59, seq: 0, notebookUp: false, failCreate: null, hold: null });

export default {
  async create({ gpu, name, image }) {
    if (!gpu || !image) throw new Error("bad request");
    // the test can make the provider create the machine and then lose the answer
    if (F.failCreate === "lost-answer") {
      const id = `m${++F.seq}`;
      F.machines.set(id, { id, name, running: false, hourly: F.price });
      throw new Error("timeout");
    }
    if (F.hold) await F.hold;
    const id = `m${++F.seq}`;
    const m = { id, name, running: false, hourly: F.price };
    F.machines.set(id, m);
    return { ...m };
  },
  async get(id) {
    const m = F.machines.get(id);
    return m ? { ...m } : null;
  },
  async list() {
    return [...F.machines.values()].map((m) => ({ ...m }));
  },
  async stop(id) {
    F.stopped.push(id);
    F.machines.delete(id);
  },
  async ready() {
    return F.notebookUp;
  },
};
