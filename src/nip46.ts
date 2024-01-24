import { SimplePool } from "nostr-tools/pool";
import { generateSecretKey, getPublicKey, finalizeEvent, type Event } from "nostr-tools/pure";
import type { SubCloser, SubscribeManyParams } from "nostr-tools";
import { npubEncode } from "nostr-tools/nip19";
import { encrypt, decrypt } from "nostr-tools/nip04";
import { NostrConnect, Handlerinformation } from "nostr-tools/kinds";
import { EventEmitter } from "events";

const DEFAULT_RELAYS = ["wss://relay.nostr.band", "wss://relay.nsecbunker.com"];
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const NPUB_REGEX = /npub1[023456789acdefghjklmnpqrstuvwxyz]{58}/;
export const PUBKEY_REGEX = /[0-9a-z]{64}/;

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

export type BunkerProfile = {
    pubkey: string;
    domain: string;
    nip05: string;
    name: string;
    picture: string;
    about: string;
    website: string;
};

export class Nip46 extends EventEmitter {
    private pool: SimplePool;
    private subscription: SubCloser | undefined;
    private relays: string[];
    public keys: KeyPair | undefined;
    public remotePubkey: string | undefined;

    /**
     * Creates a new instance of the Nip46 class.
     * @param relays - An optional array of relay addresses.
     * @param remotePubkey - An optional remote public key. This is the key you want to sign as.
     * @param keys - An optional key pair.
     */
    public constructor(relays?: string[], remotePubkey?: string, keys?: KeyPair) {
        super();

        this.pool = new SimplePool();
        this.relays = relays || DEFAULT_RELAYS;
        this.remotePubkey = remotePubkey;
        this.keys = keys || this.generateAndStoreKey();
        if (!this.subscription) this.subscribeToNostrConnectEvents();
    }

    /**
     * Generates a key pair, stores the pubkey in localStorage.
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
     * Encodes the remote public key into a string representation.
     *
     * @returns The encoded remote public key, or undefined if the remote public key is not set.
     */
    remoteNpub(): string | undefined {
        return this.remotePubkey ? npubEncode(this.remotePubkey) : undefined;
    }

    /**
     * Subscribes to Nostr Connect events (kind 24133 and 24134) for the provided keys and relays.
     *
     * This method subscribes to NostrConnect events using the provided keys and relays.
     * It sets up a subscription to receive events and emit events for the received responses.
     *
     * @private
     * @returns {void}
     */
    private subscribeToNostrConnectEvents(): void {
        // Bail early if we don't have a local keypair
        if (!this.keys) return;

        const nip46 = this;
        const parseResponseEvent = this.parseResponseEvent.bind(this);

        const subManyParams: SubscribeManyParams = {
            async onevent(event) {
                const res = await parseResponseEvent(event);
                nip46.emit("parsedResponseEvent", res);
            },
            oneose() {
                console.log("EOSE received");
            },
        };

        this.subscription = this.pool.subscribeMany(
            this.relays,
            [{ kinds: [NostrConnect, 24134], "#p": [this.keys.publicKey] }],
            subManyParams
        );
    }

    /**
     * Fetches info on available signers (nsecbunkers) using NIP-89 events.
     *
     * @returns A promise that resolves to an array of available bunker objects.
     */
    async fetchBunkers(): Promise<BunkerProfile[]> {
        const events = await this.pool.querySync(this.relays, { kinds: [Handlerinformation] });
        // Filter for events that handle the connect event kind
        const filteredEvents = events.filter((event) =>
            event.tags.some((tag) => tag[0] === "k" && tag[1] === NostrConnect.toString())
        );

        // Validate bunkers by checking their NIP-05 and pubkey
        const validatedBunkers = filteredEvents.filter(async (event) => {
            const content = JSON.parse(event.content);
            const valid = await this.validateBunkerNip05(content.nip05, event.pubkey);
            return valid;
        });

        this.emit("bunkers", "Valid bunkers found");

        // Map the events to a more useful format
        return validatedBunkers.map((event) => {
            const content = JSON.parse(event.content);
            return {
                pubkey: event.pubkey,
                nip05: content.nip05,
                domain: content.nip05.split("@")[1],
                name: content.name || content.display_name,
                picture: content.picture,
                about: content.about,
                website: content.website,
            };
        });
    }

    /**
     * Checks the availability of a NIP05 address on a given domain.
     *
     * @param nip05 - The NIP05 address to check.
     * @throws {Error} If the NIP05 address is invalid. e.g. not in the form `name@domain`.
     * @returns A promise that resolves to a boolean indicating the availability of the NIP05 address.
     */
    async checkNip05Availability(nip05: string): Promise<boolean> {
        if (nip05.split("@").length !== 2) throw new Error("Invalid nip05");

        let [username, domain] = nip05.split("@");
        const response = await fetch(`https://${domain}/.well-known/nostr.json?name=${username}`);
        const json = await response.json();
        return json.names[username] === undefined ? true : false;
    }

    /**
     * Validates a Bunkers NIP-05.
     *
     * @param nip05 - The NIP05 to validate.
     * @param pubkey - The public key to compare against.
     * @returns A promise that resolves to a boolean indicating whether the NIP05 is valid for the bunkers pubkey.
     * Will also return false for invalid nip05 format.
     */
    async validateBunkerNip05(nip05: string, pubkey: string): Promise<boolean> {
        if (nip05.split("@").length !== 2) return false;

        let [_username, domain] = nip05.split("@");
        const response = await fetch(`https://${domain}/.well-known/nostr.json?name=_`);
        const json = await response.json();
        return json.names["_"] === pubkey;
    }

    /**
     * Parses a response event and decrypts its content using the recipient's private key.
     *
     * @param event - The response event to parse.
     * @throws {Error} If no keys are found.
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
     * Requires permission/access rights to bunker.
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
     * Optionally, a secret can be provided for additional authentication.
     *
     * @param secret - Optional secret for additional authentication.
     * @throws {Error} If no keys are found or no remote public key is found.
     * @returns A Promise that resolves when the connection is established.
     */
    async connect(secret?: string): Promise<void> {
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

    /**
     * Creates an account with the specified username, domain, and optional email.
     * @param bunkerPubkey - The public key of the bunker to use for the create_account call.
     * @param username - The username for the account.
     * @param domain - The domain for the account.
     * @param email - The optional email for the account.
     * @throws Error if no keys are found, no remote public key is found, or the email is present but invalid.
     * @returns A Promise that resolves when the event is published.
     */
    async createAccount(bunkerPubkey: string, username: string, domain: string, email?: string): Promise<void> {
        if (!this.keys) throw new Error("No keys found");
        if (email && !EMAIL_REGEX.test(email)) throw new Error("Invalid email");

        const reqId = this.generateReqId();
        const params = [username, domain, email];

        // Encrypt the content for the bunker
        const encryptedContent = await encrypt(
            this.keys.privateKey,
            bunkerPubkey,
            JSON.stringify({ id: reqId, method: "create_account", params: params })
        );

        // Create event to register the username
        const verifiedEvent = finalizeEvent(
            {
                kind: 24134,
                tags: [["p", bunkerPubkey]],
                content: encryptedContent,
                created_at: Math.floor(Date.now() / 1000),
            },
            this.keys.privateKey
        );

        // Publish the event
        await Promise.any(this.pool.publish(this.relays, verifiedEvent));
    }

    /**
     * Disposes of any resources held by the object. Should be called when finished with the object.
     */
    dispose(): void {
        this.subscription?.close();
    }
}
