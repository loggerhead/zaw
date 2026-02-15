const std = @import("std");
const externs = @import("externs.zig");

var logStorage = [_]u8{0} ** 2048;

pub fn getLogPtr() i32 {
    return @intCast(@intFromPtr(&logStorage));
}

pub fn log(msg: []const u8) void {
    const len = @min(msg.len, logStorage.len - 1);
    @memcpy(logStorage[0..len], msg[0..len]);
    logStorage[len] = 0;
    externs.hostLog();
}

pub fn logf(comptime fmt: []const u8, args: anytype) void {
    const buf = logStorage[0 .. logStorage.len - 1];
    const data = std.fmt.bufPrint(buf, fmt, args) catch |err| switch (err) {
        error.NoSpaceLeft => {
            logStorage[logStorage.len - 1] = 0;
            externs.hostLog();
            return;
        },
        else => unreachable,
    };
    logStorage[data.len] = 0;
    externs.hostLog();
}
