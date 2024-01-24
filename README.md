# Nostr Ignition

A standalone, drop-in library to help new users to Nostr create accounts with an OAuth-like flow using Nsecbunker.

### To use:

First, add the JS file from CDN.

```html
<!-- TODO: UPDATE URL -->
<script src="./dist/index.js"></script>
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

`appName` is required, both `redirectUri` and `relays` are optional.

```js
options = {
    appName: `<The name of your app>`,
    redirectUri: `<Where you want to redirect to after account creation>`,
    relays: `<An array of relay urls>`,
};
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

This project was created using `bun init` in bun v1.0.18. [Bun](https://bun.sh) is a fast all-in-one JavaScript runtime.
