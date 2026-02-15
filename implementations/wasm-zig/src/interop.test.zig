const std = @import("std");
const builtin = @import("builtin");
const interop = @import("./interop.zig");
const conduit = @import("./conduit.zig");

test "interop allocate channel multiple times" {
    if (builtin.target.cpu.arch != .wasm32) {
        return;
    }

    const first_size: usize = 64;
    const second_size: usize = 128;
    const first_ptr = interop.allocateInputChannel(@intCast(first_size));
    const second_ptr = interop.allocateInputChannel(@intCast(second_size));
    try std.testing.expect(first_ptr != 0);
    try std.testing.expect(second_ptr != 0);

    const input_ptr: [*]u64 = @ptrFromInt(@as(usize, @intCast(second_ptr)));
    const input_storage = input_ptr[0 .. second_size / 8];
    var input_writer = conduit.Writer.from(input_storage);
    input_writer.write(u8, 7);
    var input_reader = interop.getInput();
    try std.testing.expectEqual(@as(u8, 7), input_reader.read(u8));

    const output_size: usize = 64;
    const output_ptr = interop.allocateOutputChannel(@intCast(output_size));
    try std.testing.expect(output_ptr != 0);
    var output_writer = interop.getOutput();
    output_writer.write(u32, 0x11223344);
    const output_raw: [*]u64 = @ptrFromInt(@as(usize, @intCast(output_ptr)));
    const output_storage = output_raw[0 .. output_size / 8];
    var output_reader = conduit.Reader.from(output_storage);
    try std.testing.expectEqual(@as(u32, 0x11223344), output_reader.read(u32));
}
