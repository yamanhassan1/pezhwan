# @pezhwan/cli

Command-line client for a running PEZHWAN identity server.

```bash
pezhwan auth login --email admin@example.com --password ...
pezhwan whoami
pezhwan sessions
pezhwan config --set baseUrl https://id.example.com
pezhwan health
```

The CLI keeps its connection profile at `~/.pezhwan/config.json` (base URL +
access token). Every command talks to the server's REST surface and prints JSON
or a narrow table. Commands whose endpoint the server has not enabled fail
loudly with the server's error envelope — the CLI never fabricates data.