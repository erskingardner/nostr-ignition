import { expect, test, describe, beforeEach } from "bun:test";
import { Nip46 } from "./nip46";

describe("NIP46", () => {
    describe("remoteNpub", () => {
        let nip46: Nip46;
        beforeEach(() => {
            nip46 = new Nip46([], undefined, { privateKey: new Uint8Array(), publicKey: "publicKey" });
        });
        test("should return null with a new Nip46 instance", () => {
            expect(nip46.remoteNpub()).toBeNull();
        });
        test("should return an npub value remotePubkey is set", () => {
            nip46.remotePubkey = "9339d9b6a47c3ae867034041dae565c11192bc495f8de97796c197f10469235c";
            expect(nip46.remoteNpub()).toBe("npub1jvuand4y0sawsecrgpqa4et9cyge90zft7x7jaukcxtlzprfydwqh0c36d");
        });
    });
});
