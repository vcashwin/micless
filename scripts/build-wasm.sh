#!/usr/bin/env bash
set -euo pipefail
root="$(cd "$(dirname "$0")/.." && pwd)"
cargo build --release --target wasm32-unknown-unknown --manifest-path "$root/dsp/Cargo.toml"
cp "$root/dsp/target/wasm32-unknown-unknown/release/micless_dsp.wasm" "$root/public/dsp.wasm"
wc -c < "$root/public/dsp.wasm"
