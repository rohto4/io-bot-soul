import { describe, expect, it, vi } from "vitest";
import { createMisskeyClient } from "../../src/misskey/client.js";

describe("createMisskeyClient", () => {
  it("sends the token as i in the request body", async () => {
    const fetchImpl = vi.fn(async () =>
      new Response(JSON.stringify([]), {
        status: 200,
        headers: { "Content-Type": "application/json" }
      })
    );
    const client = createMisskeyClient({
      host: "https://misskey.io/",
      token: "secret",
      fetchImpl: fetchImpl as unknown as typeof fetch
    });

    await client.getNotifications({
      limit: 20,
      includeTypes: ["mention", "reply"],
      markAsRead: false
    });

    const body = JSON.parse(fetchImpl.mock.calls[0][1].body as string);
    expect(fetchImpl.mock.calls[0][0]).toBe("https://misskey.io/api/i/notifications");
    expect(body).toMatchObject({
      i: "secret",
      limit: 20,
      markAsRead: false
    });
  });

  it("returns the created note id", async () => {
    const fetchImpl = vi.fn(async () =>
      new Response(JSON.stringify({ createdNote: { id: "reply-note" } }), {
        status: 200,
        headers: { "Content-Type": "application/json" }
      })
    );
    const client = createMisskeyClient({
      host: "https://misskey.io",
      token: "secret",
      fetchImpl: fetchImpl as unknown as typeof fetch
    });

    await expect(
      client.createNote({ text: "hello", replyId: "target-note", visibility: "home" })
    ).resolves.toEqual({
      id: "reply-note"
    });

    const body = JSON.parse(fetchImpl.mock.calls[0][1].body as string);
    expect(body).toMatchObject({
      i: "secret",
      text: "hello",
      replyId: "target-note",
      visibility: "home"
    });
  });

  it("can request following deletion", async () => {
    const fetchImpl = vi.fn(async () => new Response(null, { status: 204 }));
    const client = createMisskeyClient({
      host: "https://misskey.io",
      token: "secret",
      fetchImpl: fetchImpl as unknown as typeof fetch
    });

    await client.deleteFollowing({ userId: "u1" });

    const body = JSON.parse(fetchImpl.mock.calls[0][1].body as string);
    expect(fetchImpl.mock.calls[0][0]).toBe("https://misskey.io/api/following/delete");
    expect(body).toMatchObject({ i: "secret", userId: "u1" });
  });

  it("can request following creation", async () => {
    const fetchImpl = vi.fn(async () =>
      new Response(JSON.stringify({ id: "u1" }), {
        status: 200,
        headers: { "Content-Type": "application/json" }
      })
    );
    const client = createMisskeyClient({
      host: "https://misskey.io",
      token: "secret",
      fetchImpl: fetchImpl as unknown as typeof fetch
    });

    await client.createFollowing({ userId: "u1" });

    const body = JSON.parse(fetchImpl.mock.calls[0][1].body as string);
    expect(fetchImpl.mock.calls[0][0]).toBe("https://misskey.io/api/following/create");
    expect(body).toMatchObject({ i: "secret", userId: "u1" });
  });

  it("throws a useful error on API failure", async () => {
    const fetchImpl = vi.fn(async () => new Response("bad token", { status: 401 }));
    const client = createMisskeyClient({
      host: "https://misskey.io",
      token: "secret",
      fetchImpl: fetchImpl as unknown as typeof fetch
    });

    await expect(
      client.getNotifications({ limit: 1, includeTypes: [], markAsRead: false })
    ).rejects.toThrow(/i\/notifications failed: 401/);
  });
});
