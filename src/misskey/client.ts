export type MisskeyNote = {
  id: string;
  createdAt: string;
  userId: string;
  user?: MisskeyUserLite;
  text?: string | null;
  cw?: string | null;
  visibility: string;
  replyId?: string | null;
  renoteId?: string | null;
};

export type MisskeyUserLite = {
  id: string;
  username: string;
  host?: string | null;
};

export type MisskeyNoteLite = {
  id: string;
  text?: string | null;
  user?: MisskeyUserLite;
};

export type MisskeyNotification = {
  id: string;
  type: string;
  user?: MisskeyUserLite;
  note?: MisskeyNoteLite;
};

export type MisskeyReaction = {
  id: string;
  createdAt: string;
  type: string;
  user: MisskeyUserLite;
};

export type MisskeyClient = {
  getNotifications(input: {
    limit: number;
    includeTypes: string[];
    markAsRead: boolean;
  }): Promise<MisskeyNotification[]>;
  createNote(input: {
    text: string;
    replyId?: string;
    visibility?: "public" | "home" | "followers" | "specified";
  }): Promise<{ id: string }>;
  createFollowing(input: { userId: string }): Promise<void>;
  deleteFollowing(input: { userId: string }): Promise<void>;
  getNoteReactions(input: {
    noteId: string;
    type?: string;
    limit: number;
    sinceId?: string;
  }): Promise<MisskeyReaction[]>;
  getHomeTimeline(input: { limit: number; sinceId?: string }): Promise<MisskeyNote[]>;
};

export function createMisskeyClient(options: {
  host: string;
  token: string;
  fetchImpl?: typeof fetch;
}): MisskeyClient {
  const fetchImpl = options.fetchImpl ?? fetch;
  const host = options.host.replace(/\/$/, "");

  async function request<T>(endpoint: string, body: Record<string, unknown>): Promise<T> {
    const response = await fetchImpl(`${host}/api/${endpoint}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        i: options.token,
        ...body
      })
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Misskey API ${endpoint} failed: ${response.status} ${text}`);
    }

    if (response.status === 204) {
      return undefined as T;
    }

    return (await response.json()) as T;
  }

  return {
    getNotifications: (input) => request("i/notifications", input),
    async createNote(input) {
      const result = await request<{ createdNote: { id: string } }>("notes/create", input);
      return { id: result.createdNote.id };
    },
    createFollowing: (input) => request("following/create", input),
    deleteFollowing: (input) => request("following/delete", input),
    getNoteReactions: (input) => request("notes/reactions", input),
    getHomeTimeline: (input) => request("notes/timeline", input),
  };
}
