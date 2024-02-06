# NIP-46 - Reimagined

## Nostr Connect

Private keys should be exposed to as few systems - apps, operating systems, devices - as possible as each system adds to the attack surface.

This NIP describes a method for 2-way communication between a remote signer and a Nostr client. The remote signer could be, for example, a hardware device dedicated to signing Nostr events, while the client is a normal Nostr client.

## Rationale

Currently NIP-46 uses a JSON-RPC style flow where you pass encrypted commands in `kind:24133` events. This rewrite retains the basics of the JSON-RPC style flow but clarifies requests & responses, uses new kinds, and introduces a new auth challenge response format that makes handling responses easier for clients.

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
2. Remote signers wait for request events (that contain JSON-RPC style commands) and then act.

### Example flow for signing an event

❗ _This is simplified to focus on the NIP-46 flow, it doesn't show the steps required for NIP-44 encryption._

![Signing Flow](https://i.nostr.build/Dedj.png)

### Example Oauth-like flow to create a new user account with Nsecbunker

❗ _NB: This is simplified to focus on the NIP-46 flow, it doesn't show the steps required for NIP-44 encryption._

![Oauth-like account creation](https://i.nostr.build/R07e.png)

## Events

### Request Event `kind: 24135`

All requests from clients will use this event kind, thus, remote signers will only need to subscribe to these events.

```json
{
    "id": <id>,
    "kind": 24135,
    "pubkey": <local pubkey of the user>,
    "content": <NIP-44 encrypted request>,
    "tags": ["p", <remote pubkey>],
    "created_at": <unix timestamp in seconds>,
}
```

### Response Event `kind: 24136`

```json
{
    "id": <id>,
    "kind": 24136,
    "pubkey": <pubkey of the remote signer>,
    "content": <NIP-44 encrypted response>,
    "tags": ["p", <local keypair pubkey>],
    "created_at": <unix timestamp in seconds>,
}
```

The response structure for each command is listed below along with the command. Each is a JSON object containing with `id`, `response_type`, `result`, and `error`.

| Field           | Type                           | Info                                             |
| --------------- | ------------------------------ | ------------------------------------------------ |
| `id`            | `string`                       | The same value as the `id` sent with the request |
| `response_type` | `string`                       | The same as the `method` sent with the request   |
| `result`        | `string` or `object` or `null` | Present if there is NO error                     |
| `error`         | `object` or `null`             | Present if there is an error                     |

### Auth Challenge Response

All requests / commands can potentially trigger an auth challenge, which is a special kind of repsonse event that tells the client that the user needs to provide a password or another form of authentication before the remote signer will process their request.

The content of an auth challenge response (unencrypted) is a JSON object of the following form.

```json
{
    "id": <received request id>,
    "result_type": "auth_challenge",
    "result": {
        "auth_url": <url for client to present to user>
    }
}
```

## Commands

-   [create_account](#create_account)
-   [sign_event](#sign_event)
-   [connect](#connect)
-   [ping](#ping)
-   [get_relays](#get_relays)
-   [nip04_encrypt](#nip04_encrypt)
-   [nip04_decrypt](#nip04_decrypt)
-   [nip44_get_key](#nip44_get_key)
-   [nip44_encrypt](#nip44_encrypt)
-   [nip44_decrypt](#nip44_decrypt)

### `create_account`

Request a new set of keys be generated and stored on the remote signer. This is used as part of Nsecbunker's OAuth-like sign up flow.

### Request

The `username@domain` in the params represents the user's desired NIP-05 address. Email address is optional, in the case that the remote signer gives users the ability to recover keys via email.

```json
{
    "id": <request id>,
    "method": "create_account",
    "params": {
        "username": <username>,
        "domain": <domain>,
        "email": <optional email address>
    }
}
```

### Response

```json
{
    "id": <received request id>,
    "result_type": "create_account",
    "result": {
        "pubkey": <newly created pubkey>
    },
    "error": {
        "code": <error code>,
        "message": <error message>
    }
}
```

### `sign_event`

Request an event be signed using a remote pubkey

### Request

```json
{
    "id": <request id>,
    "method": "sign_event",
    "params": {
        "event": <event to be signed>,
    }
}
```

### Response

```json
{
    "id": <received request id>,
    "result_type": "sign_event",
    "result": {
        "event": <signed event>
    },
    "error": {
        "code": <error code>,
        "message": <error message>
    }
}
```

### `connect`

Ensure that you can connect to a remote signer for a given remote pubkey.

### Request

```json
{
    "id": <request id>,
    "method": "connect",
    "params": {
        "pubkey": <remote pubkey>,
        "secret": <optional secret value>
    }
}
```

### Response

```json
{
    "id": <received request id>,
    "result_type": "connect",
    "result": "ack",
    "error": {
        "code": <error code>,
        "message": <error message>
    }
}
```

### `ping`

Ping a remote signer.

### Request

```json
{
    "id": <request id>,
    "method": "ping",
    "params": {}
}
```

### Response

```json
{
    "id": <received request id>,
    "result_type": "ping",
    "result": "pong",
    "error": {
        "code": <error code>,
        "message": <error message>
    }
}
```

<!-- I'm not sure if this method is useful or even works -->
<!-- ### `get_public_key`

### Request

```json
{
    "id": <request id>,
    "method": "get_public_key",
    "params": {}
}
```

### Response

```json
{
    "id": <received request id>,
    "result_type": "get_public_key",
    "result": {
        "pubkey": <pubkey>
    },
    "error": {
        "code": <error code>,
        "message": <error message>
    }
}
``` -->

### `get_relays`

Ask a remote signer more information about the relays that it uses.

### Request

```json
{
    "id": <request id>,
    "method": "get_relays",
    "params": {}
}
```

### Response

```json
{
    "id": <received request id>,
    "result_type": "get_relays",
    "result": {
        "relays": [
            {<relay url>: {"read": <boolean>, "write": <boolean>}},
            ...
        ]
    },
    "error": {
        "code": <error code>,
        "message": <error message>
    }
}
```

### `nip04_encrypt`

Request to have a string NIP-04 encrypted.

### Request

```json
{
    "id": <request id>,
    "method": "nip04_encrypt",
    "params": {
        "third_party_pubkey": <pubkey of recipient>,
        "content": <content to be encrypted>
    }
}
```

### Response

```json
{
    "id": <received request id>,
    "result_type": "nip04_encrypt",
    "result": <nip04 encrypted content>,
    "error": {
        "code": <error code>,
        "message": <error message>
    }
}
```

### `nip04_decrypt`

Request to have a string NIP-04 decrypted.

### Request

```json
{
    "id": <request id>,
    "method": "nip04_decrypt",
    "params": {
        "third_party_pubkey": <pubkey of sender>,
        "ciphertext": <ciphertext to be decrypted>
    }
}
```

### Response

```json
{
    "id": <received request id>,
    "result_type": "nip04_decrypt",
    "result": <nip04 decrypted content>,
    "error": {
        "code": <error code>,
        "message": <error message>
    }
}
```

### `nip44_get_key`

Request to have a new NIP-44 conversation key calculated.

### Request

```json
{
    "id": <request id>,
    "method": "nip44_get_key",
    "params": {
        "third_party_pubkey": <pubkey of recipient>
    }
}
```

### Response

```json
{
    "id": <received request id>,
    "result_type": "nip44_get_key",
    "result": <nip-44 conversation key>,
    "error": {
        "code": <error code>,
        "message": <error message>
    }
}
```

### `nip44_encrypt`

Request to have a string NIP-44 encrypted.

### Request

```json
{
    "id": <request id>,
    "method": "nip44_encrypt",
    "params": {
        "third_party_pubkey": <pubkey of recipient>,
        "content": <content to be encrypted>
    }
}
```

### Response

```json
{
    "id": <received request id>,
    "result_type": "nip44_encrypt",
    "result": <nip44 encrypted content>,
    "error": {
        "code": <error code>,
        "message": <error message>
    }
}
```

### `nip44_decrypt`

Request to have a string NIP-44 decrypted.

### Request

```json
{
    "id": <request id>,
    "method": "nip44_decrypt",
    "params": {
        "third_party_pubkey": <pubkey of sender>,
        "ciphertext": <ciphertext to be decrypted>
    }
}
```

### Response

```json
{
    "id": <received request id>,
    "result_type": "nip44_decrypt",
    "result": <nip44 decrypted content>,
    "error": {
        "code": <error code>,
        "message": <error message>
    }
}
```

## Error Codes

-   `UNAUTHORIZED`: Returned if the user fails the auth challenge.
-   `NOT FOUND`: Returned if the remote signer doesn't have access to the remote pubkeys corresponding private key.
-   `UNPROCESSABLE`: Returned if a request is malformed (e.g. incorrect params).
-   `OTHER`: Other error.

## References

-   [NIP-44 - Encryption](https://github.com/nostr-protocol/nips/blob/master/44.md)
