import { generateSecretKey, VerifiedEvent, type UnsignedEvent } from "nostr-tools/pure";
import {
    BunkerSigner,
    BunkerProfile,
    BunkerSignerParams,
    createAccount,
    parseBunkerInput,
    fetchCustodialbunkers,
} from "nostr-tools/nip46";
import { queryProfile } from "nostr-tools/nip05";
import { decode, npubEncode } from "nostr-tools/nip19";
import { hexToBytes, bytesToHex } from "@noble/hashes/utils";
import { SimplePool } from "nostr-tools";

const NPUB_REGEX = /^npub1[023456789acdefghjklmnpqrstuvwxyz]{58}$/;
const PUBKEY_REGEX = /^[0-9a-z]{64}$/;

type NostrIgnitionOptions = {
    appName: string;
    redirectUri: string;
    relays?: string[];
};

let options: NostrIgnitionOptions;
const pool = new SimplePool();
let bunker: BunkerSigner;
let availableBunkers: BunkerProfile[] = [];
let hadLocalKeypair = false;
let hasConnected = false;
let clientSecret: Uint8Array;
const bunkerSignerParams: BunkerSignerParams = {
    pool,
    onauth(url: string) {
        clearTimeout(signInTimeoutFunction);
        clearTimeout(createAccountTimeoutFunction);
        openNewWindow(`${url}?redirect_uri=${options.redirectUri}`);
    },
};
const RESPONSE_TIMEOUT = 7000; // 7 seconds
let signInTimeoutFunction: NodeJS.Timeout | undefined;
let createAccountTimeoutFunction: NodeJS.Timeout | undefined;
let resetForms = () => {};

// If you're running a local nsecbunker for testing you can add it here
// to have it show up in the list of available bunkers.
// The pubkey is the pubkey of the nsecbunker, not the localNostrPubkey
// The domain must be the domain configured in the nsecbunker.json file
// All other fields are optional

// eslint-disable-next-line prefer-const
let localBunker: BunkerProfile | undefined = undefined;

// Uncomment this block to add a local nsecbunker for testing
// localBunker = {
//     bunkerPointer: {
//         relays: ["wss://relay.nsecbunker.com"],
//         pubkey: "<pubkey-of-nsecbunker>",
//         secret: null,
//     },
//     nip05: "",
//     domain: "<domain-of-nsecbunker>", // ngrok is handy for this
//     name: "",
//     picture: "",
//     about: "",
//     website: "",
//     local: true,
// };

const init = async (ignitionOptions: NostrIgnitionOptions) => {
    // Only do something if the window.nostr object doesn't exist
    // e.g. we don't have a NIP-07 extension
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if (!(window as any).nostr) {
        console.log("Initializing Nostr Ignition...");

        availableBunkers = await fetchCustodialbunkers(pool, ["wss://relay.nostr.band", "wss://relay.nsecbunker.com"]);
        if (localBunker) {
            availableBunkers.unshift(localBunker);
        }

        const local = localStorage.getItem("nip46ClientSecretKey");
        if (local) {
            clientSecret = hexToBytes(local);
            hadLocalKeypair = true;
        } else {
            clientSecret = generateSecretKey();
            localStorage.setItem("nip46ClientSecretKey", bytesToHex(clientSecret));
        }

        options = ignitionOptions; // Set the options

        // Build the modal
        const modal = await createModal(); // Create the modal element

        // Get the modal elements
        const nostrModalClose = document.getElementById("nostr_ignition__nostrModalClose") as HTMLButtonElement;
        const nostrModalCreateContainer = document.getElementById("nostr_ignition__createAccount") as HTMLDivElement;
        const nostrModalConnectContainer = document.getElementById("nostr_ignition__connectAccount") as HTMLDivElement;
        const nostrModalSwitchToSignIn = document.getElementById("nostr_ignition__switchToSignIn") as HTMLButtonElement;
        const nostrModalSwitchToCreateAccount = document.getElementById(
            "nostr_ignition__switchToCreateAccount"
        ) as HTMLButtonElement;

        // Create account form
        const nostrModalNip05 = document.getElementById("nostr_ignition__nostrModalNip05") as HTMLInputElement;
        const nostrModalBunker = document.getElementById("nostr_ignition__nostrModalBunker") as HTMLSelectElement;
        const nostrModalEmail = document.getElementById("nostr_ignition__nostrModalEmail") as HTMLInputElement;
        const nostrModalCreateSubmit = document.getElementById(
            "nostr_ignition__nostrModalCreateSubmit"
        ) as HTMLButtonElement;
        const nostrModalCreateSubmitText = document.getElementById(
            "nostr_ignition__nostrModalCreateSubmitText"
        ) as HTMLSpanElement;
        const nostrModalCreateSubmitSpinner = document.getElementById(
            "nostr_ignition__nostrModalCreateSubmitSpinner"
        ) as HTMLSpanElement;
        const nostrModalNip05Error = document.getElementById("nostr_ignition__nostrModalNip05Error") as HTMLSpanElement;
        const nostrModalBunkerError = document.getElementById(
            "nostr_ignition__nostrModalBunkerError"
        ) as HTMLSpanElement;

        // Sign in form
        const nostrModalBunkerInput = document.getElementById(
            "nostr_ignition__nostrModalBunkerInput"
        ) as HTMLInputElement;
        const nostrModalBunkerInputError = document.getElementById(
            "nostr_ignition__nostrModalBunkerInputError"
        ) as HTMLSpanElement;
        const nostrModalSignInForm = document.getElementById("nostr_ignition__nostrSignInForm") as HTMLButtonElement;
        const nostrModalSignInSubmit = document.getElementById(
            "nostr_ignition__nostrModalSignInSubmit"
        ) as HTMLButtonElement;
        const nostrModalSignInSubmitText = document.getElementById(
            "nostr_ignition__nostrModalSignInSubmitText"
        ) as HTMLSpanElement;
        const nostrModalSignInSubmitSpinner = document.getElementById(
            "nostr_ignition__nostrModalSignInSubmitSpinner"
        ) as HTMLSpanElement;

        // If we had local keys, default to the sign in form
        if (hadLocalKeypair) {
            nostrModalCreateContainer.style.display = "none";
            nostrModalConnectContainer.style.display = "block";
        }

        // Update the app name safely (escaping content provided by user)
        const appName = document.getElementById("nostr_ignition__appName") as HTMLSpanElement;
        appName.innerText = options.appName;

        // Add the available bunkers to the select element safely
        // (escaping content provided by user generated events)
        availableBunkers.forEach((bunker) => {
            const option = document.createElement("option");
            option.setAttribute("value", bunker.domain);
            option.innerText = bunker.domain;
            nostrModalBunker.appendChild(option);
        });

        // Create the window.nostr object and anytime it's called, show the modal
        Object.defineProperty(window, "nostr", {
            get: function () {
                showModal(modal);
            },
        });

        // Function to reset forms
        resetForms = () => {
            clearTimeout(signInTimeoutFunction);
            clearTimeout(createAccountTimeoutFunction);
            nostrModalNip05.value = "";
            nostrModalNip05.classList.remove("invalid");
            nostrModalBunkerError.classList.remove("invalid");
            nostrModalNip05Error.style.display = "none";
            nostrModalBunkerError.style.display = "none";
            nostrModalCreateSubmit.disabled = false;
            nostrModalCreateSubmitText.style.display = "block";
            nostrModalCreateSubmitSpinner.style.display = "none";
            nostrModalBunkerInput.value = "";
            nostrModalBunkerInput.classList.remove("invalid");
            nostrModalBunkerInputError.style.display = "none";
            nostrModalSignInSubmit.disabled = false;
            nostrModalSignInSubmitText.style.display = "block";
            nostrModalSignInSubmitSpinner.style.display = "none";
            nostrModalCreateContainer.style.display = "none";
            nostrModalConnectContainer.style.display = "block";
            modal.close();
        };

        // Add event listener to close the modal
        nostrModalClose.addEventListener("click", function () {
            modal.close();
        });

        // Add event listeners to switch between sign in and create account
        nostrModalSwitchToSignIn.addEventListener("click", function () {
            nostrModalCreateContainer.style.display = "none";
            nostrModalConnectContainer.style.display = "block";
        });

        nostrModalSwitchToCreateAccount.addEventListener("click", function () {
            nostrModalCreateContainer.style.display = "block";
            nostrModalConnectContainer.style.display = "none";
        });

        /**
         *
         * Create account form
         *
         */

        // Add event listener to the username input to check availability
        nostrModalNip05.addEventListener("input", async function () {
            const profile = await queryProfile(`${nostrModalNip05.value}@${nostrModalBunker.value}`);
            if (!profile) {
                // is available
                nostrModalNip05.setCustomValidity("");
                nostrModalCreateSubmit.disabled = false;
                nostrModalNip05.classList.remove("invalid");
                nostrModalNip05Error.style.display = "none";
                nostrModalBunkerError.style.display = "none";
            } else {
                nostrModalCreateSubmit.disabled = true;
                nostrModalNip05.setCustomValidity("Username is not available");
                nostrModalNip05.classList.add("invalid");
                nostrModalNip05Error.style.display = "block";
            }
        });

        // Add an event listener to the form to create the account
        nostrModalCreateSubmit.addEventListener("click", async function (event) {
            event.preventDefault();

            nostrModalCreateSubmit.disabled = true;
            nostrModalCreateSubmitText.style.display = "none";
            nostrModalCreateSubmitSpinner.style.display = "block";

            const chosenBunker = availableBunkers.find((bunker) => bunker.domain === nostrModalBunker.value);

            // Add error if we don't have valid details
            if (!nostrModalBunker.value || !chosenBunker) {
                nostrModalCreateSubmit.disabled = true;
                nostrModalBunkerError.innerText = "Error creating account";
                nostrModalBunker.setCustomValidity("Error creating account. Please try again later.");
                nostrModalBunker.classList.add("invalid");
                nostrModalBunkerError.style.display = "block";
                // Remove spinner and re-enable submit button
                nostrModalCreateSubmit.disabled = false;
                nostrModalCreateSubmitText.style.display = "block";
                nostrModalCreateSubmitSpinner.style.display = "none";
                return;
            }

            // Trigger the create account flow
            create(chosenBunker, nostrModalNip05.value, nostrModalBunker.value, nostrModalEmail.value || undefined);

            createAccountTimeoutFunction = setTimeout(() => {
                nostrModalBunkerError.innerText = "No response from a remote signer";
                nostrModalBunkerError.style.display = "block";
                // Remove spinner and re-enable submit button
                nostrModalCreateSubmit.disabled = false;
                nostrModalCreateSubmitText.style.display = "block";
                nostrModalCreateSubmitSpinner.style.display = "none";
            }, RESPONSE_TIMEOUT);
        });

        /**
         *
         * Sign in form
         *
         */

        // Add event listener to enable submit button
        nostrModalBunkerInput.addEventListener("input", function () {
            nostrModalBunkerInputError.innerText = "";
            nostrModalBunkerInputError.style.display = "none";
            nostrModalBunkerInput.classList.remove("invalid");
            if (nostrModalBunkerInput.value.length > 0) {
                nostrModalSignInSubmit.disabled = false;
            } else {
                nostrModalSignInSubmit.disabled = true;
            }
        });

        // Add event listener for sign in form
        nostrModalSignInForm.addEventListener("submit", async function (event) {
            event.preventDefault();
            nostrModalSignInSubmit.disabled = true;
            nostrModalSignInSubmitText.style.display = "none";
            nostrModalSignInSubmitSpinner.style.display = "block";

            // Allow for users to input npub or pubkey; if npub, decode it.
            let profileDataNip05: string | undefined = undefined;
            if (nostrModalBunkerInput.value.match(NPUB_REGEX) || nostrModalBunkerInput.value.match(PUBKEY_REGEX)) {
                // Fetch the nip-05 value from profile
                let pubkey: string;
                if (nostrModalBunkerInput.value.match(NPUB_REGEX)) {
                    pubkey = decode(nostrModalBunkerInput.value).data as string;
                } else {
                    pubkey = nostrModalBunkerInput.value;
                }

                console.log("Fetching profile for pubkey: ", pubkey);

                const profile = await pool.querySync(["wss://relay.nostr.band"], { kinds: [0], authors: [pubkey] }, {});
                console.log("Profile: ", profile);
                if (profile.length > 0) {
                    const profileData = JSON.parse(profile[0].content);
                    profileDataNip05 = profileData.nip05;
                }
            }

            const bunkerPointer = await parseBunkerInput((nostrModalBunkerInput.value || profileDataNip05) as string);
            if (!bunkerPointer) {
                // Nothing matches the value - it's an error.
                nostrModalBunkerInput.setCustomValidity("Invalid identifier or bunker:// URI");
                nostrModalBunkerInputError.innerText =
                    "Invalid identifier or bunker:// URI. We might also be having trouble contacting the remote signer.";
                nostrModalBunkerInputError.style.display = "block";
                nostrModalBunkerInput.classList.add("invalid");
                // Remove spinner and re-enable submit button
                nostrModalSignInSubmit.disabled = false;
                nostrModalSignInSubmitText.style.display = "block";
                nostrModalSignInSubmitSpinner.style.display = "none";
                return;
            }

            bunker = new BunkerSigner(clientSecret, bunkerPointer, bunkerSignerParams);
            connect();

            signInTimeoutFunction = setTimeout(() => {
                nostrModalBunkerInputError.innerText =
                    "No response from a remote signer. Are you sure there is an available remote signer managing this public key?";
                nostrModalBunkerInputError.style.display = "block";
                // Remove spinner and re-enable submit button
                nostrModalSignInSubmit.disabled = false;
                nostrModalSignInSubmitText.style.display = "block";
                nostrModalSignInSubmitSpinner.style.display = "none";
            }, RESPONSE_TIMEOUT);
        });
    }
};

// Function to create and show the modal using <dialog>
const createModal = async (): Promise<HTMLDialogElement> => {
    // Create the dialog element
    const dialog: HTMLDialogElement = document.createElement("dialog");
    dialog.id = "nostr_ignition__nostrModal";

    // Add content to the dialog
    const dialogContent: HTMLDivElement = document.createElement("div");
    dialogContent.innerHTML = `
        <button id="nostr_ignition__nostrModalClose"><svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-x-square"><rect width="18" height="18" x="3" y="3" rx="2" ry="2"/><path d="m15 9-6 6"/><path d="m9 9 6 6"/></svg></button>
        <h2 id="nostr_ignition__nostrModalTitle"><span id="nostr_ignition__appName">This app</span> uses Nostr for accounts</h2>
        <div id="nostr_ignition__createAccount">
            <p>Would you like to create a new Nostr account? Identities on Nostr are portable so you'll be able to use this account on any other Nostr client.</p>
            <form id="nostr_ignition__nostrCreateAccountForm" class="nostr_ignition__nostrModalForm">
                <span class="nostr_ignition__inputWrapper">
                    <input type="text" id="nostr_ignition__nostrModalNip05" name="nostrModalNip05" placeholder="Username" required />
                    <select id="nostr_ignition__nostrModalBunker" name="nostrModalBunker" required>
                    </select>
                </span>
                <span id="nostr_ignition__nostrModalNip05Error" class="nostr_ignition__nostrModalError">Username not available</span>
                <span id="nostr_ignition__nostrModalBunkerError" class="nostr_ignition__nostrModalError">Error creating account</span>
                <span class="nostr_ignition__inputWrapperFull">
                    <input type="email" id="nostr_ignition__nostrModalEmail" name="nostrModalEmail" placeholder="Email address. Optional, for account recovery." />
                </span>
                <button type="submit" id="nostr_ignition__nostrModalCreateSubmit" disabled>
                    <span id="nostr_ignition__nostrModalCreateSubmitText">Create account</span>
                    <span id="nostr_ignition__nostrModalCreateSubmitSpinner"></span>
                </button>
            </form>
            <button id="nostr_ignition__switchToSignIn" class="nostr_ignition__linkButton">Already have a Nostr account? Sign in instead.</button>
        </div>
        <div id="nostr_ignition__connectAccount" style="display:none;">
            <p style="text-align: center;">Sign in with your NIP-05 or bunker URI.</p>
            <form id="nostr_ignition__nostrSignInForm" class="nostr_ignition__nostrModalForm">
                <span class="nostr_ignition__inputWrapper">
                    <input type="text" id="nostr_ignition__nostrModalBunkerInput" name="nostrModalBunkerInput" placeholder="name@domain or bunker://" required />
                </span>
                <span id="nostr_ignition__nostrModalBunkerInputError" class="nostr_ignition__nostrModalError"></span>
                <button type="submit" id="nostr_ignition__nostrModalSignInSubmit" disabled>
                    <span id="nostr_ignition__nostrModalSignInSubmitText">Sign in</span>
                    <span id="nostr_ignition__nostrModalSignInSubmitSpinner"></span>
                </button>
            </form>
            <button id="nostr_ignition__switchToCreateAccount" class="nostr_ignition__linkButton">No Nostr account? Create a new account.</button>
        </div>
        <div id="nostr_ignition__nostrModalLearnMore">Not sure what Nostr is? Check out <a href="https://nostr.how" target="_blank">Nostr.how</a> for more info!</div>
    `;
    dialog.appendChild(dialogContent);

    // Append the dialog to the document body
    document.body.appendChild(dialog);
    return dialog;
};

// Function to show the modal
const showModal = (dialog: HTMLDialogElement): void => {
    dialog.showModal();
};

/**
 * Opens a new window with the specified URL.
 * @param url - The URL to open in the new window.
 */
const openNewWindow = (url: string): void => {
    const width = 600; // Desired width of the window
    const height = 800; // Desired height of the window

    const windowFeatures = `width=${width},height=${height},popup=yes`;
    window.open(url, "nostrIgnition", windowFeatures);
};

const remoteNpub = (): string | null => {
    return bunker.remotePubkey ? npubEncode(bunker.remotePubkey) : null;
};

const remotePubkey = (): string | null => {
    return bunker.remotePubkey;
};

const connected = (): boolean => {
    return hasConnected;
};

const create = async (
    bunkerProfile: BunkerProfile,
    username: string,
    domain: string,
    email?: string | undefined
): Promise<string> => {
    return createAccount(bunkerProfile, bunkerSignerParams, username, domain, email).then((newBunker) => {
        bunker = newBunker;
        console.log("Account created with pubkey: ", bunker.remotePubkey);
        hasConnected = true;
        resetForms();
        return bunker.remotePubkey;
    });
};

const connect = async (): Promise<void> => {
    console.log("Connecting to bunker...");
    return bunker
        .connect()
        .then(() => {
            console.log("Connected to bunker!");
            hasConnected = true;
            resetForms();
        })
        .catch((error) => console.error(error));
};

const ping = async (): Promise<void> => {
    console.log("Pinging bunker...");
    bunker
        .ping()
        .then(() => console.log("Pong!"))
        .catch((error) => console.error(error));
};

const signEvent = async (event: UnsignedEvent): Promise<VerifiedEvent | void> => {
    console.log("Requesting signature...");
    return bunker
        .signEvent(event)
        .then((signedEvent) => {
            console.log("Event signed!", signedEvent);
            return signedEvent;
        })
        .catch((error) => console.error(error));
};

export default {
    init,
    ping,
    create,
    connect,
    signEvent,
    remoteNpub,
    remotePubkey,
    connected,
};
