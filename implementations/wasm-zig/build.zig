const std = @import("std");

pub fn build(b: *std.Build) !void {
    const target = b.standardTargetOptions(.{});
    const optimize = b.standardOptimizeOption(.{});

    _ = b.addModule("zaw", .{
        .root_source_file = b.path("src/zaw.zig"),
        .target = target,
        .optimize = optimize,
    });

    const test_step = b.step("test", "Run unit tests");

    const conduit_tests = b.addTest(.{ .root_module = b.createModule(.{
        .root_source_file = b.path("src/conduit/conduit.test.zig"),
        .target = target,
    }) });
    const interop_tests = b.addTest(.{ .root_module = b.createModule(.{
        .root_source_file = b.path("src/interop.test.zig"),
        .target = target,
    }) });

    const run_conduit_tests = b.addRunArtifact(conduit_tests);
    const run_interop_tests = b.addRunArtifact(interop_tests);

    test_step.dependOn(&run_conduit_tests.step);
    test_step.dependOn(&run_interop_tests.step);
}
