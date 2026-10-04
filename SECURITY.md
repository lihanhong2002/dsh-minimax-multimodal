# Security policy

Do not include API keys, access tokens, credential stores, private session logs, or personal local paths in issues, pull requests, or source files.

The plugin obtains its MiniMax API key at runtime from the DSH credential service (or a host environment variable). If a key is exposed, revoke it with MiniMax and issue a replacement before using the plugin again.

For a suspected vulnerability, report it privately through the repository's GitHub Security Advisories after this project is published. Do not post credentials or sensitive personal data in a public issue.
