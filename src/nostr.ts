import { SimplePool } from "nostr-tools/pool";
import { generateSecretKey, getPublicKey } from "nostr-tools/pure";
import type { Event } from "nostr-tools/pure";

/**
 * Fetches bunkers by subscribing to multiple relays and querying for events.
 * Only events with a specific tag are returned.
 *
 * UNUSED FOR NOW
 *
 * @returns A promise that resolves to an array of events.
 */
export const fetchBunkers = async (): Promise<Event[]> => {
    const pool = new SimplePool();

    const relays = ["wss://relay.nostr.band", "wss://relay.damus.io", "wss://relay.nsecbunker.com"];

    const sub = pool.subscribeMany(relays, [{ kinds: [31990] }], {
        onevent(event) {
            // console.log(event);
        },
        oneose() {
            sub.close();
        },
    });
    const events = await pool.querySync(relays, { kinds: [31990] });
    const filteredEvents = events.filter((event) =>
        event.tags.some((tag) => tag[0] === "k" && tag[1] === "24133")
    );
    return filteredEvents;
};

/**
 * Checks the availability of a NIP05 address.
 *
 * @param nip05 - The NIP05 address to check.
 * @returns A promise that resolves to a boolean indicating the availability of the NIP05 address.
 * @throws {Error} If the NIP05 address is invalid. e.g. not in the form `name@domain`.
 */
export const checkNip05Availability = async (nip05: string): Promise<boolean> => {
    if (nip05.split("@").length !== 2) throw new Error("Invalid nip05");

    let [username, domain] = nip05.split("@");
    const response = await fetch(`https://${domain}/.well-known/nostr.json?name=${username}`);
    const json = await response.json();
    return json.names[username] === undefined ? true : false;
};

/**
 * Generates a secret key, retrieves the corresponding public key, and stores it in the local storage.
 * @returns The generated public key.
 */
export const generateAndStoreKey = (): string => {
    const privateKey = generateSecretKey();
    const pubkey = getPublicKey(privateKey);
    // localNostrPubkey is the key that we use to publish events asking nsecbunkers for real signatures
    localStorage.setItem("localNostrPubkey", pubkey);
    return pubkey;
};

export const createAccount = async (username: string, domain: string): Promise<void> => {
    // Generate keys
    // Create event to register the username
    // Encrypt the content with the newly generated key
    // Sign with the newly generated key
    // Publish the event with the newly generated key
    // Handle response
};

// Basic Steps:
// 1. Once user submits the form (where we've already checked if the name is available)
// 2. Generate a keypair
// 3. Create an event to register the username
// 5. Subscribe to response from event
// 4. Encrypy, sign, and publish the event
// 6. Handle response (store the real user pubkey in local storage)
// 7. Connect to new key on bunker with local key.
