import { Nip46, PUBKEY_REGEX, type BunkerProfile } from "./nip46";

const NostrIgnition = (() => {
    const css = "./src/index.css";

    type NostrIgnitionOptions = {
        appName: string;
        redirectUri: string;
        relays?: string[];
    };

    let options: NostrIgnitionOptions;
    let nip46: Nip46 = new Nip46();

    let availableBunkers: BunkerProfile[] = [];

    const init = async (ignitionOptions: NostrIgnitionOptions) => {
        console.log("Initializing Nostr Ignition...");
        // Only do something if the window.nostr object doesn't exist
        // e.g. we don't have a NIP-07 extension
        if (!(window as any).nostr) {
            options = ignitionOptions; // Set the options
            loadCss(css); // Load the css file

            // Check for available bunkers have to do this before modal is created
            availableBunkers = await nip46.fetchBunkers();

            // Build the modal
            const modal = await createModal(); // Create the modal element

            // Create the window.nostr object and anytime it's called, show the modal
            Object.defineProperty(window, "nostr", {
                get: function () {
                    showModal(modal);
                },
            });

            // Get the modal elements
            const nostrModalNip05 = document.getElementById("nostrModalNip05") as HTMLInputElement;
            const nostrModalBunker = document.getElementById("nostrModalBunker") as HTMLSelectElement;
            const nostrModalEmail = document.getElementById("nostrModalEmail") as HTMLInputElement;
            const nostrModalSubmit = document.getElementById("nostrModalSubmit") as HTMLButtonElement;
            const nostrModalSubmitText = document.getElementById("nostrModalSubmitText") as HTMLSpanElement;
            const nostrModalSubmitSpinner = document.getElementById("nostrModalSubmitSpinner") as HTMLSpanElement;
            const nostrModalNip05Error = document.getElementById("nostrModalNip05Error") as HTMLSpanElement;
            const nostrModalBunkerError = document.getElementById("nostrModalBunkerError") as HTMLSpanElement;
            const nostrModalClose = document.getElementById("nostrModalClose") as HTMLButtonElement;

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

                const bunkerPubkey = availableBunkers.find(
                    (bunker) => bunker.domain === nostrModalBunker.value
                )?.pubkey;

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
        dialog.id = "nostrModal";

        const optionsForBunkers = availableBunkers.map((bunker) => {
            return `<option value="${bunker.domain}">${bunker.domain}</option>`;
        });

        // Add content to the dialog
        const dialogContent: HTMLDivElement = document.createElement("div");
        dialogContent.innerHTML = `
            <button id="nostrModalClose"><svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-x-square"><rect width="18" height="18" x="3" y="3" rx="2" ry="2"/><path d="m15 9-6 6"/><path d="m9 9 6 6"/></svg></button>
            <h2 id="nostrModalTitle">${options.appName} uses Nostr for accounts</h2>
            <p>Would you like to create a new Nostr account? Identities on Nostr are portable so you'll be able to use this account on any other Nostr client.</p>
            <form id="nostrModalForm">
                <span class="inputWrapper">
                    <input type="text" id="nostrModalNip05" name="nostrModalNip05" placeholder="Username" required />
                    <select id="nostrModalBunker" name="nostrModalBunker" required>
                    ${optionsForBunkers}
                    </select>
                </span>
                <span id="nostrModalNip05Error">Username not available</span>
                <span id="nostrModalBunkerError">Error creating account</span>
                <span class="inputWrapperFull">
                    <input type="email" id="nostrModalEmail" name="nostrModalEmail" placeholder="Email address. Optional, for account recovery." />
                </span>
                <button type="submit" id="nostrModalSubmit" disabled>
                    <span id="nostrModalSubmitText">Create account</span>
                    <span id="nostrModalSubmitSpinner"></span>
                </button>
            </form>
            <div id="nostrModalLearnMore">Not sure what Nostr is? Check out <a href="https://nostr.how" target="_blank">Nostr.how</a> for more info</div>
        `;
        dialog.appendChild(dialogContent);

        // Append the dialog to the document body
        document.body.appendChild(dialog);
        return dialog;
    };

    // Function to load css file
    const loadCss = (url: string): void => {
        const linkElement: HTMLLinkElement = document.createElement("link");
        linkElement.rel = "stylesheet";
        linkElement.href = url;

        document.head.appendChild(linkElement);
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
        var width = 600; // Desired width of the window
        var height = 800; // Desired height of the window

        var windowFeatures = `width=${width},height=${height},popup=yes`;
        window.open(url, "nostrIgnition", windowFeatures);
    };

    const remoteNpub = (): string | undefined => {
        return nip46.remoteNpub();
    };

    // Finally, return the init method as the only public method
    return {
        init,
        remoteNpub,
    };
})();
