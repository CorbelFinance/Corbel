/**
 * Launchpads on Robinhood Chain, told apart by what their pools carry on chain: the Uniswap v4 hook every pool of
 * the launchpad is created with, or the contract the creating transaction called (factory, router, entry). Pools
 * made straight through Uniswap's own contracts are "direct", not a launchpad. Addresses are lower case and come
 * from each launchpad's public docs, its site's own config, or the public Uniswap hook registry.
 */
export type Launchpad = { id: string; name: string; url?: string; tone: string; hooks?: string[]; contracts?: string[] };

export const LAUNCHPADS: Launchpad[] = [
  {
    id: "pons",
    name: "Pons",
    url: "https://ponsfamily.com",
    tone: "#2fbf72",
    hooks: ["0xe5e702641ea86f4ae6cc3cdaed2b886f976be044"],
    contracts: [
      "0x7ed598bcef8bd9edd8c97a195c6d13f40801ec7e", // V2 launch factory
      "0xe33e9e479df8802cb0866d5d05258bec4cf62948", // V2 launch-and-buy router
      "0x3711cea4feade896c913c68f01eda97cb06d1a42", // V2 launch deployer
      "0xc7819b64a1daecd7ec19856d026cb14efbd89046", // V2 graduation executor
      "0x267444d099b10fb5ed7c3cc7b7c767adca574952", // V2 launch locker
      "0xa5aab3f0c6eeadf30ef1d3eb997108e976351feb", // V1 factory
      "0x736d76699c26d0d966744cae304c000d471f7f35", // V1 locker
      "0x0c37a24f5d23a486fa692d1500881d698b1f77a4", // legacy factory
      "0x31ca5e101941a93a7dd6d0497928700625cf54b5", // legacy locker
      "0x1f7d7550b1b028f7571e69a784071f0205fd2efa", // V3 factory
    ],
  },
  {
    id: "pools",
    name: "pools.trade",
    url: "https://pools.trade",
    tone: "#ff8fd8",
    contracts: [
      "0x0000ffffbe8efe702c8703ae3477ff5de3d319c0", // launch entry, current
      "0x00004c4ccc709ef590f7c81102c0689f0263d4e9", // launch entry, original
      "0x000000e200088d55c39a11f609e5f667729ad49b", // token factory
      "0x23f8209572b4a1c2ad88a42749e830791fb027f1",
      "0xad44d55e7f8337c3ce113fbb591486e85be104b2",
      "0xce57498d3474dcc244dfb6710ffbe6d4441cd2b2",
      "0x60d73b21cdf2ea846ab3d58699bbbb8f29d72491",
      "0x000000001f26a0044baa66024e7b6599c61963f8", // crowd launch auction factory
      "0x05d552391067389ee44fec3924157ed33f976000", // liquidity initializer registry
    ],
  },
  { id: "doppler", name: "Doppler", url: "https://doppler.lol", tone: "#8fe3f2", hooks: ["0x4e3468951d49f2eea976ed0d6e75ffcb44a9a544"] },
  { id: "clanker", name: "Clanker", url: "https://clanker.world", tone: "#b9a3ff", hooks: ["0x48b8f6ad3a1b4aa477314c9a23035b8f84dde8cc"] },
  { id: "fobo", name: "FOBO", tone: "#f2c46d", hooks: ["0x0af57f62982d03066ef917acad87f771c06528ec"] },
  { id: "hookr", name: "Hookr", url: "https://hookr.fun", tone: "#ff9a5c", hooks: ["0x89c9fb50d1f03192230ffb1c279bb6e7d3fe6acc"] },
  {
    id: "launchhood",
    name: "LaunchHood",
    url: "https://launchhood.com",
    tone: "#7fd1b9",
    hooks: ["0xdcf5a30aad9d194330a3934e7994b3d2b25f68cc"],
    contracts: [
      "0x2e9fbf18f6492f6651b983c34629d292516de86e",
      "0x62b33a039d289cbda50ebeb72fe4261449e61bcf",
      "0xe51960f1b45f1c9fb6d166e6a884f866fc70433b",
      "0x4e5e9bbf477aba87a34f6ed0daa4d45c2cef9161",
      "0x99b79154ff4fc0e313549b809254b02722631ee0",
      "0x764337703d79a325d2e1eda05d20bce73a6de73e",
    ],
  },
  {
    id: "memecoin",
    name: "memecoin.fun",
    url: "https://memecoin.fun",
    tone: "#ff8fa3",
    contracts: [
      "0x5432de33dc359185e265a3d277aa3520c93d541b",
      "0x5b5e19d685c9564b17c670b891cf55ce37aeb364",
      "0xb889f7166722ddcb666072c62ec10fbcd57a970d",
      "0x00e992e1c7da11dc8d5bd22e6d2aeb294b9cd173",
      "0x2d6487bfe145fb59219e2d963da78c98d023b566",
      "0x3a80545e17e5f0e1f3fb5e57de0b6a9025dc8069",
      "0x577eabdafc2bbf4807a1c454bbd4de3641cf50f4",
      "0x9ba3684eb51271d1d0e329d45a7d4ae27e22ecec",
    ],
  },
];

/** Uniswap's own contracts: a pool made through these was made by hand, not by a launchpad. */
const DIRECT = new Set([
  "0x8366a39cc670b4001a1121b8f6a443a643e40951", // v4 PoolManager
  "0x58daec3116aae6d93017baaea7749052e8a04fa7", // v4 PositionManager
  "0x8876789976decbfcbbbe364623c63652db8c0904", // UniversalRouter
  "0x89e5db8b5aa49aa85ac63f691524311aeb649eba", // V2 router
]);
export const DIRECT_PAD = { id: "direct", name: "Direct on Uniswap", tone: "#93a6ff" } as const;

const byHook = new Map<string, Launchpad>();
const byContract = new Map<string, Launchpad>();
for (const l of LAUNCHPADS) {
  for (const h of l.hooks ?? []) byHook.set(h, l);
  for (const c of l.contracts ?? []) byContract.set(c, l);
}

/** The launchpad a pool came from, by its hook first and then by the contract its creating transaction called. */
export function launchpadOf(pad: string | null | undefined, hooks: string | null | undefined): string | null {
  const h = hooks?.toLowerCase();
  if (h && byHook.has(h)) return byHook.get(h)!.id;
  const p = pad?.toLowerCase();
  if (p && byContract.has(p)) return byContract.get(p)!.id;
  if (p && DIRECT.has(p)) return DIRECT_PAD.id;
  return null;
}

export const launchpadName = (id: string) => (id === DIRECT_PAD.id ? DIRECT_PAD.name : LAUNCHPADS.find((l) => l.id === id)?.name ?? id);
export const launchpadTone = (id: string) => (id === DIRECT_PAD.id ? DIRECT_PAD.tone : LAUNCHPADS.find((l) => l.id === id)?.tone ?? "#7d8a83");
