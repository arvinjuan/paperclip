import { describe, expect, it } from "vitest";
import { resolveDefaultAgentWorkspaceDir } from "../home-paths.js";
import {
  resolveRuntimeSessionParamsForWorkspace,
  shouldResetTaskSessionForWake,
  synthesizeCompletionReportForPersistedRun,
  type ResolvedWorkspaceForRun,
} from "../services/heartbeat.ts";

function buildResolvedWorkspace(overrides: Partial<ResolvedWorkspaceForRun> = {}): ResolvedWorkspaceForRun {
  return {
    cwd: "/tmp/project",
    source: "project_primary",
    projectId: "project-1",
    workspaceId: "workspace-1",
    repoUrl: null,
    repoRef: null,
    workspaceHints: [],
    warnings: [],
    ...overrides,
  };
}

describe("resolveRuntimeSessionParamsForWorkspace", () => {
  it("migrates fallback workspace sessions to project workspace when project cwd becomes available", () => {
    const agentId = "agent-123";
    const fallbackCwd = resolveDefaultAgentWorkspaceDir(agentId);

    const result = resolveRuntimeSessionParamsForWorkspace({
      agentId,
      previousSessionParams: {
        sessionId: "session-1",
        cwd: fallbackCwd,
        workspaceId: "workspace-1",
      },
      resolvedWorkspace: buildResolvedWorkspace({ cwd: "/tmp/new-project-cwd" }),
    });

    expect(result.sessionParams).toMatchObject({
      sessionId: "session-1",
      cwd: "/tmp/new-project-cwd",
      workspaceId: "workspace-1",
    });
    expect(result.warning).toContain("Attempting to resume session");
  });

  it("does not migrate when previous session cwd is not the fallback workspace", () => {
    const result = resolveRuntimeSessionParamsForWorkspace({
      agentId: "agent-123",
      previousSessionParams: {
        sessionId: "session-1",
        cwd: "/tmp/some-other-cwd",
        workspaceId: "workspace-1",
      },
      resolvedWorkspace: buildResolvedWorkspace({ cwd: "/tmp/new-project-cwd" }),
    });

    expect(result.sessionParams).toEqual({
      sessionId: "session-1",
      cwd: "/tmp/some-other-cwd",
      workspaceId: "workspace-1",
    });
    expect(result.warning).toBeNull();
  });

  it("does not migrate when resolved workspace id differs from previous session workspace id", () => {
    const agentId = "agent-123";
    const fallbackCwd = resolveDefaultAgentWorkspaceDir(agentId);

    const result = resolveRuntimeSessionParamsForWorkspace({
      agentId,
      previousSessionParams: {
        sessionId: "session-1",
        cwd: fallbackCwd,
        workspaceId: "workspace-1",
      },
      resolvedWorkspace: buildResolvedWorkspace({
        cwd: "/tmp/new-project-cwd",
        workspaceId: "workspace-2",
      }),
    });

    expect(result.sessionParams).toEqual({
      sessionId: "session-1",
      cwd: fallbackCwd,
      workspaceId: "workspace-1",
    });
    expect(result.warning).toBeNull();
  });
});

describe("shouldResetTaskSessionForWake", () => {
  it("resets session context on assignment wake", () => {
    expect(shouldResetTaskSessionForWake({ wakeReason: "issue_assigned" })).toBe(true);
  });

  it("resets session context on timer heartbeats", () => {
    expect(shouldResetTaskSessionForWake({ wakeSource: "timer" })).toBe(true);
  });

  it("resets session context on manual on-demand invokes", () => {
    expect(
      shouldResetTaskSessionForWake({
        wakeSource: "on_demand",
        wakeTriggerDetail: "manual",
      }),
    ).toBe(true);
  });

  it("does not reset session context on mention wake comment", () => {
    expect(
      shouldResetTaskSessionForWake({
        wakeReason: "issue_comment_mentioned",
        wakeCommentId: "comment-1",
      }),
    ).toBe(false);
  });

  it("does not reset session context when commentId is present", () => {
    expect(
      shouldResetTaskSessionForWake({
        wakeReason: "issue_commented",
        commentId: "comment-2",
      }),
    ).toBe(false);
  });

  it("does not reset for comment wakes", () => {
    expect(shouldResetTaskSessionForWake({ wakeReason: "issue_commented" })).toBe(false);
  });

  it("does not reset when wake reason is missing", () => {
    expect(shouldResetTaskSessionForWake({})).toBe(false);
  });

  it("does not reset session context on callback on-demand invokes", () => {
    expect(
      shouldResetTaskSessionForWake({
        wakeSource: "on_demand",
        wakeTriggerDetail: "callback",
      }),
    ).toBe(false);
  });
});

describe("synthesizeCompletionReportForPersistedRun", () => {
  it("hydrates a persisted succeeded run without a stored completion report", () => {
    const run = {
      id: "run-1",
      companyId: "company-1",
      agentId: "agent-1",
      invocationSource: "on_demand",
      triggerDetail: "manual",
      status: "succeeded",
      startedAt: new Date("2026-04-25T12:00:00.000Z"),
      finishedAt: new Date("2026-04-25T12:02:30.000Z"),
      error: null,
      wakeupRequestId: null,
      exitCode: 0,
      signal: null,
      usageJson: {
        costUsd: 0.0123,
        model: "openrouter/xiaomi/mimo-v2-flash",
        billingType: "api",
        inputTokens: 1200,
        outputTokens: 300,
        cachedInputTokens: 400,
        reasoningOutputTokens: 50,
      },
      resultJson: {},
      sessionIdBefore: null,
      sessionIdAfter: null,
      logStore: null,
      logRef: null,
      logBytes: 1234,
      logSha256: "abc",
      logCompressed: false,
      stdoutExcerpt: "Implemented the timeout fix and tests passed locally.",
      stderrExcerpt: "",
      errorCode: null,
      externalRunId: null,
      contextSnapshot: {},
      createdAt: new Date("2026-04-25T12:00:00.000Z"),
      updatedAt: new Date("2026-04-25T12:02:30.000Z"),
    } as const;

    const report = synthesizeCompletionReportForPersistedRun(run);

    expect(report).toMatchObject({
      runId: "run-1",
      status: "succeeded",
      outcome: "succeeded",
      model: "openrouter/xiaomi/mimo-v2-flash",
      billingType: "api",
      costUsd: 0.0123,
      materialWork: true,
      noOp: false,
      summary: "Implemented the timeout fix and tests passed locally.",
      durationSec: 150,
    });
    expect(report?.usage).toMatchObject({
      inputTokens: 1200,
      outputTokens: 300,
      cachedInputTokens: 400,
      reasoningOutputTokens: 50,
      totalTokens: 1950,
    });
  });

  it("marks a token-free succeeded heartbeat as a no-op", () => {
    const run = {
      id: "run-2",
      companyId: "company-1",
      agentId: "agent-1",
      invocationSource: "timer",
      triggerDetail: "system",
      status: "succeeded",
      startedAt: new Date("2026-04-25T12:00:00.000Z"),
      finishedAt: new Date("2026-04-25T12:00:05.000Z"),
      error: null,
      wakeupRequestId: null,
      exitCode: 0,
      signal: null,
      usageJson: {},
      resultJson: null,
      sessionIdBefore: null,
      sessionIdAfter: null,
      logStore: null,
      logRef: null,
      logBytes: null,
      logSha256: null,
      logCompressed: false,
      stdoutExcerpt: "",
      stderrExcerpt: "",
      errorCode: null,
      externalRunId: null,
      contextSnapshot: {},
      createdAt: new Date("2026-04-25T12:00:00.000Z"),
      updatedAt: new Date("2026-04-25T12:00:05.000Z"),
    } as const;

    const report = synthesizeCompletionReportForPersistedRun(run);

    expect(report).toMatchObject({
      status: "succeeded",
      noOp: true,
      materialWork: false,
      noOpReason: "Run completed without token usage or final summary.",
      durationSec: 5,
    });
  });
});
