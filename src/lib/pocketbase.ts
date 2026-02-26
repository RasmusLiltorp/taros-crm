import PocketBase from "pocketbase";

const POCKETBASE_URL =
  process.env.NEXT_PUBLIC_POCKETBASE_URL || "http://127.0.0.1:8090";

// Singleton on the client side
let clientInstance: PocketBase | null = null;

export function getPocketBase(): PocketBase {
  if (typeof window === "undefined") {
    // Server-side: new instance per request
    return new PocketBase(POCKETBASE_URL);
  }
  if (!clientInstance) {
    clientInstance = new PocketBase(POCKETBASE_URL);
  }
  return clientInstance;
}

export default getPocketBase;
