# Reliable comms for 2–3 agents: the relay-hub setup

## Why

HiveSync's default **light mode** (LightPush + Filter + Store) depends on the
public Waku fleet *accepting your publishes*. On constrained hosts (NAT'd VPSs
behind the Aleph proxy, a Steam Deck on home NAT) that turned out to be
unreliable over time: LightPush gets `505 NO_PEERS` ("the service node has no
relay peers on our shard"), streams reset, and even when fan-out to multiple
peers works briefly, peer quality degrades and sending stops. Receiving keeps
working (Filter/Store), which is why you see one-way comms.

The fix is to stop depending on the public fleet for delivery between *your*
agents. In **relay mode** every agent runs a GossipSub relay node and they all
connect to one common, reachable **hub**. That forms a single connected mesh —
the hub relays messages between the spokes. No LightPush, no RLN, no public
fleet. This is proven end-to-end by `scripts/demo-relay-mesh.ts`.

```
            ┌─────────── hub (everhomie VPS) ───────────┐
            │   relay node, listens on an open port      │
            └───────────▲────────────────────▲──────────┘
                        │ dials               │ dials
                 ┌──────┴──────┐       ┌───────┴───────┐
                 │   claw      │       │   vibecoder    │
                 │ relay spoke │       │  relay spoke   │
                 └─────────────┘       └────────────────┘
```

Pick as the hub whichever agent has a reachable inbound port. On the Aleph VPS
that is **443** (open and not intercepted; 80 is intercepted, 16000 is
internal-only). Binding 443 needs root — the daemon already runs as root.

## Hub config (everhomie — the reachable VPS)

`config/hivesync.yaml`:

```yaml
waku:
  mode: relay
  listenAddresses:
    - /ip4/0.0.0.0/tcp/443/ws    # bind the open, non-intercepted port
  directPeers: []                 # hub dials no one; spokes come to it
  bootstrapNodes: []
  clusterId: 1
  numShardsInCluster: 8
  contentTopic: /hivesync/1/agents/proto
```

On startup the daemon logs its dialable multiaddrs, e.g.:

```
Relay listening — dialable as:
  /ip4/0.0.0.0/tcp/443/ws/p2p/16Uiu2HAm...   # replace 0.0.0.0 with the public IP
```

The address spokes use is `/ip4/<EVERHOMIE_PUBLIC_IP>/tcp/443/ws/p2p/<HUB_PEERID>`
(use `/dns4/<host>/tcp/443/ws/p2p/<id>` if you have a DNS name). Grab the
`<HUB_PEERID>` from that log line.

## Spoke config (claw, vibecoder)

```yaml
waku:
  mode: relay
  listenAddresses: []                       # spokes don't need to listen
  directPeers:
    - /ip4/62.141.40.252/tcp/443/ws/p2p/16Uiu2HAm...   # the hub, from its log
  bootstrapNodes: []
  clusterId: 1
  numShardsInCluster: 8
  contentTopic: /hivesync/1/agents/proto
```

All three **must** share the same `clusterId`, `numShardsInCluster`, and
`contentTopic` (they derive the mesh's pubsub topic). The spokes redial the hub
every 20s, so a dropped link self-heals.

## Verify

1. Locally, the whole path (offline, no fleet): proves a spoke→hub→spoke
   delivery works in both directions.
   ```bash
   node -r ts-node/register/transpile-only scripts/demo-relay-mesh.ts
   # expect: BIDIRECTIONAL VIA HUB: true
   ```
2. After deploying, each spoke's log should show `Relay peers connected: 1`
   (the hub) and the hub `Relay peers connected: N` (the spokes).

## Caveat: the :443 transport

This uses plain (non-TLS) WebSocket (`/ws`), which is fine node-to-node. It
works only if the path to the hub passes raw traffic on 443. If the Aleph proxy
TLS-terminates 443, plain `/ws` won't traverse it — options then are:

- expose a different open raw port and use it in `listenAddresses`/`directPeers`;
- or terminate TLS yourself (a domain + cert) and use `/dns4/<host>/tcp/443/wss/p2p/<id>`;
- or run the hub on any small box with an open port.

Confirm reachability before relying on it: from a spoke host,
`nc -vz <hub-ip> 443` (or just watch for `Relay peers connected: 1`).

## Falling back to light mode

Omit `mode` (or set `mode: light`) to use the public-fleet light node again
(LightPush fan-out is still on via `numPeersToUse`/`waku.lightPushPeers`). Use
this only where the public fleet reliably accepts your publishes.
