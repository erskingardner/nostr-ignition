import { Nip46 } from "./nip46";

const NostrIgnition = (() => {
    const css = "./src/index.css";

    type NostrIgnitionOptions = {
        appName: string;
    };

    let options: NostrIgnitionOptions;
    let nip46: Nip46 = new Nip46();

    const init = (ignitionOptions: NostrIgnitionOptions) => {
        console.log("Initializing Nostr Ignition...");
        // Only do something if the window.nostr object doesn't exist
        if (!(window as any).nostr) {
            options = ignitionOptions; // Set the options
            loadCss(css); // Load the css file
            const modal = createModal(); // Create the modal element

            // Create the window.nostr object and anytime it's called, show the modal
            Object.defineProperty(window, "nostr", {
                get: function () {
                    showModal(modal);
                },
            });

            // Add event listener to close the modal
            const nostrModalClose = document.getElementById("nostrModalClose") as HTMLButtonElement;
            nostrModalClose.addEventListener("click", function () {
                modal.close();
            });

            // Add event listener to the username input to check availability
            const nostrModalNip05 = document.getElementById("nostrModalNip05") as HTMLInputElement;
            const nostrModalSubmit = document.getElementById(
                "nostrModalSubmit"
            ) as HTMLButtonElement;
            const nostrModalNip05Error = document.getElementById(
                "nostrModalNip05Error"
            ) as HTMLSpanElement;
            nostrModalNip05.addEventListener("input", function () {
                nip46
                    .checkNip05Availability(`${nostrModalNip05.value}@nostr.me`)
                    .then((available) => {
                        if (available) {
                            nostrModalNip05.setCustomValidity("");
                            nostrModalSubmit.disabled = false;
                            nostrModalNip05.classList.remove("invalid");
                            nostrModalNip05Error.style.display = "none";
                        } else {
                            nostrModalSubmit.disabled = true;
                            nostrModalNip05.setCustomValidity("Username is not available");
                            nostrModalNip05.classList.add("invalid");
                            nostrModalNip05Error.style.display = "block";
                        }
                    });
            });
            nostrModalSubmit.addEventListener("click", async function (event) {
                event.preventDefault(); // Prevent form submission
                await nip46.ping(); // Ping for now.
            });
        }
    };

    // Function to create and show the modal using <dialog>
    const createModal = (): HTMLDialogElement => {
        // Create the dialog element
        const dialog: HTMLDialogElement = document.createElement("dialog");
        dialog.id = "nostrModal";

        // Add content to the dialog
        const dialogContent: HTMLDivElement = document.createElement("div");
        dialogContent.innerHTML = `
            <button id="nostrModalClose"><svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-x-square"><rect width="18" height="18" x="3" y="3" rx="2" ry="2"/><path d="m15 9-6 6"/><path d="m9 9 6 6"/></svg></button>
            <h2 id="nostrModalTitle">${options.appName} uses Nostr for accounts</h2>
            <p>Would you like to create a new Nostr account? Identities on Nostr are portable so you'll be able to use this account on any other Nostr client.</p>
            <form id="nostrModalForm">
                <span class="inputWrapper">
                    <input type="text" id="nostrModalNip05" name="nostrModalNip05" placeholder="Username" required> @nostr.me
                </span>
                <span id="nostrModalNip05Error">Username not available</span>
                <button type="submit" id="nostrModalSubmit" disabled>Create account</button>
            </form>
            <div id="nostrModalLearnMore">Not sure what Nostr is? Check out <a href="https://nostr.how" target="_blank">Nostr.how</a> for more info</div>
        `;
        dialog.appendChild(dialogContent);

        // Append the dialog to the document body
        document.body.appendChild(dialog);
        return dialog;
    };

    const submitModal = (event: Event) => {};

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

    // Finally, return the init method as the only public method
    return {
        init,
    };
})();
