import { Nip46, PUBKEY_REGEX, type BunkerProfile } from "./nip46";

type NostrIgnitionOptions = {
    appName: string;
    redirectUri: string;
    relays?: string[];
};

let options: NostrIgnitionOptions;
let nip46: Nip46;
let availableBunkers: BunkerProfile[] = [];

const init = async (ignitionOptions: NostrIgnitionOptions) => {
    // Only do something if the window.nostr object doesn't exist
    // e.g. we don't have a NIP-07 extension
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if (!(window as any).nostr) {
        console.log("Initializing Nostr Ignition...");
        nip46 = new Nip46(); // instantiate the NIP-46 class
        options = ignitionOptions; // Set the options

        // Check for available bunkers have to do this before modal is created
        availableBunkers = await nip46.fetchBunkers();

        // Build the modal
        const modal = await createModal(); // Create the modal element

        // Get the modal elements
        const nostrModalNip05 = document.getElementById("nostr_ignition__nostrModalNip05") as HTMLInputElement;
        const nostrModalBunker = document.getElementById("nostr_ignition__nostrModalBunker") as HTMLSelectElement;
        const nostrModalEmail = document.getElementById("nostr_ignition__nostrModalEmail") as HTMLInputElement;
        const nostrModalSubmit = document.getElementById("nostr_ignition__nostrModalSubmit") as HTMLButtonElement;
        const nostrModalSubmitText = document.getElementById("nostr_ignition__nostrModalSubmitText") as HTMLSpanElement;
        const nostrModalSubmitSpinner = document.getElementById(
            "nostr_ignition__nostrModalSubmitSpinner"
        ) as HTMLSpanElement;
        const nostrModalNip05Error = document.getElementById("nostr_ignition__nostrModalNip05Error") as HTMLSpanElement;
        const nostrModalBunkerError = document.getElementById(
            "nostr_ignition__nostrModalBunkerError"
        ) as HTMLSpanElement;
        const nostrModalClose = document.getElementById("nostr_ignition__nostrModalClose") as HTMLButtonElement;

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

        // Add event listener to close the modal
        nostrModalClose.addEventListener("click", function () {
            modal.close();
        });

        // Add event listener to the username input to check availability
        nostrModalNip05.addEventListener("input", function () {
            nip46.checkNip05Availability(`${nostrModalNip05.value}@nostr.me`).then((available) => {
                if (available) {
                    nostrModalNip05.setCustomValidity("");
                    nostrModalSubmit.disabled = false;
                    nostrModalNip05.classList.remove("invalid");
                    nostrModalNip05Error.style.display = "none";
                    nostrModalBunkerError.style.display = "none";
                } else {
                    nostrModalSubmit.disabled = true;
                    nostrModalNip05.setCustomValidity("Username is not available");
                    nostrModalNip05.classList.add("invalid");
                    nostrModalNip05Error.style.display = "block";
                }
            });
        });

        // Add an event listener to the form to create the account
        nostrModalSubmit.addEventListener("click", async function (event) {
            event.preventDefault();

            nostrModalSubmit.disabled = true;
            nostrModalSubmitText.style.display = "none";
            nostrModalSubmitSpinner.style.display = "block";

            const bunkerPubkey = availableBunkers.find((bunker) => bunker.domain === nostrModalBunker.value)?.pubkey;

            // Add error if we don't have valid details
            if (!nostrModalBunker.value || !bunkerPubkey) {
                nostrModalSubmit.disabled = true;
                nostrModalBunker.setCustomValidity("Error creating account. Please try again later.");
                nostrModalBunker.classList.add("invalid");
                nostrModalBunkerError.style.display = "block";
                // Remove spinner and re-enable submit button
                nostrModalSubmit.disabled = false;
                nostrModalSubmitText.style.display = "block";
                nostrModalSubmitSpinner.style.display = "none";
                return;
            }

            await nip46.createAccount(
                bunkerPubkey,
                nostrModalNip05.value,
                nostrModalBunker.value,
                nostrModalEmail.value || undefined
            );
        });

        // Add event listener for response events
        nip46.on("parsedResponseEvent", async (response) => {
            console.log(response);
            switch (response.result) {
                case "auth_url":
                    // TODO: Handle different responses. Can either be pubkey if user already has an account
                    // or auth_url if user needs to follow a link. We're only handling redirect url for now.
                    openNewWindow(`${response.error}?redirect_uri=${options.redirectUri}`);
                    break;
                case "ack":
                    // We're assuming for now that this is a connect response
                    console.log("Account connected!");

                    break;
                default:
                    // Handle response from create_account which just replies with a pubkey
                    if (PUBKEY_REGEX.test(response.result)) {
                        // Reset form
                        nostrModalNip05.value = "";
                        nostrModalNip05.classList.remove("invalid");
                        nostrModalBunkerError.classList.remove("invalid");
                        nostrModalNip05Error.style.display = "none";
                        nostrModalBunkerError.style.display = "none";
                        nostrModalSubmit.disabled = false;
                        nostrModalSubmitText.style.display = "block";
                        nostrModalSubmitSpinner.style.display = "none";
                        modal.close();

                        // Set the remote pubkey and connect
                        nip46.remotePubkey = response.result;
                        await nip46.connect();
                    }
                    break;
            }
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
        <p>Would you like to create a new Nostr account? Identities on Nostr are portable so you'll be able to use this account on any other Nostr client.</p>
        <form id="nostr_ignition__nostrModalForm">
            <span class="nostr_ignition__inputWrapper">
                <input type="text" id="nostr_ignition__nostrModalNip05" name="nostrModalNip05" placeholder="Username" required />
                <select id="nostr_ignition__nostrModalBunker" name="nostrModalBunker" required>
                </select>
            </span>
            <span id="nostr_ignition__nostrModalNip05Error">Username not available</span>
            <span id="nostr_ignition__nostrModalBunkerError">Error creating account</span>
            <span class="nostr_ignition__inputWrapperFull">
                <input type="email" id="nostr_ignition__nostrModalEmail" name="nostrModalEmail" placeholder="Email address. Optional, for account recovery." />
            </span>
            <button type="submit" id="nostr_ignition__nostrModalSubmit" disabled>
                <span id="nostr_ignition__nostrModalSubmitText">Create account</span>
                <span id="nostr_ignition__nostrModalSubmitSpinner"></span>
            </button>
        </form>
        <div id="nostr_ignition__nostrModalLearnMore">Not sure what Nostr is? Check out <a href="https://nostr.how" target="_blank">Nostr.how</a> for more info</div>
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

const remoteNpub = (): string | undefined => {
    return nip46.remoteNpub();
};

export default {
    init,
    remoteNpub,
};
