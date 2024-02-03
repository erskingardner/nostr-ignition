# Nostr Ignition

A standalone, drop-in library to help new users to Nostr create accounts with an OAuth-like flow using Nsecbunker.

## Demo

[![Watch the demo](https://i.nostr.build/OGO0.png)](https://v.nostr.build/8AQg.mp4)

## Get started

First, add the JS file from CDN in your Layout file or HTML. You want to make sure that this is loaded on all pages of your app where users can't log in.

```html
<script src="https://cdn.jsdelivr.net/npm/nostr-ignition@latest/dist/index.js"></script>
```

Then, initialize the library once the DOM is ready to go.

```html
<script>
    document.addEventListener("DOMContentLoaded", function () {
        NostrIgnition.init({
            appName: "DemoApp",
            redirectUri: "https://myapp.com",
            relays: ["wss://relay1.com", "wss://relay2.com"],
        });
    });
</script>
```

The `init` method takes an options argument. Options are an object that looks like the following.

```js
options = {
    appName: `<The name of your app>`,
    redirectUri: `<Where you want to redirect to after account creation>`,
    relays: `<An array of relay urls>`,
};
```

`appName` is required, both `redirectUri` and `relays` are optional.

If you want to include the default CSS, include it in your HTML as well. Otherwise, you'll need to style the modal yourself.

```html
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/nostr-ignition@latest/dist/index.min.css" />
```

## Contributing

### To install dependencies:

```bash
bun install
```

### To develop:

```bash
bun run dev
```

This will open the `demo.html` file and build the project in watch mode. You can use the demo page to view your changes as you work.

### To check formatting & linting:

```bash
bun run lint
```

This will check both prettier formatting and use `eslint` to check the code.

### To run tests:

```bash
bun run test
```

Please run both these commands before creating a PR.
