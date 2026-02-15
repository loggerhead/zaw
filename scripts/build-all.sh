#!/bin/bash

set -e;
cd "$(dirname $(realpath $0))";

./build-zig.sh
./build-ts.sh
