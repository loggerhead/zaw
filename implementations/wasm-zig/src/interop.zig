const std = @import("std");

const conduit = @import("./conduit.zig");

pub const Error = @import("./interop/error.zig");
pub const OK = Error.OK;

pub const Stack = @import("./interop/stack.zig");

const logModule = @import("./interop/log.zig");
pub const log = logModule.log;
pub const logf = logModule.logf;

var input: conduit.Reader = undefined;
var output: conduit.Writer = undefined;
var input_storage: ?[]u64 = null;
var output_storage: ?[]u64 = null;

pub fn getErrorPtr() callconv(.c) i32 {
    return Error.getErrorPtr();
}

pub fn getLogPtr() callconv(.c) i32 {
    return logModule.getLogPtr();
}

pub fn allocateInputChannel(sizeInBytes: i32) callconv(.c) i32 {
    if (sizeInBytes <= 0) {
        Error.panicFormat(@src(), "Invalid channel size: {d}", .{sizeInBytes});
    }
    const size: usize = @intCast(sizeInBytes);
    const aligned = (size + 7) & ~@as(usize, 7);
    const sizeInU64s = aligned / 8;
    if (input_storage) |storage| {
        std.heap.wasm_allocator.free(storage);
    }
    const storage = std.heap.wasm_allocator.alloc(u64, sizeInU64s) catch @panic("Failed to allocate input channel storage");
    const pointer: i32 = @intCast(@intFromPtr(storage.ptr));

    input_storage = storage;
    input = conduit.Reader.from(storage);

    return pointer;
}

pub fn allocateOutputChannel(sizeInBytes: i32) callconv(.c) i32 {
    if (sizeInBytes <= 0) {
        Error.panicFormat(@src(), "Invalid channel size: {d}", .{sizeInBytes});
    }
    const size: usize = @intCast(sizeInBytes);
    const aligned = (size + 7) & ~@as(usize, 7);
    const sizeInU64s = aligned / 8;
    if (output_storage) |storage| {
        std.heap.wasm_allocator.free(storage);
    }
    const storage = std.heap.wasm_allocator.alloc(u64, sizeInU64s) catch @panic("Failed to allocate output channel storage");
    const pointer: i32 = @intCast(@intFromPtr(storage.ptr));

    output_storage = storage;
    output = conduit.Writer.from(storage);

    return pointer;
}

pub fn getInput() conduit.Reader {
    input.reset();

    return input;
}

pub fn getOutput() conduit.Writer {
    output.reset();

    return output;
}
