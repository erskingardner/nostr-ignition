# NIP-46 - Nostr Remote Signing

## Rationale

Private keys should be exposed to as few systems - apps, operating systems, devices - as possible as each system adds to the attack surface.

This NIP describes a method for 2-way communication between a remote signer and a Nostr client. The remote signer could be, for example, a hardware device dedicated to signing Nostr events, while the client is a normal Nostr client.

Currently, NIP-46 uses a JSON-RPC style flow where you pass encrypted commands in `kind:24133` events. This rewrite strives to remove as much of the JSON-RPC as possible and uses new event kinds that correspond to each command a client might send and the three types of responses that remote signers can send back.

This also allows us to incorporate [NIP-44](https://github.com/nostr-protocol/nips/blob/master/44.md) encryption in a way that doesn't break current NIP-46 implementations.

## Terminology

-   **Local keypair**: A local public and private key-pair used to encrypt content and communicate with the remote signer.
-   **Remote pubkey**: The public key that the user wants to sign as. The remote signer has control of the private key that matches this public key.

## The flow

### Client-side

1. Clients need two things to start: a local keypair and the pubkey that the user wants to use for signing events.
    - The local keypair is roughly disposable. E.g. - it's ok to store it locally (ideally encrypted) for some period of time. Once authenticated, remote signers can choose to trust this local keypair for a period of time. This local keypair can be deleted/rotated at will by the client and will only trigger a new auth challenge for the user.
    - The remote pubkey is the pubkey that the user is trying to sign in / sign as. This can be fetched with an NIP-05 or entered directly by the user.
2. Clients use the local keypair for encrypting request events that they send to remote signers.

### Remote signer-side

1. Remote signers manage the private key of the user that will be used for signing. There are many different remote signers out there (e.g. Nsecbunker, Amber, etc.) that operate in different ways and have different features.
2. Remote signers wait for request events and then act.

### Example flow for signing an event

Coming soon...

### Example Oauth-like flow to create a new user account with Nsecbunker

Coming soon...

## Request Events `Multiple kinds`

Request events take the following form. In order simplify requests and payloads as much as possible, there are different event kinds for each command which help remote signers to understand the request and process the content properly.

Clients use the `req` tag (containing a unique request id value) to listen for the response to their command.

```json
{
    "id": <id>,
    "kind": <kind for command>, // Each command has it's own kind
    "pubkey": <local pubkey of the user>,
    "content": <nip44(<request>)>,
    "tags": [["p", <remote pubkey>]],
    "created_at": <unix timestamp in seconds>,
}
```

| Kind    | Command                  | Content field (always NIP-44 encrypted)     | Data Type               |
| ------- | ------------------------ | ------------------------------------------- | ----------------------- |
| `24140` | `create_account`         | [username, domain, email (optional)]        | JSON stringified array  |
| `24141` | `connect`                | -                                           | null                    |
| `24142` | `sign_event`             | nostr event to sign                         | JSON stringified object |
| `24143` | `ping`                   | -                                           | null                    |
| `24144` | `get_relays`             | -                                           | null                    |
| `24145` | `nip04_encrypt`          | [third_party_pubkey, plaintext to encrypt]  | JSON stringified tuple  |
| `24146` | `nip04_decrypt`          | [third_party_pubkey, ciphertext to decrypt] | JSON stringified tuple  |
| `24147` | `nip44_conversation_key` | third_party_pubkey                          | string                  |
| `24148` | `nip44_encrypt`          | [third_party_pubkey, plaintext to encrypt]  | JSON stringified tuple  |
| `24149` | `nip44_decrypt`          | [third_party_pubkey, ciphertext to decrypt] | JSON stringified tuple  |

## Response Event `kind: 24136`

```json
{
    "id": <id>,
    "kind": 24136,
    "pubkey": <pubkey of the remote signer>,
    "content": <nip44(<response>)>,
    "tags": [["p", <local keypair pubkey>], ["e", <id of the request event>]],
    "created_at": <unix timestamp in seconds>,
}
```

#### Response content to various kinds of requests. Response kind is always `24136`

| Request kind | Command                  | Response Content field (always NIP-44 encrypted) | Response Data Type      |
| ------------ | ------------------------ | ------------------------------------------------ | ----------------------- |
| `24140`      | `create_account`         | newly created pubkey                             | string                  |
| `24141`      | `connect`                | "ack"                                            | string                  |
| `24142`      | `sign_event`             | nostr event with signature                       | JSON stringified object |
| `24143`      | `ping`                   | "pong"                                           | string                  |
| `24144`      | `get_relays`             | array of relay objects                           | JSON stringified object |
| `24145`      | `nip04_encrypt`          | ciphertext                                       | string                  |
| `24146`      | `nip04_decrypt`          | plaintext                                        | string                  |
| `24147`      | `nip44_conversation_key` | conversation key                                 | string                  |
| `24148`      | `nip44_encrypt`          | ciphertext                                       | string                  |
| `24149`      | `nip44_decrypt`          | plaintext                                        | string                  |

## Auth Challenge Event `kind: 24137`

All requests / commands can potentially trigger an auth challenge, which is a special kind of repsonse event that tells the client that the user needs to provide a password or another form of authentication before the remote signer will process their request. The response content is always a URL that the client should display to the user. This URL is a page that is created/controlled by the remote signer in a way that allows the signer to collect the needed data before proceeding.

```json
{
    "id": <id>,
    "kind": 24137,
    "pubkey": <pubkey of the remote signer>,
    "content": <nip44(<auth_url>)>,
    "tags": [["p", <local keypair pubkey>], ["e", <id of the request event>]],
    "created_at": <unix timestamp in seconds>,
}
```

## Error Event `kind: 24138`

Error response (a separate kind in order to make errors easier to handle on the client side).
Content is NIP-44 encrypted and uses the following format: `CODE: Error message text`. [Error codes](#error-codes) are detailed below.

```json
{
    "id": <id>,
    "kind": 24138,
    "pubkey": <pubkey of the remote signer>,
    "content": <nip44(<error>)>,
    "tags": [["p", <local keypair pubkey>], ["e", <id of the request event>]],
    "created_at": <unix timestamp in seconds>,
}
```

### Error Codes

-   `UNAUTHORIZED`: Returned if the user fails the auth challenge.
-   `NOT FOUND`: Returned if the remote signer doesn't have access to the remote pubkeys corresponding private key.
-   `UNPROCESSABLE`: Returned if a request is malformed (e.g. incorrect request content).
-   `OTHER`: Other error.

## TODO

-   [ ] Create diagrams showing the flow for normal requests and for create_account
-   [ ] Describe/Show the various client-side checks needed (NIP-05 of bunker, availability of usernames, etc.)

## Feedback & Buy in

Who else has implemented NIP-46 in it's current form?

-   [ ] fiatjaf
-   [ ] pablof7z
-   [ ] hodlbod
-   [ ] hazrd149
-   [ ] Kieran
-   [ ] Zach from Flare
-   [ ] Mike D
-   [ ] Reya
-   [ ] Alex Gleason
-   [ ] Monlovesmango

## References

-   [NIP-44 - Encryption](https://github.com/nostr-protocol/nips/blob/master/44.md)
