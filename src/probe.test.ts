import { describe, expect, it, vi } from "vitest";
import {
  buildProbeReply,
  buildFollowGuide,
  handleConsentReactions,
  handleFollowProbe,
  handleReplyProbe,
  mention,
  parseReplyCommand
} from "./probe.js";
import type { MisskeyClient } from "./misskey/client.js";
import { createTestDb } from "./test-db.js";

function logger() {
  return {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn()
  };
}

describe("probe", () => {
  it("builds local and remote mentions", () => {
    expect(mention({ id: "u1", username: "alice" })).toBe("@alice");
    expect(mention({ id: "u2", username: "bob", host: "example.com" })).toBe("@bob@example.com");
    expect(buildProbeReply({ id: "u1", username: "alice" })).toContain("@alice");
    expect(buildFollowGuide({ id: "u1", username: "alice" })).toContain("ピン留めノートに❤");
  });

  it("follows back and posts a guide for new followers once", async () => {
    const db = await createTestDb();
    const client: MisskeyClient = {
      getNotifications: vi.fn(async () => [
        {
          id: "n-follow",
          type: "follow",
          user: { id: "u1", username: "alice" }
        }
      ]),
      createNote: vi.fn(async () => ({ id: "guide-note" })),
      createFollowing: vi.fn(async () => undefined),
      deleteFollowing: vi.fn(),
      getNoteReactions: vi.fn()
    };

    await handleFollowProbe({
      db,
      client,
      logger: logger(),
      maxFollows: 1,
      notificationFetchLimit: 20,
      at: "2026-05-01T00:00:00.000Z"
    });
    await handleFollowProbe({
      db,
      client,
      logger: logger(),
      maxFollows: 1,
      notificationFetchLimit: 20,
      at: "2026-05-01T00:01:00.000Z"
    });

    expect(client.createFollowing).toHaveBeenCalledTimes(1);
    expect(client.createNote).toHaveBeenCalledTimes(1);
    expect(await db.all("SELECT user_id, status FROM consent_guides")).toEqual([
      { user_id: "u1", status: "posted" }
    ]);
    expect(
      await db.all("SELECT user_id, username, consent_status FROM experience_source_consents")
    ).toEqual([{ user_id: "u1", username: "alice", consent_status: "pending" }]);
  });

  it("posts a guide even when the bot already follows the user", async () => {
    const db = await createTestDb();
    const client: MisskeyClient = {
      getNotifications: vi.fn(async () => [
        {
          id: "n-follow",
          type: "follow",
          user: { id: "u1", username: "alice" }
        }
      ]),
      createNote: vi.fn(async () => ({ id: "guide-note" })),
      createFollowing: vi.fn(async () => {
        throw new Error("Misskey API following/create failed: 400 ALREADY_FOLLOWING");
      }),
      deleteFollowing: vi.fn(),
      getNoteReactions: vi.fn()
    };

    await handleFollowProbe({
      db,
      client,
      logger: logger(),
      maxFollows: 1,
      notificationFetchLimit: 20,
      at: "2026-05-01T00:00:00.000Z"
    });

    expect(client.createNote).toHaveBeenCalledTimes(1);
    expect(await db.all("SELECT user_id, status FROM consent_guides")).toEqual([
      { user_id: "u1", status: "posted" }
    ]);
  });

  it("replies once to mention or reply notifications", async () => {
    const db = await createTestDb();
    const client: MisskeyClient = {
      getNotifications: vi.fn(async () => [
        {
          id: "n1",
          type: "mention",
          user: { id: "u1", username: "alice" },
          note: { id: "note1" }
        }
      ]),
      createNote: vi.fn(async () => ({ id: "reply1" })),
      createFollowing: vi.fn(),
      deleteFollowing: vi.fn(),
      getNoteReactions: vi.fn()
    };

    await handleReplyProbe({
      db,
      client,
      logger: logger(),
      maxReplies: 1,
      notificationFetchLimit: 20,
      at: "2026-05-01T00:00:00.000Z"
    });
    await handleReplyProbe({
      db,
      client,
      logger: logger(),
      maxReplies: 1,
      notificationFetchLimit: 20,
      at: "2026-05-01T00:01:00.000Z"
    });

    expect(client.createNote).toHaveBeenCalledTimes(1);
    expect(await db.get("SELECT COUNT(*) AS count FROM reply_logs")).toEqual({ count: 1 });
  });

  it("limits probe replies per polling tick", async () => {
    const db = await createTestDb();
    const client: MisskeyClient = {
      getNotifications: vi.fn(async () => [
        {
          id: "n1",
          type: "mention",
          user: { id: "u1", username: "alice" },
          note: { id: "note1" }
        },
        {
          id: "n2",
          type: "reply",
          user: { id: "u2", username: "bob" },
          note: { id: "note2" }
        }
      ]),
      createNote: vi.fn(async () => ({ id: "reply" })),
      createFollowing: vi.fn(),
      deleteFollowing: vi.fn(),
      getNoteReactions: vi.fn()
    };

    await handleReplyProbe({
      db,
      client,
      logger: logger(),
      maxReplies: 1,
      notificationFetchLimit: 20,
      at: "2026-05-01T00:00:00.000Z"
    });

    expect(client.createNote).toHaveBeenCalledTimes(1);
  });

  it("parses only exact stop and unfollow commands", () => {
    expect(parseReplyCommand("/stop")).toBe("stop");
    expect(parseReplyCommand(" /unfollow ")).toBe("unfollow");
    expect(parseReplyCommand("/slop")).toBeNull();
    expect(parseReplyCommand("普通のリプ")).toBeNull();
  });

  it("handles /stop without unfollowing", async () => {
    const db = await createTestDb();
    const client: MisskeyClient = {
      getNotifications: vi.fn(async () => [
        {
          id: "n-stop",
          type: "reply",
          user: { id: "u1", username: "alice" },
          note: { id: "note-stop", text: "/stop" }
        }
      ]),
      createNote: vi.fn(async () => ({ id: "reply-stop" })),
      createFollowing: vi.fn(),
      deleteFollowing: vi.fn(),
      getNoteReactions: vi.fn()
    };

    await handleReplyProbe({
      db,
      client,
      logger: logger(),
      maxReplies: 1,
      notificationFetchLimit: 20,
      at: "2026-05-01T00:00:00.000Z"
    });

    expect(client.deleteFollowing).not.toHaveBeenCalled();
    expect(
      await db.get("SELECT user_id, consent_status, stopped_at FROM experience_source_consents")
    ).toEqual({
      user_id: "u1",
      consent_status: "stopped",
      stopped_at: "2026-05-01T00:00:00.000Z"
    });
  });

  it("handles /unfollow by deleting following and excluding the user", async () => {
    const db = await createTestDb();
    const client: MisskeyClient = {
      getNotifications: vi.fn(async () => [
        {
          id: "n-unfollow",
          type: "reply",
          user: { id: "u1", username: "alice" },
          note: { id: "note-unfollow", text: "/unfollow" }
        }
      ]),
      createNote: vi.fn(async () => ({ id: "reply-unfollow" })),
      createFollowing: vi.fn(),
      deleteFollowing: vi.fn(async () => undefined),
      getNoteReactions: vi.fn()
    };

    await handleReplyProbe({
      db,
      client,
      logger: logger(),
      maxReplies: 1,
      notificationFetchLimit: 20,
      at: "2026-05-01T00:00:00.000Z"
    });

    expect(client.deleteFollowing).toHaveBeenCalledWith({ userId: "u1" });
    expect(
      await db.get("SELECT user_id, consent_status, unfollowed_at FROM experience_source_consents")
    ).toEqual({
      user_id: "u1",
      consent_status: "unfollowed",
      unfollowed_at: "2026-05-01T00:00:00.000Z"
    });
  });

  it("stores heart reactions as consented users", async () => {
    const db = await createTestDb();
    const client: MisskeyClient = {
      getNotifications: vi.fn(),
      createNote: vi.fn(),
      createFollowing: vi.fn(),
      deleteFollowing: vi.fn(),
      getNoteReactions: vi.fn(async () => [
        {
          id: "r1",
          createdAt: "2026-05-01T00:00:00.000Z",
          type: "❤️",
          user: { id: "u1", username: "alice" }
        },
        {
          id: "r2",
          createdAt: "2026-05-01T00:00:01.000Z",
          type: "👍",
          user: { id: "u2", username: "bob" }
        }
      ])
    };

    await handleConsentReactions({
      db,
      client,
      logger: logger(),
      pinnedConsentNoteId: "pinned",
      reactionFetchLimit: 100,
      at: "2026-05-01T00:02:00.000Z"
    });

    expect(
      await db.all("SELECT user_id, username, consent_status FROM experience_source_consents")
    ).toEqual([{ user_id: "u1", username: "alice", consent_status: "consented" }]);
  });

  it("does not restore stopped users from an old heart reaction", async () => {
    const db = await createTestDb();
    await db.run(
      `
      INSERT INTO experience_source_consents (
        user_id,
        username,
        consent_status,
        stopped_at,
        created_at,
        updated_at
      )
      VALUES (
        'u1',
        'alice',
        'stopped',
        '2026-05-01T00:01:00.000Z',
        '2026-05-01T00:00:00.000Z',
        '2026-05-01T00:01:00.000Z'
      )
      `
    );
    const client: MisskeyClient = {
      getNotifications: vi.fn(),
      createNote: vi.fn(),
      createFollowing: vi.fn(),
      deleteFollowing: vi.fn(),
      getNoteReactions: vi.fn(async () => [
        {
          id: "r1",
          createdAt: "2026-05-01T00:00:00.000Z",
          type: "❤",
          user: { id: "u1", username: "alice" }
        }
      ])
    };

    await handleConsentReactions({
      db,
      client,
      logger: logger(),
      pinnedConsentNoteId: "pinned",
      reactionFetchLimit: 100,
      at: "2026-05-01T00:02:00.000Z"
    });

    expect(
      await db.get("SELECT user_id, username, consent_status FROM experience_source_consents")
    ).toEqual({ user_id: "u1", username: "alice", consent_status: "stopped" });
  });
});
