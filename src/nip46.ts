import "websocket-polyfill";
import { SimplePool } from "nostr-tools/pool";
import { generateSecretKey, getPublicKey, finalizeEvent, type Event } from "nostr-tools/pure";
import type { SubCloser } from "nostr-tools";
import { encrypt, decrypt } from "nostr-tools/nip04";
import { NostrConnect, Handlerinformation } from "nostr-tools/kinds";
import { EventEmitter } from "events";

const nostrMePubkey = "9c1636cda4be9bce36fe06f99f71c21525b109e0f6f206eb7a5f72093ec89f02";
const defaultRelays = ["wss://relay.nostr.band", "wss://relay.nsecbunker.com"];

type KeyPair = { privateKey: Uint8Array; publicKey: string };

type nip46Request = {
    id: string;
    pubkey: string;
    method: string;
    params: string[];
    event: Event;
};

type nip46Response = {
    id: string;
    result: string;
    error?: string;
    event: Event;
};

export class Nip46 extends EventEmitter {
    private pool: SimplePool;
    private subscription: SubCloser | undefined;
    private relays: string[];
    public keys: KeyPair | undefined;
    public remotePubkey: string | undefined;

    public constructor(relays?: string[], remotePubkey?: string, keys?: KeyPair) {
        super();

        this.pool = new SimplePool();
        this.relays = relays || defaultRelays;
        this.remotePubkey = remotePubkey || nostrMePubkey;
        this.keys = keys || this.generateAndStoreKey();
        if (!this.subscription) this.subscribeToNostrConnectEvents();
    }

    /**
     * Generates a secret key, retrieves the corresponding public key, and stores it in the local storage.
     *
     * @private
     * @returns {void}
     */
    private generateAndStoreKey(): KeyPair {
        const privateKey = generateSecretKey();
        const publicKey = getPublicKey(privateKey);
        // localNostrPubkey is the key that we use to publish events asking nsecbunkers for real signatures
        localStorage.setItem("localNostrPubkey", publicKey);
        return { privateKey, publicKey };
    }

    /**
     * Generates a unique request ID.
     *
     * @private
     * @returns {string} The generated request ID.
     */
    private generateReqId(): string {
        return Math.random().toString(36).substring(7);
    }

    /**
     * Subscribes to Nostr Connect events (kind 24133 and 24134) for the provided keys and relays.
     *
     * This method subscribes to NostrConnect events using the provided keys and relays.
     * It sets up a subscription to receive events and logs the received response.
     *
     * @private
     * @returns {void}
     */
    private subscribeToNostrConnectEvents(): void {
        // Bail early if we don't have a local keypair
        if (!this.keys) return;
        this.subscription = this.pool.subscribeMany(
            this.relays,
            [{ kinds: [NostrConnect, 24134], "#p": [this.keys.publicKey] }],
            {
                async onevent(event) {
                    console.log("Received event", event);
                    // TODO: need to parse the response properly (super doesn't work here?)
                },
                oneose() {
                    console.log("EOSE received");
                },
            }
        );
    }

    /**
     * Fetches info on available signers (nsecbunkers).
     *
     * @returns A promise that resolves to an array of events showing the available bunkers.
     */
    async fetchBunkers(): Promise<Event[]> {
        const events = await this.pool.querySync(this.relays, { kinds: [Handlerinformation] });
        const filteredEvents = events.filter((event) =>
            event.tags.some((tag) => tag[0] === "k" && tag[1] === NostrConnect.toString())
        );
        return filteredEvents;
    }

    /**
     * Checks the availability of a NIP05 address on a given domain.
     *
     * @param nip05 - The NIP05 address to check.
     * @returns A promise that resolves to a boolean indicating the availability of the NIP05 address.
     * @throws {Error} If the NIP05 address is invalid. e.g. not in the form `name@domain`.
     */
    async checkNip05Availability(nip05: string): Promise<boolean> {
        if (nip05.split("@").length !== 2) throw new Error("Invalid nip05");

        let [username, domain] = nip05.split("@");
        const response = await fetch(`https://${domain}/.well-known/nostr.json?name=${username}`);
        const json = await response.json();
        return json.names[username] === undefined ? true : false;
    }

    /**
     *
     *
     * TODO: Validate domain and NIP-05 of Bunker in use.
     *
     *
     */

    /**
     * Parses a response event and decrypts its content using the recipient's private key.
     *
     * @throws {Error} If no keys are found.
     * @param event - The response event to parse.
     * @param recipientPrivateKey - The private key of the recipient used for decryption.
     * @returns An object containing the parsed response event data.
     */
    async parseResponseEvent(event: Event): Promise<nip46Response | nip46Request> {
        if (!this.keys) throw new Error("No keys found");

        const decryptedContent = await decrypt(this.keys.privateKey, event.pubkey, event.content);
        const parsedContent = JSON.parse(decryptedContent);
        const { id, method, params, result, error } = parsedContent;
        if (method) {
            return { id, pubkey: event.pubkey, method, params, event };
        } else {
            return { id, result, error, event };
        }
    }

    /**
     * Sends a ping request to the remote server.
     * @throws {Error} If no keys are found or no remote public key is found.
     * @returns {Promise<void>}
     */
    async ping(): Promise<void> {
        if (!this.keys) throw new Error("No keys found");
        if (!this.remotePubkey) throw new Error("No remote public key found");

        const reqId = this.generateReqId();
        const params: string[] = [];

        // Encrypt the content for the bunker
        const encryptedContent = await encrypt(
            this.keys.privateKey,
            this.remotePubkey,
            JSON.stringify({ id: reqId, method: "ping", params: params })
        );

        // Create event to connect
        const verifiedEvent = finalizeEvent(
            {
                kind: NostrConnect,
                tags: [["p", this.remotePubkey]],
                content: encryptedContent,
                created_at: Math.floor(Date.now() / 1000),
            },
            this.keys.privateKey
        );
        // Publish the event
        await Promise.any(await this.pool.publish(this.relays, verifiedEvent));
    }

    /**
     * Connects to a remote server using the provided keys and remote public key.
     * Optionally, a secret can be provided for additional authentication.key
     *
     * @throws {Error} If no keys are found or no remote public key is found.
     * @param secret - Optional secret for additional authentication.
     * @returns A Promise that resolves when the connection is established.
     */
    async connect(secret?: string) {
        if (!this.keys) throw new Error("No keys found");
        if (!this.remotePubkey) throw new Error("No remote public key found");

        const reqId = this.generateReqId();
        const params = [this.keys.publicKey];
        if (secret) params.push(secret);

        // Encrypt the content for the bunker
        const encryptedContent = await encrypt(
            this.keys.privateKey,
            this.remotePubkey,
            JSON.stringify({ id: reqId, method: "connect", params: params })
        );

        // Create event to connect
        const verifiedEvent = finalizeEvent(
            {
                kind: NostrConnect,
                tags: [["p", this.remotePubkey]],
                content: encryptedContent,
                created_at: Math.floor(Date.now() / 1000),
            },
            this.keys.privateKey
        );

        // Publish the event
        await Promise.any(this.pool.publish(this.relays, verifiedEvent));
    }

    async createAccount(nip05: string): Promise<void> {
        if (!this.keys) throw new Error("No keys found");
        if (!this.remotePubkey) throw new Error("No remote public key found");
        if (nip05.split("@").length !== 2) throw new Error("Invalid nip05");

        let [username, domain] = nip05.split("@");

        const reqId = this.generateReqId();
        const params = [username, domain];

        // Encrypt the content for the bunker
        const encryptedContent = await encrypt(
            this.keys.privateKey,
            this.remotePubkey,
            JSON.stringify({ id: reqId, method: "create_account", params: params })
        );

        // Create event to register the username
        const verifiedEvent = finalizeEvent(
            {
                kind: 24134,
                tags: [["p", this.remotePubkey]],
                content: encryptedContent,
                created_at: Math.floor(Date.now() / 1000),
            },
            this.keys.privateKey
        );

        // Publish the event
        await Promise.any(this.pool.publish(this.relays, verifiedEvent));
    }

    /**
     * Disposes of any resources held by the object.
     */
    dispose(): void {
        this.subscription?.close();
    }
}
