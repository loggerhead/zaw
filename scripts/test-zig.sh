#!/bin/bash

set -e;
ROOT="$(dirname $(realpath $0))/..";

cd $ROOT
zig build test --summary all
